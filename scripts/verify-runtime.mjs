import assert from 'node:assert/strict'
import { isCurrent } from '../market.mjs'

const endpoint = 'http://127.0.0.1:8798/api/rates'
let response
for (let attempt = 0; attempt < 30; attempt++) {
  try { response = await fetch(endpoint); break } catch { await new Promise(resolve => setTimeout(resolve, 500)) }
}
assert.ok(response, 'Local workerd did not start')
assert.equal(response.status, 200, await response.clone().text())
const rate = await response.json()
assert.ok(isCurrent(rate))
assert.equal(rate.gold, 4200)
assert.equal(rate.fx, 61)
const status = await (await fetch('http://127.0.0.1:8798/api/status')).json()
assert.equal(status.budget.daily, 1)
assert.equal(status.attempts.at(-1).result, 'success')
assert.equal(status.attempts.at(-1).httpStatus, 200)
assert.deepEqual(await (await fetch(endpoint)).json(), rate)
console.log('PASS: real workerd Request + Durable Object, simulated provider; one daily reservation')
