const axios = require('axios')

async function geocodeAddressOSM(address) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'RutaLibreBot/1.0'
      }
    })
    if (response.data.length > 0) {
      const location = response.data[0]
      return {
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lon),
        formatted_address: location.display_name
      }
    }
    return null
  } catch (error) {
    console.error('Error geocoding with OSM:', error.message)
    return null
  }
}

async function reverseGeocodeOSM(lat, lng) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json'
      },
      headers: {
        'User-Agent': 'RutaLibreBot/1.0'
      }
    })
    if (response.data && response.data.display_name) {
      return response.data.display_name
    }
    return null
  } catch (error) {
    console.error('Error reverse geocoding with OSM:', error.message)
    return null
  }
}

async function calculateDistanceOSM(originLat, originLng, destLat, destLng) {
  try {
    const response = await axios.get('https://router.project-osrm.org/route/v1/driving/' + originLng + ',' + originLat + ';' + destLng + ',' + destLat, {
      params: {
        overview: false,
        steps: false
      }
    })
    if (response.data.routes && response.data.routes.length > 0) {
      const distance = response.data.routes[0].distance / 1000 // km
      return distance
    }
    return null
  } catch (error) {
    console.error('Error calculating distance with OSM:', error.message)
    return null
  }
}

module.exports = { geocodeAddressOSM, reverseGeocodeOSM, calculateDistanceOSM }
