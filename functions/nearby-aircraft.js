"use strict";

const SOURCES = [
  {
    name: "Airplanes.live",
    buildUrl: (lat, lon, radius) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`
  },
  {
    name: "ADSB.lol",
    buildUrl: (lat, lon, radius) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`
  }
];

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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerNumber(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normaliseAltitude(value) {
  if (String(value).toLowerCase() === "ground") return 0;
  return finiteNumber(value);
}

function normaliseAircraft(record) {
  const latitude = finiteNumber(record.lat ?? record.latitude ?? record.lastPosition?.lat);
  const longitude = finiteNumber(record.lon ?? record.lng ?? record.longitude ?? record.lastPosition?.lon);
  if (latitude === null || longitude === null) return null;

  const seenPosition = finiteNumber(
    record.seen_pos ?? record.seenPosition ?? record.lastPosition?.seen_pos ?? record.lastPosition?.seen
  );
  const altitude = normaliseAltitude(record.alt_baro ?? record.altitude ?? record.alt_geom);
  const dbFlags = integerNumber(record.dbFlags ?? record.db_flags, 0);

  return {
    hex: cleanText(record.hex ?? record.icao ?? record.icao24).replace(/^~/, ""),
    callsign: cleanText(record.flight ?? record.callsign ?? record.call),
    registration: cleanText(record.r ?? record.registration ?? record.reg),
    type: cleanText(record.t ?? record.aircraft_type),
    description: cleanText(record.desc ?? record.description),
    operator: cleanText(record.ownOp ?? record.operator ?? record.owner),
    lat: latitude,
    lon: longitude,
    altitude,
    alt_baro: normaliseAltitude(record.alt_baro),
    alt_geom: normaliseAltitude(record.alt_geom),
    speed: finiteNumber(record.gs ?? record.speed ?? record.ground_speed),
    gs: finiteNumber(record.gs ?? record.speed ?? record.ground_speed),
    track: finiteNumber(record.track ?? record.heading ?? record.true_heading),
    verticalRate: finiteNumber(record.baro_rate ?? record.geom_rate ?? record.vertical_rate),
    squawk: cleanText(record.squawk),
    category: cleanText(record.category),
    seen: finiteNumber(record.seen),
    seenPosition,
    emergency: cleanText(record.emergency),
    sourceType: cleanText(record.type),
    dbFlags,
    isMilitary: Boolean(dbFlags & 1),
    isInteresting: Boolean(dbFlags & 2),
    isPia: Boolean(dbFlags & 4),
    isLadd: Boolean(dbFlags & 8)
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AviQuest-GGs-Adventure/2.0"
      },
      signal: controller.signal
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Non-JSON response (${res.status})`);
    }

    if (!res.ok) {
      const reason = data?.message || data?.error || data?.msg || `HTTP ${res.status}`;
      throw new Error(reason);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  if (event.httpMethod !== "GET") {
    return response(405, { error: "Only GET requests are supported." });
  }

  const query = event.queryStringParameters || {};
  const latitude = finiteNumber(query.lat);
  const longitude = finiteNumber(query.lon);
  const requestedRadius = finiteNumber(query.radius);
  const radius = Math.min(250, Math.max(1, requestedRadius ?? 50));

  if (latitude === null || latitude < -90 || latitude > 90) {
    return response(400, { error: "A valid latitude from -90 to 90 is required." });
  }

  if (longitude === null || longitude < -180 || longitude > 180) {
    return response(400, { error: "A valid longitude from -180 to 180 is required." });
  }

  const errors = [];

  for (const source of SOURCES) {
    try {
      const data = await fetchJson(source.buildUrl(latitude, longitude, radius));
      const rawAircraft = Array.isArray(data?.ac)
        ? data.ac
        : Array.isArray(data?.aircraft)
          ? data.aircraft
          : [];

      const aircraft = rawAircraft
        .map(normaliseAircraft)
        .filter(Boolean)
        .filter((record) => record.seenPosition === null || record.seenPosition <= 120);

      const militaryTotal = aircraft.filter((record) => record.isMilitary).length;

      return response(200, {
        ok: true,
        source: source.name,
        requestedAt: new Date().toISOString(),
        radiusNm: radius,
        centre: { lat: latitude, lon: longitude },
        total: aircraft.length,
        civilTotal: aircraft.length - militaryTotal,
        militaryTotal,
        aircraft
      });
    } catch (error) {
      errors.push(`${source.name}: ${error.name === "AbortError" ? "timeout" : error.message}`);
    }
  }

  return response(502, {
    error: "Neither live aircraft source responded successfully.",
    details: errors
  });
};
