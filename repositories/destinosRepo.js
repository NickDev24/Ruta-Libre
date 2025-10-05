const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class DestinosRepo {
  async listDestinos() {
    const db = getDB()
    return await db.collection('destinos').find({}).toArray()
  }

  async obtener(id) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      return await db.collection('destinos').findOne({ _id: new ObjectId(id) })
    }

    // Si parece un nombre de destino (más de 3 caracteres, sin números puros)
    if (typeof id === 'string' && id.length > 3 && !/^\d+$/.test(id)) {
      return await db.collection('destinos').findOne({ nombre: new RegExp(id, 'i') })
    }

    // Si no es ninguno de los anteriores, devolver null en lugar de lanzar error
    console.warn(`ID de destino inválido recibido: ${id}. Tipo: ${typeof id}, Longitud: ${id?.length || 0}`)
    return null
  }

  async crear(data) {
    const db = getDB()
    const destino = { nombre: data.nombre, categoria: data.categoria, kmIda: data.kmIda, tipoServicio: data.tipoServicio }
    const result = await db.collection('destinos').insertOne(destino)
    return { _id: result.insertedId, ...destino }
  }

  async actualizar(id, data) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      await db.collection('destinos').updateOne({ _id: new ObjectId(id) }, { $set: data })
      return true
    }

    // Si parece un nombre de destino (más de 3 caracteres, sin números puros)
    if (typeof id === 'string' && id.length > 3 && !/^\d+$/.test(id)) {
      await db.collection('destinos').updateOne({ nombre: new RegExp(id, 'i') }, { $set: data })
      return true
    }

    console.warn(`ID de destino inválido para actualizar: ${id}`)
    return false
  }

  async eliminar(id) {
    const db = getDB()

    // Si es un ObjectId válido (24 caracteres hexadecimales)
    if (typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]{24}$/.test(id)) {
      await db.collection('destinos').deleteOne({ _id: new ObjectId(id) })
      return true
    }

    // Si parece un nombre de destino (más de 3 caracteres, sin números puros)
    if (typeof id === 'string' && id.length > 3 && !/^\d+$/.test(id)) {
      await db.collection('destinos').deleteOne({ nombre: new RegExp(id, 'i') })
      return true
    }

    console.warn(`ID de destino inválido para eliminar: ${id}`)
    return false
  }

  async findDestino(nombre) {
    const db = getDB()
    return await db.collection('destinos').findOne({ nombre })
  }
}

module.exports = new DestinosRepo()
