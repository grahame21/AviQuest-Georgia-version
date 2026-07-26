"use strict";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=8, s-maxage=8, stale-while-revalidate=20"
};

const memoryCache = new Map();

function reply(statusCode, payload) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(payload) };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value ?? null;
}

function normaliseOpenSky(state) {
  if (!Array.isArray(state)) return null;
  const lat = finite(state[6]);
  const lon = finite(state[5]);
  if (lat === null || lon === null) return null;

  return {
    hex: String(state[0] || "").toLowerCase(),
    callsign: clean(state[1]),
    registration: null,
    type: null,
    description: null,
    operator: null,
    country: clean(state[2]),
    lat,
    lon,
    altitude: finite(state[7]) === null ? 0 : Math.round(state[7] * 3.28084),
    geoAltitude: finite(state[13]) === null ? null : Math.round(state[13] * 3.28084),
    track: finite(state[10]),
    speed: finite(state[9]) === null ? null : Math.round(state[9] * 1.943844),
    verticalRate: finite(state[11]) === null ? null : Math.round(state[11] * 196.8504),
    squawk: clean(state[14]),
    onGround: Boolean(state[8]),
    source: "adsb",
    sourceType: "OpenSky state vector",
    category: finite(state[17]),
    emergency: Boolean(state[15]) ? "alert" : null,
    isMilitary: false,
    seen: finite(state[4]),
    seenPosition: null,
    provider: "opensky"
  };
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: "application/json",
      "User-Agent": "AviQuest-Georgia/4.0"
    };

    // Optional authenticated OpenSky access. Anonymous access still works,
    // but credentials normally provide more generous request limits.
    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
    if (clientId && clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else if (process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) {
      headers.Authorization = `Basic ${Buffer.from(`${process.env.OPENSKY_USERNAME}:${process.env.OPENSKY_PASSWORD}`).toString("base64")}`;
    }

    const response = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`OpenSky returned invalid JSON (${response.status})`); }
    if (!response.ok) throw new Error(data.message || `OpenSky HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(bounds, includeGround) {
  const rounded = bounds.map(value => Math.round(value * 2) / 2);
  return `${rounded.join(":")}:${includeGround ? 1 : 0}`;
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return reply(204, {});
  if (event.httpMethod !== "GET") return reply(405, { ok: false, error: "Only GET is supported." });

  const q = event.queryStringParameters || {};
  const lamin = clamp(finite(q.lamin) ?? -90, -90, 90);
  const lamax = clamp(finite(q.lamax) ?? 90, -90, 90);
  const lomin = clamp(finite(q.lomin) ?? -180, -180, 180);
  const lomax = clamp(finite(q.lomax) ?? 180, -180, 180);
  const includeGround = q.includeGround !== "false";
  const limit = clamp(Math.round(finite(q.limit) ?? 2500), 100, 5000);

  if (lamin >= lamax || lomin >= lomax) {
    return reply(400, { ok: false, error: "Invalid map bounds." });
  }

  const key = cacheKey([lamin, lamax, lomin, lomax], includeGround);
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.savedAt < 8000) {
    return reply(200, { ...cached.payload, cache: "memory" });
  }

  try {
    const params = new URLSearchParams({
      lamin: String(lamin), lamax: String(lamax),
      lomin: String(lomin), lomax: String(lomax)
    });
    const data = await fetchJson(`https://opensky-network.org/api/states/all?${params}`);
    const aircraft = (Array.isArray(data.states) ? data.states : [])
      .map(normaliseOpenSky)
      .filter(Boolean)
      .filter(item => includeGround || !item.onGround)
      .slice(0, limit);

    const payload = {
      ok: true,
      live: true,
      worldwide: true,
      source: "opensky",
      requestedAt: new Date().toISOString(),
      bounds: { lamin, lamax, lomin, lomax },
      total: aircraft.length,
      aircraft
    };
    memoryCache.set(key, { savedAt: Date.now(), payload });
    if (memoryCache.size > 60) memoryCache.delete(memoryCache.keys().next().value);
    return reply(200, payload);
  } catch (error) {
    console.error("Global aircraft request failed:", error);
    return reply(502, {
      ok: false,
      live: false,
      source: "opensky",
      error: "Worldwide aircraft data is temporarily unavailable.",
      details: error.message
    });
  }
};
