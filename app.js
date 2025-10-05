const dotenv = require('dotenv')
dotenv.config()

const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')

const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MongoAdapter = require('@bot-whatsapp/database/mongo')
const { connect, getDB } = require('./db/mongo')
const reservasRepo = require('./repositories/reservasRepo')
const codigosRepo = require('./repositories/codigosRepo')
const destinosRepo = require('./repositories/destinosRepo')
const tarifasRepo = require('./repositories/tarifasRepo')
const { crearPreferenciaPago } = require('./utils/mercadopago')
const { setProvider, setAdminPhone, notifyAdmin, notifyClient, notifyClientWithFile } = require('./notifiers/notify.js')
const { geocodeAddress, reverseGeocode, calculateDistance } = require('./utils/googleMaps')
const { coordCache } = require('./utils/coordCache')
const { startServer } = require('./server')

// Función para extraer coordenadas de texto (enlaces Google Maps)
function extractCoordsFromText(text) {
  if (!text) return null
  const s = text.trim()

  // Patrón básico de coordenadas: lat,lng
  let regex = /[-+]?\d*\.?\d+[,;\s]\s*[-+]?\d*\.?\d+/
  let match = s.match(regex)
  if (match) {
    const coords = match[0].replace(/;/g, ',').split(/[,;\s]+/).map(coord => parseFloat(coord.trim()))
    if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
      return { lat: coords[0], lng: coords[1] }
    }
  }

  // Enlaces de Google Maps tipo: https://maps.google.com/maps?q=-24.7760337%2C-65.4034075
  regex = /maps\.google\.com\/maps\?q=([-+]?\\d*\\.?\\d+)%2C([-+]?\\d*\\.?\\d+)/
  match = s.match(regex)
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
  }

  // Enlaces de Google Maps tipo: https://www.google.com/maps/@-23.5791907,-65.406447,15z
  regex = /maps\/@([-+]?\\d*\\.?\\d+),([-+]?\\d*\\.?\\d+)/
  match = s.match(regex)
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
  }

  // Enlaces de Google Maps con place: https://www.google.com/maps/place/.../@lat,lng
  regex = /\/place\/[^\/]+\/@([-+]?\\d*\\.?\\d+),([-+]?\\d*\\.?\\d+)/
  match = s.match(regex)
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
  }

  // Enlaces de Google Maps con parámetros adicionales
  regex = /\/maps\/[^\/]*\/@([-+]?\\d*\\.?\\d+),([-+]?\\d*\\.?\\d+)/
  match = s.match(regex)
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
  }

  // Coordenadas con signos negativos más complejas
  regex = /([-+]?\\d+\\.\\d+),\\s*([-+]?\\d+\\.\\d+)/g
  match = s.match(regex)
  if (match && match.length >= 2) {
    const lat = parseFloat(match[1])
    const lng = parseFloat(match[2])
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng }
    }
  }

  return null
}

/**
 * Declaramos las conexiones de Mongo
 */

const MONGO_DB_URI = process.env.MONGO_DB_URI || 'mongodb://mongo:27017'
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'rutalibre_prod'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rutalibre.com'
const ADMIN_PASS = process.env.ADMIN_PASS || 'secure_password'
const ADMIN_PHONE = process.env.ADMIN_PHONE || null // Ej: '5493875XXXXXX@c.us'
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000'

/**
 * Aqui declaramos los flujos hijos, los flujos se declaran de atras para adelante, es decir que si tienes un flujo de este tipo:
 *
 *          Menu Principal
 *           - SubMenu 1
 *             - Submenu 1.1
 *           - Submenu 2
 *             - Submenu 2.1
 *
 * Primero declaras los submenus 1.1 y 2.1, luego el 1 y 2 y al final el principal.
 */

// Utilidades de validación y cotización
function esFechaValida(yyyyMMdd) {
    return /^\d{4}-\d{2}-\d{2}$/.test(yyyyMMdd)
}

function esHoraValida(hhmm) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(hhmm)
}

