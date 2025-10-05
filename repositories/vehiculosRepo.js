const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class VehiculosRepo {
  async listar() {
    const db = getDB()
    return await db.collection('vehiculos').find({}).toArray()
  }

  async obtener(id) {
    const db = getDB()
    if (!id || typeof id !== 'string' || id.length !== 24) {
      throw new Error('ID inválido para vehículo')
    }
    return await db.collection('vehiculos').findOne({ _id: new ObjectId(id) })
  }

  async crear(data) {
    const db = getDB()
    const vehiculo = { modelo: data.modelo, patente: data.patente, capacidad: data.capacidad, disponible: data.disponible || true }
    const result = await db.collection('vehiculos').insertOne(vehiculo)
    return { _id: result.insertedId, ...vehiculo }
  }

  async actualizar(id, data) {
    const db = getDB()
    await db.collection('vehiculos').updateOne({ _id: new ObjectId(id) }, { $set: data })
  }

  async eliminar(id) {
    const db = getDB()
    await db.collection('vehiculos').deleteOne({ _id: new ObjectId(id) })
  }

  async setDisponible(patente, disponible) {
    const db = getDB()
    await db.collection('vehiculos').updateOne({ patente }, { $set: { disponible } })
  }

  async listDisponibles() {
    const db = getDB()
    return await db.collection('vehiculos').find({ disponible: true }).toArray()
  }
}

module.exports = new VehiculosRepo()
