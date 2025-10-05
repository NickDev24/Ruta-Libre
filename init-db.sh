#!/bin/bash

# ============================================================================
# Script de inicialización de base de datos para Ruta Libre
# ============================================================================

set -e  # Salir inmediatamente si hay errores

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# ============================================================================
# Configuración
# ============================================================================

MONGO_URI=${MONGO_URI:-mongodb://localhost:27017}
DATABASE_NAME=${DATABASE_NAME:-rutalibre_prod}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================================================
# Verificaciones previas
# ============================================================================

log "🗄️ Iniciando inicialización de base de datos..."

# Verificar si MongoDB está disponible
if ! command -v mongosh &> /dev/null && ! command -v mongo &> /dev/null; then
    error "MongoDB shell client no está instalado"
    exit 1
fi

# Verificar conectividad con MongoDB
log "🔌 Verificando conexión con MongoDB..."

if command -v mongosh &> /dev/null; then
    MONGO_CMD="mongosh"
    if ! $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
        error "No se puede conectar a MongoDB en $MONGO_URI"
        exit 1
    fi
elif command -v mongo &> /dev/null; then
    MONGO_CMD="mongo"
    if ! $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
        error "No se puede conectar a MongoDB en $MONGO_URI"
        exit 1
    fi
fi

log "✅ Conexión con MongoDB verificada"

# ============================================================================
# Crear base de datos y usuario
# ============================================================================

log "🏗️ Configurando base de datos..."

# Ejecutar script de inicialización si existe
INIT_SCRIPT="$SCRIPT_DIR/docker/mongo-init/init-mongo.js"
if [[ -f "$INIT_SCRIPT" ]]; then
    log "📜 Ejecutando script de inicialización..."

    if [[ "$MONGO_CMD" == "mongosh" ]]; then
        $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" "$INIT_SCRIPT"
    else
        # Para mongo (versión antigua)
        $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" "$INIT_SCRIPT"
    fi

    log "✅ Script de inicialización ejecutado"
else
    warn "No se encontró script de inicialización en $INIT_SCRIPT"
    log "📋 Creando estructura básica manualmente..."

    # Crear estructura básica usando comandos directos
    if [[ "$MONGO_CMD" == "mongosh" ]]; then
        $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" --eval "
            // Crear usuario de aplicación
            db = db.getSiblingDB('$DATABASE_NAME');
            db.createUser({
                user: 'rutalibre_app',
                pwd: 'secure_app_password',
                roles: [{ role: 'readWrite', db: '$DATABASE_NAME' }]
            });

            // Crear índices básicos
            db.reservas.createIndex({ 'clienteTelefono': 1 });
            db.reservas.createIndex({ 'estado': 1 });
            db.vehiculos.createIndex({ 'patente': 1 }, { unique: true });
            db.conductores.createIndex({ 'telefono': 1 }, { unique: true });

            print('✅ Usuario y estructura básica creados');
        "
    fi
fi

# ============================================================================
# Ejecutar seeders si existen
# ============================================================================

SEED_DIR="$SCRIPT_DIR/seed"
if [[ -d "$SEED_DIR" ]] && [[ -f "$SEED_DIR/seed.js" ]]; then
    log "🌱 Ejecutando seeders..."

    if [[ -f ".env" ]]; then
        # Ejecutar seeder con variables de entorno
        NODE_ENV=production $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" "$SEED_DIR/seed.js"
    else
        warn "No se encontró archivo .env, ejecutando seeder sin variables de entorno"
        NODE_ENV=production $MONGO_CMD "$MONGO_URI/$DATABASE_NAME" "$SEED_DIR/seed.js"
    fi

    log "✅ Seeders ejecutados"
fi

# ============================================================================
# Verificación final
# ============================================================================

log "🔍 Verificando configuración de base de datos..."

# Verificar colecciones creadas
if [[ "$MONGO_CMD" == "mongosh" ]]; then
    COLLECTIONS=$($MONGO_CMD "$MONGO_URI/$DATABASE_NAME" --eval "db.getCollectionNames().join(',')" --quiet 2>/dev/null)
    if [[ -n "$COLLECTIONS" ]]; then
        log "✅ Colecciones encontradas: $COLLECTIONS"
    else
        warn "No se encontraron colecciones. Puede que la inicialización haya fallado."
    fi
fi

# Verificar usuarios
log "👤 Verificando usuarios de base de datos..."
if [[ "$MONGO_CMD" == "mongosh" ]]; then
    USERS=$($MONGO_CMD "$MONGO_URI/admin" --eval "
        db.getUsers().forEach(user => {
            if (user.db === '$DATABASE_NAME') {
                print('Usuario: ' + user.user + ' (DB: ' + user.db + ')');
            }
        });
    " --quiet 2>/dev/null)
    echo "$USERS"
fi

# ============================================================================
# Información final
# ============================================================================

echo
log "🎉 ¡Inicialización de base de datos completada!"
echo
echo -e "${BLUE}===============================================================${NC}"
echo -e "${BLUE}                🗄️ BASE DE DATOS INICIALIZADA                 ${NC}"
echo -e "${BLUE}===============================================================${NC}"
echo
echo -e "${GREEN}📋 Configuración aplicada:${NC}"
echo "   • Base de datos: $DATABASE_NAME"
echo "   • URI de conexión: $MONGO_URI"
echo "   • Usuario de aplicación: rutalibre_app"
echo "   • Colecciones creadas y configuradas"
echo
echo -e "${YELLOW}🔧 Próximos pasos recomendados:${NC}"
echo "   • Verificar que la aplicación puede conectarse"
echo "   • Ejecutar pruebas de integración"
echo "   • Configurar backups automáticos"
echo "   • Revisar logs de la aplicación"
echo
log "✅ Inicialización de base de datos finalizada"
