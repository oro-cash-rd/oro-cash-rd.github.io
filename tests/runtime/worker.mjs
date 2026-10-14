import worker, { DailyRates } from '../../workers/daily-rates/worker.mjs'

// Use the real workerd Request constructor: Node accepts redirect:error, but
// workerd rejects it before doing network I/O. Only the provider body is mocked.
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init)
  if (request.redirect !== 'manual') throw new Error('Provider redirects must be rejected')
  const now = new Date().toISOString()
  return Response.json({ status: 'success', currency: 'USD', unit: 'toz', metals: { gold: 4200 }, currencies: { DOP: 1 / 61 }, timestamps: { metal: now, currency: now } })
}

export { DailyRates }
export default worker
