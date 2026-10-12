import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { DailyRates } from '../workers/daily-rates/worker.mjs'
import { createRateClient } from '../rates-client.mjs'

const START = Date.parse('2026-10-12T12:00:00Z')
function context(map = new Map()) {
  let queue = Promise.resolve()
  return {
    storage: { get: async key => structuredClone(map.get(key)), put: async (key, value) => map.set(key, structuredClone(value)) },
    blockConcurrencyWhile(callback) {
      const result = queue.then(callback)
      queue = result.catch(() => {})
      return result
    }
  }
}
const provider = at => ({ status: 'success', currency: 'USD', unit: 'toz', metals: { gold: 4200 }, currencies: { DOP: 1 / 61 }, timestamps: { metal: new Date(at - 1000).toISOString(), currency: new Date(at - 2000).toISOString() } })

test('100 simultaneous visitors and Merca Oro share one durable daily call; midnight refreshes once', async () => {
  const oldNow = Date.now, oldFetch = globalThis.fetch
  let clock = START, calls = 0
  const map = new Map()
  Date.now = () => clock
  globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(provider(clock)) }
  try {
    const service = new DailyRates(context(map), { METALS_DEV_API_KEY: 'test-only' })
    const responses = await Promise.all(Array.from({ length: 100 }, () => service.fetch()))
    const bodies = await Promise.all(responses.map(response => response.json()))
    assert.equal(calls, 1)
    assert.equal(map.get('budget').monthly, 1)
    assert.ok(bodies.every(body => body.day === '2026-10-12' && body.fetchedAt === START))
    clock = Date.parse('2026-10-13T03:59:59Z')
    const restarted = new DailyRates(context(map), { METALS_DEV_API_KEY: 'test-only' })
    assert.equal((await (await restarted.fetch()).json()).fetchedAt, START)
    assert.equal(calls, 1)
    clock = Date.parse('2026-10-13T04:00:00Z')
    assert.equal((await (await restarted.fetch()).json()).day, '2026-10-13')
    assert.equal(calls, 2)
  } finally { Date.now = oldNow; globalThis.fetch = oldFetch }
})

test('invalid/old provider data cannot replace snapshot; retry cooldown and durable 3/day quota', async () => {
  const oldNow = Date.now, oldFetch = globalThis.fetch
  let clock = START, calls = 0
  const oldRate = { day: '2026-10-11', fetchedAt: START - 86400000, gold: 4194, fx: 61 }
  const map = new Map([['rate', oldRate]])
  Date.now = () => clock
  globalThis.fetch = async () => { calls++; return Response.json(provider(clock - 600000)) }
  try {
    const service = new DailyRates(context(map), { METALS_DEV_API_KEY: 'test-only' })
    assert.equal((await service.fetch()).status, 503)
    assert.deepEqual(map.get('rate'), oldRate)
    assert.equal((await service.fetch()).status, 503)
    assert.equal(calls, 1)
    clock += 60000; await service.fetch()
    clock += 60000; await service.fetch()
    clock += 60000
    assert.equal((await (await new DailyRates(context(map), { METALS_DEV_API_KEY: 'test-only' }).fetch()).json()).error, 'provider_quota_limit')
    assert.equal(calls, 3)
    assert.equal(map.get('budget').monthly, 3)
    assert.deepEqual(map.get('rate'), oldRate)
  } finally { Date.now = oldNow; globalThis.fetch = oldFetch }
})

test('monthly quota persists across dates, resets at Dominican month boundary, and missing key makes no call', async () => {
  const oldNow = Date.now, oldFetch = globalThis.fetch
  let clock = Date.parse('2026-11-01T03:59:59Z'), calls = 0
  const map = new Map([['budget', { day: '2026-10-12', month: '2026-10', daily: 0, monthly: 95 }]])
  Date.now = () => clock
  globalThis.fetch = async () => { calls++; return Response.json(provider(clock)) }
  try {
    const service = new DailyRates(context(map), { METALS_DEV_API_KEY: 'test-only' })
    assert.equal((await service.fetch()).status, 503)
    assert.equal(calls, 0)
    clock += 1000
    assert.equal((await service.fetch()).status, 200)
    assert.equal(map.get('budget').monthly, 1)
    const empty = new DailyRates(context(), {})
    assert.equal((await empty.fetch()).status, 503)
    assert.equal(calls, 1)
  } finally { Date.now = oldNow; globalThis.fetch = oldFetch }
})

test('worker is public read-only, errors contain no provider key, OPTIONS does not query provider', async () => {
  const env = { METALS_DEV_API_KEY: 'private-test-secret', DAILY_RATES: { idFromName: () => 'one', get: () => ({ fetch: async () => Response.json({ day: '2026-10-12' }) }) } }
  assert.equal((await worker.fetch(new Request('https://service/api/rates', { method: 'POST' }), env)).status, 405)
  assert.equal((await worker.fetch(new Request('https://service/api/rates', { method: 'OPTIONS' }), env)).status, 204)
  assert.equal((await worker.fetch(new Request('https://service/nope'), env)).status, 404)
  const response = await worker.fetch(new Request('https://service/api/rates'), env)
  assert.equal(response.status, 200)
  assert.equal((await response.text()).includes('private-test-secret'), false)
})

test('browser first visit calls demand service, deduplicates, caches until midnight, fails closed without static fallback', async () => {
  let clock = START, calls = 0
  const urls = []
  let broken = false
  const get = createRateClient({ now: () => clock, fetcher: async url => {
    urls.push(url)
    if (url === './data/rates-source.json') return Response.json({ mode: 'demand', url: 'https://service.example/api/rates' })
    calls++
    if (broken) return Response.json({ error: 'fresh_rate_unavailable' }, { status: 503 })
    return Response.json({ day: '2026-10-12', fetchedAt: START, gold: 4200, fx: 61 })
  } })
  const values = await Promise.all(Array.from({ length: 10 }, () => get()))
  assert.equal(calls, 1)
  assert.ok(values.every(value => value.fetchedAt === START))
  clock += 3600000; await get(); assert.equal(calls, 1)
  clock = Date.parse('2026-10-13T04:00:00Z'); broken = true
  await assert.rejects(get())
  assert.equal(calls, 2)
  assert.equal(urls.includes('./data/rates.json'), false)
})
