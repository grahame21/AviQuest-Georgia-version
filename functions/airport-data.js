// Netlify Function: Fetch airport information from OpenAIP
// Returns airport details: ICAO code, coordinates, runways, etc.

const https = require('https');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, (res) => {
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
    }).on('error', reject);
  });
}

// Fallback airport database (free OurAirports data)
const AIRPORT_DB = {
  YSSY: {
    name: 'Sydney Airport',
    city: 'Sydney',
    country: 'Australia',
    lat: -33.946111,
    lon: 151.177222,
    runways: 3,
    elevation: 6,
    iata: 'SYD'
  },
  YMML: {
    name: 'Melbourne Airport',
    city: 'Melbourne',
    country: 'Australia',
    lat: -37.673333,
    lon: 144.843333,
    runways: 2,
    elevation: 132,
    iata: 'MEL'
  },
  EGLL: {
    name: 'London Heathrow Airport',
    city: 'London',
    country: 'United Kingdom',
    lat: 51.4706,
    lon: -0.4619,
    runways: 3,
    elevation: 83,
    iata: 'LHR'
  },
  KJFK: {
    name: 'John F Kennedy International Airport',
    city: 'New York',
    country: 'United States',
    lat: 40.6413,
    lon: -73.7781,
    runways: 4,
    elevation: 13,
    iata: 'JFK'
  },
  LEMD: {
    name: 'Adolfo Suárez Madrid-Barajas Airport',
    city: 'Madrid',
    country: 'Spain',
    lat: 40.471926,
    lon: -3.561613,
    runways: 4,
    elevation: 610,
    iata: 'MAD'
  }
};

exports.handler = async (event) => {
  try {
    const { icao } = event.queryStringParameters || {};

    if (!icao || icao.length < 2) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid ICAO code' })
      };
    }

    const icaoCode = icao.toUpperCase();

    // Try to fetch from OpenAIP first
    try {
      const response = await makeRequest(
        `https://api.openaip.net/v2/aerodromes?icao=${icaoCode}`
      );

      if (response && response.aerodromes && response.aerodromes.length > 0) {
        const airport = response.aerodromes[0];
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: airport.name || 'Unknown',
            icao: airport.icao,
            iata: airport.iata,
            lat: airport.geometryPoint?.latitude,
            lon: airport.geometryPoint?.longitude,
            elevation: airport.elevation,
            source: 'OpenAIP'
          })
        };
      }
    } catch (e) {
      console.warn('OpenAIP request failed, using fallback:', e.message);
    }

    // Fallback to local database
    if (AIRPORT_DB[icaoCode]) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...AIRPORT_DB[icaoCode],
          source: 'Local Database'
        })
      };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Airport not found' })
    };
  } catch (error) {
    console.error('Airport Data Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch airport data',
        details: error.message
      })
    };
  }
};
