# ORO CASH RD

Sitio estático en https://oro-cash-rd.github.io/ con cotización diaria de oro para fundición y valoración de joyas por WhatsApp.

GitHub Actions consulta Metals.Dev y publica una tasa diaria fija para República Dominicana. La clave se guarda únicamente como secreto `METALS_DEV_API_KEY`. Si no hay una tasa vigente, no se muestra una cotización numérica. Los horarios programados pueden retrasarse; la web espera una tasa nueva antes de cotizar.

El cálculo se realiza en el navegador con peso, pureza y un porcentaje de compra de 75%. Las tasas y la fórmula son públicas. Las nuevas cotizaciones no se guardan en una base de datos.

WhatsApp comercial: 18298568905. Android usa Intent, iOS usa whatsapp:// y escritorio usa wa.me. El cliente revisa y envía el mensaje; no se pide su teléfono.

Ver MIGRATION.md para operación, límites y retirada del servicio anterior. Pruebas: `npm test`.
