import { isCurrent } from './market.mjs'

// Configuration is public; the provider key lives only in the rate service.
export function createRateClient({ fetcher = fetch, now = Date.now } = {}) {
  let configuration, snapshot, pending
  async function load() {
    configuration ??= await (async () => {
      const response = await fetcher('./data/rates-source.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('Configuración de tasas no disponible.')
      const source = await response.json()
      if (source.url) {
        const url = new URL(source.url)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Servicio de tasas inválido.')
      }
      return source
    })()
    const endpoint = configuration.url || './data/rates.json'
    const response = await fetcher(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('No pudimos obtener la tasa de hoy. Intenta más tarde o escríbenos por WhatsApp.')
    const rate = await response.json()
    if (!isCurrent(rate, now())) throw new Error('La tasa de hoy todavía no está disponible.')
    snapshot = rate
    return rate
  }
  return async () => {
    if (isCurrent(snapshot, now())) return snapshot
    if (!pending) pending = load().finally(() => { pending = null })
    return pending
  }
}
