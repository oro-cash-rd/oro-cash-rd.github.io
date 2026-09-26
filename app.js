(() => {
  const cfg = window.ORO_CASH_CONFIG || {}
  const apiBase = String(cfg.apiBaseUrl || '').replace(/\/$/, '')
  const businessWhatsapp = String(cfg.businessWhatsapp || '18298568905').replace(/\D/g, '')
  const $ = id => document.getElementById(id)
  const state = { kind: null, karat: null, quote: null, generation: 0, loading: false }
  const money = value => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(value).replace('DOP', 'RD$')
  const time = iso => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  // Native links stay on the user's click: no popup or asynchronous redirect.
  const wa = message => {
    const text = encodeURIComponent(message)
    const query = `phone=${businessWhatsapp}&text=${text}`
    const fallback = `https://wa.me/${businessWhatsapp}?text=${text}`
    const ua = navigator.userAgent || ''
    if (/Android/i.test(ua)) {
      // Let Android resolve WhatsApp / WhatsApp Business; Chrome falls back if unavailable.
      return `intent://send?${query}#Intent;scheme=whatsapp;S.browser_fallback_url=${encodeURIComponent(fallback)};end`
    }
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      return `whatsapp://send?${query}`
    }
    return fallback
  }
  const weight = () => Number($('weight').value.replace(',', '.'))
  const validWeight = () => Number.isFinite(weight()) && weight() > 0
  const manual = () => state.kind === 'jewelry' || state.karat === 'unknown'
  function sync() {
    const jewelry = state.kind === 'jewelry'
    const ready = Boolean(state.karat && (validWeight() || (jewelry && $('weightUnknown').checked)) && (!jewelry || $('jewelryType').value))
    $('quoteButton').classList.toggle('hidden', manual())
    $('detailsWhatsapp').classList.toggle('hidden', !manual())
    $('quoteButton').disabled = !ready || state.loading
    $('detailsWhatsapp').setAttribute('aria-disabled', String(!ready))
    $('detailsWhatsapp').tabIndex = ready ? 0 : -1
    if (ready) {
      const description = jewelry ? `Quiero vender una joya: ${$('jewelryType').value}.` : 'Quiero vender oro para fundición.'
      const grams = jewelry && $('weightUnknown').checked ? 'No lo sé' : `${weight()} g (aproximado)`
      $('detailsWhatsapp').href = wa(`Hola, ORO CASH RD. ${description}\nPeso: ${grams}.\nQuilataje: ${state.karat === 'unknown' ? 'No lo sé' : state.karat}.\nQuisiera una valoración y negociar con ustedes. Puedo compartir fotos de la pieza.`)
    } else $('detailsWhatsapp').removeAttribute('href')
    $('unknownNotice').classList.toggle('hidden', state.karat !== 'unknown')
  }
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
    state.kind = button.dataset.kind
    button.parentElement.classList.remove('awaiting-choice')
    state.generation++
    state.loading = false
    state.quote = null
    document.querySelectorAll('[data-kind]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)) })
    const jewelry = state.kind === 'jewelry'
    $('detailsPanel').classList.remove('hidden')
    $('jewelryField').classList.toggle('hidden', !jewelry)
    $('weightUnknownLabel').classList.toggle('hidden', !jewelry)
    $('weight').disabled = jewelry && $('weightUnknown').checked
    $('modeHint').textContent = jewelry ? 'Describe tu joya y negocia su valoración por WhatsApp.' : 'Calculamos el valor del oro por peso y pureza, como material para fundición.'
    $('formNote').textContent = jewelry ? 'Sin oferta automática. Revisamos tu pieza contigo.' : 'Estimación orientativa. Confirmamos peso y pureza presencialmente.'
    $('quoteResult').classList.add('hidden')
    $('quoteForm').classList.remove('hidden')
    $('quoteError').classList.add('hidden')
    $('quoteButton').textContent = 'CALCULAR VALOR DEL METAL →'
    sync()
  }))
  document.querySelectorAll('[data-karat]').forEach(button => button.addEventListener('click', () => {
    state.karat = button.dataset.karat
    document.querySelectorAll('[data-karat]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)) })
    sync()
  }))
  $('weight').addEventListener('input', () => { $('weight').value = $('weight').value.replace(/[^0-9.,]/g, '').slice(0, 10); sync() })
  $('jewelryType').addEventListener('change', sync)
  $('weightUnknown').addEventListener('change', () => { $('weight').disabled = $('weightUnknown').checked; sync() })
  $('detailsWhatsapp').addEventListener('click', event => { if ($('detailsWhatsapp').getAttribute('aria-disabled') === 'true') event.preventDefault() })
  $('quoteButton').addEventListener('click', async () => {
    if (state.kind !== 'scrap' || manual() || !validWeight() || !state.karat || state.loading) return
    const generation = ++state.generation
    state.loading = true
    $('quoteButton').disabled = true
    $('quoteButton').textContent = 'Calculando…'
    $('quoteError').classList.add('hidden')
    try {
      const res = await fetch(`${apiBase}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight_grams: weight(), karat: state.karat }) })
      const quote = await res.json()
      if (!res.ok) throw new Error(quote.message || 'No pudimos obtener la cotización. Puedes escribirnos por WhatsApp.')
      if (generation !== state.generation) return
      state.quote = quote
      $('resultAmount').textContent = money(quote.estimated_offer_dop)
      $('resultMeta').textContent = `${Number(quote.weight_grams).toFixed(2)} g · Oro ${quote.karat}`
      $('resultTime').textContent = `Tasa del día · ${time(quote.last_updated_at)}`
      $('staleWarning').classList.toggle('hidden', !quote.market_stale)
      $('acceptOffer').href = wa(`Hola, ORO CASH RD. Quiero vender oro para fundición.\nPeso: ${quote.weight_grams} g.\nQuilataje: ${quote.karat}.\nEstimación del metal: ${money(quote.estimated_offer_dop)} (sujeta a verificación).\nReferencia: ${quote.quote_id}.\nQuisiera conversar y coordinar una evaluación.`)
      $('quoteForm').classList.add('hidden')
      $('quoteResult').classList.remove('hidden')
    } catch (error) {
      if (generation !== state.generation) return
      $('quoteError').textContent = error.message || 'Cotización no disponible. Escríbenos por WhatsApp.'
      $('quoteError').classList.remove('hidden')
    } finally {
      if (generation === state.generation) {
        state.loading = false
        $('quoteButton').textContent = 'CALCULAR VALOR DEL METAL →'
        sync()
      }
    }
  })
  $('resetQuote').addEventListener('click', () => { state.quote = null; $('quoteResult').classList.add('hidden'); $('quoteForm').classList.remove('hidden'); sync() })
  sync()
})()
