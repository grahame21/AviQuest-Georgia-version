AVIQUEST AR ROUTES + CAMERA v4

WHAT CHANGED
- Rich origin → destination route display in AR aircraft details.
- Flight and airline fields added.
- Route data is loaded through a new Netlify function: netlify/functions/flight-route.js.
- Rear-camera selection now tries the saved device, exact environment camera, ideal environment camera, and a general video fallback.
- Added a Camera restart control.
- Camera resumes after returning to the page without deliberately re-requesting every permission.
- AviQuest remembers that setup was completed and changes the start button to Resume Live AR.
- The dark camera overlay has been substantially reduced.
- Route information is also saved into AR-spotted records.

IMPORTANT IPHONE PERMISSION DETAIL
A website cannot force iPhone to remember a permission. When iPhone offers choices, do not choose “Allow Once”.
For the Netlify website in Safari:
1. Tap the page menu beside the address.
2. Open Website Settings.
3. Set Camera to Allow.
4. Set Location to Allow.
Motion & Orientation may still require a user tap because Apple controls that permission.

INSTALL
Upload all files inside AviQuest-Georgia-version-main to the repository root.
Make sure netlify/functions/flight-route.js is uploaded.
Wait for Netlify deployment, then close the old tab and open the site again.
