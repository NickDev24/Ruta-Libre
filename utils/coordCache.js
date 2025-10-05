const { connect, getDB } = require('../db/mongo');

// Cache de coordenadas para mejorar velocidad
class CoordCache {
  constructor() {
    this.cache = new Map(); // In-memory cache para sesiones
  }

  async get(address) {
    // Primero verificar in-memory
    if (this.cache.has(address)) {
      return this.cache.get(address);
    }

    // Luego DB
    try {
      const db = getDB();
      const doc = await db.collection('coord_cache').findOne({ address });
      if (doc) {
        this.cache.set(address, { lat: doc.lat, lng: doc.lng });
        return { lat: doc.lat, lng: doc.lng };
      }
    } catch (e) {
      console.error('Error getting coord from cache:', e);
    }
    return null;
  }

  async set(address, lat, lng) {
    this.cache.set(address, { lat, lng });

    try {
      const db = getDB();
      await db.collection('coord_cache').updateOne(
        { address },
        { $set: { lat, lng, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error('Error setting coord in cache:', e);
    }
  }

  // Función para extraer coordenadas de enlace Google Maps
  extractCoordsFromGoogleLink(link) {
    // Ej: https://maps.google.com/?q=-24.7820,-65.4083
    // o https://www.google.com/maps/@-24.7820,-65.4083,15z
    const regex = /[-+]?\d*\.?\d+,\s*[-+]?\d*\.?\d+/;
    const match = link.match(regex);
    if (match) {
      const [lat, lng] = match[0].split(',').map(Number);
      return { lat, lng };
    }
    return null;
  }

  // Función para obtener coordenadas de dirección (con cache)
  async geocodeWithCache(address) {
    let coords = await this.get(address);
    if (coords) return coords;

    // Si no en cache, usar geocoding (Google Maps o fallback)
    try {
      const { geocodeAddress } = require('./googleMaps');
      coords = await geocodeAddress(address);
      if (coords) {
        await this.set(address, coords.lat, coords.lng);
      }
    } catch (e) {
      console.error('Error geocoding:', e);
      // Fallback to OpenStreetMap
      try {
        const { geocodeAddressOSM } = require('./openStreetMap');
        coords = await geocodeAddressOSM(address);
        if (coords) {
          await this.set(address, coords.lat, coords.lng);
        }
      } catch (e2) {
        console.error('Error geocoding fallback:', e2);
      }
    }
    return coords;
  }
}

const coordCache = new CoordCache();

module.exports = { coordCache };
