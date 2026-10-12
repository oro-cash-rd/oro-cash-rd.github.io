import { dayKey, parseMarket, isCurrent } from '../../market.mjs'
import seed from './seed.mjs'

const json = (body, status = 200, retry = null) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...(retry ? { 'Retry-After': String(retry) } : {})
  }
})

// One global object serializes both Oro Cash visits and Merca Oro requests.
export class DailyRates {
  constructor(ctx, env) { this.ctx = ctx; this.env = env }
  async fetch() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(), day = dayKey(now), month = day.slice(0, 7)
      const rate = await this.ctx.storage.get('rate')
      if (isCurrent(rate, now)) return json(rate)
      if (!this.env.METALS_DEV_API_KEY) return json({ error: 'service_not_configured', day }, 503)
      const prior = (await this.ctx.storage.get('budget')) || seed
      const budget = {
        day, month,
        daily: prior.day === day ? prior.daily : 0,
        monthly: prior.month === month ? prior.monthly : 0,
        nextAttemptAt: prior.day === day ? prior.nextAttemptAt || 0 : 0
      }
      if (budget.daily >= 3 || budget.monthly >= 95) return json({ error: 'provider_quota_limit', day }, 503)
      if (now < budget.nextAttemptAt) return json({ error: 'provider_retry_pending', day }, 503, Math.ceil((budget.nextAttemptAt - now) / 1000))
      // Count before the outbound request: crashes and failed calls still consume quota.
      budget.daily++
      budget.monthly++
      budget.nextAttemptAt = now + 60000
      await this.ctx.storage.put('budget', budget)
      try {
        const url = new URL('https://api.metals.dev/v1/latest')
        url.search = new URLSearchParams({ api_key: this.env.METALS_DEV_API_KEY, currency: 'USD', unit: 'toz' })
        const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
        if (!response.ok) throw new Error('provider_failed')
        const result = parseMarket(await response.json(), Date.now())
        await this.ctx.storage.put('rate', result)
        return json(result)
      } catch {
        // Do not leak URLs, keys or provider error bodies; never re-date old data.
        return json({ error: 'fresh_rate_unavailable', day: dayKey(Date.now()) }, 503, 60)
      }
    })
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    if (path === '/health') return json({ service: 'oro-cash-daily-rates', configured: Boolean(env.METALS_DEV_API_KEY) })
    if (path !== '/api/rates') return json({ error: 'not_found' }, 404)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } })
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
    const object = env.DAILY_RATES.get(env.DAILY_RATES.idFromName('shared-dop-gold'))
    return object.fetch('https://internal/api/rates')
  }
}
