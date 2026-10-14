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

La consulta real `/usage` confirmó HTTP 200, clave activa y 89/100 solicitudes
restantes antes de recuperar. La única reserva adicional obtuvo oro 4083.47
USD/onza troy y cambio 61.269047773431026 DOP/USD; fetchedAt
2026-10-14T17:23:06.083Z, timestamps de metal 17:22:09.993Z y moneda
17:22:15.535Z. Se conservaron daily=4/monthly=17 e historial previo.
Oro Cash calculó en Chrome 1 g / 24K = RD$6,027 con fecha 14/10/2026.

Cloudflare mantuvo inicialmente el código anterior en el Durable Object activo,
incluso tras completar el despliegue. El verificador consulta solo status hasta
confirmar la política y binding efectivos, con margen de seis minutos.
Este comportamiento también está reportado en
[workers-sdk #16235](https://github.com/cloudflare/workers-sdk/issues/16235).
Los dos primeros workflows no completaron su verificación por esta demora;
no se interpreta su fallo como falta de cuota ni se repite la consulta de tasa.

Verificación HTTPS real a las 17:25:33.956Z: política `manual` efectiva,
`recoveryDay=null`, snapshot vigente idéntico en tres lecturas sucesivas y
20 concurrentes; daily=4/monthly=17 sin incremento. OPTIONS 204, POST 405 y
ruta desconocida 404. Evidencia completa:
[JSON real](evidence/service-verification-20261014.json) y
[cotizador en Chrome](evidence/quote-recovered-20261014.png).

Precios Merca Oro sin descuento, RD$/g: 10K 3351.59, 14K 4692.22,
18K 6032.85 y 24K 8043.81. Oro Cash aplica sus purezas y oferta al 75%;
su estimación para 1 g / 24K es RD$6,027. Son convenciones diferentes.
La tarea de imagen existente puede consumir nuevamente el mismo endpoint;
no se modificó el horario ni se afirma entrega de una nueva imagen aquí.
