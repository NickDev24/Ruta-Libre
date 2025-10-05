const { Client } = require('@googlemaps/google-maps-services-js')

const client = new Client({})
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY'

async function geocodeAddress(address) {
  try {
    const response = await client.geocode({
      params: {
        address,
        key: GOOGLE_MAPS_API_KEY
      }
    })
    if (response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location
      return { lat: location.lat, lng: location.lng, formatted_address: response.data.results[0].formatted_address }
    }
    return null
  } catch (error) {
    console.error('Error geocoding with Google Maps:', error)
    // Fallback to OSM
    console.log('Fallback to OpenStreetMap for geocoding')
    try {
      const { geocodeAddressOSM } = require('./openStreetMap')
      return await geocodeAddressOSM(address)
    } catch (e) {
      return null
    }
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const response = await client.reverseGeocode({
      params: {
        latlng: { lat, lng },
        key: GOOGLE_MAPS_API_KEY
      }
    })
    if (response.data.results.length > 0) {
      return response.data.results[0].formatted_address
    }
    return null
  } catch (error) {
    console.error('Error reverse geocoding with Google Maps:', error)
    // Fallback to OSM
    console.log('Fallback to OpenStreetMap for reverse geocoding')
    try {
      const { reverseGeocodeOSM } = require('./openStreetMap')
      return await reverseGeocodeOSM(lat, lng)
    } catch (e) {
      return null
    }
  }
}

async function calculateDistance(originLat, originLng, destLat, destLng) {
  try {
    const response = await client.distancematrix({
      params: {
        origins: [{ lat: originLat, lng: originLng }],
        destinations: [{ lat: destLat, lng: destLng }],
        units: 'metric',
        key: GOOGLE_MAPS_API_KEY
      }
    })
    if (response.data.rows[0].elements[0].status === 'OK') {
      const distance = response.data.rows[0].elements[0].distance.value / 1000 // km
      return distance
    }
    console.warn('Google Maps Distance Matrix status:', response.data.rows[0].elements[0].status)
    return null
  } catch (error) {
    console.error('Error calculating distance with Google Maps:', error.message)
    // Retry después de 1 segundo si es error de quota
    if (error.response && error.response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return calculateDistance(originLat, originLng, destLat, destLng)
    }
    // Fallback to OSM
    console.log('Fallback to OpenStreetMap for distance calculation')
    try {
      const { calculateDistanceOSM } = require('./openStreetMap')
      return await calculateDistanceOSM(originLat, originLng, destLat, destLng)
    } catch (e) {
      return null
    }
  }
}

module.exports = { geocodeAddress, reverseGeocode, calculateDistance }
