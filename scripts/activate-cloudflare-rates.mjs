import { spawnSync } from 'node:child_process'

const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
if (!account || !token) throw new Error('Falta la configuración de Cloudflare.')
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/subdomain`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(15000), redirect: 'error'
})
if (!response.ok) throw new Error('No se pudo comprobar el subdominio público del servicio.')
const payload = await response.json()
const subdomain = payload.result?.subdomain
if (!payload.success || typeof subdomain !== 'string' || !/^[a-z0-9-]+$/.test(subdomain)) throw new Error('Configura primero un subdominio workers.dev en Cloudflare.')
const endpoint = `https://oro-cash-daily-rates.${subdomain}.workers.dev/api/rates`
const child = spawnSync(process.execPath, ['scripts/activate-demand-rates.mjs', endpoint], { stdio: 'inherit' })
if (child.status !== 0) process.exit(child.status || 1)
