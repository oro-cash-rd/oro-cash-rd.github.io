import assert from 'node:assert/strict'
import { isCurrent } from '../market.mjs'

const site = 'https://oro-cash-rd.github.io/'
const read = async url => {
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, 200, String(url))
  return response.json()
}
const source = await read(new URL('data/rates-source.json', site))
assert.equal(source.mode, 'demand')
const endpoint = new URL(source.url)
assert.equal(endpoint.protocol, 'https:')
assert.equal(endpoint.pathname, '/api/rates')
assert.equal(endpoint.username + endpoint.password + endpoint.search + endpoint.hash, '')
const health = await read(new URL('/health', endpoint))
assert.equal(health.configured, true)
const before = await read(new URL('/api/status', endpoint))
const rate = await read(endpoint)
assert.ok(isCurrent(rate))
for (const stamp of [rate.metalTimestamp, rate.currencyTimestamp]) {
  const time = Date.parse(stamp)
  assert.ok(Number.isFinite(time) && time <= rate.fetchedAt + 120000 && Date.now() - time < 86400000)
}
const afterFirst = await read(new URL('/api/status', endpoint))
for (let i = 0; i < 3; i++) assert.deepEqual(await read(endpoint), rate)
const concurrent = await Promise.all(Array.from({ length: 20 }, () => read(endpoint)))
assert.ok(concurrent.every(value => JSON.stringify(value) === JSON.stringify(rate)))
for (const [path, method, expected] of [['/api/rates', 'POST', 405], ['/api/rates', 'OPTIONS', 204], ['/missing', 'GET', 404]]) {
  const response = await fetch(new URL(path, endpoint), { method, redirect: 'error', signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, expected)
}
const after = await read(new URL('/api/status', endpoint))
assert.deepEqual(after.budget, afterFirst.budget)
assert.equal(after.fetchedAt, rate.fetchedAt)
const base = rate.gold * rate.fx / 31.1034768
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), source, health, rate,
  units: { gold: 'USD/troy ounce (toz)', fx: 'DOP/USD' },
  before, afterFirst, after,
  checks: { sequential: 3, concurrent: 20, identicalSnapshot: true, noExtraProviderReservations: true, post: 405, options: 204, missing: 404 },
  mercaOroDopPerGram: Object.fromEntries([10, 14, 18, 24].map(k => [`${k}K`, (base * k / 24).toFixed(2)]))
}, null, 2))
