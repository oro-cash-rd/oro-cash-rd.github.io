# Tasa diaria compartida: Oro Cash y Merca Oro RD

## Comportamiento

El primer visitante de Oro Cash de cada día dominicano llama al servicio HTTPS público `/api/rates`. Si nadie visita la web, la tarea de Merca Oro realiza esa misma llamada a las 09:00. El servicio consulta Metals.Dev para obtener oro USD/onza troy y USD/DOP en una sola respuesta. El primer resultado válido queda fijo hasta medianoche en `America/Santo_Domingo`.

Oro Cash y Merca Oro comparten ese snapshot, no hacen dos consultas independientes. Un Durable Object con almacenamiento SQLite conserva tasa y cuota, y serializa las solicitudes concurrentes. No guarda usuarios, teléfonos ni cotizaciones de clientes. Nunca se expone la clave en el navegador, la URL pública, el repositorio ni el prompt programado.

No se necesita GitHub para las consultas diarias una vez activado el servicio. GitHub sigue alojando la web y sirve para publicar cambios de código. El workflow antiguo deja de consultar al proveedor cuando `data/rates-source.json` indica `mode: demand`.

Si el proveedor responde con datos inválidos/antiguos, falla o agota su cuota, se devuelve HTTP 503, sin reetiquetar la tasa previa como actual. Máximo tres intentos diarios, separados por al menos un minuto, y 95 mensuales, conservando el consumo previo de Actions durante la activación. Se reserva la llamada antes de realizarla para cubrir errores y reinicios.

## Estado del candidato

Implementado y probado localmente. **Todavía sin activar**: `data/rates-source.json` mantiene el modo anterior hasta que el endpoint real pase la validación. No confundir la preparación del código con el despliegue productivo.

## Activación

1. Crear/habilitar Workers en la cuenta Cloudflare del operador y configurar un subdominio `workers.dev`.
2. En este repositorio, añadir los secretos Actions `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`. El token necesita permisos para desplegar Workers, crear/migrar Durable Objects e instalar secretos en esa cuenta. Usar los permisos mínimos que Cloudflare requiera; no pegar credenciales en chats ni código.
3. Reutilizar `METALS_DEV_API_KEY`, que ya existe en Actions. No hace falta leer ni volver a proporcionar su valor: el workflow lo pasa por stdin a `wrangler secret put`.
4. Integrar el candidato y ejecutar **Activar tasa compartida por visita** desde `main`. Se serializa con el workflow legado para trasladar su consumo previo sin carreras.
5. El workflow despliega el servicio, instala la clave, solicita una tasa real vigente, guarda la URL pública en `data/rates-source.json` y publica Oro Cash. Si cualquier comprobación falla antes de guardar la configuración, la web mantiene su fuente anterior.
6. Verificar `/api/rates` dos veces y comprobar mismo `fetchedAt`; abrir Oro Cash sin clicar y comprobar la llamada; confirmar que la tarea obtiene la URL desde `data/rates-source.json` y usa el snapshot vigente.

Consultar también el contador real de Metals.Dev si otros sistemas comparten la clave: el contador local solo registra las llamadas de esta integración. Reiniciar/recrear el Durable Object o trasladarlo de cuenta requiere conservar su cuota.

## Merca Oro RD

La tarea lee `data/rates-source.json` de `main`. En modo `demand`, hace GET a `url`: una lectura provoca la consulta si falta la tasa del día. No necesita token de Metals.Dev. Validar día, timestamps, valores positivos, unidades y antigüedad antes de generar la imagen.

Oro Cash conserva su oferta de compra al 75% y sus convenciones de pureza. La imagen de Merca Oro calcula `gold * fx / 31.1034768 * quilates / 24`, con 10, 14, 18 y 24K, sin descuento de compra; redondeo final a dos decimales.

No hay promesa de disponibilidad infalible del proveedor ni de entrega de imágenes al segundo exacto: la tarea programada conserva las 09:00 RD, y una consulta/generación fallida debe notificarse. Nunca publicar una tasa antigua como vigente para cubrir una incidencia.

## Validación

`npm test`: cambio de día y mes dominicanos, 100 peticiones simultáneas, persistencia tras reinicio, cuota, cooldown, proveedor antiguo, cliente y ausencia de fallback vencido. `wrangler deploy --dry-run` verifica el bundle; la prueba real necesita las credenciales de despliegue.
