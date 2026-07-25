// Netlify Function: Fetch live aircraft data from OpenSky Network
// Free & Open Source Flight Tracking API

const https = require('https');

const OPENSKY_API = 'https://opensky-network.org/api';
const USERNAME = process.env.OPENSKY_USERNAME;
const PASSWORD = process.env.OPENSKY_PASSWORD;

// Encode credentials for Basic Auth
function getAuthHeader() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('Missing OPENSKY_USERNAME or OPENSKY_PASSWORD environment variables');
  }
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  return `Basic ${auth}`;
}

// Make HTTPS request to OpenSky API
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
      timeout: 10000
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
          reject(new Error(`Invalid JSON response: ${e.message}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    request.on('timeout', () => {
      request.abort();
      reject(new Error('Request timeout'));
    });

    request.end();
  });
}

// Calculate bounding box from center point and radius
function calculateBoundingBox(lat, lon, radiusNm) {
  const radiusKm = radiusNm * 1.852; // Convert nautical miles to km
  const latOffset = radiusKm / 111; // ~111 km per degree latitude
  const lonOffset = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  return {
    lamin: Number(lat) - latOffset,
    lomin: Number(lon) - lonOffset,
    lamax: Number(lat) + latOffset,
    lomax: Number(lon) + lonOffset
  };
}

// Transform OpenSky state vector to AviQuest format
function transformAircraft(state) {
  // OpenSky state vector format:
  // [0] ICAO24, [1] callsign, [2] origin_country, [3] time_position,
  // [4] time_velocity, [5] longitude, [6] latitude, [7] baro_altitude,
  // [8] on_ground, [9] velocity, [10] true_track, [11] vertical_rate,
  // [12] sensors, [13] geo_altitude, [14] squawk, [15] spi, [16] position_source

  return {
    hex: state[0] || null,
    callsign: state[1] ? state[1].trim() : null,
    country: state[2] || null,
    lat: state[6],
    lon: state[5],
    altitude: state[7], // In feet (barometric)
    track: Number.isFinite(state[10]) ? state[10] : null, // Track in degrees
    speed: state[9] ? Math.round(state[9] * 1.94384) : null, // Convert m/s to knots
    verticalRate: state[11] ? Math.round(state[11] * 196.85) : null, // Convert m/s to ft/min
    squawk: state[14] || null,
    onGround: Boolean(state[8]),
    isMilitary: false, // OpenSky doesn't directly flag military, infer from call patterns
    sourceType: 'ADS-B ICAO',
    seenPosition: state[3],
    seen: state[4],
    geoAltitude: state[13] // Geometric altitude (GPS)
  };
}

// Main handler
exports.handler = async (event) => {
  try {
    const { lat, lon, radius } = event.queryStringParameters || {};

    // Validate input
    if (!lat || !lon || !radius) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required parameters: lat, lon, radius'
        })
      };
    }

    const latNum = Number(lat);
    const lonNum = Number(lon);
    const radiusNum = Number(radius);

    // Validate ranges
    if (isNaN(latNum) || isNaN(lonNum) || isNaN(radiusNum)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid numeric parameters'
        })
      };
    }

    if (latNum < -90 || latNum > 90) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Latitude must be between -90 and 90' })
      };
    }

    if (lonNum < -180 || lonNum > 180) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Longitude must be between -180 and 180' })
      };
    }

    if (radiusNum <= 0 || radiusNum > 300) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Radius must be between 1 and 300 nautical miles' })
      };
    }

    // Calculate bounding box
    const bbox = calculateBoundingBox(latNum, lonNum, radiusNum);

    // Query OpenSky API
    const endpoint = `/v1/states/all?lamin=${bbox.lamin.toFixed(5)}&lomin=${bbox.lomin.toFixed(5)}&lamax=${bbox.lamax.toFixed(5)}&lomax=${bbox.lomax.toFixed(5)}`;
    const states = await makeRequest(endpoint);

    // Transform and filter aircraft
    const aircraft = (states.states || [])
      .filter(state => state[6] !== null && state[5] !== null) // Has valid lat/lon
      .map(transformAircraft)
      .sort((a, b) => {
        // Sort by distance to center
        const distA = Math.sqrt(Math.pow(a.lat - latNum, 2) + Math.pow(a.lon - lonNum, 2));
        const distB = Math.sqrt(Math.pow(b.lat - latNum, 2) + Math.pow(b.lon - lonNum, 2));
        return distA - distB;
      })
      .slice(0, 500); // Limit to 500 aircraft per request

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, max-age=0'
      },
      body: JSON.stringify({
        aircraft: aircraft,
        source: 'OpenSky Network',
        timestamp: new Date().toISOString(),
        bounds: bbox,
        count: aircraft.length
      })
    };
  } catch (error) {
    console.error('OpenSky Tracker Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch aircraft data',
        details: error.message
      })
    };
  }
};
