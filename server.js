require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const path = require('path')
const rateLimit = require('express-rate-limit')
const winston = require('winston')
const { connect, getDB } = require('./db/mongo')
const reservasRepo = require('./repositories/reservasRepo')
const pagosRepo = require('./repositories/pagosRepo')
const destinosRepo = require('./repositories/destinosRepo')
const vehiculosRepo = require('./repositories/vehiculosRepo')
const conductoresRepo = require('./repositories/conductoresRepo')
const { setProvider, setAdminPhone, notifyAdmin, notifyClient, notifyClientWithFile } = require('./notifiers/notify')
const suscripcionesRepo = require('./repositories/suscripcionesRepo')
const codigosRepo = require('./repositories/codigosRepo')
const { body, validationResult } = require('express-validator')
const { generateFacturaPDF } = require('./utils/generatePDF')
const { geocodeAddress, reverseGeocode, calculateDistance } = require('./utils/googleMaps')
const { getAuthorizationUrl, exchangeCodeForToken, getUserInfo } = require('./utils/openStreetMap')

const app = express()
app.use(cors())
app.use(bodyParser.json())

// Configuración de logs con Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
})

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 requests por windowMs
  message: 'Demasiadas solicitudes desde esta IP, por favor intenta más tarde.'
})
app.use('/api/', limiter)
// Auth básica para admin (usuario: ADMIN_EMAIL, clave: ADMIN_PASS)
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="RutaLibre Admin"')
    return res.status(401).send('Autenticación requerida')
  }
  const [user, pass] = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8').split(':')
  if (user === (process.env.ADMIN_EMAIL || 'facucercuetti420@gmail.com') && pass === (process.env.ADMIN_PASS || 'Mikias420')) return next()
  return res.status(403).send('Credenciales incorrectas')
}

app.use(express.static(path.join(__dirname, 'public')))
app.use('/admin', requireAdmin, express.static(path.join(__dirname, 'admin')))

// Servir el QR desde la raíz
app.get('/bot.qr.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'bot.qr.png'))
})

const BASE_PORT = Number(process.env.PORT || 3000)

