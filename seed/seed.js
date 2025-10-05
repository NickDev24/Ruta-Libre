require('dotenv').config()
const { connect } = require('../db/mongo')
const destinosRepo = require('../repositories/destinosRepo')
const conductoresRepo = require('../repositories/conductoresRepo')
const vehiculosRepo = require('../repositories/vehiculosRepo')

async function seedDatabase() {
  try {
    console.log('Conectando a la base de datos...')
    const uri = process.env.MONGO_DB_URI || 'mongodb+srv://Admin-Clotch:Mikias420@clotch.nge8kuc.mongodb.net/'
    const dbName = process.env.MONGO_DB_NAME || 'db_bot'
    await connect({ uri, dbName })

    console.log(' Poblando base de datos...')

    //Destinos iniciales
    const destinos = [
      // Salta Capital y alrededores
      { nombre: 'Salta Capital', categoria: 'Salta Capital', kmIda: 0, tipoServicio: 'Urbano Puntual' },
      { nombre: 'San Lorenzo', categoria: 'Salta Capital', kmIda: 15, tipoServicio: 'Urbano Puntual' },
      { nombre: 'El Carril', categoria: 'Salta Capital', kmIda: 25, tipoServicio: 'Urbano Puntual' },
      { nombre: 'La Merced', categoria: 'Salta Capital', kmIda: 35, tipoServicio: 'Urbano Puntual' },

      // Quebrada de Humahuaca
      { nombre: 'Tilcara', categoria: 'Quebrada de Humahuaca', kmIda: 85, tipoServicio: 'Turismo' },
      { nombre: 'Humahuaca', categoria: 'Quebrada de Humahuaca', kmIda: 125, tipoServicio: 'Turismo' },
      { nombre: 'Iruya', categoria: 'Quebrada de Humahuaca', kmIda: 180, tipoServicio: 'Turismo' },
      { nombre: 'Purmamarca', categoria: 'Quebrada de Humahuaca', kmIda: 65, tipoServicio: 'Turismo' },

      // Quebrada y Puna
      { nombre: 'San Antonio de los Cobres', categoria: 'Quebrada y Puna', kmIda: 160, tipoServicio: 'Turismo' },
      { nombre: 'Rincon', categoria: 'Quebrada y Puna', kmIda: 140, tipoServicio: 'Empresas Mineras' },
      { nombre: 'Centenario-Ratones', categoria: 'Quebrada y Puna', kmIda: 150, tipoServicio: 'Empresas Mineras' },
      { nombre: 'Olacapato', categoria: 'Quebrada y Puna', kmIda: 135, tipoServicio: 'Turismo' },

      // Valles Calchaquíes
      { nombre: 'Cafayate', categoria: 'Valles Calchaquíes', kmIda: 180, tipoServicio: 'Turismo' },
      { nombre: 'Cachi', categoria: 'Valles Calchaquíes', kmIda: 155, tipoServicio: 'Turismo' },
      { nombre: 'Molinos', categoria: 'Valles Calchaquíes', kmIda: 125, tipoServicio: 'Turismo' },
      { nombre: 'Seclantás', categoria: 'Valles Calchaquíes', kmIda: 140, tipoServicio: 'Turismo' },

      // Aeropuerto y terminal
      { nombre: 'Aeropuerto Martín Miguel de Güemes', categoria: 'Salta Capital', kmIda: 12, tipoServicio: 'Urbano Puntual' },
      { nombre: 'Terminal de Ómnibus', categoria: 'Salta Capital', kmIda: 8, tipoServicio: 'Urbano Puntual' }
    ]

    console.log(' Insertando destinos...')
    for (const destino of destinos) {
      try {
        await destinosRepo.crear(destino)
        console.log(` ${destino.nombre}`)
      } catch (error) {
        console.log(` ${destino.nombre} ya existe`)
      }
    }

    // Vehículos iniciales
    const vehiculos = [
      { modelo: 'Toyota Hilux', patente: 'ABC123', capacidad: 4, disponible: true },
      { modelo: 'Ford Ranger', patente: 'DEF456', capacidad: 4, disponible: true },
      { modelo: 'Chevrolet S10', patente: 'GHI789', capacidad: 4, disponible: true },
      { modelo: 'VW Amarok', patente: 'JKL012', capacidad: 4, disponible: true },
      { modelo: 'Mercedes Sprinter', patente: 'MNO345', capacidad: 12, disponible: true }
    ]

    console.log(' Insertando vehículos...')
    for (const vehiculo of vehiculos) {
      try {
        await vehiculosRepo.crear(vehiculo)
        console.log(` ${vehiculo.modelo} - ${vehiculo.patente}`)
      } catch (error) {
        console.log(` ${vehiculo.patente} ya existe`)
      }
    }

    // Conductores iniciales
    const conductores = [
      { nombre: 'Carlos Rodríguez', telefono: '5493875123456', password: '123456', porcentajePago: 0.85, disponible: true },
      { nombre: 'María González', telefono: '5493875234567', password: '123456', porcentajePago: 0.85, disponible: true },
      { nombre: 'Juan Pérez', telefono: '5493875345678', password: '123456', porcentajePago: 0.85, disponible: true },
      { nombre: 'Ana López', telefono: '5493875456789', password: '123456', porcentajePago: 0.85, disponible: true }
    ]

    console.log(' Insertando conductores...')
    for (const conductor of conductores) {
      try {
        await conductoresRepo.crear(conductor)
        console.log(` ${conductor.nombre}`)
      } catch (error) {
        console.log(` ${conductor.nombre} ya existe`)
      }
    }

    console.log(' Base de datos poblada exitosamente!')
    console.log('\n Resumen:')
    console.log(`- ${destinos.length} destinos agregados`)
    console.log(`- ${vehiculos.length} vehículos agregados`)
    console.log(`- ${conductores.length} conductores agregados`)

    process.exit(0)
  } catch (error) {
    console.error(' Error poblando la base de datos:', error)
    process.exit(1)
  }
}

seedDatabase()
