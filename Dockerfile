# ============================================================================
# Dockerfile de producción optimizado para Ruta Libre WhatsApp Bot
# ============================================================================

# Etapa 1: Construcción de la aplicación
FROM node:18-alpine AS builder

# Instalar herramientas de construcción
RUN apk add --no-cache python3 make g++

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar dependencias de producción únicamente
RUN npm ci --only=production && npm cache clean --force

# Etapa 2: Imagen de producción
FROM node:18-alpine AS production

# Instalar herramientas necesarias para producción
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Crear directorios necesarios
RUN mkdir -p /app/logs /app/temp /app/bot_sessions && \
    chown -R nodejs:nodejs /app

# Establecer directorio de trabajo
WORKDIR /app

# Copiar dependencias instaladas desde la etapa de construcción
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código fuente
COPY --chown=nodejs:nodejs . .

# Crear archivo .env si no existe (para evitar errores en tiempo de ejecución)
RUN if [ ! -f .env ]; then cp .env.example .env; fi

# Cambiar propietario de archivos críticos
RUN chown -R nodejs:nodejs /app && \
    chmod -R 755 /app

# Cambiar a usuario no-root
USER nodejs

# Variables de entorno para producción
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

# Puerto expuesto
EXPOSE 3000

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Comando de inicio
CMD ["npm", "start"]

# ============================================================================
# Información de salud y metadatos
# ============================================================================
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Metadatos de la imagen
LABEL maintainer="Ruta Libre Team <dev@rutalibre.com>" \
      version="1.0.0" \
      description="WhatsApp Bot para servicio de transporte - Ruta Libre" \
      org.opencontainers.image.source="https://github.com/rutalibre/whatsapp-bot"