// Public endpoints
app.post('/api/pagos', async (req, res) => {
  try {
    const { reservaId, monto, metodo, email } = req.body
    if (!reservaId || !monto || !email) return res.status(400).json({ ok: false, error: 'Datos incompletos' })
    if (isNaN(Number(monto)) || Number(monto) <= 0) return res.status(400).json({ ok: false, error: 'Monto inválido' })
    const reserva = await reservasRepo.obtener(reservaId)
    if (!reserva) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' })
    const pago = await pagosRepo.crearPago({ reservaId, monto, metodo, email })
    await notifyAdmin(`Nuevo pago pendiente para reserva ${reservaId}. Pago ID: ${pago._id}`)
    res.json({ ok: true, pago })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Webhook para Mercado Pago IPN (GET con query params)
app.get('/api/webhook', async (req, res) => {
  try {
    const { topic, id } = req.query;
    if (topic !== 'payment') return res.status(400).send('Invalid topic');
    if (!id) return res.status(400).send('ID required');

    // Para IPN, Mercado Pago envía GET, pero para actualizar, asumimos aprobado por simplicidad
    // En producción, consultar API de MP para obtener estado real
    const estado = 'aprobado'; // Placeholder - DEBE SER REEMPLAZADO CON CONSULTA REAL A LA API
    const pago = await pagosRepo.setEstado(id, estado);
    const reserva = await reservasRepo.obtener(pago.reservaId);
    if (estado === 'aprobado') {
      await notifyAdmin(`Pago APROBADO ${pago._id} para reserva ${pago.reservaId}. Asignar vehículo y conductor en panel admin.`);
      await notifyClient(reserva.clienteTelefono, `¡Pago aprobado! 🎉 Estamos asignando vehículo y conductor para tu viaje a ${reserva.destino}. Te avisamos en breve.`);
    }
    res.send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(500).send('Error');
  }
});

// Webhook alternativo para POST (si MP cambia)
app.post('/api/webhook', async (req, res) => {
  try {
    const id = req.body.data ? req.body.data.id : req.body.id;
    if (!id) return res.status(400).json({ ok: false, error: 'ID no encontrado' });
    const estado = req.body.action === 'payment.updated' ? 'aprobado' : 'rechazado';
    if (!['aprobado','rechazado'].includes(estado)) return res.status(400).json({ ok:false, error: 'Estado inválido' });
    const pago = await pagosRepo.setEstado(id, estado);
    const reserva = await reservasRepo.obtener(pago.reservaId);
    if (estado === 'aprobado') {
      await notifyAdmin(`Pago APROBADO ${pago._id} para reserva ${pago.reservaId}. Asignar vehículo y conductor en panel admin.`);
      await notifyClient(reserva.clienteTelefono, `¡Pago aprobado! 🎉 Estamos asignando vehículo y conductor para tu viaje a ${reserva.destino}. Te avisamos en breve.`);
    } else if (estado === 'rechazado') {
      await notifyClient(reserva.clienteTelefono, `Tu pago fue rechazado ❌. Podés intentar nuevamente desde el enlace que te compartimos.`);
    }
    res.json({ ok: true, pago });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Endpoint para suscripción
app.post('/api/suscripcion', [
  body('nombre').isLength({ min: 2 }).withMessage('Nombre debe tener al menos 2 caracteres'),
  body('email').isEmail().withMessage('Email inválido'),
  body('telefono').isLength({ min: 10 }).withMessage('Teléfono inválido'),
  body('tipoCliente').isIn(['turista', 'minero', 'empresa', 'urbano']).withMessage('Tipo de cliente inválido')
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    logger.warn('Errores de validación en suscripción:', errors.array())
    return res.status(400).json({ ok: false, errors: errors.array() })
  }
  try {
    const data = req.body
    // Simular aprobación de pago
    // En producción, integrar con gateway de pago
    const suscripcion = await suscripcionesRepo.crearSuscripcion(data)
    // Generar código único
    const descuento = 10 // 10% descuento
    const usosMax = 5 // Máximo 5 usos
    const codigo = await codigosRepo.crearCodigo(data.plan, descuento, usosMax)
    // Generar PDF
    try {
      const pdfPath = await generateFacturaPDF(suscripcion, codigo.codigo)
      // Enviar por WhatsApp
      await notifyClientWithFile(data.telefono + '@c.us', `¡Suscripción activada! 🎉 Tu código para empleados: ${codigo.codigo} (válido por ${usosMax} usos con ${descuento}% descuento).`, pdfPath)
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError)
      await notifyClient(data.telefono + '@c.us', `¡Suscripción activada! 🎉 Tu código para empleados: ${codigo.codigo} (válido por ${usosMax} usos con ${descuento}% descuento). Nota: No se pudo generar el PDF.`)
    }
    // Nota: Enviar PDF adjunto requiere extensión del notifyClient para archivos
    logger.info('Suscripción creada:', suscripcion._id)
    res.json({ ok: true, suscripcion, codigo: codigo.codigo })
  } catch (e) {
    logger.error('Error en suscripción:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Admin APIs
app.get('/api/admin/reservas', requireAdmin, async (req, res) => {
  const estado = req.query.estado
  const data = estado ? await reservasRepo.listarPorEstado(estado) : await reservasRepo.listarPorEstado('pendiente')
  res.json({ ok: true, data })
})

app.post('/api/admin/asignar', requireAdmin, async (req, res) => {
  try {
    const { reservaId, patente, telefonoConductor } = req.body
    if (!reservaId || !patente || !telefonoConductor) return res.status(400).json({ ok:false, error:'Datos incompletos' })

    // Buscar datos completos para notificación enriquecida
    const db = getDB()
    const vehDoc = await db.collection('vehiculos').findOne({ patente })
    const conDoc = await db.collection('conductores').findOne({ telefono: telefonoConductor })
    const vehiculo = vehDoc ? { patente: vehDoc.patente, modelo: vehDoc.modelo } : { patente }
    const conductor = conDoc ? { telefono: conDoc.telefono, nombre: conDoc.nombre } : { telefono: telefonoConductor }

    // Obtener detalles de la reserva
    const reserva = await reservasRepo.obtener(reservaId)
    if (!reserva) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' })

    // Asignar reserva
    const reservaActualizada = await reservasRepo.asignar(reservaId, vehiculo, conductor)
    await vehiculosRepo.setDisponible(patente, false)
    await conductoresRepo.setDisponible(telefonoConductor, false)

    // Calcular distancia aproximada en horas
    let horasEstimadas = 0
    if (reserva.distancia) {
      horasEstimadas = Math.ceil(reserva.distancia / 60) // Asumiendo velocidad promedio de 60 km/h
    }

    // Validar ubicación del conductor si tiene lat/lng
    if (conDoc && conDoc.latActual && conDoc.lngActual) {
      const origenCoords = await geocodeAddress(reserva.origen)
      if (origenCoords) {
        const distancia = calculateDistance(conDoc.latActual, conDoc.lngActual, origenCoords.lat, origenCoords.lng)
        if (distancia > 1) {
          await notifyClient(telefonoConductor, `📍 Estás a ${Math.round(distancia)} km del origen. Dirígete al punto de origen: ${reserva.origen}`)
        }
      }
    }

    // ========== NOTIFICACIONES MEJORADAS PARA VIAJES EN EFECTIVO ==========

    if (reserva.metodoPago === 'efectivo') {
      // 1. NOTIFICAR AL CLIENTE - Información detallada
      const clienteInfo = [
        `✅ ¡Reserva confirmada! 🎯`,
        ``,
        `👤 Cliente: ${reservaActualizada.clienteNombre}`,
        ``,
        `📅 Fecha/Hora: ${reservaActualizada.fecha} ${reservaActualizada.hora}`,
        ``,
        `🗺️ Origen:`,
        `${reservaActualizada.origen}`,
        ``,
        `🎯 Destino:`,
        `${reservaActualizada.destino}`,
        ``,
        `📏 Distancia: ~${Math.round(reservaActualizada.distancia || 0)} km`,
        `⏱️ Tiempo estimado: ~${horasEstimadas} horas`,
        ``,
        `💰 Valor del viaje: ARS ${reservaActualizada.precio.toLocaleString()}`,
        ``,
        `🚗 Vehículo: ${vehiculo.modelo || 'Vehículo'} (${vehiculo.patente})`,
        `👨‍💼 Conductor: ${conductor.nombre || 'Conductor'} (${conductor.telefono})`,
        ``,
        `⚠️ Nota: peajes, permisos, combustible extra o esperas especiales se facturan aparte.`
      ]

      // Enviar información al cliente en mensajes separados como solicitado
      await notifyClient(reservaActualizada.clienteTelefono, clienteInfo.join('\n'))

      // 2. NOTIFICAR AL CONDUCTOR - Información detallada para viajes en efectivo
      const conductorInfo = [
        `🚗 ¡Nuevo viaje asignado! 📍`,
        ``,
        `👤 Cliente: ${reservaActualizada.clienteNombre}`,
        `📞 Teléfono cliente: ${reservaActualizada.clienteTelefono}`,
        ``,
        `📅 Fecha/Hora: ${reservaActualizada.fecha} ${reservaActualizada.hora}`,
        ``,
        `🗺️ Origen:`,
        `${reservaActualizada.origen}`,
        ``,
        `🎯 Destino:`,
        `${reservaActualizada.destino}`,
        ``,
        `📏 Distancia: ~${Math.round(reservaActualizada.distancia || 0)} km`,
        `⏱️ Tiempo estimado: ~${horasEstimadas} horas`,
        ``,
        `💵 Valor a cobrar al cliente: ARS ${reservaActualizada.precio.toLocaleString()}`,
        `💰 Comisión (20%): ARS ${Math.round(reservaActualizada.precio * 0.20).toLocaleString()}`,
        ``,
        `👥 Pasajeros: ${reservaActualizada.numPersonas}`,
        ``,
        `🔑 Credenciales de acceso al panel:`,
        `Usuario: ${telefonoConductor}`,
        `Contraseña: ${conDoc?.password || 'Consultar con admin'}`,
        ``,
        `🌐 Enlace del panel: ${PUBLIC_URL}/conductor/login.html`,
        ``,
        `📍 Una vez conectado, activa el compartir ubicación para que aparezcas en el mapa del administrador.`
      ]

      await notifyClient(telefonoConductor, conductorInfo.join('\n'))

      // 3. Notificar al administrador
      if (ADMIN_PHONE) {
        await notifyAdmin(`✅ Viaje en efectivo asignado: ${reservaId}\nCliente: ${reservaActualizada.clienteNombre}\nConductor: ${conductor.nombre || telefonoConductor}\nVehículo: ${vehiculo.patente}\nMonto: ARS ${reservaActualizada.precio}`)
      }

    } else {
      // ========== NOTIFICACIONES PARA VIAJES CON TARJETA (mantener como estaba) ==========
      const vehTxt = vehiculo.modelo ? `${vehiculo.modelo}, patente ${vehiculo.patente}` : vehiculo.patente
      const conTxt = conductor.nombre ? `${conductor.nombre}, 📞 ${conductor.telefono}` : conductor.telefono
      await notifyClient(reserva.clienteTelefono, `Reserva confirmada ✅\nVehículo asignado: ${vehTxt}\nConductor: ${conTxt}\nFecha/hora: ${reserva.fecha} ${reserva.hora}\nOrigen/Destino: ${reserva.origen} → ${reserva.destino}`)

      // Notificar al conductor con credenciales de login
      const loginUrl = `${PUBLIC_URL}/conductor/login.html`
      await notifyClient(telefonoConductor, `🚗 ¡Nuevo viaje asignado! 📍

👤 Cliente: ${reserva.clienteNombre}
📞 Teléfono cliente: ${reserva.clienteTelefono}
🏠 Origen: ${reserva.origen}
🎯 Destino: ${reserva.destino}
📅 Fecha/Hora: ${reserva.fecha} ${reserva.hora}
👥 Pasajeros: ${reserva.numPersonas}
💰 Monto: $${reserva.precio} (${reserva.metodoPago})

🔑 Para iniciar sesión y compartir tu ubicación:
Usuario: ${telefonoConductor}
Contraseña: ${conDoc.password}
Enlace: ${loginUrl}

📍 Una vez conectado, activa el compartir ubicación para que aparezcas en el mapa del administrador.`)

      // Notificar al administrador
      if (ADMIN_PHONE) {
        await notifyAdmin(`💳 Nueva reserva con pago pendiente ${reserva._id} de ${reserva.clienteNombre} (${reserva.clienteTelefono}). Monto: ARS ${reserva.precio}. Medio: ${reserva.metodoPago}`)
      }
    }

    res.json({ ok: true, reserva: reservaActualizada })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/admin/pagos', requireAdmin, async (req, res) => {
  const estado = req.query.estado || 'pendiente'
  const data = await pagosRepo.listarPorEstado(estado)
  res.json({ ok: true, data })
})

app.post('/api/admin/reservas/:id/estado', requireAdmin, async (req, res) => {
  try {
    const { estado } = req.body
    await reservasRepo.actualizarEstado(req.params.id, estado)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Stats para dashboard
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalReservas = await reservasRepo.listar().then(r => r.length)
    const reservasAprobadas = await reservasRepo.listarPorEstado('aprobado').then(r => r.length)
    const reservasPendientes = await reservasRepo.listarPorEstado('pendiente').then(r => r.length)
    const totalClientes = await suscripcionesRepo.listar().then(s => s.length)
    const ingresosTotales = await reservasRepo.listar().then(r => r.reduce((sum, res) => sum + res.precio, 0))
    res.json({ ok: true, stats: { totalReservas, reservasAprobadas, reservasPendientes, totalClientes, ingresosTotales } })
  } catch (e) {
    logger.error('Error en stats:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// CRUD Vehículos
app.get('/api/admin/vehiculos', requireAdmin, async (req, res) => {
  const data = await vehiculosRepo.listar()
  res.json({ ok: true, data })
})
app.get('/api/admin/vehiculos/:id', requireAdmin, async (req, res) => {
  const data = await vehiculosRepo.obtener(req.params.id)
  res.json({ ok: true, data })
})
app.post('/api/admin/vehiculos', requireAdmin, async (req, res) => {
  const vehiculo = await vehiculosRepo.crear(req.body)
  res.json({ ok: true, vehiculo })
})
app.put('/api/admin/vehiculos/:id', requireAdmin, async (req, res) => {
  await vehiculosRepo.actualizar(req.params.id, req.body)
  res.json({ ok: true })
})
app.delete('/api/admin/vehiculos/:id', requireAdmin, async (req, res) => {
  await vehiculosRepo.eliminar(req.params.id)
  res.json({ ok: true })
})

// CRUD Conductores
app.get('/api/admin/conductores', requireAdmin, async (req, res) => {
  const data = await conductoresRepo.listar()
  res.json({ ok: true, data })
})
app.get('/api/admin/conductores/:id', requireAdmin, async (req, res) => {
  try {
    const data = await conductoresRepo.obtener(req.params.id)
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Conductor no encontrado' })
    }
    res.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo conductor:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})
app.post('/api/admin/conductores', requireAdmin, async (req, res) => {
  const conductor = await conductoresRepo.crear(req.body)
  res.json({ ok: true, conductor })
})
app.put('/api/admin/conductores/:id', requireAdmin, async (req, res) => {
  try {
    const success = await conductoresRepo.actualizar(req.params.id, req.body)
    if (success) {
      res.json({ ok: true })
    } else {
      res.status(404).json({ ok: false, error: 'Conductor no encontrado o ID inválido' })
    }
  } catch (error) {
    console.error('Error actualizando conductor:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.delete('/api/admin/conductores/:id', requireAdmin, async (req, res) => {
  try {
    const success = await conductoresRepo.eliminar(req.params.id)
    if (success) {
      res.json({ ok: true })
    } else {
      res.status(404).json({ ok: false, error: 'Conductor no encontrado o ID inválido' })
    }
  } catch (error) {
    console.error('Error eliminando conductor:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// OpenStreetMap OAuth routes
app.get('/api/osm/auth', (req, res) => {
  const authUrl = getAuthorizationUrl()
  res.json({ authUrl })
})

app.get('/api/osm/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    if (!code) {
      return res.status(400).json({ ok: false, error: 'Código de autorización requerido' })
    }

    const tokens = await exchangeCodeForToken(code)
    const userInfo = await getUserInfo(tokens.accessToken)

    // Aquí podrías guardar los tokens en la base de datos asociados al conductor
    // Por ahora, solo devolvemos la información
    res.json({
      ok: true,
      tokens,
      user: userInfo
    })
  } catch (error) {
    logger.error('Error en callback OSM:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// CRUD Destinos
app.get('/api/admin/destinos', requireAdmin, async (req, res) => {
  const data = await destinosRepo.listDestinos()
  res.json({ ok: true, data })
})
app.get('/api/admin/destinos/:id', requireAdmin, async (req, res) => {
  try {
    const data = await destinosRepo.obtener(req.params.id)
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Destino no encontrado' })
    }
    res.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo destino:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})
app.post('/api/admin/destinos', requireAdmin, async (req, res) => {
  const destino = await destinosRepo.crear(req.body)
  res.json({ ok: true, destino })
})
app.put('/api/admin/destinos/:id', requireAdmin, async (req, res) => {
  try {
    const success = await destinosRepo.actualizar(req.params.id, req.body)
    if (success) {
      res.json({ ok: true })
    } else {
      res.status(404).json({ ok: false, error: 'Destino no encontrado o ID inválido' })
    }
  } catch (error) {
    console.error('Error actualizando destino:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.delete('/api/admin/destinos/:id', requireAdmin, async (req, res) => {
  try {
    const success = await destinosRepo.eliminar(req.params.id)
    if (success) {
      res.json({ ok: true })
    } else {
      res.status(404).json({ ok: false, error: 'Destino no encontrado o ID inválido' })
    }
  } catch (error) {
    console.error('Error eliminando destino:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// CRUD Config
app.get('/api/admin/config/kmPrice', requireAdmin, async (req, res) => {
  try {
    const db = getDB()
    const config = await db.collection('config').findOne({ key: 'kmPrice' })
    res.json({ ok: true, value: config ? config.value : 50 })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/admin/config/setKmPrice', requireAdmin, async (req, res) => {
  try {
    const { value } = req.body
    const db = getDB()
    await db.collection('config').updateOne({ key: 'kmPrice' }, { $set: { value } }, { upsert: true })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/admin/suscripciones/:id', requireAdmin, async (req, res) => {
  try {
    const data = await suscripcionesRepo.obtener(req.params.id)
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Suscripción no encontrada' })
    }
    res.json({ ok: true, data })
  } catch (error) {
    console.error('Error obteniendo suscripción:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.get('/api/admin/suscripciones', requireAdmin, async (req, res) => {
  const data = await suscripcionesRepo.listar()
  res.json({ ok: true, data })
})

app.post('/api/admin/suscripciones', requireAdmin, async (req, res) => {
  const suscripcion = await suscripcionesRepo.crearSuscripcion(req.body)
  res.json({ ok: true, suscripcion })
})

app.put('/api/admin/suscripciones/:id', requireAdmin, async (req, res) => {
  try {
    const success = await suscripcionesRepo.actualizar(req.params.id, req.body)
    if (success) {
      res.json({ ok: true })
    } else {
      res.status(404).json({ ok: false, error: 'Suscripción no encontrada o ID inválido' })
    }
  } catch (error) {
    console.error('Error actualizando suscripción:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.delete('/api/admin/suscripciones/:id', requireAdmin, async (req, res) => {
  try {
    const success = await suscripcionesRepo.eliminar(req.params.id)
    if (success) {
      res.json({ ok: true })
    } else {
      res.status(404).json({ ok: false, error: 'Suscripción no encontrada o ID inválido' })
    }
  } catch (error) {
    console.error('Error eliminando suscripción:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// Login para conductores
app.get('/conductor', (req, res) => {
  res.sendFile(path.join(__dirname, 'conductor', 'login.html'))
})

app.post('/api/conductor/login', async (req, res) => {
  try {
    const { telefono, password } = req.body
    const ip = req.ip || req.connection.remoteAddress
    const conductor = await conductoresRepo.login(telefono, password, ip)
    if (conductor) {
      // Aquí podríamos usar sesiones, pero por simplicidad, devolver ok
      res.json({ ok: true, conductor, message: 'Login exitoso. Por favor dirigete al punto de origen para recoger a los pasajeros: ' + conductor.nombre })
    } else {
      res.status(401).json({ ok: false, error: 'Credenciales incorrectas' })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// API para obtener viajes asignados al conductor
app.get('/api/conductor/viajes', async (req, res) => {
  try {
    const { telefono } = req.query
    if (!telefono) return res.status(400).json({ ok: false, error: 'Teléfono requerido' })

    const reservas = await reservasRepo.listar()
    const viajesAsignados = reservas.filter(r =>
      r.conductor &&
      r.conductor.telefono === telefono &&
      ['asignado', 'completado'].includes(r.estado)
    )

    res.json({ ok: true, viajes: viajesAsignados })
  } catch (error) {
    logger.error('Error obteniendo viajes del conductor:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// API para obtener conductores en viaje para el mapa admin
app.get('/api/admin/conductores/activos', requireAdmin, async (req, res) => {
  const conductores = await conductoresRepo.listar()
  const activos = conductores.filter(c => c.disponible && c.ipActual)
  res.json({ ok: true, data: activos })
})

app.get('/api/admin/contabilidad', requireAdmin, async (req, res) => {
  const reservas = await reservasRepo.listar()
  let totalPlataforma = 0
  let saldosConductores = {}

  // Obtener todos los conductores para mapear teléfonos a nombres
  const conductores = await conductoresRepo.listar()
  const conductorMap = {}
  conductores.forEach(c => {
    conductorMap[c.telefono] = c.nombre
  })

  // Obtener penalizaciones pendientes por conductor
  const penalizacionesPorConductor = {}
  reservas.forEach(r => {
    if (r.metodoPago === 'efectivo' && r.conductor && r.conductor.telefono && !r.penalizacionAplicada) {
      if (!penalizacionesPorConductor[r.conductor.telefono]) {
        penalizacionesPorConductor[r.conductor.telefono] = 0
      }
      penalizacionesPorConductor[r.conductor.telefono]++
    }
  })

  reservas.forEach(r => {
    if (r.metodoPago === 'efectivo') {
      // En efectivo: plataforma recibe 20% directamente
      const plataforma = r.precio * 0.20
      totalPlataforma += plataforma

      if (r.conductor && r.conductor.telefono) {
        const nombreConductor = conductorMap[r.conductor.telefono] || r.conductor.telefono
        const vehiculoInfo = r.conductor.modelo ? `${r.conductor.modelo} (${r.conductor.patente})` : 'Vehículo asignado'
        const claveConductor = `${nombreConductor} - ${vehiculoInfo}`

        // Conductor recibe 80% en efectivo
        const conductorEfectivo = r.precio * 0.80
        saldosConductores[claveConductor] = (saldosConductores[claveConductor] || 0) + conductorEfectivo
      }
    } else {
      // Pago con tarjeta: plataforma 15%, conductor 85% (menos penalizaciones por viajes en efectivo anteriores)
      const plataforma = r.precio * 0.15
      totalPlataforma += plataforma

      if (r.conductor && r.conductor.telefono) {
        const nombreConductor = conductorMap[r.conductor.telefono] || r.conductor.telefono
        const vehiculoInfo = r.conductor.modelo ? `${r.conductor.modelo} (${r.conductor.patente})` : 'Vehículo asignado'
        const claveConductor = `${nombreConductor} - ${vehiculoInfo}`

        // Calcular ganancia del conductor considerando penalizaciones
        let gananciaConductor = r.precio * 0.85

        // Aplicar penalizaciones pendientes (20% por cada viaje en efectivo anterior)
        const penalizacionesPendientes = penalizacionesPorConductor[r.conductor.telefono] || 0
        if (penalizacionesPendientes > 0) {
          const penalizacionTotal = r.precio * 0.20 * penalizacionesPendientes
          gananciaConductor -= penalizacionTotal
          totalPlataforma += penalizacionTotal // La plataforma recibe esta penalización también
        }

        saldosConductores[claveConductor] = (saldosConductores[claveConductor] || 0) + Math.max(0, gananciaConductor)
      }
    }
  })

  res.json({
    ok: true,
    totalPlataforma,
    saldosConductores,
    penalizacionesPendientes: penalizacionesPorConductor
  })
})
// API para liberar pagos a conductores
app.post('/api/admin/liberar-pagos', requireAdmin, async (req, res) => {
  try {
    const { conductorIds } = req.body
    if (!conductorIds || !Array.isArray(conductorIds)) {
      return res.status(400).json({ ok: false, error: 'Lista de conductores requerida' })
    }

    const db = getDB()
    const conductores = await conductoresRepo.listar()
    const reservas = await reservasRepo.listar()
    const pagosLiberados = []

    for (const conductorId of conductorIds) {
      // Buscar conductor por ID o teléfono
      let conductor = conductores.find(c => c._id.toString() === conductorId || c.telefono === conductorId)

      if (!conductor) continue

      // Obtener viajes completados del conductor
      const viajesCompletados = reservas.filter(r =>
        r.conductor &&
        r.conductor.telefono === conductor.telefono &&
        r.estado === 'completado' &&
        !r.pagoLiberado // Campo nuevo para rastrear pagos liberados
      )

      if (viajesCompletados.length === 0) continue

      let totalLiberar = 0
      const detallesViajes = []

      // Calcular ganancias por viaje
      for (const viaje of viajesCompletados) {
        let gananciaConductor = 0

        if (viaje.metodoPago === 'efectivo') {
          // En efectivo: conductor debe 20% a la plataforma
          gananciaConductor = viaje.precio * 0.80 // Conductor recibe 80%
        } else {
          // Con tarjeta: conductor recibe 85%
          gananciaConductor = viaje.precio * 0.85
        }

        totalLiberar += gananciaConductor
        detallesViajes.push({
          reservaId: viaje._id,
          fecha: viaje.fecha,
          origen: viaje.origen,
          destino: viaje.destino,
          precio: viaje.precio,
          metodoPago: viaje.metodoPago,
          gananciaConductor: gananciaConductor
        })
      }

      if (totalLiberar > 0) {
        // Marcar viajes como pagos liberados
        for (const viaje of viajesCompletados) {
          await db.collection('reservas').updateOne(
            { _id: viaje._id },
            { $set: { pagoLiberado: true, fechaLiberacion: new Date() } }
          )
        }

        // Crear registro de pago liberado
        const pagoLiberado = {
          conductorTelefono: conductor.telefono,
          conductorNombre: conductor.nombre,
          monto: totalLiberar,
          viajes: detallesViajes.length,
          fechaLiberacion: new Date(),
          detalles: detallesViajes
        }

        await db.collection('pagos_liberados').insertOne(pagoLiberado)

        // Enviar factura por WhatsApp con detalles
        const facturaTexto = generarFacturaTexto(pagoLiberado, detallesViajes)
        await notifyClient(conductor.telefono, facturaTexto)

        pagosLiberados.push({
          conductor: conductor.nombre,
          telefono: conductor.telefono,
          monto: totalLiberar,
          viajes: viajesCompletados.length
        })
      }
    }

    res.json({
      ok: true,
      pagosLiberados,
      totalConductores: conductorIds.length,
      conductoresProcesados: pagosLiberados.length
    })

  } catch (error) {
    console.error('Error liberando pagos:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// Función auxiliar para generar texto de factura
function generarFacturaTexto(pagoLiberado, detallesViajes) {
  let texto = `💰 FACTURA DE PAGO - RUTA LIBRE\n\n`
  texto += `👨‍💼 Conductor: ${pagoLiberado.conductorNombre}\n`
  texto += `📞 Teléfono: ${pagoLiberado.conductorTelefono}\n`
  texto += `💵 Total Liberado: ARS ${pagoLiberado.monto.toFixed(2)}\n`
  texto += `🚗 Viajes Procesados: ${pagoLiberado.viajes}\n`
  texto += `📅 Fecha Liberación: ${new Date().toLocaleDateString()}\n\n`

  texto += `📋 DETALLE DE VIAJES:\n`
  texto += `════════════════════════════════════\n\n`

  detallesViajes.forEach((viaje, index) => {
    texto += `${index + 1}. ${viaje.fecha}\n`
    texto += `   ${viaje.origen} → ${viaje.destino}\n`
    texto += `   💰 Precio: ARS ${viaje.precio}\n`
    texto += `   💳 Método: ${viaje.metodoPago === 'efectivo' ? 'Efectivo' : 'Tarjeta'}\n`
    texto += `   💵 Tu ganancia: ARS ${viaje.gananciaConductor.toFixed(2)}\n\n`
  })

  texto += `════════════════════════════════════\n`
  texto += `✅ Pago procesado correctamente\n`
  texto += `📞 Contactanos si tenés dudas`

  return texto
}

// Webhook Mercado Pago mejorado con consulta real a la API
app.post('/api/webhook', async (req, res) => {
  try {
    const { body, headers } = req
    console.log('Webhook MP recibido:', body)

    if (body.topic === 'payment') {
      const paymentId = body.resource
      // Consultar estado real del pago en la API de MP
      const axios = require('axios')
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      })
      const payment = response.data

      if (payment.status === 'approved') {
        const reservaId = payment.external_reference
        // Usar método correcto del repositorio
        await reservasRepo.actualizarEstado(reservaId, 'aprobado')
        // Usar método correcto para obtener reserva
        const reserva = await reservasRepo.obtener(reservaId)
        if (reserva && reserva.clienteTelefono) {
          await notifyClient(reserva.clienteTelefono, `✅ ¡Pago aprobado! Tu reserva ${reservaId} está confirmada. Nos contactaremos pronto para asignar conductor.`)
        }
        console.log(`Reserva ${reservaId} aprobada`)
      }
    }

    res.status(200).send('OK')
  } catch (error) {
    console.error('Error en webhook MP:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// Bot management endpoints
let globalBot = null
let globalQR = null
let globalProvider = null

app.get('/api/admin/bot-status', requireAdmin, async (req, res) => {
  try {
    if (!globalBot) {
      return res.json({ ok: true, status: 'Bot no inicializado' })
    }

    let status = 'Desconectado'

    // Try to get status from provider if available
    if (globalProvider?.vendor?.store?.state?.connection === 'open') {
      status = 'Conectado'
    } else if (globalProvider?.vendor?.authState?.creds?.me) {
      status = 'Conectado'
    } else {
      status = 'Desconectado'
    }

    res.json({ ok: true, status })
  } catch (error) {
    console.error('Error getting bot status:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.get('/api/admin/bot-qr', requireAdmin, async (req, res) => {
  try {
    if (!globalBot) {
      return res.status(404).json({ ok: false, error: 'Bot no inicializado' })
    }

    // Check if QR is available
    const qr = globalQR

    if (qr) {
      // Convert QR to data URL for display
      const QRCode = require('qrcode')
      const qrDataURL = await QRCode.toDataURL(qr)
      res.json({ ok: true, qr: qrDataURL })
    } else {
      res.json({ ok: true, qr: null, message: 'QR no disponible - Bot ya conectado o esperando QR' })
    }
  } catch (error) {
    console.error('Error getting QR:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.get('/api/admin/bot-chats', requireAdmin, async (req, res) => {
  try {
    if (!globalProvider) {
      return res.status(404).json({ ok: false, error: 'Provider no inicializado' })
    }

    // Get chats from provider store
    const chats = globalProvider.vendor?.store?.chats || {}
    const chatList = Object.values(chats)
      .filter(chat => chat.id && !chat.id.includes('status@broadcast'))
      .map(chat => ({
        id: chat.id,
        name: chat.name || chat.notify || 'Usuario desconocido',
        lastMessage: chat.messages?.[Object.keys(chat.messages || {}).pop()]?.message?.conversation || '',
        time: chat.messages?.[Object.keys(chat.messages || {}).pop()]?.messageTimestamp ?
          new Date(chat.messages[Object.keys(chat.messages || {}).pop()].messageTimestamp * 1000).toLocaleTimeString() : '',
        unread: chat.unreadCount || 0
      }))

    res.json({ ok: true, chats: chatList })
  } catch (error) {
    console.error('Error getting chats:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.get('/api/admin/bot-messages/:chatId', requireAdmin, async (req, res) => {
  try {
    if (!globalProvider) {
      return res.status(404).json({ ok: false, error: 'Provider no inicializado' })
    }

    const { chatId } = req.params
    const chat = globalProvider.vendor?.store?.chats?.[chatId]

    if (!chat) {
      return res.status(404).json({ ok: false, error: 'Chat no encontrado' })
    }

    const messages = Object.values(chat.messages || {})
      .sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0))
      .map(msg => ({
        id: msg.key.id,
        fromMe: msg.key.fromMe,
        text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
        caption: msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '',
        time: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleString() : '',
        type: msg.message ? Object.keys(msg.message)[0] : 'unknown'
      }))

    res.json({ ok: true, messages })
  } catch (error) {
    console.error('Error getting messages:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

function setBotQR(qr) {
  globalQR = qr
}

async function startServer(bot = null, provider = null) {
  globalBot = bot
  globalProvider = provider
  const uri = process.env.MONGO_DB_URI || 'mongodb+srv://Admin-Clotch:Mikias420@clotch.nge8kuc.mongodb.net/'
  const dbName = process.env.MONGO_DB_NAME || 'db_bot'
  await connect({ uri, dbName })
  // Recordatorios automáticos cada minuto
  setInterval(async () => {
    try {
      const db = getDB()
      const ahora = new Date()
      const enDosHoras = new Date(Date.now() + 2 * 60 * 60 * 1000)
      const reservas = await db.collection('reservas').find({ estado: { $in: ['pendiente','asignado'] } }).toArray()
      for (const r of reservas) {
        if (!r.fecha || !r.hora) continue
        const dt = new Date(`${r.fecha}T${r.hora}:00`)
        if (dt >= ahora && dt <= enDosHoras && !r.reminderEnviado) {
          await notifyClient(r.clienteTelefono, `Recordatorio 🕒 Tu viaje ${r.origen} → ${r.destino} es a las ${r.hora} del ${r.fecha}.`)
          // Si hay conductor asignado
          if (r.conductor && r.conductor.telefono) {
            await notifyClient(r.conductor.telefono, `Recordatorio 🕒 Viaje asignado para ${r.fecha} ${r.hora} | ${r.origen} → ${r.destino}.`)
          }
          await db.collection('reservas').updateOne({ _id: r._id }, { $set: { reminderEnviado: true } })
        }
      }
    } catch (e) {
      console.error('Error recordatorios', e)
    }
  }, 60 * 1000)

  // Intentar escuchar en BASE_PORT; si está ocupado, aumentar +1 hasta 3010
  const tryListen = (port, limit = 3010) => {
    const server = app.listen(port, () => console.log(`HTTP server running on http://localhost:${port}`))
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        if (port < limit) {
          console.warn(`Puerto ${port} en uso. Probando ${port + 1}...`)
          tryListen(port + 1, limit)
        } else {
          console.error(`No se encontró puerto libre entre ${BASE_PORT} y ${limit}`)
          process.exit(1)
        }
      } else {
        console.error('Error al iniciar el servidor', err)
        process.exit(1)
      }
    })
  }
  tryListen(BASE_PORT)
}

if (require.main === module) startServer()

module.exports = { startServer, setBotQR }
