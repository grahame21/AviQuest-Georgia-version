# AviQuest worldwide live aircraft — API connections

## Included and working without your private keys

- **Airplanes.live** — detailed aircraft within 250 nautical miles at closer zoom levels.
- **ADSB.lol** — automatic fallback for the same close-range requests.
- **OpenSky Network** — visible-map bounding-box traffic at continent/world zoom levels.

The tracker opens at the user's GPS location. Panning or zooming anywhere in the world automatically reloads traffic for the visible area. It does not try to download every aircraft on Earth every five seconds; that would overload mobile Safari and breach most API limits.

## Optional Netlify environment variables

Add secrets in **Netlify → Site configuration → Environment variables**. Never write API keys into tracker.js, HTML, GitHub, or a public repository.

- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`

Legacy OpenSky username/password variables are also recognised:

- `OPENSKY_USERNAME`
- `OPENSKY_PASSWORD`

## Send these details for each additional API

1. Provider name
2. Documentation link
3. Which plan/tier you have
4. Required header or query-parameter name for its key
5. Features you want from it: live positions, schedules, flight plans, gates, photos, liveries, history, military traffic, weather, etc.

Do not paste active API keys into a public GitHub issue or source file. Add them to Netlify and provide only the variable names when possible.
