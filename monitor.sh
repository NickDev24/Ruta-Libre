#!/bin/bash

# ============================================================================
# Script de monitoreo y logs para Ruta Libre WhatsApp Bot
# ============================================================================

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
# Función de ayuda
# ============================================================================

show_help() {
    echo "Uso: $0 [COMANDO]"
    echo
    echo "Comandos disponibles:"
    echo "  status      Mostrar estado de servicios"
    echo "  logs        Mostrar logs en tiempo real"
    echo "  logs-app    Mostrar logs de la aplicación"
    echo "  logs-mongo  Mostrar logs de MongoDB"
    echo "  logs-nginx  Mostrar logs de Nginx"
    echo "  health      Verificar estado de salud"
    echo "  metrics     Mostrar métricas básicas"
    echo "  clean       Limpiar logs antiguos"
    echo "  restart     Reiniciar servicios"
    echo "  stop        Detener servicios"
    echo "  start       Iniciar servicios"
    echo
    echo "Ejemplos:"
    echo "  $0 status"
    echo "  $0 logs -f app"
    echo "  $0 health"
}

# ============================================================================
# Verificar estado de servicios
# ============================================================================

check_status() {
    log "🔍 Verificando estado de servicios..."

    echo -e "${BLUE}===============================================================${NC}"
    echo -e "${BLUE}                     📊 ESTADO DE SERVICIOS                     ${NC}"
    echo -e "${BLUE}===============================================================${NC}"
    echo

    if command -v docker &> /dev/null && docker compose ps &> /dev/null; then
        docker compose ps

        echo
        echo -e "${GREEN}📋 Información adicional:${NC}"

        # Mostrar uso de recursos
        if command -v docker &> /dev/null; then
            echo "Uso de recursos:"
            docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
        fi
    else
        error "Docker o Docker Compose no están disponibles"
        exit 1
    fi
}

# ============================================================================
# Mostrar logs
# ============================================================================

show_logs() {
    local service="$2"

    if [[ -z "$service" ]]; then
        log "📜 Mostrando logs de todos los servicios..."
        docker compose logs -f --tail=100
    else
        log "📜 Mostrando logs del servicio: $service"
        docker compose logs -f --tail=100 "$service"
    fi
}

# ============================================================================
# Health check
# ============================================================================

check_health() {
    log "🏥 Verificando estado de salud..."

    echo -e "${BLUE}===============================================================${NC}"
    echo -e "${BLUE}                       🏥 HEALTH CHECK                         ${NC}"
    echo -e "${BLUE}===============================================================${NC}"
    echo

    # Verificar aplicación web
    if curl -f -s http://localhost:3000/health > /dev/null; then
        echo -e "${GREEN}✅ Aplicación: Saludable${NC}"
    else
        echo -e "${RED}❌ Aplicación: No responde${NC}"
    fi

    # Verificar MongoDB
    if docker exec rutalibre-mongo mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MongoDB: Conectado${NC}"
    else
        echo -e "${RED}❌ MongoDB: No responde${NC}"
    fi

    # Verificar Nginx
    if curl -f -s -I http://localhost:80 > /dev/null; then
        echo -e "${GREEN}✅ Nginx: Respondiendo${NC}"
    else
        echo -e "${RED}❌ Nginx: No responde${NC}"
    fi

    # Verificar espacio en disco
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ $DISK_USAGE -lt 80 ]]; then
        echo -e "${GREEN}✅ Disco: ${DISK_USAGE}% usado${NC}"
    else
        echo -e "${RED}❌ Disco: ${DISK_USAGE}% usado (crítico)${NC}"
    fi

    echo
    log "✅ Verificación de salud completada"
}

# ============================================================================
# Mostrar métricas básicas
# ============================================================================

show_metrics() {
    log "📊 Obteniendo métricas básicas..."

    echo -e "${BLUE}===============================================================${NC}"
    echo -e "${BLUE}                       📊 MÉTRICAS BÁSICAS                     ${NC}"
    echo -e "${BLUE}===============================================================${NC}"
    echo

    # Número de reservas por estado
    echo "📋 Reservas por estado:"
    docker exec rutalibre-mongo mongosh rutalibre_prod --eval "
        db.reservas.aggregate([
            { \$group: { _id: '\$estado', count: { \$sum: 1 } } }
        ]).forEach(printjson)
    " 2>/dev/null | grep -E "(pendiente|aprobado|asignado|completado)" || echo "   No se pudieron obtener métricas"

    # Número total de usuarios registrados
    echo
    echo "👥 Estadísticas de usuarios:"
    docker exec rutalibre-mongo mongosh rutalibre_prod --eval "
        print('Total de reservas: ' + db.reservas.countDocuments({}));
        print('Total de pagos: ' + db.pagos.countDocuments({}));
        print('Total de vehículos: ' + db.vehiculos.countDocuments({}));
        print('Total de conductores: ' + db.conductores.countDocuments({}));
    " 2>/dev/null || echo "   No se pudieron obtener métricas"

    echo
    log "✅ Métricas obtenidas"
}

# ============================================================================
# Limpiar logs antiguos
# ============================================================================

clean_logs() {
    log "🧹 Limpiando logs antiguos..."

    # Limpiar logs de Docker
    if command -v docker &> /dev/null; then
        docker system prune -f > /dev/null 2>&1
        log "✅ Logs de Docker limpiados"
    fi

    # Limpiar archivos de log locales antiguos
    find logs/ -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    log "✅ Logs locales antiguos eliminados"

    # Rotar logs si son muy grandes
    for log_file in logs/*.log; do
        if [[ -f "$log_file" ]] && [[ $(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null) -gt 10485760 ]]; then # 10MB
            mv "$log_file" "$log_file.$(date +%Y%m%d_%H%M%S).bak"
            log "📦 Log rotado: $log_file"
        fi
    done

    log "✅ Limpieza de logs completada"
}

# ============================================================================
# Control de servicios
# ============================================================================

restart_services() {
    log "🔄 Reiniciando servicios..."
    docker compose restart
    log "✅ Servicios reiniciados"
}

stop_services() {
    log "⏹️ Deteniendo servicios..."
    docker compose down
    log "✅ Servicios detenidos"
}

start_services() {
    log "▶️ Iniciando servicios..."
    docker compose up -d
    log "✅ Servicios iniciados"
}

# ============================================================================
# Procesamiento de comandos
# ============================================================================

case "${1:-status}" in
    "status")
        check_status
        ;;
    "logs")
        show_logs "$@"
        ;;
    "logs-app")
        show_logs "" "app"
        ;;
    "logs-mongo")
        show_logs "" "mongo"
        ;;
    "logs-nginx")
        show_logs "" "nginx"
        ;;
    "health")
        check_health
        ;;
    "metrics")
        show_metrics
        ;;
    "clean")
        clean_logs
        ;;
    "restart")
        restart_services
        ;;
    "stop")
        stop_services
        ;;
    "start")
        start_services
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}Comando desconocido: $1${NC}"
        echo
        show_help
        exit 1
        ;;
esac
