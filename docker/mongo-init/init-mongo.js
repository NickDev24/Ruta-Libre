// ============================================================================
// Script de inicialización de MongoDB para Ruta Libre
// ============================================================================

// Crear usuario de aplicación
db = db.getSiblingDB('rutalibre_prod');

// Crear usuario de aplicación
db.createUser({
    user: 'rutalibre_app',
    pwd: 'secure_app_password',
    roles: [
        {
            role: 'readWrite',
            db: 'rutalibre_prod'
        }
    ]
});

// Crear usuario de solo lectura para consultas (opcional)
db.createUser({
    user: 'rutalibre_readonly',
    pwd: 'readonly_password',
    roles: [
        {
            role: 'read',
            db: 'rutalibre_prod'
        }
    ]
});

// Crear índices para mejor rendimiento
db.reservas.createIndex({ "clienteTelefono": 1 });
db.reservas.createIndex({ "estado": 1 });
db.reservas.createIndex({ "fecha": 1, "hora": 1 });
db.reservas.createIndex({ "conductor.telefono": 1 });

db.pagos.createIndex({ "reservaId": 1 });
db.pagos.createIndex({ "estado": 1 });
db.pagos.createIndex({ "fecha": -1 });

db.vehiculos.createIndex({ "patente": 1 }, { unique: true });
db.vehiculos.createIndex({ "disponible": 1 });

db.conductores.createIndex({ "telefono": 1 }, { unique: true });
db.conductores.createIndex({ "disponible": 1 });

db.destinos.createIndex({ "nombre": 1 });
db.destinos.createIndex({ "categoria": 1 });

db.suscripciones.createIndex({ "email": 1 });
db.suscripciones.createIndex({ "telefono": 1 });

db.codigos.createIndex({ "codigo": 1 }, { unique: true });
db.codigos.createIndex({ "fechaExpiracion": 1 });

// Insertar datos iniciales de configuración
db.config.insertMany([
    {
        key: 'kmPrice',
        value: 1000,
        description: 'Precio global por km extra',
        updatedAt: new Date()
    },
    {
        key: 'appVersion',
        value: '1.0.0',
        description: 'Versión actual de la aplicación',
        updatedAt: new Date()
    }
]);

// Insertar destinos iniciales (datos de ejemplo)
db.destinos.insertMany([
    {
        nombre: 'Aeropuerto Salta',
        categoria: 'Salta Capital',
        tipoServicio: 'Turismo',
        kmIda: 15,
        lat: -24.7859,
        lng: -65.4095,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        nombre: 'Terminal de Omnibus',
        categoria: 'Salta Capital',
        tipoServicio: 'Turismo',
        kmIda: 8,
        lat: -24.7893,
        lng: -65.4107,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date()
    }
]);

print('Base de datos inicializada correctamente para Ruta Libre');
