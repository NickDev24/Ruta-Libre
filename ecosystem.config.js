# ============================================================================
# Configuración PM2 para Ruta Libre WhatsApp Bot - Producción
# ============================================================================

module.exports = {
  apps: [
    {
      name: 'rutalibre-app',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Logging
      log_file: './logs/app.log',
      out_file: './logs/app-out.log',
      error_file: './logs/app-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Manejo de errores y reinicios
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',

      // Estrategia de reinicio
      restart_delay: 4000,
      autorestart: true,

      // Health check
      health_check: {
        enabled: true,
        url: 'http://localhost:3000/health',
        interval: '30s',
        timeout: '10000ms',
        retries: 3,
        retry_delay: '5000ms'
      },

      // Monitoreo de recursos
      monitoring: {
        enabled: true,
        mode: 'process'
      },

      // Configuración específica para WhatsApp Bot
      node_args: [
        '--max-old-space-size=4096',
        '--optimize-for-size',
        '--memory-reducer'
      ],

      // Variables de entorno adicionales
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      }
    },

    // Proceso separado para el bot principal (si es necesario)
    {
      name: 'rutalibre-bot',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },

      // Configuración específica para el bot de WhatsApp
      log_file: './logs/bot.log',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',

      // El bot necesita más memoria para sesiones de WhatsApp
      max_memory_restart: '2G',
      node_args: [
        '--max-old-space-size=8192',
        '--expose-gc'
      ],

      // Reinicio más agresivo para el bot
      max_restarts: 5,
      restart_delay: 10000,

      // Health check específico para el bot
      health_check: {
        enabled: true,
        url: 'http://localhost:3000/bot/status',
        interval: '60s',
        timeout: '30000ms'
      }
    }
  ]
};
