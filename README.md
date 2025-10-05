# Ruta Libre - Plataforma de Transporte Premium

## 📋 Descripción General

**Ruta Libre** es una plataforma tecnológica innovadora que ofrece servicios de transporte ejecutivo premium en la región del NOA (Noroeste Argentino), con énfasis en Salta Capital y localidades aledañas. Nuestro sistema integra un bot conversacional de WhatsApp, procesamiento de pagos seguro mediante Mercado Pago, y un panel administrativo completo para la gestión eficiente de operaciones.

## 🚀 Características Principales

### 🤖 **Bot WhatsApp Inteligente**
- **Interfaz Conversacional Avanzada**: Flujos intuitivos para cotización, reserva y suscripción
- **Geolocalización Obligatoria**: Sistema GPS integrado que requiere ubicación precisa para origen y destino
- **Cálculos de Precisión**: Algoritmos avanzados con Google Maps y OpenStreetMap para determinar distancias reales
- **Sistema de Cache Inteligente**: Optimización de consultas repetitivas para respuesta inmediata
- **Validaciones Automáticas**: Prevención de errores y mensajes claros al usuario
- **Notificaciones Push**: Recordatorios automáticos y confirmaciones de estado

### 💳 **Integración Mercado Pago**
- **Procesamiento Seguro**: Plataforma de pagos certificada con encriptación de datos
- **Webhooks Automatizados**: Actualización automática del estado de reservas
- **Gestión de Estados**: Seguimiento completo desde creación hasta completitud
- **Notificaciones Cliente**: Comunicación inmediata sobre aprobación de pagos
- **Firma Digital**: Verificación de autenticidad de transacciones

### 🖥️ **Panel Administrativo Completo**
- **Dashboard Ejecutivo**: Métricas en tiempo real de ingresos, reservas y clientes
- **Sistema CRUD**: Gestión completa de vehículos, conductores, destinos y reservas
- **Contabilidad Avanzada**: Saldos individuales por conductor con modelo de vehículo
- **Configuración Dinámica**: Ajuste de tarifas por kilómetro en tiempo real
- **Mapa Interactivo**: Seguimiento GPS de conductores activos
- **API RESTful**: Arquitectura escalable con endpoints bien documentados

### 🗺️ **Sistema de Geocodificación**
- **Base de Datos Completa**: 73 destinos estratégicos del NOA con coordenadas precisas
- **Cache de Alto Rendimiento**: Base de datos MongoDB para consultas ultra-rápidas
- **Múltiples Proveedores**: Google Maps primario con OpenStreetMap como respaldo
- **Procesamiento Automático**: Extracción de coordenadas desde enlaces de Google Maps
- **Geocodificación Inversa**: Conversión de coordenadas a direcciones legibles

## 📊 Modelo de Negocio

### **Comisiones y Tarifas**
- **Pagos con Tarjeta**: Plataforma retiene 15% - Conductor recibe 85%
- **Pagos en Efectivo**: Plataforma retiene 20% - Conductor recibe 80%
- **Sistema de Penalización**: Descuento automático del 20% en próximo viaje con tarjeta cuando se utiliza efectivo
- **Comisiones Variables**: Configurables por conductor según acuerdos individuales

### **Segmentos de Mercado**
1. **Clientes Corporativos**: Empresas con necesidades de movilidad ejecutiva
2. **Turistas Premium**: Visitantes que requieren servicios de alta calidad
3. **Clientes VIP**: Personas de alto poder adquisitivo que valoran el lujo y la discreción
4. **Transporte Especializado**: Eventos, celebraciones y traslados especiales

## 🛠 Instalación y Configuración

### **Prerrequisitos**
- **Node.js**: Versión 16 o superior
- **MongoDB**: Base de datos en la nube (Atlas recomendado)
- **Cuenta Mercado Pago**: Credenciales de producción
- **Google Maps API**: Clave válida para geocodificación
- **WhatsApp Business**: Número verificado para el bot

### **Instalación**
```bash
git clone <repositorio>
cd ruta-libre
npm install
```

