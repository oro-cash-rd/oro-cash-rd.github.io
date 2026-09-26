(() => {
  const cfg = window.ORO_CASH_CONFIG || {}
  const apiBase = String(cfg.apiBaseUrl || '').replace(/\/$/, '')
  const businessWhatsapp = String(cfg.businessWhatsapp || '18298568905').replace(/\D/g, '')
  const state = { weight: '', karat: null, quote: null }

  const $ = (id) => document.getElementById(id)
  const money = (value) => new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP', maximumFractionDigits: 0, minimumFractionDigits: 0
  }).format(value).replace('DOP', 'RD$')
  const time = (iso) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  const normalizePhone = (value) => {
    let digits = String(value || '').replace(/\D/g, '')
    if (digits.length === 10) digits = `1${digits}`
    return digits
  }

  const weightInput = $('weight')
  const quoteButton = $('quoteButton')
  const unknownNotice = $('unknownNotice')
  const quoteForm = $('quoteForm')
  const quoteResult = $('quoteResult')
  const errorBox = $('quoteError')
  const modalBackdrop = $('modalBackdrop')
  const clientWhatsapp = $('clientWhatsapp')
  const negotiationError = $('negotiationError')
  const continueButton = $('continueButton')

  function canQuote() {
    const weight = Number(String(weightInput.value).replace(',', '.'))
    return Number.isFinite(weight) && weight > 0 && state.karat && state.karat !== 'unknown'
  }

  function syncQuoteButton() { quoteButton.disabled = !canQuote() }

  document.querySelectorAll('[data-karat]').forEach((button) => {
    button.addEventListener('click', () => {
      state.karat = button.dataset.karat
      document.querySelectorAll('[data-karat]').forEach((b) => b.classList.toggle('active', b === button))
      unknownNotice.classList.toggle('hidden', state.karat !== 'unknown')
      errorBox.classList.add('hidden')
      syncQuoteButton()
    })
  })

  weightInput.addEventListener('input', () => {
    weightInput.value = weightInput.value.replace(/[^0-9.,]/g, '').slice(0, 10)
    syncQuoteButton()
  })

  async function request(path, body) {
    if (!apiBase) throw new Error('La cotización automática todavía no está disponible.')
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    let json = {}
    try { json = await res.json() } catch {}
    if (!res.ok) throw new Error(json.message || 'No pudimos completar la solicitud.')
    return json
  }

  quoteButton.addEventListener('click', async () => {
    if (!canQuote()) return
    quoteButton.disabled = true
    quoteButton.innerHTML = '<span class="spinner"></span> Calculando...'
    errorBox.classList.add('hidden')
    try {
      const weight = Number(weightInput.value.replace(',', '.'))
      const quote = await request('/quote', { weight_grams: weight, karat: state.karat })
      state.quote = quote
      $('resultAmount').textContent = money(quote.estimated_offer_dop)
      $('resultMeta').textContent = `${Number(quote.weight_grams).toFixed(2)} g · Oro ${quote.karat}`
      $('resultTime').textContent = `Tasa del día · Actualizada: ${time(quote.last_updated_at)}`
      $('staleWarning').classList.toggle('hidden', !quote.market_stale)
      quoteForm.classList.add('hidden')
      quoteResult.classList.remove('hidden')
      quoteResult.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch (error) {
      errorBox.textContent = error.message || 'Cotización temporalmente no disponible.'
      errorBox.classList.remove('hidden')
    } finally {
      quoteButton.innerHTML = 'CALCULAR COTIZACIÓN →'
      syncQuoteButton()
    }
  })

  $('resetQuote').addEventListener('click', () => {
    state.quote = null
    state.karat = null
    weightInput.value = ''
    document.querySelectorAll('[data-karat]').forEach((b) => b.classList.remove('active'))
    unknownNotice.classList.add('hidden')
    quoteResult.classList.add('hidden')
    quoteForm.classList.remove('hidden')
    syncQuoteButton()
  })

  $('acceptOffer').addEventListener('click', () => {
    if (!state.quote) return
    $('miniQuote').textContent = `${Number(state.quote.weight_grams).toFixed(2)} g · Oro ${state.quote.karat}`
    $('miniAmount').textContent = money(state.quote.estimated_offer_dop)
    clientWhatsapp.value = ''
    negotiationError.classList.add('hidden')
    continueButton.disabled = true
    modalBackdrop.classList.remove('hidden')
    setTimeout(() => clientWhatsapp.focus(), 50)
  })

  function closeModal() { modalBackdrop.classList.add('hidden') }
  $('modalClose').addEventListener('click', closeModal)
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

  clientWhatsapp.addEventListener('input', () => {
    clientWhatsapp.value = clientWhatsapp.value.replace(/[^0-9+()\-\s]/g, '').slice(0, 22)
    const digits = normalizePhone(clientWhatsapp.value)
    continueButton.disabled = digits.length < 11 || digits.length > 15
  })

  continueButton.addEventListener('click', async () => {
    if (!state.quote) return
    const phone = normalizePhone(clientWhatsapp.value)
    if (phone.length < 11 || phone.length > 15) return
    continueButton.disabled = true
    continueButton.innerHTML = '<span class="spinner"></span> Preparando WhatsApp...'
    negotiationError.classList.add('hidden')
    try {
      const result = await request('/negotiate', { quote_id: state.quote.quote_id, whatsapp: phone })
      window.location.assign(result.whatsapp_url)
    } catch (error) {
      negotiationError.textContent = error.message || 'No pudimos iniciar la negociación.'
      negotiationError.classList.remove('hidden')
      continueButton.disabled = false
      continueButton.textContent = 'CONTINUAR POR WHATSAPP →'
    }
  })

  const genericMessage = encodeURIComponent('Hola, quiero información para vender mi oro.')
  $('whatsappFloat').href = `https://wa.me/${businessWhatsapp}?text=${genericMessage}`
  syncQuoteButton()
})()
