const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class ConductoresRepo {
  async listar() {
    const db = getDB()
    return await db.collection('conductores').find({}).toArray()
  }

  async obtener(id) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      return await db.collection('conductores').findOne({ _id: new ObjectId(id) })
    }

    // Si parece un número de teléfono (10-15 dígitos)
    if (typeof id === 'string' && /^\d{10,15}$/.test(id)) {
      return await db.collection('conductores').findOne({ telefono: id })
    }

    // Si no es ninguno de los anteriores, devolver null en lugar de lanzar error
    console.warn(`ID de conductor inválido recibido: ${id}. Tipo: ${typeof id}, Longitud: ${id?.length || 0}`)
    return null
  }

  async crear(data) {
    const db = getDB()
    const conductor = {
      nombre: data.nombre,
      telefono: data.telefono,
      password: data.password, // Agregar password
      porcentajePago: data.porcentajePago || 0.85, // Cambiado a 85% por defecto
      disponible: data.disponible || true,
      ipActual: null,
      latActual: null,
      lngActual: null,
      enViaje: false,
      // Nuevos campos del formulario de 2 pasos
      dni: data.dni || null,
      licencia: data.licencia || null,
      tipoLicencia: data.tipoLicencia || null,
      vehiculoId: data.vehiculoId || null,
      datosBancarios: data.datosBancarios || null
    }
    const result = await db.collection('conductores').insertOne(conductor)
    return { _id: result.insertedId, ...conductor }
  }

  async actualizar(id, data) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      await db.collection('conductores').updateOne({ _id: new ObjectId(id) }, { $set: data })
      return true
    }

    // Si parece un número de teléfono (10-15 dígitos)
    if (typeof id === 'string' && /^\d{10,15}$/.test(id)) {
      await db.collection('conductores').updateOne({ telefono: id }, { $set: data })
      return true
    }

    console.warn(`ID de conductor inválido para actualizar: ${id}`)
    return false
  }

  async eliminar(id) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      await db.collection('conductores').deleteOne({ _id: new ObjectId(id) })
      return true
    }

    // Si parece un número de teléfono (10-15 dígitos)
    if (typeof id === 'string' && /^\d{10,15}$/.test(id)) {
      await db.collection('conductores').deleteOne({ telefono: id })
      return true
    }

    console.warn(`ID de conductor inválido para eliminar: ${id}`)
    return false
  }

  async setDisponible(telefono, disponible) {
    const db = getDB()
    await db.collection('conductores').updateOne({ telefono }, { $set: { disponible } })
  }

  async login(telefono, password, ip) {
    const db = getDB()
    const conductor = await db.collection('conductores').findOne({ telefono, password })
    if (conductor) {
      await db.collection('conductores').updateOne({ telefono }, { $set: { ipActual: ip, disponible: true } })
      return conductor
    }
    return null
  }

  async actualizarUbicacion(telefono, lat, lng) {
    const db = getDB()
    await db.collection('conductores').updateOne({ telefono }, { $set: { latActual: lat, lngActual: lng } })
  }

  async listDisponibles() {
    const db = getDB()
    return await db.collection('conductores').find({ disponible: true }).toArray()
  }
}

module.exports = new ConductoresRepo()
