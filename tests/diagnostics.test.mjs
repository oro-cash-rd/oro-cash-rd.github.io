import test from 'node:test'
import assert from 'node:assert/strict'
import { DailyRates } from '../workers/daily-rates/worker.mjs'
import { parseMarket } from '../market.mjs'

const START = Date.parse('2026-10-13T13:00:00Z')
const SECRET = 'never-log-this-test-secret'
const unsafe = `https://api.metals.dev/v1/latest?api_key=${SECRET}`
const provider = (at = START) => ({ status: 'success', currency: 'USD', unit: 'toz', metals: { gold: 4200 }, currencies: { DOP: 1 / 61 }, timestamps: { metal: new Date(at - 1000).toISOString(), currency: new Date(at - 2000).toISOString() } })
function context(map, failKey) {
  let queue = Promise.resolve()
  return {
    storage: {
      get: async key => structuredClone(map.get(key)),
      put: async (key, value) => {
        if (key === failKey) throw new Error(unsafe)
        map.set(key, structuredClone(value))
      }
    },
    blockConcurrencyWhile(callback) {
      const result = queue.then(callback)
      queue = result.catch(() => {})
      return result
    }
  }
}
async function scenario(fetcher, body, failKey) {
  const original = { now: Date.now, fetch: globalThis.fetch, log: console.log }
  const oldRate = { day: '2026-10-12', fetchedAt: START - 86400000, gold: 4170, fx: 60 }
  const map = new Map([['rate', oldRate]]), logs = []
  let clock = START, calls = 0
  Date.now = () => clock
  console.log = message => logs.push(message)
  globalThis.fetch = async (...args) => { calls++; return fetcher(...args) }
  const service = new DailyRates(context(map, failKey), { METALS_DEV_API_KEY: SECRET })
  try { await body({ service, map, logs, oldRate, calls: () => calls, advance: ms => { clock += ms } }) }
  finally { Date.now = original.now; globalThis.fetch = original.fetch; console.log = original.log }
}
const records = logs => logs.map(line => JSON.parse(line)).filter(item => item.event === 'daily_rate_attempt')
const status = service => service.fetch(new Request('https://internal/api/status')).then(response => response.json())

test('failure diagnostics distinguish HTTP, provider code, JSON, network, timeout and validation without secrets', async () => {
  const cases = [
    ['provider_http', 'http', 401, 1101, () => Response.json({ error_code: 1101, error_message: unsafe }, { status: 401 })],
    ['provider_http', 'http', 429, 1203, () => Response.json({ error_code: 1203, api_key: SECRET }, { status: 429 })],
    ['provider_http', 'http', 502, null, () => new Response(unsafe, { status: 502 })],
    ['provider_status', 'validate', 200, 1101, () => Response.json({ status: 'failure', error_code: 1101, error_message: unsafe })],
    ['provider_json', 'decode', 200, null, () => new Response(unsafe)],
    ['provider_network', 'fetch', null, null, () => { throw new Error(unsafe) }],
    ['provider_timeout', 'fetch', null, null, () => { throw new DOMException(unsafe, 'TimeoutError') }],
    ['metal_timestamp_old', 'validate', 200, null, () => Response.json({ ...provider(), timestamps: { ...provider().timestamps, metal: new Date(START - 180001).toISOString() } })],
    ['currency_timestamp_future', 'validate', 200, null, () => Response.json({ ...provider(), timestamps: { ...provider().timestamps, currency: new Date(START + 120001).toISOString() } })],
    ['metal_timestamp_invalid', 'validate', 200, null, () => Response.json({ ...provider(), timestamps: { metal: unsafe, currency: SECRET } })],
    ['fx_range', 'validate', 200, null, () => Response.json({ ...provider(), currencies: { DOP: 60 } })]
  ]
  for (const [reason, stage, httpStatus, code, fetcher] of cases) {
    await scenario(fetcher, async ({ service, map, logs, oldRate, calls }) => {
      const response = await service.fetch()
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('Retry-After'), '60')
      assert.deepEqual(await response.json(), { error: 'fresh_rate_unavailable', day: '2026-10-13' })
      const diagnostic = records(logs)[0]
      assert.equal(diagnostic.reason, reason)
      assert.equal(diagnostic.stage, stage)
      assert.equal(diagnostic.httpStatus, httpStatus)
      assert.equal(diagnostic.providerCode, code)
      assert.equal(diagnostic.startedAt, START)
      assert.equal(diagnostic.result, 'failure')
      assert.equal(map.get('budget').daily, 1)
      assert.deepEqual(map.get('rate'), oldRate)
      const view = await status(service)
      assert.deepEqual(view.attempts, [diagnostic])
      assert.equal(calls(), 1)
      assert.equal(JSON.stringify({ logs, view }).includes(SECRET), false)
      assert.equal(JSON.stringify({ logs, view }).includes('api.metals.dev'), false)
    })
  }
})

