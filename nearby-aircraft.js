"use strict";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
};

function reply(statusCode, payload) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(payload) };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "ground") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value ?? null;
}

function isMilitaryAircraft(raw) {
  const flags = Number(raw.dbFlags || raw.db_flags || 0);
  const category = String(raw.category || "").toUpperCase();
  const description = String(raw.desc || raw.description || "").toUpperCase();
  const operator = String(raw.ownOp || raw.operator || "").toUpperCase();
  return Boolean(flags & 1) || /MIL|MILITARY|AIR FORCE|NAVY|ARMY|RAAF|RAF|USAF/.test(`${category} ${description} ${operator}`);
}

function normalise(raw, provider) {
  const altitude = numberOrNull(raw.alt_baro ?? raw.alt_geom ?? raw.altitude);
  const seen = numberOrNull(raw.seen);
  const seenPosition = numberOrNull(raw.seen_pos ?? raw.seenPosition);

  return {
    hex: String(raw.hex || raw.icao24 || "").toLowerCase().replace(/^~/, ""),
    callsign: clean(raw.flight ?? raw.callsign),
    registration: clean(raw.r ?? raw.reg ?? raw.registration),
    type: clean(raw.t ?? raw.type),
    description: clean(raw.desc ?? raw.description),
    operator: clean(raw.ownOp ?? raw.operator),
    lat: numberOrNull(raw.lat),
    lon: numberOrNull(raw.lon),
    altitude: altitude ?? 0,
    geoAltitude: numberOrNull(raw.alt_geom ?? raw.geoAltitude),
    track: numberOrNull(raw.track ?? raw.true_heading),
    speed: numberOrNull(raw.gs ?? raw.speed),
    verticalRate: numberOrNull(raw.baro_rate ?? raw.geom_rate ?? raw.verticalRate),
    squawk: clean(raw.squawk),
    onGround: raw.alt_baro === "ground" || raw.onGround === true || altitude === 0,
    source: String(raw.type || raw.source || "adsb").toLowerCase(),
    sourceType: clean(raw.type ?? raw.sourceType) || "ADS-B",
    category: clean(raw.category),
    emergency: clean(raw.emergency),
    country: clean(raw.country),
    isMilitary: isMilitaryAircraft(raw),
    seen,
    seenPosition,
    provider
  };
}

async function fetchJson(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "AviQuest-Georgia/3.0"
      },
      cache: "no-store",
      signal: controller.signal
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Provider returned invalid JSON (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || `Provider HTTP ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function requestProvider(provider, lat, lon, radius) {
  const safeRadius = Math.max(1, Math.min(250, radius));
  const base = provider === "airplanes.live"
    ? "https://api.airplanes.live/v2/point"
    : "https://api.adsb.lol/v2/point";
  const url = `${base}/${lat}/${lon}/${safeRadius}`;
  const data = await fetchJson(url);
  const rows = Array.isArray(data.ac) ? data.ac : Array.isArray(data.aircraft) ? data.aircraft : [];

  return rows
    .map(row => normalise(row, provider))
    .filter(item => item.hex && Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .filter(item => item.seenPosition === null || item.seenPosition <= 180);
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return reply(204, {});
  if (event.httpMethod !== "GET") return reply(405, { ok: false, error: "Only GET is supported." });

  const query = event.queryStringParameters || {};
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radius = Number(query.radius || 250);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return reply(400, { ok: false, error: "A valid latitude is required." });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return reply(400, { ok: false, error: "A valid longitude is required." });
  }

  const errors = [];
  for (const provider of ["airplanes.live", "adsb.lol"]) {
    try {
      const aircraft = await requestProvider(provider, lat, lon, radius);
      return reply(200, {
        ok: true,
        live: true,
        source: provider,
        requestedAt: new Date().toISOString(),
        centre: { lat, lon },
        radiusNm: Math.min(250, Math.max(1, radius)),
        total: aircraft.length,
        civilTotal: aircraft.filter(item => !item.isMilitary).length,
        militaryTotal: aircraft.filter(item => item.isMilitary).length,
        aircraft
      });
    } catch (error) {
      console.error(`${provider} failed:`, error);
      errors.push(`${provider}: ${error.message}`);
    }
  }

  return reply(502, {
    ok: false,
    live: false,
    error: "Both live ADS-B providers are temporarily unavailable.",
    details: errors
  });
};
