#!/bin/bash

# ============================================================================
# Script de backup para Ruta Libre WhatsApp Bot
# ============================================================================

set -e  # Salir inmediatamente si hay errores

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
BACKUP_DIR="backups"
MONGO_CONTAINER="rutalibre-mongo"
RETENTION_DAYS=${RETENTION_DAYS:-7}

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
# Verificaciones previas
# ============================================================================

log "💾 Iniciando proceso de backup..."

# Verificar Docker
if ! command -v docker &> /dev/null; then
    error "Docker no está instalado"
    exit 1
fi

# Verificar si el contenedor de MongoDB está corriendo
if ! docker ps | grep -q "$MONGO_CONTAINER"; then
    error "El contenedor MongoDB no está corriendo. Inicia los servicios primero."
    exit 1
fi

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# ============================================================================
# Crear backup
# ============================================================================

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"

log "📦 Creando backup de MongoDB en $BACKUP_PATH..."

# Crear el backup usando mongodump dentro del contenedor
if docker exec "$MONGO_CONTAINER" mongodump --out "/data/backup/$TIMESTAMP" --oplog; then
    log "✅ Backup de MongoDB creado exitosamente"

    # Copiar el backup al host
    docker cp "$MONGO_CONTAINER:/data/backup/$TIMESTAMP" "$BACKUP_PATH"
    docker exec "$MONGO_CONTAINER" rm -rf "/data/backup/$TIMESTAMP"

    # Crear archivo de información del backup
    cat > "$BACKUP_PATH/backup_info.txt" << EOF
Ruta Libre WhatsApp Bot - Información del Backup
==================================================

Fecha: $(date)
Timestamp: $TIMESTAMP
Base de datos: rutalibre_prod
Contenedor: $MONGO_CONTAINER

Instrucciones de restauración:
1. Descomprime el archivo comprimido si aplica
2. Usa mongorestore para restaurar:
   mongorestore --uri="mongodb://localhost:27017/rutalibre_prod" --drop "$BACKUP_PATH"

Contenido incluido:
- Todas las colecciones de MongoDB
- Índices y metadatos
- Estado del oplog (para point-in-time recovery)
EOF

    log "✅ Backup copiado al host exitosamente"
else
    error "❌ Error creando backup de MongoDB"
    exit 1
fi

# ============================================================================
# Crear archivo comprimido (opcional)
# ============================================================================

read -p "¿Deseas crear un archivo comprimido del backup? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "🗜️ Creando archivo comprimido..."
    ARCHIVE_NAME="rutalibre_backup_$TIMESTAMP.tar.gz"

    if tar -czf "$ARCHIVE_NAME" -C "$BACKUP_DIR" "backup_$TIMESTAMP"; then
        log "✅ Archivo comprimido creado: $ARCHIVE_NAME"

        # Eliminar directorio descomprimido después de comprimir
        rm -rf "$BACKUP_PATH"
        log "🧹 Directorio temporal eliminado"
    else
        error "❌ Error creando archivo comprimido"
        exit 1
    fi
fi

# ============================================================================
# Limpieza de backups antiguos
# ============================================================================

log "🧹 Limpiando backups antiguos (más de $RETENTION_DAYS días)..."

# Contar backups antes de limpiar
BACKUP_COUNT_BEFORE=$(find "$BACKUP_DIR" -type d -name "backup_*" | wc -l)

# Eliminar backups antiguos
find "$BACKUP_DIR" -type d -name "backup_*" -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true
find . -type f -name "rutalibre_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

BACKUP_COUNT_AFTER=$(find "$BACKUP_DIR" -type d -name "backup_*" | wc -l)

log "✅ Limpieza completada. Backups eliminados: $((BACKUP_COUNT_BEFORE - BACKUP_COUNT_AFTER))"

# ============================================================================
# Información final
# ============================================================================

echo
log "🎉 ¡Backup completado exitosamente!"
echo
echo -e "${BLUE}===============================================================${NC}"
echo -e "${BLUE}                     💾 BACKUP FINALIZADO                      ${NC}"
echo -e "${BLUE}===============================================================${NC}"
echo
echo -e "${GREEN}📋 Resumen:${NC}"
echo "   • Backup creado: $(date)"
echo "   • Ubicación: $BACKUP_PATH"
echo "   • Backups retenidos: $BACKUP_COUNT_AFTER"
echo "   • Días de retención: $RETENTION_DAYS"
echo
echo -e "${YELLOW}💡 Consejos:${NC}"
echo "   • Guarda los backups en un lugar seguro"
echo "   • Prueba la restauración periódicamente"
echo "   • Considera subir backups a la nube"
echo "   • Programa backups automáticos con cron"
echo
log "✅ Proceso de backup finalizado"
