const mercadopago = require('mercadopago')

if (process.env.MP_ACCESS_TOKEN) {
  mercadopago.configure({
    access_token: process.env.MP_ACCESS_TOKEN
  })
} else {
  console.warn('MP_ACCESS_TOKEN no configurado, MercadoPago no funcionará')
}

async function crearPreferenciaPago(reservaId, monto, descripcion) {
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn('MercadoPago no configurado, no se puede crear preferencia')
    return null
  }
  try {
    const preference = {
      items: [
        {
          title: descripcion,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: monto
        }
      ],
      back_urls: {
        success: `${process.env.PUBLIC_URL}/pago_exitoso.html`,
        failure: `${process.env.PUBLIC_URL}/pago_fallido.html`,
        pending: `${process.env.PUBLIC_URL}/pago_pendiente.html`
      },
      auto_return: 'approved',
      external_reference: reservaId,
      notification_url: process.env.MP_WEBHOOK
    }

    const result = await mercadopago.preferences.create(preference)
    return result.body
  } catch (error) {
    console.error('Error creando preferencia de MercadoPago:', error)
    return null
  }
}

module.exports = { crearPreferenciaPago }
