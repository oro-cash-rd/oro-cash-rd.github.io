# Tasa diaria compartida: Oro Cash y Merca Oro RD

## Comportamiento

El primer visitante de Oro Cash de cada día dominicano llama al servicio HTTPS público `/api/rates`. Si nadie visita la web, la tarea de Merca Oro realiza esa misma llamada a las 09:00. El servicio consulta Metals.Dev para obtener oro USD/onza troy y USD/DOP en una sola respuesta. El primer resultado válido queda fijo hasta medianoche en `America/Santo_Domingo`.

Oro Cash y Merca Oro comparten ese snapshot, no hacen dos consultas independientes. Un Durable Object con almacenamiento SQLite conserva tasa y cuota, y serializa las solicitudes concurrentes. No guarda usuarios, teléfonos ni cotizaciones de clientes. Nunca se expone la clave en el navegador, la URL pública, el repositorio ni el prompt programado.

No se necesita GitHub para las consultas diarias una vez activado el servicio. GitHub sigue alojando la web y sirve para publicar cambios de código. El workflow antiguo deja de consultar al proveedor cuando `data/rates-source.json` indica `mode: demand`.

Si el proveedor responde con datos inválidos/antiguos, falla o agota su cuota, se devuelve HTTP 503, sin reetiquetar la tasa previa como actual. Máximo tres intentos diarios, separados por al menos un minuto, y 95 mensuales, conservando el consumo previo de Actions durante la activación. Se reserva la llamada antes de realizarla para cubrir errores y reinicios.

## Estado productivo

