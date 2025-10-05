const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')

function generateFacturaPDF(suscripcion, codigo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const fileName = `factura_${suscripcion._id}.pdf`
    const filePath = path.join(__dirname, '..', 'temp', fileName)
    if (!fs.existsSync(path.join(__dirname, '..', 'temp'))) {
      fs.mkdirSync(path.join(__dirname, '..', 'temp'))
    }
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    // Header
    doc.fontSize(20).text('Factura - Ruta Libre', { align: 'center' })
    doc.moveDown()

    // Datos de la suscripción
    doc.fontSize(12).text(`ID Suscripción: ${suscripcion._id}`)
    doc.text(`Nombre: ${suscripcion.nombre}`)
    doc.text(`Email: ${suscripcion.email}`)
    doc.text(`Teléfono: ${suscripcion.telefono}`)
    doc.text(`Tipo Cliente: ${suscripcion.tipoCliente}`)
    doc.text(`Plan: ${suscripcion.plan}`)
    doc.text(`Fecha: ${suscripcion.fechaCreacion.toLocaleDateString()}`)
    doc.moveDown()

    // Código único
    doc.text(`Código para empleados: ${codigo}`)
    doc.moveDown()

    // Detalles de pago
    doc.text('Pago aprobado: Simulado')
    doc.text('Monto: Según plan (ej: ARS 25.000 para Urbano Básico)')
    doc.moveDown()

    // Footer
    doc.text('Gracias por elegir Ruta Libre.', { align: 'center' })

    doc.end()

    stream.on('finish', () => resolve(filePath))
    stream.on('error', reject)
  })
}

module.exports = { generateFacturaPDF }
