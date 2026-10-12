import { writeFile } from 'node:fs/promises'
import { isCurrent } from '../market.mjs'

const endpoint = new URL(process.argv[2])
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/api/rates') throw new Error('Se requiere URL HTTPS pública /api/rates sin credenciales.')
const response = await fetch(endpoint, { signal: AbortSignal.timeout(20000), cache: 'no-store', redirect: 'error' })
if (!response.ok) throw new Error('El servicio no devuelve una tasa vigente; no se activa.')
const rate = await response.json()
if (!isCurrent(rate)) throw new Error('La tasa no corresponde al día dominicano actual; no se activa.')
const stamp = Date.now()
for (const value of [rate.metalTimestamp, rate.currencyTimestamp]) {
  const time = Date.parse(value)
  if (!Number.isFinite(time) || time > rate.fetchedAt + 120000 || stamp - time >= 86400000) throw new Error('Timestamp inválido; no se activa.')
}
await writeFile('data/rates-source.json', JSON.stringify({ mode: 'demand', url: endpoint.href }, null, 2) + '\n')
await writeFile('data/rates.json', JSON.stringify(rate, null, 2) + '\n')
// The snapshot is just a public mirror; new daily requests go to the service.
console.log('Servicio de tasas validado y configuración preparada.')