function parseFechaFlexible(input) {
    if (!input) return null
    const s = input.trim()
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // DD/MM/YYYY
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m) {
        const [_, dd, mm, yyyy] = m
        return `${yyyy}-${mm}-${dd}`
    }
    // DD-MM-YYYY
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
    if (m) {
        const [_, dd, mm, yyyy] = m
        return `${yyyy}-${mm}-${dd}`
    }
    // YYYY/MM/DD
    m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
    if (m) {
        const [_, yyyy, mm, dd] = m
        return `${yyyy}-${mm}-${dd}`
    }
    return null
}

function parseFechaHoraCombo(input) {
    // Ej: 05/10/2025 a las 10:00 o 05/10/2025 10:00, también 05-10-2025, 2025/10/05
    if (!input) return null
    const s = input.trim().toLowerCase().replace(' a las ', ' ')
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+([0-2]\d:[0-5]\d)$/)
    if (m) {
        const [_, dd, mm, yyyy, hhmm] = m
        return { fecha: `${yyyy}-${mm}-${dd}`, hora: hhmm }
    }
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+([0-2]\d:[0-5]\d)$/)
    if (m) {
        const [_, dd, mm, yyyy, hhmm] = m
        return { fecha: `${yyyy}-${mm}-${dd}`, hora: hhmm }
    }
    m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+([0-2]\d:[0-5]\d)$/)
    if (m) {
        const [_, yyyy, mm, dd, hhmm] = m
        return { fecha: `${yyyy}-${mm}-${dd}`, hora: hhmm }
    }
    return null
}

function esFechaFinDeSemanaOHoliday(fechaStr, horaStr) {
    // Crear objeto Date con la fecha y hora del viaje
    const fechaHora = new Date(`${fechaStr}T${horaStr}:00`)

    // Verificar si es sábado (6) o domingo (0)
    const diaSemana = fechaHora.getDay()
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6

    // Lista de feriados fijos en Argentina (puedes expandir esta lista)
    const feriados = [
        '01-01', // Año Nuevo
        '03-24', // Día Nacional de la Memoria
        '04-02', // Día del Veterano y de los Caídos
        '05-01', // Día del Trabajo
        '05-25', // Revolución de Mayo
        '06-20', // Día de la Bandera
        '07-09', // Día de la Independencia
        '08-17', // Paso a la Inmortalidad de San Martín
        '10-12', // Día del Respeto a la Diversidad Cultural
        '11-20', // Día de la Soberanía Nacional
        '12-08', // Día de la Inmaculada Concepción
        '12-25', // Navidad
    ]

    // Verificar si la fecha coincide con algún feriado
    const mesDia = `${String(fechaHora.getMonth() + 1).padStart(2, '0')}-${String(fechaHora.getDate()).padStart(2, '0')}`
    const esFeriado = feriados.includes(mesDia)

    return {
        esFinDeSemana,
        esFeriado,
        esFindeOFeriado: esFinDeSemana || esFeriado,
        diaSemana: diaSemana,
        mesDia: mesDia
    }
}

async function calcularCotizacion(tipoCliente, kmIda, opciones = {}) {
    const tarifa = await tarifasRepo.getTarifa(tipoCliente)
    if (!tarifa) return { total: 0, detalle: 'Tarifa no configurada' }

    // Usar precio global por km si está disponible, sino usar tarifa tradicional
    const db = getDB()
    const configGlobal = await db.collection('config').findOne({ key: 'kmPrice' })
    const precioPorKm = configGlobal ? configGlobal.value : tarifa.precioKmExtra || 1000

    const kmVta = kmIda * 2
    let total = tarifa.base
    let extraKm = 0

    if (tipoCliente === 'Turismo' || tipoCliente === 'Empresas Mineras' || tipoCliente === 'Empresarial Urbano' || tipoCliente === 'Urbano Puntual') {
        const excedente = Math.max(0, kmVta - tarifa.kmIncluidos)
        extraKm = excedente * precioPorKm  // Usar precio global por km
        total += extraKm
    }

    let extraHoras = 0
    if (opciones.horasExtras && tarifa.precioHoraExtra) {
        extraHoras = opciones.horasExtras * tarifa.precioHoraExtra
        total += extraHoras
    }

    let recargo = 0
    if (opciones.esFindeOFeriado) {
        recargo = Math.round(total * tarifa.recargoFinde)
        total += recargo
    }

    return {
        total: Math.round(total),
        kmVta,
        extraKm,
        extraHoras,
        recargo,
        base: tarifa.base,
        kmIncluidos: tarifa.kmIncluidos,
        precioKmExtra: precioPorKm,  // Usar precio global
        precioPorKm: precioPorKm
    }
}

