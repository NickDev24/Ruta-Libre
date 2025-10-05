const { getDB } = require('../db/mongo')
const { ObjectId } = require('mongodb')

class CodigosRepo {
  async crearCodigo(plan, descuento, usosMax) {
    const db = getDB()
    const codigo = {
      codigo: this.generarCodigo(),
      plan,
      descuento,
      usosMax,
      usosActual: 0,
      fechaCreacion: new Date(),
      activo: true
    }
    const result = await db.collection('codigos').insertOne(codigo)
    return { _id: result.insertedId, ...codigo }
  }

  async usarCodigo(codigoStr) {
    const db = getDB()
    const codigo = await db.collection('codigos').findOne({
      codigo: codigoStr.toUpperCase(),
      activo: true,
      $expr: { $lt: ['$usosActual', '$usosMax'] }
    })

    if (codigo) {
      await db.collection('codigos').updateOne(
        { _id: codigo._id },
        { $inc: { usosActual: 1 } }
      )
      return codigo
    }
    return null
  }

  generarCodigo() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  async listar() {
    const db = getDB()
    return await db.collection('codigos').find({}).toArray()
  }

  async obtener(id) {
    const db = getDB()
    return await db.collection('codigos').findOne({ _id: new ObjectId(id) })
  }

  async actualizar(id, data) {
    const db = getDB()
    await db.collection('codigos').updateOne({ _id: new ObjectId(id) }, { $set: data })
  }

  async eliminar(id) {
    const db = getDB()
    await db.collection('codigos').deleteOne({ _id: new ObjectId(id) })
  }
}

module.exports = new CodigosRepo()