test('success records ages and duration once; cached/status reads make no calls or diagnostic writes', async () => {
  let advance
  await scenario(() => { advance(25); return Response.json(provider()) }, async ({ service, map, logs, calls, advance: setClock }) => {
    advance = setClock
    const response = await service.fetch()
    assert.equal(response.status, 200)
    const rate = await response.json(), record = records(logs)[0]
    assert.equal(rate.fetchedAt, START + 25)
    assert.equal(record.result, 'success')
    assert.equal(record.reason, 'ok')
    assert.equal(record.stage, 'persist_rate')
    assert.equal(record.durationMs, 25)
    assert.equal(record.providerDurationMs, 25)
    assert.equal(record.metalAgeMs, 1025)
    assert.equal(record.currencyAgeMs, 2025)
    const history = structuredClone(map.get('attemptHistory'))
    await service.fetch(); await status(service)
    assert.equal(calls(), 1)
    assert.equal(records(logs).length, 1)
    assert.deepEqual(map.get('attemptHistory'), history)
  })
})

test('cooldown, quota and restart preserve the first three failure records without spending extra calls', async () => {
  await scenario(() => { throw new Error(unsafe) }, async ({ service, map, logs, calls, advance }) => {
    await service.fetch()
    assert.equal((await (await service.fetch()).json()).error, 'provider_retry_pending')
    advance(60000); await service.fetch()
    advance(60000); await service.fetch()
    advance(60000)
    const restarted = new DailyRates(context(map), { METALS_DEV_API_KEY: SECRET })
    assert.equal((await (await restarted.fetch()).json()).error, 'provider_quota_limit')
    assert.equal((await status(restarted)).attempts.length, 3)
    assert.equal(map.get('budget').daily, 3)
    assert.equal(calls(), 3)
    assert.equal(records(logs).length, 3)
  })
})

test('history stays bounded at six terminal attempts across days', async () => {
  await scenario(() => { throw new Error(unsafe) }, async ({ service, map, advance }) => {
    for (let day = 0; day < 3; day++) {
      for (let attempt = 0; attempt < 3; attempt++) { await service.fetch(); advance(60000) }
      advance(86400000)
    }
    assert.equal(map.get('attemptHistory').length, 6)
    assert.equal(map.get('budget').monthly, 9)
  })
})

test('snapshot write failures are distinguished and leave the previous snapshot intact', async () => {
  await scenario(() => Response.json(provider()), async ({ service, map, logs, oldRate }) => {
    assert.equal((await service.fetch()).status, 503)
    assert.equal(records(logs)[0].reason, 'snapshot_store_failed')
    assert.equal(records(logs)[0].httpStatus, 200)
    assert.deepEqual(map.get('rate'), oldRate)
    assert.equal(logs.join('').includes(SECRET), false)
  }, 'rate')
})

test('diagnostic storage failure does not turn a valid rate into a failure', async () => {
  await scenario(() => Response.json(provider()), async ({ service, map, logs }) => {
    assert.equal((await service.fetch()).status, 200)
    assert.equal(map.get('rate').day, '2026-10-13')
    assert.ok(logs.some(line => JSON.parse(line).event === 'daily_rate_diagnostic_store_failed'))
    assert.equal(logs.join('').includes(SECRET), false)
  }, 'attemptHistory')
})

test('three-minute and two-minute timestamp boundaries are unchanged', () => {
  const payload = provider()
  payload.timestamps = { metal: new Date(START - 180000).toISOString(), currency: new Date(START + 120000).toISOString() }
  assert.equal(parseMarket(payload, START).day, '2026-10-13')
  payload.timestamps.metal = new Date(START - 180001).toISOString()
  assert.throws(() => parseMarket(payload, START), { reason: 'metal_timestamp_old' })
  payload.timestamps = { metal: new Date(START).toISOString(), currency: new Date(START + 120001).toISOString() }
  assert.throws(() => parseMarket(payload, START), { reason: 'currency_timestamp_future' })
})
