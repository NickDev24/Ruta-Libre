const { MongoClient } = require('mongodb')

let client = null
let db = null

async function connect({ uri, dbName }) {
  if (db) return db
  client = new MongoClient(uri, { useUnifiedTopology: true })
  await client.connect()
  db = client.db(dbName)
  await ensureIndexes()
  return db
}

async function ensureIndexes() {
  if (!db) return
  await db.collection('destinos').createIndex({ nombre: 1 }, { unique: true })
  // Permitir múltiples tarifas por modelo diferenciadas por tipoCliente
  await db.collection('tarifas').createIndex({ modelo: 1, tipoCliente: 1 }, { unique: true })
  await db.collection('vehiculos').createIndex({ patente: 1 }, { unique: true })
  await db.collection('conductores').createIndex({ telefono: 1 }, { unique: true })
  await db.collection('reservas').createIndex({ estado: 1 })
  await db.collection('pagos').createIndex({ estado: 1 })
}

function getDB() {
  if (!db) throw new Error('DB not connected')
  return db
}

module.exports = { connect, getDB }
