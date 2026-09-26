# ORO CASH RD — MVP público

Frontend 100% estático para GitHub Pages.

## Producción

- Sitio objetivo: `https://oro-cash-rd.github.io`
- Backend Supabase: `https://gxfseqvaytuoniacdagk.supabase.co/functions/v1`
- WhatsApp comercial: `18298568905`
- Edge Function cotización: `/quote`
- Edge Function negociación: `/negotiate`

## Flujo

1. El cliente elige joya u oro para fundición.
2. Joyas: declara tipo, peso aproximado (o desconocido) y quilataje (o desconocido). Abre WhatsApp con esos datos para valoración manual, sin cotización automática.
3. Fundición: peso y quilataje conocido se envían a `/quote`. Se muestra una estimación explícita del metal; el quilataje desconocido deriva a WhatsApp.
4. Los botones abren la app con Android Intent o `whatsapp://` en iOS; en escritorio usan `wa.me`. Android incluye fallback HTTPS si no hay una app compatible. Las confirmaciones del sistema/navegador no pueden suprimirse. El cliente revisa y envía el mensaje en WhatsApp.
5. No se solicita teléfono, no se abre modal y no se llama a `/negotiate`. La función antigua permanece disponible para compatibilidad, pero este frontend no la usa.

## Seguridad

El porcentaje interno, snapshots, datos de mercado y claves server-side no existen en el frontend.
El backend ignora cualquier precio, payout u oferta enviados desde el navegador y recalcula todo.
Las tablas privadas tienen RLS habilitada y no están disponibles para `anon` ni `authenticated`.

## Fuentes de mercado

Metals.Dev proporciona oro y USD/DOP en una sola consulta. La tasa queda fija durante el día de República Dominicana y se renueva con la primera cotización del día siguiente. La clave solo se guarda como secreto en Supabase.

## Archivos públicos

index.html, styles.css, app.js, config.js y .nojekyll.
