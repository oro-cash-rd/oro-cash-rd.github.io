import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { isCurrent, parseMarket, dayKey } from '../market.mjs'
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return {}; throw e } }
const now = Date.now(), day = dayKey(now), month = new Date(now).toISOString().slice(0,7)
if (process.argv[2] === 'prepare') {
  const rate = await read('data/rates.json')
  if (isCurrent(rate, now)) process.exit(0)
  if (!process.env.METALS_DEV_API_KEY) throw new Error('Configura el secreto METALS_DEV_API_KEY en GitHub Actions.')
  const old = await read('data/budget.json')
  const budget = {day,month,daily:old.day===day?old.daily:0,monthly:old.month===month?old.monthly:0}
  if (budget.daily >= 3 || budget.monthly >= 95) throw new Error('Límite de consultas alcanzado; no se usará una tasa vencida.')
  budget.daily++;budget.monthly++
  await writeFile('data/budget.json',JSON.stringify(budget,null,2)+'\n')
  await appendFile(process.env.GITHUB_OUTPUT,'refresh=true\n')
} else {
  try {
    const url = new URL('https://api.metals.dev/v1/latest')
    url.search = new URLSearchParams({api_key:process.env.METALS_DEV_API_KEY,currency:'USD',unit:'toz'})
    const response = await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'})
    if (!response.ok) throw new Error()
    const rate = parseMarket(await response.json(),Date.now())
    await writeFile('data/rates.json',JSON.stringify(rate,null,2)+'\n')
  } catch { throw new Error('No se obtuvo una tasa vigente. No se publicará una cotización vencida.') }
}
