# ============================================================================
# 🚗 GUÍA DE DESPLIEGUE - RUTA LIBRE WHATSAPP BOT
# ============================================================================
# Esta guía te ayudará a desplegar el bot en un servidor Ubuntu para EC2
# Última actualización: $(date)
# ============================================================================

## 📋 TABLA DE CONTENIDOS

1. [Requisitos previos](#requisitos-previos)
2. [Configuración inicial del servidor](#configuración-inicial-del-servidor)
3. [Instalación de Docker y Docker Compose](#instalación-de-docker-y-docker-compose)
4. [Configuración del proyecto](#configuración-del-proyecto)
5. [Despliegue con Docker Compose](#despliegue-con-docker-compose)
6. [Configuración de SSL con Let's Encrypt](#configuración-de-ssl-con-lets-encrypt)
7. [Configuración de dominio y DNS](#configuración-de-dominio-y-dns)
8. [Monitoreo y mantenimiento](#monitoreo-y-mantenimiento)
9. [Solución de problemas](#solución-de-problemas)
10. [Comandos útiles](#comandos-útiles)

## 🚀 REQUISITOS PREVIOS

### Especificaciones mínimas del servidor:
- **Sistema operativo**: Ubuntu 20.04 LTS o superior
- **CPU**: 2 núcleos
- **RAM**: 4 GB
- **Almacenamiento**: 20 GB SSD
- **Red**: Puerto 80 y 443 abiertos

### Servicios requeridos:
- Docker (última versión)
- Docker Compose (última versión)
- Git
- Nginx (opcional, incluido en Docker)

## 🔧 CONFIGURACIÓN INICIAL DEL SERVIDOR

### 1. Actualizar el sistema
```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
```

### 2. Crear usuario dedicado para la aplicación
```bash
sudo useradd -m -s /bin/bash rutalibre
sudo usermod -aG sudo rutalibre
sudo passwd rutalibre  # Establecer contraseña segura
```

### 3. Configurar SSH para el nuevo usuario
```bash
sudo mkdir -p /home/rutalibre/.ssh
sudo cp ~/.ssh/authorized_keys /home/rutalibre/.ssh/
sudo chown -R rutalibre:rutalibre /home/rutalibre/.ssh
sudo chmod 600 /home/rutalibre/.ssh/authorized_keys
```

### 4. Deshabilitar acceso root por SSH (opcional pero recomendado)
```bash
sudo nano /etc/ssh/sshd_config
# Cambiar: PermitRootLogin no
sudo systemctl restart ssh
```

## 🐳 INSTALACIÓN DE DOCKER Y DOCKER COMPOSE

### 1. Instalar Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker rutalibre
```

### 2. Instalar Docker Compose
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. Verificar instalación
```bash
docker --version
docker-compose --version
```

## 📁 CONFIGURACIÓN DEL PROYECTO

### 1. Clonar o subir el proyecto
```bash
# Como usuario rutalibre
su - rutalibre
cd /home/rutalibre
git clone [URL_DEL_REPOSITORIO] rutalibre-bot
cd rutalibre-bot
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
nano .env
```

**Variables críticas a configurar:**
```env
# Base de datos
MONGO_DB_URI=mongodb://mongo:27017
MONGO_DB_NAME=rutalibre_prod

# Administración
ADMIN_EMAIL=tu-email@dominio.com
ADMIN_PASS=contraseña_segura
ADMIN_PHONE=549XXXXXXXXX@c.us

# URLs públicas
PUBLIC_URL=https://tu-dominio.com

# MercadoPago
MP_PUBLIC_KEY=tu_mp_public_key
MP_ACCESS_TOKEN=tu_mp_access_token

# Google Maps
GOOGLE_MAPS_API_KEY=tu_google_maps_api_key
```

### 3. Configurar permisos
```bash
sudo chown -R rutalibre:rutalibre /home/rutalibre/rutalibre-bot
chmod +x deploy.sh backup.sh monitor.sh init-db.sh
```

## 🚀 DESPLIEGUE CON DOCKER COMPOSE

### 1. Desplegar la aplicación
```bash
# Iniciar servicios
./deploy.sh

# O manualmente:
docker-compose up -d

# Inicializar base de datos
./init-db.sh
```

### 2. Verificar despliegue
```bash
# Estado de servicios
./monitor.sh status

# Ver logs
./monitor.sh logs

# Health check
./monitor.sh health
```

### 3. Crear usuario administrador inicial
```bash
# Acceder al contenedor de la aplicación
docker exec -it rutalibre-app node -e "
const { connect } = require('./db/mongo');
const conductoresRepo = require('./repositories/conductoresRepo');

async function crearAdmin() {
  await connect({ uri: 'mongodb://mongo:27017/rutalibre_prod', dbName: 'rutalibre_prod' });

  await conductoresRepo.crear({
    telefono: '549XXXXXXXXX',
    nombre: 'Administrador',
    password: 'contraseña_segura',
    disponible: true,
    rol: 'admin'
  });

  console.log('✅ Usuario administrador creado');
  process.exit(0);
}

crearAdmin().catch(console.error);
"
```

## 🔒 CONFIGURACIÓN DE SSL CON LET'S ENCRYPT

### 1. Instalar Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Obtener certificado SSL
```bash
# Detener Nginx temporalmente si está corriendo
sudo systemctl stop nginx

# Obtener certificado
sudo certbot certonly --standalone -d tu-dominio.com -d www.tu-dominio.com

# Configurar renovación automática
sudo crontab -e
# Agregar: 0 3 * * * certbot renew --quiet
```

### 3. Configurar certificados en Nginx
```bash
# Copiar certificados al proyecto
sudo cp /etc/letsencrypt/live/tu-dominio.com/cert.pem docker/ssl/
sudo cp /etc/letsencrypt/live/tu-dominio.com/privkey.pem docker/ssl/key.pem

# Ajustar permisos
sudo chown rutalibre:rutalibre docker/ssl/*.pem
chmod 600 docker/ssl/*.pem

# Reiniciar servicios
docker-compose restart nginx
```

## 🌐 CONFIGURACIÓN DE DOMINIO Y DNS

### 1. Configurar registros DNS en tu proveedor
```
Tipo A:
tu-dominio.com → IP_DE_TU_SERVIDOR

Tipo CNAME (opcional):
www.tu-dominio.com → tu-dominio.com
```

### 2. Configurar Nginx para dominio
```bash
# Editar configuración de Nginx
nano docker/nginx/conf.d/default.conf

# Cambiar server_name por tu dominio:
server_name tu-dominio.com www.tu-dominio.com;
```

## 📊 MONITOREO Y MANTENIMIENTO

### 1. Configurar monitoreo básico
```bash
# Crear script de monitoreo en crontab
crontab -e
# Agregar:
# */5 * * * * /home/rutalibre/rutalibre-bot/monitor.sh health >> /home/rutalibre/health.log 2>&1
# 0 2 * * * /home/rutalibre/rutalibre-bot/backup.sh >> /home/rutalibre/backup.log 2>&1
```

### 2. Logs de rotación
```bash
# Configurar logrotate
sudo nano /etc/logrotate.d/rutalibre
```
/home/rutalibre/rutalibre-bot/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 rutalibre rutalibre
}
```
```bash
sudo logrotate -f /etc/logrotate.d/rutalibre
```

### 3. Backups automáticos
```bash
# Crear script de backup automático
nano backup-automatico.sh
```
```bash
#!/bin/bash
/home/rutalibre/rutalibre-bot/backup.sh
# Subir a almacenamiento remoto (ejemplo con AWS S3)
aws s3 sync /home/rutalibre/rutalibre-bot/backups/ s3://tu-bucket/backups/
```

## 🔧 SOLUCIÓN DE PROBLEMAS

### Problemas comunes:

#### 1. Aplicación no inicia
```bash
# Ver logs detallados
./monitor.sh logs-app

# Verificar variables de entorno
docker exec rutalibre-app env | grep -E "(MONGO|ADMIN|PUBLIC)"

# Probar conectividad con MongoDB
docker exec rutalibre-mongo mongosh --eval "db.stats()"
```

#### 2. Bot de WhatsApp no conecta
```bash
# Verificar logs del bot
docker logs rutalibre-app 2>&1 | grep -i whatsapp

# Verificar sesiones de WhatsApp
ls -la bot_sessions/

# Reiniciar aplicación
docker-compose restart app
```

#### 3. Problemas de memoria
```bash
# Ver uso de memoria
docker stats

# Aumentar límites si es necesario
nano docker-compose.yml
# Editar sección deploy -> resources -> limits
```

#### 4. Problemas de permisos
```bash
# Verificar permisos de archivos
sudo chown -R rutalibre:rutalibre /home/rutalibre/rutalibre-bot
chmod +x *.sh

# Verificar permisos de directorios
find /home/rutalibre/rutalibre-bot -type d -exec chmod 755 {} \;
find /home/rutalibre/rutalibre-bot -type f -exec chmod 644 {} \;
```

## 🛠️ COMANDOS ÚTILES

### Gestión de servicios:
```bash
# Estado de servicios
docker-compose ps

# Logs en tiempo real
docker-compose logs -f

# Reiniciar servicio específico
docker-compose restart app

# Parar todo
docker-compose down

# Actualizar aplicación
docker-compose pull && docker-compose up -d
```

### Gestión de datos:
```bash
# Backup manual
./backup.sh

# Ver métricas
./monitor.sh metrics

# Health check
./monitor.sh health
```

### Gestión de usuarios:
```bash
# Crear conductor desde MongoDB
docker exec rutalibre-mongo mongosh rutalibre_prod --eval "
db.conductores.insertOne({
  telefono: '549XXXXXXXXX',
  nombre: 'Nombre del Conductor',
  password: 'contraseña_segura',
  disponible: true,
  createdAt: new Date()
})
"
```

## 📞 SOPORTE Y CONTACTO

Para soporte técnico:
- Revisa los logs: `./monitor.sh logs`
- Consulta esta guía completa
- Revisa el código fuente en el repositorio

**¡Tu bot de WhatsApp está listo para recibir reservas! 🚗✨**

---

*Esta guía fue generada automáticamente. Última actualización: $(date)*
