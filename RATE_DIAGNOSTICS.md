# Diagnóstico de los intentos de tasa compartida

El bloqueo local `provider_quota_limit` sigue significando tres reservas diarias o 95 mensuales. No prueba un agotamiento de la cuenta Metals.Dev. Los límites, el cooldown de 60 segundos, el timeout de diez segundos, la validación de tres minutos y el snapshot fijo del día permanecen iguales.

## Datos conservados

Por cada intento realmente reservado, el servicio emite un evento de inicio y un resultado terminal. El resultado incluye día, número de intento, consumo mensual local, horas de inicio y fin en epoch milisegundos, duración total, duración hasta recibir cabeceras, HTTP, código numérico acotado del proveedor, etapa, motivo cerrado y edades de metal/moneda en milisegundos. Una edad negativa significa un timestamp futuro.

Se conservan los últimos seis resultados terminales en `attemptHistory`, dentro del mismo Durable Object. GET `/api/status` los expone en `attempts` sin consultar al proveedor ni reservar cuota. Las lecturas de caché, cooldown y bloqueo tampoco crean intentos ni sustituyen el historial. Un reinicio conserva el historial; un fallo al guardar el diagnóstico se registra con un evento fijo y no cambia el resultado de la consulta.

No se registran claves, URL saliente, cuerpo completo, mensaje del proveedor, datos de visitantes ni excepciones crudas. El historial es público y solo contiene estos campos numéricos y motivos cerrados. La configuración habilita Workers Logs al 100 %, deshabilita registros automáticos de invocación y deshabilita trazas. No intenta atribuir solicitudes a usuarios ni a la automatización.

Los motivos distinguen `provider_http`, `provider_network`, `provider_timeout`, `provider_json`, `provider_status`, unidades, valores de oro/cambio, timestamps inválidos/antiguos/futuros y `snapshot_store_failed`. Por ejemplo, HTTP 429 con código 1203 identifica el error del proveedor; `metal_timestamp_old` con HTTP 200 identifica un rechazo de datos. Ninguno de esos ejemplos demuestra la causa del incidente pasado.

## Instalación autorizada

Ejecutar el instalador autorizado **Instalar y desplegar diagnóstico de tasa** desde `main`. Instala el parche una vez, después de comprobar hashes y pasar las pruebas; su guarda rechaza una segunda aplicación o cambios posteriores. No se añade otro workflow de despliegue. El workflow usa la cuenta y token Cloudflare existentes, el nombre del Worker, el binding y las migraciones vigentes. Regenera la misma semilla desde el ledger legado para conservar la importación durante despliegues posteriores. No reinstala la clave Metals.Dev, no valida llamando a `/api/rates`, no escribe snapshots/configuración en GitHub y no crea un Durable Object nuevo.

Verificar que el despliegue terminó y que la versión activa contiene el diagnóstico. Leer `/api/status`: debe conservar contadores y snapshot; `attempts` estará vacío hasta un nuevo intento ordinario. Si la cuota diaria ya está agotada, no borrar contadores ni provocar nuevas consultas para verificar.

Después de medianoche America/Santo_Domingo, revisar el primer intento ordinario provocado por una visita o por la tarea existente de las 09:00. Correlacionar `daily_rate_attempt_started` y `daily_rate_attempt` por día/número/hora en Cloudflare Observability, y leer `/api/status` para el resultado conservado. Una tasa válida debe mantener el mismo `fetchedAt` en lecturas posteriores sin consumir otra consulta.

Los eventos históricos que no se registraron no pueden reconstruirse con este cambio. La instalación del diagnóstico tampoco resuelve por sí sola el fallo original.

## Validación local

`npm test` utiliza proveedor simulado. Cubre HTTP/códigos, JSON, red, timeout, rechazos de timestamps, guardado del snapshot, fallo del almacenamiento diagnóstico, límites de historial, persistencia, cuotas/cooldown, concurrencia y ausencia de secretos. No consulta Metals.Dev.

Configuración de logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
