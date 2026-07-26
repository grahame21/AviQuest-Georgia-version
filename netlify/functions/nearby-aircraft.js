"use strict";

const https = require('https');

const USERNAME = process.env.OPENSKY_USERNAME;
const PASSWORD = process.env.OPENSKY_PASSWORD;

function getAuthHeader() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('OpenSky credentials not configured');
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
        'User-Agent': 'AviQuest-GGs-Adventure/2.0'
      },
      timeout: 10000
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

function normaliseAircraft(state) {
  return {
    hex: state[0],
    callsign: state[1] ? state[1].trim() : null,
    country: state[2],
    lat: state[6],
    lon: state[5],
    altitude: state[7],
    track: Number.isFinite(state[10]) ? state[10] : null,
    speed: state[9] ? Math.round(state[9] * 1.94384) : null,
    verticalRate: state[11] ? Math.round(state[11] * 196.85) : null,
    squawk: state[14],
    onGround: Boolean(state[8]),
    sourceType: 'ADS-B ICAO',
    seen: state[4],
    geoAltitude: state[13],
    isMilitary: false,
    registration: null,
    type: null,
    description: null,
    operator: null,
    category: null,
    emergency: null,
    seenPosition: state[4]
  };
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store, max-age=0"
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  if (event.httpMethod !== "GET") {
    return response(405, { error: "Only GET requests are supported." });
  }

  try {
    const query = event.queryStringParameters || {};
    const lat = parseFloat(query.lat);
    const lon = parseFloat(query.lon);
    const radius = parseFloat(query.radius) || 50;

    // Validate coordinates
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return response(400, { error: "Valid latitude (-90 to 90) required" });
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return response(400, { error: "Valid longitude (-180 to 180) required" });
    }

    // Calculate bounds (convert radius nm to degrees, roughly 1 degree = 60 nm)
    const radiusDeg = radius / 60;
    const minLat = lat - radiusDeg;
    const maxLat = lat + radiusDeg;
    const minLon = lon - radiusDeg;
    const maxLon = lon + radiusDeg;

    // Fetch from OpenSky Network
    const endpoint = `/v1/states/all?lamin=${minLat}&lamax=${maxLat}&lomin=${minLon}&lomax=${maxLon}`;
    const data = await makeRequest(endpoint);

    if (!data || !data.states) {
      return response(200, {
        ok: true,
        source: 'OpenSky Network',
        requestedAt: new Date().toISOString(),
        radiusNm: radius,
        centre: { lat, lon },
        total: 0,
        civilTotal: 0,
        militaryTotal: 0,
        aircraft: []
      });
    }

    // Transform and filter aircraft
    const aircraft = (data.states || [])
      .filter(state => state[6] !== null && state[5] !== null) // Valid lat/lon
      .map(normaliseAircraft)
      .filter(ac => ac.seenPosition === null || ac.seenPosition <= 120);

    const militaryTotal = aircraft.filter(ac => ac.isMilitary).length;

    return response(200, {
      ok: true,
      source: 'OpenSky Network',
      requestedAt: new Date().toISOString(),
      radiusNm: radius,
      centre: { lat, lon },
      total: aircraft.length,
      civilTotal: aircraft.length - militaryTotal,
      militaryTotal,
      aircraft
    });

  } catch (error) {
    console.error('Aircraft request error:', error);
    return response(502, {
      error: 'Failed to fetch aircraft data',
      details: error.message
    });
  }
};
