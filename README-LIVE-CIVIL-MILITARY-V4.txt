AVIQUEST LIVE CIVIL + MILITARY TRACKER V4

WHAT IS NOW CONNECTED
- The Leaflet map requests genuine live ADS-B/MLAT positions through a Netlify Function.
- Primary live source: Airplanes.live.
- Automatic fallback source: ADSB.lol.
- The browser never calls the third-party live source directly.
- No API key is required for these two prototype/non-commercial feeds.

NEW MAP CONTROLS
- All: displays every live aircraft returned for the visible map area.
- Civil: displays aircraft not marked as military. This includes airline, private and general-aviation traffic.
- Military: displays aircraft carrying the source database's military flag.
- Civil aircraft use blue markers.
- Military aircraft use amber markers.
- Emergency aircraft receive a red alert ring.

NEW AIRCRAFT DETAILS
- Civil or military classification
- Operator/owner when supplied
- Vertical rate
- Squawk
- ADS-B, MLAT, TIS-B, ADS-C or other position source
- Military identification note

IMPORTANT MILITARY LIMITATION
Military aircraft are not guaranteed to appear. Some are blocked, intentionally hidden, using anonymised addresses, not tagged in the source database, outside receiver coverage, or not transmitting a trackable position. The tracker only shows aircraft returned legally by its public data sources.

INSTALL
1. Upload every file inside this folder over the files in the GitHub repository.
2. Keep the netlify/functions folder and both JavaScript function files inside it.
3. Allow Netlify to redeploy.
4. Close and reopen the Home Screen app.
5. If the old tracker remains cached, remove the Home Screen icon, open the Netlify site in Safari, refresh, and add it to the Home Screen again.

FLIGHTAWARE AEROAPI
AeroAPI can later enrich selected commercial flights with schedules, route, origin, destination, gates and filed flight plans. It should not replace the live ADS-B map feed for this screen, and FlightAware notes that some sensitive or military flights are unavailable for public tracking.