// Sub-flujo: Suscripción y página pública
const flowSuscripcion = addKeyword(['suscripcion', 'suscripción', 'plan', 'planes']).addAnswer([
    '📢 Planes de suscripción mensual de Ruta Libre',
    '• Urbano Básico 🚗',
    '• Corporativo Plus 🏢',
    '• Minería Operativo ⛏️',
    'Visítanos aquí para ver precios, condiciones y formas de pago:',
    `${PUBLIC_URL}/suscripcion.html`,
    '¿Seguimos con una cotización o reserva? Escribime: *cotizar* o *reservar*',
])

const flowCotizar = addKeyword(['cotizar', 'cotizacion', 'cotización']).addAnswer(
    [
        '🧭 ¡Vamos a cotizar tu viaje! Elegí tu tipo de cliente:',
        '1) Turismo ✈️',
        '2) Empresas Mineras ⛏️',
        '3) Empresarial Urbano 🏢',
        '4) Urbano Puntual 🚗',
        'Respondé con el número (1-4) o escribí el tipo (por ej: Turismo).',
    ],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const map = { '1': 'Turismo', '2': 'Empresas Mineras', '3': 'Empresarial Urbano', '4': 'Urbano Puntual' }
        const raw = (ctx.body || '').trim()
        const tipo = map[raw] || normalizarTipoCliente(raw)
        if (!tipo) { 
            await flowDynamic('❌ Opción inválida. Opciones válidas: 1-4 o escribe el tipo completo. Volvé a escribir *cotizar*');
            return endFlow();
        }
        await state.update({ tipo })
        const todos = await destinosRepo.listDestinos()
        // Filtrar por aproximación de tipo
        const filtrados = todos.filter(d => {
            if (tipo === 'Urbano Puntual') return d.tipoServicio === 'Urbano Puntual'
            if (tipo === 'Empresarial Urbano') return d.tipoServicio === 'Urbano Puntual' || d.categoria === 'Salta Capital'
            if (tipo === 'Empresas Mineras') return ['San Antonio de los Cobres', 'Rincon', 'Centenario-Ratones'].includes(d.nombre) || d.categoria === 'Quebrada y Puna'
            return true
        })
        const lista = filtrados.slice(0, 25)
        const opciones = lista.map((d, i) => `${i + 1}) ${d.nombre} (${d.kmIda} km ida) 📍`).join('\n')
        await flowDynamic([
            '📍 Ahora elegí el destino por número:',
            opciones || 'No hay destinos precargados. Podés escribir el destino manualmente.'
        ])
    }
).addAnswer(
    ['Escribí el número del destino o el nombre exacto.'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const todos = await destinosRepo.listDestinos()
        const st = (await state.getMyState()) || {}
        const tipo = st.tipo
        const input = (ctx.body || '').trim()
        let elegido = null
        // Reaplicar el filtro para que el índice numérico coincida con la lista mostrada
        const filtrados = todos.filter(d => {
            if (tipo === 'Urbano Puntual') return d.tipoServicio === 'Urbano Puntual'
            if (tipo === 'Empresarial Urbano') return d.tipoServicio === 'Urbano Puntual' || d.categoria === 'Salta Capital'
            if (tipo === 'Empresas Mineras') return ['San Antonio de los Cobres', 'Rincon', 'Centenario-Ratones'].includes(d.nombre) || d.categoria === 'Quebrada y Puna'
            return true
        })
        const lista = filtrados.slice(0, 25)
        const num = Number(input)
        if (!isNaN(num) && num > 0 && num <= lista.length) {
            elegido = lista[num - 1]
        }
        if (!elegido) {
            elegido = todos.find(d => d.nombre.toLowerCase() === input.toLowerCase())
        }
        if (!elegido) { 
            await flowDynamic('❌ No encontré ese destino. Volvé a escribir *cotizar* para intentar de nuevo.');
            return endFlow();
        }
        await state.update({ destino: elegido.nombre, kmIda: elegido.kmIda })
        await flowDynamic('📅 ¿Es fin de semana o feriado? Respondé: si / no')
    }
)
.addAnswer(
    ['¿Es fin de semana o feriado? (si/no)'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const esFinde = ((ctx.body || '').trim().toLowerCase().startsWith('s'))
        const st = (await state.getMyState()) || {}
        const { tipo, kmIda, destino } = st
        await flowDynamic('Aguardame un momento que estoy validando la ruta de origen y destino para darte un precio exacto para tu solicitud.')
        const r = await calcularCotizacion(tipo, kmIda, { esFindeOFeriado: esFinde })
        await flowDynamic([
            `💰 Modelo: MODELO PREMIUM COMPETITIVO (2025)`,
            `👥 Tipo: ${tipo} | 📍 Destino: ${destino}`,
            `💸 Base: ARS ${r.base} (incluye ${r.kmIncluidos} km)`,
            `🚗 Km ida+vta: ${r.kmVta} | Extra km: ARS ${r.extraKm} (ARS ${r.precioPorKm}/km)`,
            `${r.recargo > 0 ? '📈 Recargo finde/feriado: ARS ' + r.recargo : '✅ Sin recargo'}`,
            `💵 Total estimado: *ARS ${r.total}*`,
            '¿Querés reservar? Escribí: *reservar*'
        ])
        return
    }
)

