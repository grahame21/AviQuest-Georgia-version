// Netlify Function: Fetch aircraft metadata from OpenSky Network
// Returns aircraft registration, manufacturer, model, and operator info

const https = require('https');

const OPENSKY_API = 'https://opensky-network.org/api';
const USERNAME = process.env.OPENSKY_USERNAME;
const PASSWORD = process.env.OPENSKY_PASSWORD;

function getAuthHeader() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('Missing OpenSky credentials');
  }
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  return `Basic ${auth}`;
}

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'opensky-network.org',
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'User-Agent': 'AviQuest-Flight-Tracker/1.0'
      },
      timeout: 8000
    };

    const request = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.abort();
      reject(new Error('Request timeout'));
    });

    request.end();
  });
}

exports.handler = async (event) => {
  try {
    const { icao24 } = event.queryStringParameters || {};

    if (!icao24 || icao24.length !== 6) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid ICAO24 address' })
      };
    }

    // Query OpenSky Aircraft Database
    const endpoint = `/v1/aircraft?icao24=${icao24.toUpperCase()}`;
    const aircraftData = await makeRequest(endpoint);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registration: aircraftData.registration || null,
        manufacturer: aircraftData.manufacturername || null,
        model: aircraftData.model || null,
        operatorIata: aircraftData.operatorIata || null,
        operatorIcao: aircraftData.operatorIcao || null,
        operatorCallsign: aircraftData.operatorCallsign || null,
        icao24: icao24.toUpperCase(),
        firstSeen: aircraftData.firstseen || null,
        lastSeen: aircraftData.lastseen || null
      })
    };
  } catch (error) {
    console.error('Aircraft Data Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch aircraft data',
        details: error.message
      })
    };
  }
};
