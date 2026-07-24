GG’S ADVENTURE — LIVE AR SPOTTER v1
====================================

WHAT THIS PACKAGE ADDS
----------------------
• A new “Live AR Spotter” tile on the Home screen.
• A second AR launch button inside Georgia’s Spotter Log.
• Rear-camera plane spotting with GPS, compass and live nearby ADS-B positions.
• Aircraft labels showing callsign/registration, distance and altitude.
• Tap a label for more details, then tick the aircraft off as spotted.
• A local “Spotted today” list with JSON export.
• Search-radius choices of 20, 50, 80 and 120 nautical miles.
• Airplanes.live as the first live-data source, with ADSB.lol as an automatic fallback.
• No API key is required for this version.

FILES IN THIS PACKAGE
---------------------
index.html
ar.html
ar.css
ar.js
netlify/functions/nearby-aircraft.js
README-AR-INSTALL.txt

IMPORTANT
---------
This package contains only the changed index.html and the new AR files.
Keep all of your existing GG’s Adventure files, including:

app.js
data.js
styles.css
manifest.webmanifest
icons and images

UPLOAD STEPS
------------
1. Unzip this package.
2. In your existing GG’s Adventure site/repository, replace the current index.html with this one.
3. Add ar.html, ar.css and ar.js beside index.html.
4. Add the nearby-aircraft.js file at exactly:

   netlify/functions/nearby-aircraft.js

5. Keep all other existing files where they are.
6. Deploy or redeploy the site through Netlify.
7. Wait for Netlify to show “Published”.
8. Open the HTTPS site in Safari on the iPhone.
9. Tap Live AR Spotter, then tap Start Live AR.
10. Allow Camera, Location and Motion & Orientation when asked.

FIRST USE AT THE SPOTTING LOCATION
----------------------------------
1. Hold the iPhone upright in portrait mode.
2. Point it roughly toward the horizon.
3. Tap Calibrate.
4. Slowly pan left and right.
5. Tap an aircraft label to open its details.
6. Tap “Mark this aircraft spotted” to tick it off.

The compass may drift near cars, metal fences, loudspeakers, magnetic mounts or other strong magnetic objects. Move a few metres away and tap Calibrate again if labels are offset.

HOME-SCREEN CACHE
-----------------
The replacement index.html uses version 5 query strings to reduce stale caching.
After deployment, completely close GG’s Adventure and reopen it.
If the old version still appears, open the site once in Safari and refresh it. As a final fallback, remove the old Home Screen icon and add it again after the new deployment is live.

SAFETY AND ACCURACY
-------------------
Live ADS-B positions can be delayed, incomplete or temporarily unavailable. Some aircraft do not broadcast all fields, and aircraft can appear in a slightly different direction from the label because of compass drift or data delay.

Use this as a fun spotting aid only. Do not use it for aviation navigation, traffic separation or any safety decision. Stay aware of roads, vehicles, uneven ground and other people while looking through the camera.