// Sub-flujo: Reserva completa + enlace de pago
const flowReservar = addKeyword(['reservar']).addAnswer(
    [
        '📝 Vamos a tomar tu reserva. ¿Cuál es tu nombre y apellido?',
    ],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const nombre = (ctx.body || '').trim()
        if (!nombre || nombre.length < 2) { 
            await flowDynamic('❌ Nombre inválido. Debe tener al menos 2 caracteres. Volvé a escribir *reservar*');
            return endFlow();
        }
        await state.update({ clienteNombre: nombre })
    }
).addAnswer(
    ['👥 ¿Qué tipo de cliente sos? (Turismo / Empresas Mineras / Empresarial Urbano / Urbano Puntual)'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const tipo = normalizarTipoCliente(ctx.body)
        if (!tipo) { 
            await flowDynamic('❌ Tipo de cliente inválido. Opciones: Turismo, Empresas Mineras, Empresarial Urbano, Urbano Puntual. Volvé a escribir *reservar*');
            return endFlow();
        }
        await state.update({ tipoCliente: tipo })
    }
).addAnswer(
    ['📅 Fecha del viaje (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY o YYYY/MM/DD). También podés enviar: DD/MM/YYYY a las HH:MM'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const input = (ctx.body || '').trim()
        const combo = parseFechaHoraCombo(input)
        if (combo) {
            await state.update({ fecha: combo.fecha, hora: combo.hora })
            return
        }
        const fechaStd = parseFechaFlexible(input)
        if (!fechaStd) { 
            await flowDynamic('❌ Fecha inválida. Usá formatos como YYYY-MM-DD o DD/MM/YYYY. Volvé a escribir *reservar*');
            return endFlow();
        }
        await state.update({ fecha: fechaStd })
    }
).addAnswer(
    ['🕒 Hora del viaje (HH:MM)'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const st = (await state.getMyState()) || {}
        if (st.hora && esHoraValida(st.hora)) return
        const hora = (ctx.body || '').trim()
        if (!esHoraValida(hora)) { 
            await flowDynamic('❌ Hora inválida. Usá formato HH:MM (24h). Volvé a escribir *reservar*');
            return endFlow();
        }
        await state.update({ hora })
    }
).addAnswer(
    ['🏠 Origen (OBLIGATORIO: envía ubicación GPS desde Google Maps o WhatsApp)'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        console.log('DEBUG: Origen input:', ctx.body, ctx.message)
        let origenLat, origenLng, origenAddress = 'Ubicación GPS'
        // Verificar si es mensaje de ubicación de WhatsApp
        if (ctx.message && ctx.message.locationMessage) {
            // Ubicación WhatsApp
            origenLat = ctx.message.locationMessage.degreesLatitude
            origenLng = ctx.message.locationMessage.degreesLongitude
            try {
                origenAddress = await reverseGeocode(origenLat, origenLng) || origenAddress
            } catch (error) {
                console.error('Error reverse geocoding origen:', error)
            }
        } else if (ctx.message && ctx.message.liveLocationMessage) {
            // Ubicación en vivo
            origenLat = ctx.message.liveLocationMessage.degreesLatitude
            origenLng = ctx.message.liveLocationMessage.degreesLongitude
            try {
                origenAddress = await reverseGeocode(origenLat, origenLng) || origenAddress
            } catch (error) {
                console.error('Error reverse geocoding origen:', error)
            }
        } else if (ctx.body) {
            // Verificar si es enlace Google Maps
            const coords = extractCoordsFromText(ctx.body)
            if (coords) {
                origenLat = coords.lat
                origenLng = coords.lng
            } else {
                await flowDynamic('❌ Origen inválido. Envía ubicación GPS desde WhatsApp o enlace Google Maps con coordenadas.')
                return
            }
        } else {
            await flowDynamic('❌ Envía ubicación GPS.')
            return
        }
        await state.update({ origenLat, origenLng, origen: origenAddress })
        console.log('DEBUG: Origen guardado:', origenLat, origenLng, origenAddress)
    }
).addAnswer(
    ['📍 Destino (elige uno conocido o envía ubicación GPS nueva)'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        console.log('DEBUG: Destino input:', ctx.body, ctx.message)
        const st = (await state.getMyState()) || {}
        let destinoLat, destinoLng, destinoNombre
        // Verificar si es mensaje de ubicación de WhatsApp
        if (ctx.message && ctx.message.locationMessage) {
            // Nueva ubicación WhatsApp
            destinoLat = ctx.message.locationMessage.degreesLatitude
            destinoLng = ctx.message.locationMessage.degreesLongitude
            destinoNombre = 'Ubicación personalizada'
            try {
                const address = await reverseGeocode(destinoLat, destinoLng)
                if (address) destinoNombre = address
            } catch (error) {
                console.error('Error reverse geocoding destino:', error)
            }
        } else if (ctx.message && ctx.message.liveLocationMessage) {
            // Ubicación en vivo
            destinoLat = ctx.message.liveLocationMessage.degreesLatitude
            destinoLng = ctx.message.liveLocationMessage.degreesLongitude
            destinoNombre = 'Ubicación personalizada'
            try {
                const address = await reverseGeocode(destinoLat, destinoLng)
                if (address) destinoNombre = address
            } catch (error) {
                console.error('Error reverse geocoding destino:', error)
            }
        } else if (ctx.body) {
            const coords = extractCoordsFromText(ctx.body)
            if (coords) {
                destinoLat = coords.lat
                destinoLng = coords.lng
                destinoNombre = 'Ubicación personalizada'
            } else {
                // Buscar en destinos conocidos
                const destinos = await destinosRepo.listDestinos()
                const destinoEncontrado = destinos.find(d => d.nombre.toLowerCase().includes(ctx.body.toLowerCase()) || ctx.body.toLowerCase().includes(d.nombre.toLowerCase()))
                if (destinoEncontrado) {
                    destinoLat = destinoEncontrado.lat
                    destinoLng = destinoEncontrado.lng
                    destinoNombre = destinoEncontrado.nombre
                    await state.update({ kmIda: destinoEncontrado.kmIda })
                } else {
                    await flowDynamic('❌ Destino no encontrado. Envía ubicación GPS nueva o elige uno conocido.')
                    return
                }
            }
        } else {
            await flowDynamic('❌ Envía ubicación GPS o elige destino conocido.')
            return
        }
        await state.update({ destinoLat, destinoLng, destino: destinoNombre })
        console.log('DEBUG: Destino guardado:', destinoLat, destinoLng, destinoNombre)
    }
).addAnswer(
    ['👥 ¿Cuántas personas viajan (incluyéndote)?'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const numPersonas = parseInt((ctx.body || '').trim())
        if (isNaN(numPersonas) || numPersonas < 1) { 
            await flowDynamic('❌ Número de personas inválido. Debe ser un número mayor a 0.')
            return
        }
        await state.update({ numPersonas })
    }
).addAnswer(
    ['¿Tenés código de descuento? (si/no)'],
    { capture: true },
    async (ctx, { flowDynamic, state }) => {
        const tiene = ((ctx.body || '').trim().toLowerCase().startsWith('s'))
        await state.update({ tieneCodigo: tiene })
        if (tiene) {
            await flowDynamic('Ingresa tu código de descuento:')
        } else {
            await state.update({ askedFinde: true })
            // Detectar automáticamente si es fin de semana o feriado usando la fecha del viaje
            const st = (await state.getMyState()) || {}
            if (st.fecha && st.hora) {
                const fechaInfo = esFechaFinDeSemanaOHoliday(st.fecha, st.hora)
                await state.update({
                    esFinde: fechaInfo.esFindeOFeriado,
                    fechaInfo: fechaInfo
                })

                if (fechaInfo.esFindeOFeriado) {
                    await flowDynamic(`✅ Detecté que ${fechaInfo.esFinDeSemana ? 'es fin de semana' : 'es feriado'} (${fechaInfo.mesDia}). Aplicando recargo automáticamente.`)
                } else {
                    await flowDynamic('✅ Detecté que es día hábil. Sin recargo adicional.')
                }
            } else {
                await flowDynamic('¿Es fin de semana o feriado? (si/no)')
            }
        }
    }
).addAnswer(
    '',
    { capture: true },
    async (ctx, { flowDynamic, state }) => {
        const st = (await state.getMyState()) || {}
        if (st.tieneCodigo) {
            const codigo = (ctx.body || '').trim().toUpperCase()
            const cod = await codigosRepo.usarCodigo(codigo)
            if (!cod) {
                await flowDynamic('❌ Código inválido o agotado. ¿Es fin de semana o feriado? (si/no)')
                await state.update({ askedFinde: true })
                return
            }
            await state.update({ codigoDescuento: cod })
            await flowDynamic(`✅ Código aplicado: ${cod.descuento}% descuento.`)
        }

        // Detectar automáticamente si es fin de semana o feriado usando la fecha del viaje
        const currentState = (await state.getMyState()) || {}
        if (currentState.fecha && currentState.hora) {
            const fechaInfo = esFechaFinDeSemanaOHoliday(currentState.fecha, currentState.hora)
            await state.update({
                esFinde: fechaInfo.esFindeOFeriado,
                fechaInfo: fechaInfo
            })

            if (fechaInfo.esFindeOFeriado) {
                await flowDynamic(`✅ Detecté que ${fechaInfo.esFinDeSemana ? 'es fin de semana' : 'es feriado'} (${fechaInfo.mesDia}). Aplicando recargo automáticamente.`)
            } else {
                await flowDynamic('✅ Detecté que es día hábil. Sin recargo adicional.')
            }
        } else {
            await flowDynamic('¿Es fin de semana o feriado? (si/no)')
        }
        await state.update({ askedFinde: true })
    }
).addAnswer(
    '',
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        // Si llega aquí es porque no se pudo detectar automáticamente
        const esFinde = ((ctx.body || '').trim().toLowerCase().startsWith('s'))
        await state.update({ esFinde })

        // Calcular cotización aquí
        const st = (await state.getMyState()) || {}
        const { tipoCliente, kmIda, origenLat, origenLng, destinoLat, destinoLng, numPersonas, codigoDescuento } = st

        let distancia = kmIda * 2
        if (origenLat && origenLng && destinoLat && destinoLng) {
            try {
                const dist = await calculateDistance(origenLat, origenLng, destinoLat, destinoLng)
                if (dist) distancia = dist
            } catch (error) {
                console.error('Error calculating distance:', error)
            }
        }

        const capacidadPorAuto = 4
        const numVehiculos = Math.ceil(numPersonas / capacidadPorAuto)
        let horasExtras = 0
        if (tipoCliente === 'Turismo') {
            const extraKmVta = Math.max(0, distancia - 200)
            horasExtras = Math.floor(extraKmVta / 50)
        }
        if (tipoCliente === 'Empresarial Urbano') {
            // Añadir lógica si necesario
        }
        if (tipoCliente === 'Empresas Mineras') {
            const extraKmVta = Math.max(0, distancia - 100)
            horasExtras = Math.floor(extraKmVta / 100)
        }

        try {
            const r = await calcularCotizacion(tipoCliente, kmIda, { esFindeOFeriado: esFinde, horasExtras })
            let total = r.total
            let descuentoAplicado = 0
            if (codigoDescuento) {
                descuentoAplicado = codigoDescuento.descuento
                total = Math.round(total * (1 - descuentoAplicado / 100))
            }
            await flowDynamic([
                `💰 Cálculo finalizado ${st.clienteNombre}! 🎯`,
                `📋 Viaje: ${st.origen} → ${st.destino}`,
                `📅 Fecha/Hora: ${st.fecha} ${st.hora}`,
                `👥 Personas: ${numPersonas} | 🚗 Vehículos: ${numVehiculos}`,
                `📏 Distancia total: ~${Math.round(distancia)} km`,
                `💵 Total: *ARS ${total}* ${descuentoAplicado ? "(con ${descuentoAplicado}% descuento)" : ''}`,
            ])
            await state.update({
                precioCalculado: total,
                numVehiculos,
                distancia,
                horasExtras,
                descuentoAplicado,
                codigoDescuento
            })
        } catch (error) {
            console.error('Error in calculation:', error)
            await flowDynamic('Error calculando precio. Volvé a escribir *reservar*')
            return endFlow()
        }
    }
).addAnswer(
    ['💳 ¿Cómo vas a pagar? (tarjeta/efectivo)'],
    { capture: true },
    async (ctx, { flowDynamic, state, endFlow }) => {
        const medioPago = (ctx.body || '').trim().toLowerCase()
        const st = (await state.getMyState()) || {}

        if (!['tarjeta', 'efectivo', 'tarjet', 'efectiv'].includes(medioPago)) {
            await flowDynamic('❌ Por favor indica: *tarjeta* o *efectivo*')
            return
        }

        const metodoPago = medioPago.startsWith('tar') ? 'tarjeta' : 'efectivo'

        // Crear la reserva
        const reserva = await reservasRepo.crearReserva({
            clienteTelefono: ctx.from,
            clienteNombre: st.clienteNombre,
            tipoCliente: st.tipoCliente,
            fecha: st.fecha,
            hora: st.hora,
            origen: st.origen,
            destino: st.destino,
            kmIda: st.kmIda,
            precio: st.precioCalculado,
            numPersonas: st.numPersonas,
            numVehiculos: st.numVehiculos,
            metodoPago,
            estado: metodoPago === 'efectivo' ? 'pendiente' : 'pendiente_pago'
        })

        if (metodoPago === 'tarjeta') {
            const descripcion = `Viaje ${st.origen} → ${st.destino} | ${st.fecha} ${st.hora}`
            const preferencia = await crearPreferenciaPago(reserva._id, st.precioCalculado, descripcion)
            const linkPago = preferencia ? preferencia.init_point : `${PUBLIC_URL}/pago.html?reservaId=${encodeURIComponent(reserva._id)}`

            await flowDynamic([
                `✅ ¡Reserva creada! 🎯`,
                `💳 Para confirmar, realizá el pago aquí: ${linkPago}`,
                `🚗 Una vez aprobado, el administrador asignará vehículo y conductor.`,
                `⚠️ Nota: peajes, permisos, combustible extra o esperas especiales se facturan aparte.`
            ])

            if (ADMIN_PHONE) await notifyAdmin(`💳 Nueva reserva con pago pendiente ${reserva._id} de ${st.clienteNombre} (${ctx.from}). Monto: ARS ${st.precioCalculado}. Medio: ${metodoPago}`)

        } else {
            await flowDynamic([
                `✅ ¡Reserva creada! 🎯`,
                `💵 El pago se realizará en efectivo al conductor.`,
                `🚗 El administrador asignará vehículo y conductor pronto.`,
                `📞 Te notificaremos cuando esté todo listo.`,
                `⚠️ Nota: peajes, permisos, combustible extra o esperas especiales se facturan aparte.`
            ])

            if (ADMIN_PHONE) await notifyAdmin(`💵 Nueva reserva en efectivo ${reserva._id} de ${st.clienteNombre} (${ctx.from}). Monto: ARS ${st.precioCalculado}. Medio: ${metodoPago}. REQUIERE ASIGNACIÓN MANUAL`)
        }

        endFlow()
    }
)

