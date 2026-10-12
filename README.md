# ORO CASH RD

Sitio estático en https://oro-cash-rd.github.io/ con cotización diaria de oro para fundición y valoración de joyas por WhatsApp.

La primera visita del día consulta el servicio compartido de tasas, que obtiene oro y USD/DOP juntos de Metals.Dev y conserva el primer snapshot válido hasta medianoche dominicana. La clave permanece en el Worker como secreto `METALS_DEV_API_KEY`. Si no hay una tasa vigente, no se muestra una cotización numérica. GitHub Actions publica cambios de la web, sin consultar al proveedor en modo `demand`.

El servicio está activo en Cloudflare Workers Free con un Durable Object SQLite. Configuración pública: [data/rates-source.json](data/rates-source.json). Operación y evidencia: [DEMAND_RATES.md](DEMAND_RATES.md).

El cálculo se realiza en el navegador con peso, pureza y un porcentaje de compra de 75%. Las tasas y la fórmula son públicas. Las nuevas cotizaciones no se guardan en una base de datos.

WhatsApp comercial: 18298568905. Android usa Intent, iOS usa whatsapp:// y escritorio usa wa.me. El cliente revisa y envía el mensaje; no se pide su teléfono.

Ver MIGRATION.md para operación, límites y retirada del servicio anterior. Pruebas: `npm test`.
