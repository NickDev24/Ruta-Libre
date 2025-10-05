const { MongoClient } = require('mongodb')

let client = null
let db = null

async function connect({ uri, dbName }) {
  if (db) return db

  // Parse URI to add authentication if needed for Docker deployment
  let connectionUri = uri

  // Only add authentication if credentials are explicitly provided and not commented
  const mongoUser = process.env.MONGO_USER
  const mongoPass = process.env.MONGO_PASSWORD

  // More strict check - ensure values are not undefined, null, empty, or commented values
  if (mongoUser &&
      mongoPass &&
      mongoUser.trim() !== '' &&
      mongoPass.trim() !== '' &&
      !mongoUser.startsWith('#') &&
      !mongoPass.startsWith('#') &&
      mongoUser !== 'rutalibre_app' &&
      mongoPass !== 'secure_app_password') {
    if (!connectionUri.includes('@') && !connectionUri.includes('localhost')) {
      connectionUri = connectionUri.replace('mongodb://', `mongodb://${mongoUser}:${mongoPass}@`)
    }
  }

  client = new MongoClient(connectionUri, {
    useUnifiedTopology: true,
    authSource: mongoUser && mongoPass ? 'admin' : undefined  // Only set authSource if using auth
  })
  await client.connect()
  db = client.db(dbName)
  await ensureIndexes()
  return db
}

async function ensureIndexes() {
  if (!db) return
  try {
    await db.collection('destinos').createIndex({ nombre: 1 }, { unique: true })
    // Permitir múltiples tarifas por modelo diferenciadas por tipoCliente
    await db.collection('tarifas').createIndex({ modelo: 1, tipoCliente: 1 }, { unique: true })
    await db.collection('vehiculos').createIndex({ patente: 1 }, { unique: true })
    await db.collection('conductores').createIndex({ telefono: 1 }, { unique: true })
    await db.collection('reservas').createIndex({ estado: 1 })
    await db.collection('pagos').createIndex({ estado: 1 })
    console.log('✅ Índices de base de datos creados correctamente')
  } catch (error) {
    console.error('❌ Error creando índices:', error.message)
  }
}

function getDB() {
  if (!db) throw new Error('DB not connected')
  return db
}

module.exports = { connect, getDB }
