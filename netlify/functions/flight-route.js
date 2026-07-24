"use strict";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300, s-maxage=1800"
};

function respond(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "GET") return respond(405, { error: "Only GET is supported." });

  const callsign = String(event.queryStringParameters?.callsign || "")
    .trim().replace(/\s+/g, "").toUpperCase();

  if (!/^[A-Z0-9]{3,10}$/.test(callsign)) {
    return respond(400, { error: "A valid flight callsign is required." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(
      `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "AviQuest-GGs-Adventure/3.0"
        },
        signal: controller.signal
      }
    );

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return respond(502, { error: "Route provider returned invalid data." }); }

    if (!response.ok || !data?.response?.flightroute) {
      return respond(404, { error: "No published route found.", callsign });
    }

    return respond(200, {
      ok: true,
      callsign,
      source: "ADSBDB",
      flightroute: data.response.flightroute
    });
  } catch (error) {
    return respond(502, {
      error: error.name === "AbortError" ? "Route lookup timed out." : error.message
    });
  } finally {
    clearTimeout(timer);
  }
};
