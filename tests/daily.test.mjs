import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { dayKey, isCurrent, parseMarket, quoteFor } from '../market.mjs'
const now = Date.parse('2026-10-03T14:02:05Z')
const payload = (at = now) => ({ status:'success', currency:'USD', unit:'toz', metals:{gold:4142.33}, currencies:{DOP:1/60.05079493}, timestamps:{metal:new Date(at-60000).toISOString(),currency:new Date(at-60000).toISOString()} })
const memory = () => { const map=new Map();return {get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v))} }
test('Dominican midnight and expiry', () => {
  assert.equal(dayKey(Date.parse('2026-10-04T03:59:59Z')), '2026-10-03')
  const rate=parseMarket(payload(),now)
  assert.ok(isCurrent(rate,Date.parse('2026-10-04T03:59:59Z')))
  assert.equal(isCurrent(rate,Date.parse('2026-10-04T04:00:00Z')),false)
  assert.equal(isCurrent(rate,now-1),false)
})
test('independent known production quotes and purity',()=>{
  const rate=parseMarket(payload(),now)
  assert.equal(quoteFor(15,'10K',rate,now).estimated_offer_dop,37488)
  const sep=Date.parse('2026-09-26T14:00:00Z')
  const old={...rate,day:'2026-09-26',fetchedAt:sep,gold:4284.675,fx:59.48029119}
  assert.equal(quoteFor(28,'10K',old,sep).estimated_offer_dop,71695)
  assert.equal(quoteFor(20,'14K',{...old,fx:59.47973539},sep).estimated_offer_dop,71899)
  assert.equal(quoteFor(10,'24K',old,sep).estimated_offer_dop,61392)
  assert.throws(()=>quoteFor(.09,'10K',rate,now))
  assert.throws(()=>quoteFor(10000,'24K',rate,now))
  assert.throws(()=>quoteFor(1,'unknown',rate,now))
  assert.throws(()=>quoteFor(1,'10K',rate,now+86400000))
})
test('reject old market data, invalid FX, wrong units and future timestamps',()=>{
  for(const body of [payload(now-181000),payload(now+200000),{...payload(),unit:'g'},{...payload(),currencies:{DOP:0}},{...payload(),currencies:{DOP:60}},{...payload(),metals:{gold:'4142'}}]) assert.throws(()=>parseMarket(body,now))
})
test('Actions: reserve quota, skip current rate, and reject missing key / exhausted quota',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'oro-rates-'))
  const script=resolve('scripts/refresh.mjs'), output=join(dir,'output')
  await mkdir(join(dir,'data'))
  const run=(key='test-only')=>spawnSync(process.execPath,[script,'prepare'],{cwd:dir,env:{...process.env,METALS_DEV_API_KEY:key,GITHUB_OUTPUT:output},encoding:'utf8'})
  try {
    assert.notEqual(run('').status,0)
    assert.equal(run().status,0)
    const budget=JSON.parse(await readFile(join(dir,'data/budget.json')))
    assert.equal(budget.daily,1);assert.equal(budget.monthly,1)
    assert.equal(run().status,0);assert.equal(run().status,0);assert.notEqual(run().status,0)
    const time=Date.now();const rate=parseMarket(payload(time),time)
    await writeFile(join(dir,'data/rates.json'),JSON.stringify(rate))
    const before=await readFile(join(dir,'data/budget.json'),'utf8')
    assert.equal(run('').status,0) // A fixed valid snapshot needs neither key nor a new request.
    assert.equal(await readFile(join(dir,'data/budget.json'),'utf8'),before)
    await writeFile(join(dir,'data/rates.json'),'{}')
    await writeFile(join(dir,'data/budget.json'),JSON.stringify({...budget,daily:0,monthly:95}))
    assert.notEqual(run().status,0)
  }finally{await rm(dir,{recursive:true,force:true})}
})
