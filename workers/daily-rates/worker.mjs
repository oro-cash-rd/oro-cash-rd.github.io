import { dayKey, parseMarket, isCurrent } from '../../market.mjs'
import seed from './seed.mjs'

const validationReasons = new Set(['provider_status', 'currency_unit', 'metal_unit', 'gold_value', 'fx_value', 'fx_range', 'metal_timestamp_invalid', 'metal_timestamp_old', 'metal_timestamp_future', 'currency_timestamp_invalid', 'currency_timestamp_old', 'currency_timestamp_future'])
const providerCode = data => Number.isSafeInteger(data?.error_code) && data.error_code >= 0 && data.error_code <= 99999 ? data.error_code : null
const timestampAge = (value, now) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? now - Date.parse(value) : null
const log = record => { try { console.log(JSON.stringify(record)) } catch {} }

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
  async recordAttempt(record) {
    log(record)
    try {
      const history = await this.ctx.storage.get('attemptHistory') || []
      await this.ctx.storage.put('attemptHistory', [...history, record].slice(-6))
    } catch {
      // Diagnostics must not change the outcome or leak storage exceptions.
      log({ event: 'daily_rate_diagnostic_store_failed', day: record.day, attempt: record.attempt })
    }
  }
  async fetch(request = new Request('https://internal/api/rates')) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(), day = dayKey(now), month = day.slice(0, 7)
      let rate = await this.ctx.storage.get('rate')
      const stored = await this.ctx.storage.get('budget')
      const prior = stored || seed
      // A failed cutover may leave Actions active. Import only additional legacy
      // consumption on retry, never overwrite consumption reserved by this object.
      const imported = await this.ctx.storage.get('importedBudget') || (stored ? seed : { daily: 0, monthly: 0 })
      const budget = {
        day, month,
        daily: (prior.day === day ? prior.daily : 0) + (stored && seed.day === day ? Math.max(0, seed.daily - (imported.day === day ? imported.daily : 0)) : 0),
        monthly: (prior.month === month ? prior.monthly : 0) + (stored && seed.month === month ? Math.max(0, seed.monthly - (imported.month === month ? imported.monthly : 0)) : 0),
        nextAttemptAt: prior.day === day ? prior.nextAttemptAt || 0 : 0
      }
      if (!stored || JSON.stringify(stored) !== JSON.stringify(budget)) await this.ctx.storage.put('budget', budget)
      if (JSON.stringify(imported) !== JSON.stringify(seed)) await this.ctx.storage.put('importedBudget', seed)
      if (!rate && isCurrent(seed.rate, now)) {
        rate = seed.rate
        await this.ctx.storage.put('rate', rate)
      }
      // Read-only diagnostics never initiate a provider request.
      if (new URL(request.url).pathname === '/api/status') return json({ day, budget, fetchedAt: rate?.fetchedAt ?? null, current: isCurrent(rate, now), requestPolicy: 'manual', recoveryDay: this.env.RECOVERY_DAY || null, attempts: await this.ctx.storage.get('attemptHistory') || [] })
      if (isCurrent(rate, now)) return json(rate)
      if (!this.env.METALS_DEV_API_KEY) return json({ error: 'service_not_configured', day }, 503)
      // Incident recovery is one extra reservation on a deployment-selected day.
      // It never resets the ledger and expires automatically at Dominican midnight.
      const dailyLimit = this.env.RECOVERY_DAY === day ? 4 : 3
      if (budget.daily >= dailyLimit || budget.monthly >= 95) return json({ error: 'provider_quota_limit', day }, 503)
      if (now < budget.nextAttemptAt) return json({ error: 'provider_retry_pending', day }, 503, Math.ceil((budget.nextAttemptAt - now) / 1000))
      // Count before the outbound request: crashes and failed calls still consume quota.
      budget.daily++
      budget.monthly++
      budget.nextAttemptAt = now + 60000
      await this.ctx.storage.put('budget', budget)
      const startedAt = Date.now()
      const record = { event: 'daily_rate_attempt', day, attempt: budget.daily, monthly: budget.monthly, startedAt, finishedAt: null, durationMs: null, providerDurationMs: null, stage: 'fetch', result: 'failure', reason: null, httpStatus: null, providerCode: null, metalAgeMs: null, currencyAgeMs: null }
      log({ event: 'daily_rate_attempt_started', day, attempt: budget.daily, monthly: budget.monthly, startedAt })
      try {
        const url = new URL('https://api.metals.dev/v1/latest')
        url.search = new URLSearchParams({ api_key: this.env.METALS_DEV_API_KEY, currency: 'USD', unit: 'toz' })
        // workerd supports follow/manual only. Manual + !ok rejects every 3xx
        // without forwarding the API key or consuming a second provider request.
        const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'manual' })
        record.providerDurationMs = Math.max(0, Date.now() - startedAt)
        record.httpStatus = response.status
        if (!response.ok) {
          record.stage = 'http'; record.reason = 'provider_http'
          try { record.providerCode = providerCode(await response.json()) } catch {}
          throw new Error('provider_failed')
        }
        record.stage = 'decode'
        const data = await response.json()
        const parsedAt = Date.now()
        record.providerCode = providerCode(data)
        record.metalAgeMs = timestampAge(data?.timestamps?.metal ?? data?.timestamp, parsedAt)
        record.currencyAgeMs = timestampAge(data?.timestamps?.currency ?? data?.timestamp, parsedAt)
        record.stage = 'validate'
        const result = parseMarket(data, parsedAt)
        record.stage = 'persist_rate'
        await this.ctx.storage.put('rate', result)
        record.result = 'success'; record.reason = 'ok'
        record.finishedAt = Date.now(); record.durationMs = Math.max(0, record.finishedAt - startedAt)
        await this.recordAttempt(record)
        return json(result)
      } catch (error) {
        if (record.stage === 'fetch') {
          record.reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'provider_timeout' : 'provider_network'
          record.providerDurationMs = Math.max(0, Date.now() - startedAt)
        } else if (record.stage === 'decode') record.reason = 'provider_json'
        else if (record.stage === 'validate') record.reason = validationReasons.has(error?.reason) ? error.reason : 'validation_rejected'
        else if (record.stage === 'persist_rate') record.reason = 'snapshot_store_failed'
        record.finishedAt = Date.now(); record.durationMs = Math.max(0, record.finishedAt - startedAt)
        await this.recordAttempt(record)
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
    if (path !== '/api/rates' && path !== '/api/status') return json({ error: 'not_found' }, 404)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } })
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
    const object = env.DAILY_RATES.get(env.DAILY_RATES.idFromName('shared-dop-gold'))
    return object.fetch(new Request(`https://internal${path}`))
  }
}
