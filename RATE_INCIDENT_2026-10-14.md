# Incidencia de tasa: 14 de octubre de 2026

## Causa comprobada

El servicio compartido falló antes de enviar la petición a Metals.Dev. El motor
workerd rechaza `redirect: 'error'` con `TypeError: Invalid redirect value`.
El mismo código funciona en Node, por eso las pruebas previas no detectaban
esta incompatibilidad. La reproducción local real del 14 de octubre devuelve
ese TypeError; `redirect: 'manual'` recibe HTTP 401 del proveedor sin clave.
Se utilizó la misma fecha de compatibilidad 2026-10-01 y Wrangler 4.149.0.

El diagnóstico de producción registró tres fallos `provider_network` de 38–98 ms,
sin HTTP ni código de proveedor. Quedó daily=3, monthly=16; el snapshot seguía
siendo el del 12 de octubre. `provider_quota_limit` indicaba el límite local,
no demostraba agotamiento de la cuenta del proveedor.

## Corrección

La petición usa `manual` y rechaza toda respuesta no exitosa, incluidas las 3xx,
sin seguir su Location ni reenviar la clave. Se conserva el timeout, la
validación de tres minutos, la cuota mensual, el Durable Object y sus datos.
No se modifica Supabase: el servicio productivo de tasas ya reside en Cloudflare.

El workflow manual `Reparar y verificar servicio de tasas` consulta `/usage`
desde Actions con la clave existente, emite solo números y estado, ejecuta las
pruebas, despliega y verifica la tasa real. Un `recovery_day` igual a hoy en RD
autoriza una sola reserva adicional (cuarta), contada también en la cuota
mensual. No borra ni devuelve reservas anteriores. La excepción caduca por día
y el workflow la retira tras la verificación, incluso si ésta falla.

## Verificación

19 pruebas Node aprobadas: incluye rechazo de 302 sin seguimiento y recuperación
acotada, caducidad y respeto a la cuota mensual. Bundle de producción comprobado.
La regresión adicional se ejecuta en workerd con Request y Durable Object reales
y únicamente la respuesta del proveedor simulada; pasa localmente y se integra
en el workflow de publicación habitual para detectar esta incompatibilidad.

La recuperación productiva y la cuota real se documentarán después de ejecutar
el workflow; estas comprobaciones locales no acreditan producción.