Activado el 12 de octubre de 2026. `data/rates-source.json` público indica `mode: demand` y `https://oro-cash-daily-rates.omartinezg930112.workers.dev/api/rates`. Worker independiente en Workers Free; Durable Object `DailyRates` con migración `v1` / `new_sqlite_classes`, confirmado como SQLite en el panel real. No se contrató un plan de pago. [Disponibilidad oficial en Free](https://developers.cloudflare.com/durable-objects/platform/pricing/).

La activación trasladó la primera tasa válida de hoy y el consumo previo (1 diario / 10 mensual). Conservó `fetchedAt=1791804282895`, sin solicitar otra tasa ni cambiar timestamps. Los días siguientes se actualizan por el primer GET al servicio, independientemente de Actions. Reintentar activación importa solo consumo legado adicional; desplegar no reinicia los contadores persistidos.

## Activación

1. Crear/habilitar Workers en la cuenta Cloudflare del operador y configurar un subdominio `workers.dev`.
2. En este repositorio, añadir los secretos Actions `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`. El token actual de cuenta tiene solo `Individual Workers Editor` para `oro-cash-daily-rates`, con caducidad 12/10/2027. El Worker fue creado primero desde el panel para evitar conceder permiso para crear o borrar otros Workers. Configurar la variable pública `CLOUDFLARE_WORKERS_SUBDOMAIN=omartinezg930112`: evita requerir acceso de lectura a la configuración global de la cuenta. Este permiso Editor permite despliegue, migración del Durable Object y secretos del Worker. No pegar credenciales en chats ni código.
3. Reutilizar `METALS_DEV_API_KEY`, que ya existe en Actions. No hace falta leer ni volver a proporcionar su valor: el workflow lo pasa por stdin a `wrangler secret put`.
4. Integrar el candidato y ejecutar **Activar tasa compartida por visita** desde `main`. Se serializa con el workflow legado para trasladar su consumo previo sin carreras.
5. El workflow despliega el servicio, instala la clave, valida una tasa real vigente (reutilizando el snapshot del día si ya existe), guarda la URL pública en `data/rates-source.json` y publica Oro Cash. Si cualquier comprobación falla antes de guardar la configuración, la web mantiene su fuente anterior.
6. Verificar `/api/rates` dos veces y comprobar mismo `fetchedAt`; abrir Oro Cash sin clicar y comprobar la llamada; confirmar que la tarea obtiene la URL desde `data/rates-source.json` y usa el snapshot vigente.

Consultar también el contador real de Metals.Dev si otros sistemas comparten la clave: el contador local solo registra las llamadas de esta integración. Reiniciar/recrear el Durable Object o trasladarlo de cuenta requiere conservar su cuota.

## Merca Oro RD

La tarea lee `data/rates-source.json` de `main`. En modo `demand`, hace GET a `url`: una lectura provoca la consulta si falta la tasa del día. No necesita token de Metals.Dev. Validar día, timestamps, valores positivos, unidades y antigüedad antes de generar la imagen.

Oro Cash conserva su oferta de compra al 75% y sus convenciones de pureza. La imagen de Merca Oro calcula `gold * fx / 31.1034768 * quilates / 24`, con 10, 14, 18 y 24K, sin descuento de compra; redondeo final a dos decimales.

No hay promesa de disponibilidad infalible del proveedor ni de entrega de imágenes al segundo exacto: la tarea programada conserva las 09:00 RD, y una consulta/generación fallida debe notificarse. Nunca publicar una tasa antigua como vigente para cubrir una incidencia.

## Validación

Incidencia del 14/10/2026 y corrección de la petición en workerd:
[causa, recuperación acotada y evidencia](RATE_INCIDENT_2026-10-14.md).

`npm test`: cambio de día y mes dominicanos, 100 peticiones simultáneas, persistencia tras reinicio, cuota, cooldown, proveedor antiguo, cliente y ausencia de fallback vencido. `wrangler deploy --dry-run` verifica el bundle; la prueba real necesita las credenciales de despliegue.

`node scripts/verify-demand-rates.mjs` valida la configuración publicada, secreto instalado (`/health`), snapshot, timestamps, tres lecturas sucesivas y veinte concurrentes. Comprueba que todas las respuestas son idénticas y que los contadores no aumentan; también OPTIONS 204, POST 405 y ruta inexistente 404. `/api/status` solo lee snapshot y cuota: nunca consulta al proveedor ni expone credenciales. El límite corresponde a esta integración, no al consumo de otras aplicaciones que pudieran compartir la clave.

Evidencia del 12/10/2026:

- [Activación y publicación correctas](https://github.com/oro-cash-rd/oro-cash-rd.github.io/actions/runs/38268874150). El primer intento [38268599728](https://github.com/oro-cash-rd/oro-cash-rd.github.io/actions/runs/38268599728) falló únicamente al consultar el subdominio global; se resolvió con la variable pública, conservando el alcance del token.
- [Verificación HTTPS real](evidence/service-verification.json): snapshot idéntico y cuota 1/10 antes y después, sin consultas adicionales a Metals.Dev.
- [Registro de Chrome](evidence/browser-load.json): recarga de Oro Cash sin elegir ninguna opción; GET de configuración y GET `/api/rates` HTTP 200; mismo snapshot. [Captura](evidence/public-load.jpg).
- 11 pruebas locales y en Actions aprobadas. Proveedor simulado para fallos, cuota, cambio de día/mes y 100 peticiones concurrentes; no se provocaron fallos reales ni se borró el snapshot para gastar otra consulta.
- Tarea existente `Imagen diaria del oro` (`6acafed631e08191ba8aed5404401239`): inspeccionada en ChatGPT, activa, diaria a las 09:00 hora de República Dominicana, zona visible estándar del Atlántico. Su prompt descubre `data/rates-source.json`, consulta el endpoint en modo demand y mantiene `America/Santo_Domingo`. No se creó una tarea duplicada ni se cambió su configuración.
- [Ejecución manual de la tarea existente](evidence/merca-task-verification.json): confirmó que el servicio compartido respondía con el snapshot válido de hoy, verificó las unidades y obtuvo exactamente los cuatro precios indicados abajo. La imagen seguía en generación al observar esta validación; aquí se verifica la integración de tasas, no se afirma la entrega de esa imagen.
- [Publicación tras guardar evidencia](https://github.com/oro-cash-rd/oro-cash-rd.github.io/actions/runs/38269747994): éxito, reserva y consulta Metals.Dev omitidas en modo demand. La actualización diaria continúa por GET al servicio.

Snapshot preservado: gold `4170.75` USD/onza troy, fx `60.6752520894418` DOP/USD, día `2026-10-12`, fetchedAt `2026-10-12T11:24:42.895Z` (07:24:42.895 RD); metal `11:24:12.075Z`, moneda `11:23:08.262Z`. La respuesta de Metals.Dev en USD usa `currencies.DOP` como USD por DOP: se invierte una sola vez al producir fx. [Documentación del proveedor](https://metals.dev/docs).

Precios Merca Oro en RD$/g, sin descuento: 10K `3390.05`, 14K `4746.06`, 18K `6102.08`, 24K `8136.11`.
