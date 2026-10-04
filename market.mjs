export const DAY_ZONE = 'America/Santo_Domingo'
export const dayKey = now => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: DAY_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export const unavailable = () => new Error('La tasa de hoy no está disponible. Intenta más tarde o escríbenos por WhatsApp.')
export function isCurrent(rate, now = Date.now()) {
  return Boolean(rate && rate.day === dayKey(now) && Number.isFinite(rate.fetchedAt) && rate.fetchedAt <= now && now - rate.fetchedAt < 86400000 && rate.day === dayKey(rate.fetchedAt) && Number.isFinite(rate.gold) && rate.gold > 0 && Number.isFinite(rate.fx) && rate.fx >= 10 && rate.fx <= 200)
}
export function parseMarket(data, now) {
  if (data?.status !== 'success' || data.currency !== 'USD' || data.unit !== 'toz') throw unavailable()
  const gold = data.metals?.gold, inverseFx = data.currencies?.DOP
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold <= 0 || typeof inverseFx !== 'number' || !Number.isFinite(inverseFx) || inverseFx <= 0) throw unavailable()
  const fx = 1 / inverseFx
  if (fx < 10 || fx > 200) throw unavailable()
  const timestamps = [data.timestamps?.metal ?? data.timestamp, data.timestamps?.currency ?? data.timestamp]
  if (timestamps.some(t => typeof t !== 'string' || !Number.isFinite(Date.parse(t)) || now - Date.parse(t) > 180000 || Date.parse(t) - now > 120000)) throw unavailable()
  return { day: dayKey(now), fetchedAt: now, gold, fx, metalTimestamp: timestamps[0], currencyTimestamp: timestamps[1] }
}
// Decimal rational arithmetic; 10K is exactly 10/24, other purities match the existing backend.
const purity = { '10K': [10n,24n], '14K': [585n,1000n], '18K': [750n,1000n], '21K': [875n,1000n], '22K': [9167n,10000n], '24K': [999n,1000n] }
function fraction(value) {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, decimal = ''] = coefficient.split('.')
  const scale = decimal.length - Number(exponent)
  return scale >= 0 ? [BigInt(whole + decimal), 10n ** BigInt(scale)] : [BigInt(whole + decimal) * 10n ** BigInt(-scale), 1n]
}
export function quoteFor(weight, karat, rate, now = Date.now()) {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0.1 || weight > 10000 || !Object.hasOwn(purity, karat)) throw new Error('Revisa el peso (mínimo 0.1 g) y el quilataje.')
  if (!isCurrent(rate, now)) throw unavailable()
  let numerator = 75n, denominator = 100n
  for (const [n,d] of [fraction(weight), purity[karat], fraction(rate.gold), fraction(rate.fx), [10000000n,311034768n]]) { numerator *= n; denominator *= d }
  const offer = Number((numerator * 2n + denominator) / (2n * denominator))
  if (offer > 500000) throw new Error('Por este importe necesitamos una valoración directa. Escríbenos por WhatsApp.')
  return { quote_id: crypto.randomUUID(), weight_grams: Number(weight.toFixed(2)), karat, estimated_offer_dop: offer, last_updated_at: new Date(rate.fetchedAt).toISOString(), valid_until: new Date(Date.parse(rate.day + 'T00:00:00-04:00') + 86400000).toISOString(), market_stale: false }
}