// Flow principal: saludo y menú simple (amplía saludos comunes)
const flowPrincipal = addKeyword([
    'hola', 'holaa', 'holis', 'hello', 'hi',
    'buenas', 'buenass', 'buenas tardes', 'buenas noches',
    'buenos', 'buenos dias', 'buenos días',
    'alo', 'qué tal', 'que tal'
])
    .addAnswer('¡Hola! 😄 Bienvenido a Ruta Libre.')
    .addAnswer([
        '¿Querés cotizar un viaje, hacer una reserva o conocer nuestros planes de suscripción?',
        '• 💰 *cotizar* para calcular precio',
        '• 📝 *reservar* para agendar un viaje',
        '• 📢 *suscripcion* para planes mensuales',
        'Dato: contesto rápido y sin vueltas, como chofer que conoce todas las calles 😉',
    ], null, null, [flowCotizar, flowReservar, flowSuscripcion])

// Flow de bienvenida universal: dispara ante el primer mensaje del usuario (cualquier texto)
const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer('¡Hola! 😄 Bienvenido a Ruta Libre.')
    .addAnswer([
        '¿Querés cotizar un viaje, hacer una reserva o conocer nuestros planes de suscripción?',
        '• 💰 *cotizar* para calcular precio',
        '• 📝 *reservar* para agendar un viaje',
        '• 📢 *suscripcion* para planes mensuales',
        'Dato: contesto rápido y sin vueltas, como chofer que conoce todas las calles 😉',
    ], null, null, [flowCotizar, flowReservar, flowSuscripcion])

