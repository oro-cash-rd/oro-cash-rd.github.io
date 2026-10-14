import assert from 'node:assert/strict'

// Runs only inside Actions with its existing secret; never prints URLs/errors.
try {
  assert.ok(process.env.METALS_DEV_API_KEY)
  const url = new URL('https://api.metals.dev/usage')
  url.searchParams.set('api_key', process.env.METALS_DEV_API_KEY)
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  const data = await response.json()
  const output = { httpStatus: response.status, status: data.status === 'success' ? 'success' : 'failure' }
  for (const field of ['total', 'used', 'remaining', 'error_code']) if (Number.isSafeInteger(data[field])) output[field] = data[field]
  console.log(JSON.stringify(output))
  assert.ok(response.ok && data.status === 'success' && data.remaining > 0)
} catch {
  console.error('Provider usage check failed; no credentials or raw errors printed.')
  process.exitCode = 1
}
