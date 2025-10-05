const { getDB } = require('../db/mongo')

async function upsertTarifa(tarifa) {
  const db = getDB()
  await db.collection('tarifas').updateOne({ modelo: tarifa.modelo, tipoCliente: tarifa.tipoCliente }, { $set: tarifa }, { upsert: true })
}

async function getTarifa(tipoCliente) {
  const db = getDB()
  return db.collection('tarifas').findOne({ tipoCliente })
}

module.exports = { upsertTarifa, getTarifa }