const main = async () => {
    // Conexión para repositorios (datos de negocio)
    await connect({ uri: MONGO_DB_URI, dbName: MONGO_DB_NAME })

    // Adapter para bot-whatsapp (sesiones y state)
    const adapterDB = new MongoAdapter({ dbUri: MONGO_DB_URI, dbName: MONGO_DB_NAME })
    // Registrar todos los flujos para que funcionen como entry-points (incluye bienvenida universal)
    const adapterFlow = createFlow([flowWelcome, flowPrincipal, flowCotizar, flowReservar, flowSuscripcion])
    const adapterProvider = createProvider(BaileysProvider)

    // Iniciar Bot
    const bot = createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    // Notificaciones
    setProvider(adapterProvider)
    if (ADMIN_PHONE) setAdminPhone(ADMIN_PHONE)

    // Servidor HTTP (público + admin)
    const { startServer, setBotQR } = require('./server')
    await startServer(bot, adapterProvider)

    // Intentar configurar eventos del provider de manera segura (opcional)
    try {
        setTimeout(async () => {
            if (adapterProvider && adapterProvider.vendor) {
                console.log('Configurando eventos del provider...')

                // Solo configurar eventos críticos
                if (typeof adapterProvider.vendor.on === 'function') {
                    adapterProvider.vendor.on('qr', (qr) => {
                      console.log('QR generado desde provider:', qr.substring(0, 50) + '...')
                      setBotQR(qr)
                    })

                    adapterProvider.vendor.on('connection.update', (update) => {
                      if (update.connection === 'open') {
                        console.log('Bot conectado y listo!')
                        setBotQR(null)
                      }
                    })
                }
            } else {
                console.log('Provider events not available - bot will work without them')
            }
        }, 5000) // Esperar 5 segundos
    } catch (error) {
        console.log('Provider events setup failed, but bot should still work:', error.message)
    }

    // Also capture connection events from bot
    console.log('Bot inicializado correctamente - omitiendo eventos para compatibilidad')
}

main()
