const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class ReservasRepo {
  async listar() {
    const db = getDB()
    return await db.collection('reservas').find({}).toArray()
  }

  async listarPorEstado(estado) {
    const db = getDB()
    return await db.collection('reservas').find({ estado }).toArray()
  }

  async obtener(id) {
    const db = getDB()
    if (!id || typeof id !== 'string' || id.length !== 24) {
      throw new Error('ID inválido para reserva')
    }
    return await db.collection('reservas').findOne({ _id: new ObjectId(id) })
  }

  async crear(data) {
    const db = getDB()
    const reserva = {
      clienteTelefono: data.clienteTelefono,
      clienteNombre: data.clienteNombre,
      tipoCliente: data.tipoCliente,
      fecha: data.fecha,
      hora: data.hora,
      origen: data.origen,
      destino: data.destino,
      kmIda: data.kmIda,
      precio: data.precio,
      numPersonas: data.numPersonas,
      numVehiculos: data.numVehiculos,
      metodoPago: data.metodoPago || 'tarjeta', // 'tarjeta' o 'efectivo'
      estado: data.estado || (data.metodoPago === 'efectivo' ? 'pendiente' : 'pendiente_pago'),
      fechaCreacion: new Date(),
      vehiculo: null,
      conductor: null,
      reminderEnviado: false
    }
    const result = await db.collection('reservas').insertOne(reserva)
    return { _id: result.insertedId, ...reserva }
  }

  async actualizarEstado(id, estado) {
    const db = getDB()
    // Try to convert to ObjectId if it's a valid ObjectId string
    let objectId
    try {
      objectId = new ObjectId(id)
    } catch (e) {
      // If not a valid ObjectId, search by string
      await db.collection('reservas').updateOne({ _id: id }, { $set: { estado } })
      return
    }
    await db.collection('reservas').updateOne({ _id: objectId }, { $set: { estado } })
  }

  async asignar(id, vehiculo, conductor) {
    const db = getDB()
    await db.collection('reservas').updateOne(
      { _id: new ObjectId(id) },
      { $set: { vehiculo, conductor, estado: 'asignado' } }
    )
    return await this.obtener(id)
  }
}

module.exports = new ReservasRepo()
