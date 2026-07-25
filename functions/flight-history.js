// Netlify Function: Fetch 7-day flight history for an aircraft
// OpenSky Network provides historical flight data for registered users

const https = require('https');

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
    const { hex } = event.queryStringParameters || {};

    if (!hex || hex.length !== 6) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid ICAO24 address (hex)' })
      };
    }

    // Get flights from last 7 days
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);

    // Query OpenSky flight history
    const endpoint = `/v1/flights/aircraft?icao24=${hex.toUpperCase()}&begin=${sevenDaysAgo}&end=${now}`;
    const flights = await makeRequest(endpoint);

    // Format flight data
    const formattedFlights = (flights || [])
      .map(flight => ({
        callsign: flight.callsign ? flight.callsign.trim() : null,
        firstSeen: new Date(flight.firstSeen * 1000).toISOString(),
        lastSeen: new Date(flight.lastSeen * 1000).toISOString(),
        estDepartureAirport: flight.estDepartureAirport,
        estArrivalAirport: flight.estArrivalAirport,
        estDepartureAirportHorizDistance: flight.estDepartureAirportHorizDistance,
        estDepartureAirportVertDistance: flight.estDepartureAirportVertDistance,
        estArrivalAirportHorizDistance: flight.estArrivalAirportHorizDistance,
        estArrivalAirportVertDistance: flight.estArrivalAirportVertDistance,
        departureAirportCandidates: flight.departureAirportCandidates || [],
        arrivalAirportCandidates: flight.arrivalAirportCandidates || []
      }))
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, 20); // Limit to 20 most recent flights

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftHex: hex.toUpperCase(),
        flightCount: formattedFlights.length,
        period: {
          start: new Date(sevenDaysAgo * 1000).toISOString(),
          end: new Date(now * 1000).toISOString()
        },
        recentFlights: formattedFlights
      })
    };
  } catch (error) {
    console.error('Flight History Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch flight history',
        details: error.message
      })
    };
  }
};
