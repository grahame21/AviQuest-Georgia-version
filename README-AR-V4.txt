AVIQUEST LIVE AR SPOTTER V4

Fixes in this build:
- Aircraft photos no longer flash between the placeholder and the real image.
- Photo requests are cached and failed photos are not retried continuously.
- Marker elements stay on screen and move instead of being destroyed/recreated eight times per second.
- Closing aircraft details fully clears the selected aircraft.
- A late photo response can no longer reopen a closed detail sheet.
- Another aircraft can be selected immediately after closing the sheet.
- Vertical marker movement has been reversed from v3 to match the direction requested after testing.
- Distances remain in metres/kilometres and radius messages now say kilometres.
- Only the six aircraft closest to the centre of view are displayed, with the centre target prioritised.
- Service worker cache has been bumped to v4 so older AR files are replaced.

DEPLOYMENT
Upload every file and folder in AviQuest-Georgia-version-main to the repository root.
After Netlify deploys, open the site in Safari and refresh. If an old Home Screen build remains, remove the Home Screen icon, open the Netlify URL in Safari, and add it again.
