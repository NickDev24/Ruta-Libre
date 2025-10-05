const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class SuscripcionesRepo {
  async crearSuscripcion(data) {
    const db = getDB()
    const suscripcion = {
      ...data,
      fechaCreacion: new Date(),
      estado: 'activa'
    }
    const result = await db.collection('suscripciones').insertOne(suscripcion)
    return { _id: result.insertedId, ...suscripcion }
  }

  async obtener(id) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      return await db.collection('suscripciones').findOne({ _id: new ObjectId(id) })
    }

    // Si parece un email (contiene @)
    if (typeof id === 'string' && id.includes('@')) {
      return await db.collection('suscripciones').findOne({ email: id })
    }

    // Si parece un teléfono (10-15 dígitos)
    if (typeof id === 'string' && /^\d{10,15}$/.test(id)) {
      return await db.collection('suscripciones').findOne({ telefono: id })
    }

    // Si no es ninguno de los anteriores, devolver null en lugar de lanzar error
    console.warn(`ID de suscripción inválido recibido: ${id}. Tipo: ${typeof id}, Longitud: ${id?.length || 0}`)
    return null
  }

  async listar() {
    const db = getDB()
    return await db.collection('suscripciones').find({}).toArray()
  }

  async actualizar(id, data) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      await db.collection('suscripciones').updateOne({ _id: new ObjectId(id) }, { $set: data })
      return true
    }

    // Si parece un email (contiene @)
    if (typeof id === 'string' && id.includes('@')) {
      await db.collection('suscripciones').updateOne({ email: id }, { $set: data })
      return true
    }

    // Si parece un teléfono (10-15 dígitos)
    if (typeof id === 'string' && /^\d{10,15}$/.test(id)) {
      await db.collection('suscripciones').updateOne({ telefono: id }, { $set: data })
      return true
    }

    console.warn(`ID de suscripción inválido para actualizar: ${id}`)
    return false
  }

  async eliminar(id) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      await db.collection('suscripciones').deleteOne({ _id: new ObjectId(id) })
      return true
    }

    // Si parece un email (contiene @)
    if (typeof id === 'string' && id.includes('@')) {
      await db.collection('suscripciones').deleteOne({ email: id })
      return true
    }

    // Si parece un teléfono (10-15 dígitos)
    if (typeof id === 'string' && /^\d{10,15}$/.test(id)) {
      await db.collection('suscripciones').deleteOne({ telefono: id })
      return true
    }

    console.warn(`ID de suscripción inválido para eliminar: ${id}`)
    return false
  }
}

module.exports = new SuscripcionesRepo()