### **Configuración de Variables de Entorno**
```env
# Base de Datos
MONGO_DB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/
MONGO_DB_NAME=ruta_libre_db

# Administración
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASS=contraseña_segura
ADMIN_PHONE=5493872221741

# URLs Públicas
PUBLIC_URL=https://tudominio.com

# Mercado Pago (Producción)
MP_PUBLIC_KEY=APP_USR-tu_clave_publica
MP_ACCESS_TOKEN=APP_USR-tu_access_token
MP_WEBHOOK=https://tudominio.com/api/webhook
MP_WEBHOOK_SECRET=tu_webhook_secret

# Google Maps API
GOOGLE_MAPS_API_KEY=tu_api_key_google_maps

# OpenStreetMap OAuth (Opcional)
OSM_CLIENT_ID=tu_client_id
OSM_CLIENT_SECRET=tu_client_secret
OSM_REDIRECT_URI=https://tudominio.com
```

### **Inicio del Sistema**
```bash
npm start
# Servidor disponible en http://localhost:3000
# Panel administrativo en http://localhost:3000/admin
```

## 📚 Documentación Técnica

### **Estructura de Base de Datos**

#### **Colecciones Principales**
- **`destinos`**: Información geográfica de 73 localidades del NOA
- **`reservas`**: Registro completo de viajes y transacciones
- **`conductores`**: Perfiles con información personal y bancaria
- **`vehiculos`**: Flota disponible con características técnicas
- **`suscripciones`**: Clientes VIP con planes especiales
- **`coord_cache`**: Cache de coordenadas para optimización
- **`config`**: Configuraciones dinámicas del sistema
- **`pagos_liberados`**: Historial de pagos procesados a conductores

#### **Campos Críticos por Colección**
```javascript
// Destinos
{
  _id: ObjectId,
  nombre: String,
  categoria: String,
  lat: Number,
  lng: Number,
  kmIda: Number,
  tipoServicio: String,
  enlaceGoogleMaps: String
}

// Reservas
{
  _id: ObjectId,
  clienteNombre: String,
  clienteTelefono: String,
  origen: String,
  destino: String,
  fecha: String,
  hora: String,
  numPersonas: Number,
  metodoPago: String,
  precio: Number,
  estado: String,
  conductor: Object,
  pagoLiberado: Boolean
}

// Conductores
{
  _id: ObjectId,
  nombre: String,
  telefono: String,
  password: String,
  porcentajePago: Number,
  disponible: Boolean,
  dni: String,
  licencia: String,
  tipoLicencia: String,
  vehiculoId: ObjectId,
  datosBancarios: {
    cbuCvu: String,
    cuitCuil: String,
    titularNombre: String,
    banco: String
  }
}
```

### **API RESTful**

#### **Endpoints de Administración**
```javascript
GET    /api/admin/stats           # Estadísticas generales
GET    /api/admin/conductores     # Lista de conductores
POST   /api/admin/conductores     # Crear conductor
PUT    /api/admin/conductores/:id # Actualizar conductor
DELETE /api/admin/conductores/:id # Eliminar conductor

# Similar para vehículos, destinos, reservas y suscripciones
```

#### **Contabilidad y Configuración**
```javascript
GET    /api/admin/contabilidad          # Saldos y ganancias
GET    /api/admin/config/kmPrice        # Precio base por km
POST   /api/admin/config/setKmPrice     # Actualizar precio
POST   /api/admin/liberar-pagos         # Procesar pagos a conductores
```

#### **Webhooks y Notificaciones**
```javascript
POST   /api/webhook               # Notificaciones de Mercado Pago
POST   /api/conductor/login       # Autenticación de conductores
GET    /api/conductor/viajes      # Viajes asignados a conductor
```

### **Flujos del Sistema**

#### **Proceso de Reserva**
1. **Inicio Conversacional**: Usuario contacta via WhatsApp
2. **Selección de Servicio**: Cliente elige tipo (turista/empresa/VIP)
3. **Geolocalización**: Sistema solicita ubicación GPS precisa
4. **Cálculo de Tarifa**: Algoritmo determina precio basado en distancia
5. **Procesamiento de Pago**: Integración con Mercado Pago
6. **Asignación de Conductor**: Sistema selecciona conductor disponible
7. **Seguimiento**: Notificaciones en tiempo real del progreso
8. **Finalización**: Registro automático y liberación de pagos

