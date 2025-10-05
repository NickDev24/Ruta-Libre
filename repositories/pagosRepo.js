const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class PagosRepo {
  async crearPago(data) {
    const db = getDB()
    const pago = {
      reservaId: data.reservaId,
      monto: data.monto,
      metodo: data.metodo || 'mercadopago',
      email: data.email,
      estado: 'pendiente',
      fechaCreacion: new Date()
    }
    const result = await db.collection('pagos').insertOne(pago)
    return { _id: result.insertedId, ...pago }
  }

  async setEstado(id, estado) {
    const db = getDB()
    const pago = await db.collection('pagos').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { estado, fechaActualizacion: new Date() } },
      { returnDocument: 'after' }
    )
    return pago.value
  }

  async listarPorEstado(estado) {
    const db = getDB()
    return await db.collection('pagos').find({ estado }).toArray()
  }

  async obtener(id) {
    const db = getDB()
    if (!id || typeof id !== 'string' || id.length !== 24) {
      throw new Error('ID inválido para pago')
    }
    return await db.collection('pagos').findOne({ _id: new ObjectId(id) })
  }
}

module.exports = new PagosRepo()
