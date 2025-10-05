#!/bin/bash

# ============================================================================
# Script de despliegue para Ruta Libre WhatsApp Bot
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
# Verificaciones previas
# ============================================================================

log "🚀 Iniciando despliegue de Ruta Libre WhatsApp Bot"

# Verificar si estamos en el directorio correcto
if [[ ! -f "docker-compose.yml" ]]; then
    error "No se encontró docker-compose.yml. ¿Estás en el directorio correcto?"
    exit 1
fi

# Verificar si existe .env
if [[ ! -f ".env" ]]; then
    warn "No se encontró archivo .env. Copiando desde .env.example"
    cp .env.example .env
    warn "Por favor configura las variables de entorno en .env antes de continuar"
    exit 1
fi

# Verificar Docker y Docker Compose
if ! command -v docker &> /dev/null; then
    error "Docker no está instalado"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    error "Docker Compose no está instalado"
    exit 1
fi

# Crear directorios necesarios
log "📁 Creando directorios necesarios..."
mkdir -p data/mongo data/configdb logs temp bot_sessions backups

# ============================================================================
# Backup de datos existentes (si aplica)
# ============================================================================

if [[ -d "data/mongo" ]] && [[ -n "$(ls -A data/mongo 2>/dev/null)" ]]; then
    warn "Se encontró datos existentes de MongoDB"
    read -p "¿Deseas crear un backup antes de continuar? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "💾 Creando backup de datos existentes..."
        BACKUP_DIR="backups/backup_$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        cp -r data/mongo "$BACKUP_DIR/"
        log "✅ Backup creado en $BACKUP_DIR"
    fi
fi

# ============================================================================
# Construir e iniciar servicios
# ============================================================================

log "🔨 Construyendo imágenes de Docker..."
if docker compose build --parallel; then
    log "✅ Imágenes construidas exitosamente"
else
    error "❌ Error construyendo imágenes"
    exit 1
fi

log "🏃‍♂️ Iniciando servicios..."
if docker compose up -d; then
    log "✅ Servicios iniciados exitosamente"
else
    error "❌ Error iniciando servicios"
    exit 1
fi

# ============================================================================
# Verificaciones post-despliegue
# ============================================================================

log "🔍 Verificando estado de servicios..."
sleep 10

# Verificar servicios críticos
SERVICES=("mongo" "app")
for service in "${SERVICES[@]}"; do
    if docker compose ps "$service" | grep -q "Up"; then
        log "✅ Servicio $service funcionando correctamente"
    else
        error "❌ Servicio $service no se inició correctamente"
        docker compose logs "$service"
        exit 1
    fi
done

# Verificar conectividad
log "🌐 Verificando conectividad..."
if curl -f -s http://localhost:3000/health > /dev/null; then
    log "✅ Aplicación respondiendo correctamente"
else
    warn "⚠️ Aplicación no responde en health check, pero puede estar iniciando"
fi

# ============================================================================
# Configuración SSL (opcional)
# ============================================================================

if [[ ! -f "docker/ssl/cert.pem" ]] || [[ ! -f "docker/ssl/key.pem" ]]; then
    warn "No se encontraron certificados SSL"
    echo "Para configurar SSL:"
    echo "1. Copia tus certificados a docker/ssl/cert.pem y docker/ssl/key.pem"
    echo "2. O usa Let's Encrypt con: docker compose -f docker-compose.ssl.yml up"
fi

# ============================================================================
# Información final
# ============================================================================

echo
log "🎉 ¡Despliegue completado exitosamente!"
echo
echo -e "${BLUE}===============================================================${NC}"
echo -e "${BLUE}                   🚗 RUTA LIBRE - DESPLEGADO                  ${NC}"
echo -e "${BLUE}===============================================================${NC}"
echo
echo -e "${GREEN}📍 URLs de acceso:${NC}"
echo "   • Aplicación: http://localhost:3000"
echo "   • Panel Admin: http://localhost:3000/admin"
echo "   • Panel Conductor: http://localhost:3000/conductor"
echo "   • Webhook MP: http://localhost:3000/api/webhook"
echo
echo -e "${GREEN}🔧 Comandos útiles:${NC}"
echo "   • Ver logs: docker compose logs -f [servicio]"
echo "   • Reiniciar: docker compose restart [servicio]"
echo "   • Parar todo: docker compose down"
echo "   • Backup: docker compose --profile backup run backup"
echo
echo -e "${YELLOW}⚠️  Recordatorios:${NC}"
echo "   • Configura las variables de entorno en .env"
echo "   • Configura SSL para producción"
echo "   • Revisa los logs regularmente"
echo "   • Haz backups periódicos de la base de datos"
echo
log "✅ Despliegue finalizado. ¡Tu bot de WhatsApp está listo!"
