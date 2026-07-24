AVIQUEST GLOBAL TRACKER V2

CHANGES
- Live Flight Tracker and Live AR Spotter are now paired tabs at the top.
- The visible radius selector has been removed.
- Aircraft data loads automatically for the map area currently on screen. Pan to another country or city and the tracker requests that region.
- Real source data refreshes every 5 seconds.
- Aircraft marker positions are smoothly interpolated four times per second between source updates.
- Search supports callsign, registration, ICAO hex and aircraft type within the loaded map area.
- Added My location, Favourites and Saved filters.
- Free-account prototype limits: 5 favourites and 10 saved aircraft. These values are stored on the device.
- The aircraft drawer is hidden unless opened.
- AR camera startup now retries rear-camera constraints, waits for a real video frame and reports a useful error instead of silently showing black.
- AR vertical pitch direction has been reversed again based on the latest real-device report.

IMPORTANT DATA NOTE
The current free ADS-B sources use geographic area requests. The map interface is global because it automatically loads the region being viewed, but a worldwide registration search that finds an aircraft anywhere on Earth without first moving the map requires a global search/provider endpoint. The UI is ready for that API connection.

INSTALL
Upload every file inside this folder to the root of the GitHub repository, replacing existing files. Wait for Netlify to deploy, then close and reopen the Home Screen app. If an old build remains, remove the Home Screen icon, open the Netlify URL in Safari and add it again.
