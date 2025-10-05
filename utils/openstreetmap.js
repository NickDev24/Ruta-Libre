const axios = require('axios')
require('dotenv').config()

const OSM_CONFIG = {
  clientId: process.env.OSM_CLIENT_ID,
  clientSecret: process.env.OSM_CLIENT_SECRET,
  redirectUri: process.env.OSM_REDIRECT_URI,
  baseUrl: 'https://www.openstreetmap.org',
  apiUrl: 'https://api.openstreetmap.org/api/0.6'
}

/**
 * Genera URL de autorización para OpenStreetMap OAuth
 */
function getAuthorizationUrl(state = null) {
  const params = new URLSearchParams({
    client_id: OSM_CONFIG.clientId,
    redirect_uri: OSM_CONFIG.redirectUri,
    response_type: 'code',
    scope: 'read_prefs write_prefs write_diary write_api write_changeset_comments read_gpx write_gpx write_notes write_redactions write_blocks consume_messages send_messages openid'
  })

  if (state) {
    params.append('state', state)
  }

  return `${OSM_CONFIG.baseUrl}/oauth2/authorize?${params.toString()}`
}

/**
 * Intercambia código de autorización por tokens de acceso
 */
async function exchangeCodeForToken(code) {
  try {
    const response = await axios.post(`${OSM_CONFIG.baseUrl}/oauth2/token`, {
      client_id: OSM_CONFIG.clientId,
      client_secret: OSM_CONFIG.clientSecret,
      code: code,
      redirect_uri: OSM_CONFIG.redirectUri,
      grant_type: 'authorization_code'
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type
    }
  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message)
    throw error
  }
}

/**
 * Refresca token de acceso usando refresh token
 */
async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post(`${OSM_CONFIG.baseUrl}/oauth2/token`, {
      client_id: OSM_CONFIG.clientId,
      client_secret: OSM_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type
    }
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message)
    throw error
  }
}

/**
 * Obtiene información del usuario autenticado
 */
async function getUserInfo(accessToken) {
  try {
    const response = await axios.get(`${OSM_CONFIG.apiUrl}/user/details`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    return response.data
  } catch (error) {
    console.error('Error getting user info:', error.response?.data || error.message)
    throw error
  }
}

/**
 * Sube una traza GPX a OpenStreetMap
 */
async function uploadGPX(accessToken, gpxData, name, description = '', visibility = 'private') {
  try {
    const formData = new FormData()
    formData.append('file', gpxData, name)
    formData.append('description', description)
    formData.append('visibility', visibility)

    const response = await axios.post(`${OSM_CONFIG.apiUrl}/gpx/create`, formData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'multipart/form-data'
      }
    })

    return response.data
  } catch (error) {
    console.error('Error uploading GPX:', error.response?.data || error.message)
    throw error
  }
}

/**
 * Crea una nota en el mapa
 */
async function createNote(accessToken, lat, lon, text) {
  try {
    const response = await axios.post(`${OSM_CONFIG.apiUrl}/notes`, null, {
      params: {
        lat,
        lon,
        text
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    return response.data
  } catch (error) {
    console.error('Error creating note:', error.response?.data || error.message)
    throw error
  }
}

module.exports = {
  OSM_CONFIG,
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
  uploadGPX,
  createNote
}
