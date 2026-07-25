// Netlify Function: Fetch global aircraft data from OpenSky Network ONLY
// Simplified for free OpenSky tier (no ADS-B Exchange)

const https = require('https');

const USERNAME = process.env.OPENSKY_USERNAME;
const PASSWORD = process.env.OPENSKY_PASSWORD;

function getOpenSkyAuth() {
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
        'Authorization': getOpenSkyAuth(),
        'User-Agent': 'AviQuest-Flight-Tracker/1.0'
      },
      timeout: 12000
    };

    const request = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

// Transform OpenSky state vector to standard format
function transformAircraft(state) {
  return {
    hex: state[0],
    callsign: state[1] ? state[1].trim() : null,
    country: state[2],
    lat: state[6],
    lon: state[5],
    altitude: state[7],
    track: Number.isFinite(state[10]) ? state[10] : null,
    speed: state[9] ? Math.round(state[9] * 1.94384) : null, // m/s to knots
    verticalRate: state[11] ? Math.round(state[11] * 196.85) : null, // m/s to ft/min
    squawk: state[14],
    onGround: Boolean(state[8]),
    sourceType: 'ADS-B ICAO',
    seen: state[4],
    geoAltitude: state[13]
  };
}

exports.handler = async (event) => {
  try {
    const { limit = 1000, includeGround = false } = event.queryStringParameters || {};
    
    const limitNum = Math.min(Math.max(Number(limit) || 1000, 100), 3000);
    const includeGnd = includeGround === 'true';

    console.log(`Fetching global aircraft - limit: ${limitNum}, include ground: ${includeGnd}`);

    // Fetch ALL aircraft worldwide from OpenSky Network
    const endpoint = '/v1/states/all';
    const states = await makeRequest(endpoint);
    
    if (!states || !states.states) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft: [],
          count: 0,
          source: 'OpenSky Network',
          worldwide: true,
          timestamp: new Date().toISOString(),
          message: 'No aircraft data available'
        })
      };
    }

    // Filter and transform aircraft
    const aircraft = (states.states || [])
      .filter(state => state[6] !== null && state[5] !== null) // Valid lat/lon
      .filter(state => includeGnd || !state[8]) // Filter ground aircraft if needed
      .map(transformAircraft)
      .sort((a, b) => {
        // Sort by callsign quality (longer = better data)
        return (b.callsign?.length || 0) - (a.callsign?.length || 0);
      })
      .slice(0, limitNum);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, max-age=0'
      },
      body: JSON.stringify({
        aircraft: aircraft,
        count: aircraft.count || aircraft.length,
        totalStates: states.states.length,
        source: 'OpenSky Network',
        worldwide: true,
        timestamp: new Date().toISOString(),
        stats: {
          totalTracked: states.states.length,
          displayed: aircraft.length,
          coverage: 'Global (~95% worldwide)'
        }
      })
    };
  } catch (error) {
    console.error('Global Aircraft Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch global aircraft data',
        details: error.message,
        source: 'OpenSky Network'
      })
    };
  }
};
