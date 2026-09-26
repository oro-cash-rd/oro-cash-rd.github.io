# ORO CASH RD — MVP público

Frontend 100% estático para GitHub Pages.

## Producción

- Sitio objetivo: `https://oro-cash-rd.github.io`
- Backend Supabase: `https://gxfseqvaytuoniacdagk.supabase.co/functions/v1`
- WhatsApp comercial: `18298568905`
- Edge Function cotización: `/quote`
- Edge Function negociación: `/negotiate`

## Flujo

1. Cliente introduce peso y quilataje.
2. Frontend envía exclusivamente `weight_grams` y `karat` a `/quote`.
3. Backend obtiene datos de mercado, calcula el valor y aplica la configuración privada.
4. El navegador recibe únicamente la cotización pública y su referencia.
5. Al pulsar **ACEPTAR OFERTA ESTIMADA**, el cliente introduce su WhatsApp.
6. `/negotiate` registra WhatsApp, IP, ubicación aproximada, user-agent y quote_id.
7. El backend genera el enlace hacia el WhatsApp de ORO CASH RD con la cotización precargada.

## Seguridad

El porcentaje interno, snapshots, datos de mercado y claves server-side no existen en el frontend.
El backend ignora cualquier precio, payout u oferta enviados desde el navegador y recalcula todo.
Las tablas privadas tienen RLS habilitada y no están disponibles para `anon` ni `authenticated`.

## Fuentes de mercado

Metals.Dev proporciona oro y USD/DOP en una sola consulta. La tasa queda fija durante el día de República Dominicana y se renueva con la primera cotización del día siguiente. La clave solo se guarda como secreto en Supabase.

## Archivos públicos

index.html, styles.css, app.js, config.js y .nojekyll.
