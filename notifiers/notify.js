let provider = null
let adminPhone = process.env.ADMIN_PHONE || null

function setProvider(p) { provider = p }
function setAdminPhone(p) { adminPhone = p }

async function notifyAdmin(message) {
  if (provider && adminPhone) {
    try { await provider.sendText(adminPhone, message) } catch (e) { console.error('Notify admin error', e) }
  } else {
    console.log('[ADMIN NOTIFY]', message)
  }
}

async function notifyClient(phone, message) {
  if (provider && phone) {
    try { await provider.sendText(phone, message) } catch (e) { console.error('Notify client error', e) }
  } else {
    console.log('[CLIENT NOTIFY]', phone, message)
  }
}

async function notifyClientWithFile(phone, message, filePath) {
  if (provider && phone) {
    try {
      await provider.sendText(phone, message)
      if (filePath) {
        await provider.sendFile(phone, filePath, 'Factura.pdf')
      }
    } catch (e) {
      console.error('Notify client with file error', e)
    }
  } else {
    console.log('[CLIENT NOTIFY]', phone, message, filePath ? 'with file' : '')
  }
}

module.exports = { setProvider, setAdminPhone, notifyAdmin, notifyClient, notifyClientWithFile }