#### **Sistema de Penalizaciones**
- **Pago en Efectivo**: Se registra deuda del 20% para próximo viaje con tarjeta
- **Aplicación Automática**: El sistema deduce automáticamente en pagos posteriores
- **Transparencia**: Conductores reciben notificaciones claras sobre penalizaciones

## 🔒 Seguridad y Cumplimiento

### **Protecciones Implementadas**
- **Autenticación Básica**: Panel administrativo con credenciales seguras
- **Rate Limiting**: Protección contra ataques de fuerza bruta
- **Validación de Datos**: Sanitización completa de entradas
- **Logs de Auditoría**: Registro detallado de todas las operaciones
- **Encriptación**: Datos sensibles protegidos en tránsito y reposo

### **Cumplimiento Normativo**
- **Protección de Datos Personales (PDP)**: Ley 25.326 Argentina
- **Registro de Bases de Datos (RNBDP)**: Inscripción obligatoria
- **Prevención de Lavado de Activos**: Reportes ante UIF cuando corresponda
- **Normativas de Transporte**: Cumplimiento con requisitos provinciales

## 📈 Métricas y KPIs

### **Indicadores Clave de Rendimiento**
- **Tasa de Conversión**: Reservas completadas vs consultas iniciales
- **Tiempo de Respuesta**: Velocidad promedio de respuesta del bot
- **Satisfacción del Cliente**: Métricas de calidad de servicio
- **Eficiencia Operativa**: Tiempo promedio de asignación de conductores
- **Rentabilidad**: Margen de ganancia por viaje y conductor

### **Métricas Técnicas**
- **Uptime del Sistema**: Disponibilidad del servicio
- **Tiempo de Respuesta API**: Latencia de endpoints críticos
- **Uso de Cache**: Efectividad del sistema de optimización
- **Tasa de Error**: Fallos en procesamiento de pagos y geolocalización

## 🚨 Procedimientos de Emergencia

### **Planes de Contingencia**
1. **Caída del Bot WhatsApp**: Activación de modo manual vía teléfono
2. **Falla de Mercado Pago**: Procesamiento manual de pagos
3. **Interrupción de Google Maps**: Fallback automático a OpenStreetMap
4. **Problemas de Base de Datos**: Sistema de respaldo automático

### **Equipo de Soporte**
- **Técnico Principal**: Desarrollador líder del proyecto
- **Soporte Operativo**: Equipo administrativo para atención al cliente
- **Conductores**: Red de profesionales capacitados

## 📋 Checklist de Producción

### **Pre-Deploy**
- [ ] Variables de entorno configuradas correctamente
- [ ] Credenciales de producción verificadas
- [ ] Base de datos poblada con destinos iniciales
- [ ] Webhook de Mercado Pago registrado
- [ ] Certificado SSL instalado
- [ ] Backups automáticos configurados

### **Post-Deploy**
- [ ] Funcionalidad del bot verificada
- [ ] Panel administrativo accesible
- [ ] Procesamiento de pagos operativo
- [ ] Sistema de geocodificación funcional
- [ ] Monitoreo de métricas activado

## 🔄 Mantenimiento y Actualizaciones

### **Calendario de Mantenimiento**
- **Diario**: Verificación de logs y métricas de rendimiento
- **Semanal**: Análisis de patrones de uso y optimizaciones
- **Mensual**: Actualizaciones de seguridad y mejoras funcionales
- **Trimestral**: Auditorías completas y planificación estratégica

### **Proceso de Actualizaciones**
1. **Desarrollo**: Rama develop para nuevas funcionalidades
2. **Testing**: Ambiente staging para validación
3. **Producción**: Deploy controlado con rollback planificado
4. **Monitoreo**: Seguimiento post-deploy de métricas críticas

---

## 📞 Información de Contacto

**Desarrollador Principal**: Facundo Cercuetti
**Email**: facucercuetti420@gmail.com
**WhatsApp**: +54 9 3872 22-1741
**Versión**: 2.0.0
**Fecha**: Octubre 2024
**Licencia**: Propietario - Todos los derechos reservados# Ruta-Libre
