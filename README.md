# AviQuest Georgia Pro v2

This version responds to Georgia's first test run.

## Main changes

- New dark blue, green and black theme
- “Infinite Adventure” renamed to **Aviation Journey**
- Simplified fake map questions removed
- New **Aviation Knowledge** category added
- Questions rewritten to avoid obvious prompts such as “Which city is served by Adelaide Airport?”
- Aircraft identification cards no longer display the answer as a type code beside an aircraft emoji
- More code-pair, callsign, clue-combination and aircraft-description questions
- Three contextual hints per challenge
- A used hint reduces the XP earned for that answer
- Separate **Reset levels, XP and quiz scores** button
- Resetting quiz progress preserves spotting logs, ideas, favourites, photos and settings
- A7-BAF feature panel added to the home page
- Georgia can replace the online A7-BAF preview with her own photo
- Service-worker cache version increased so Netlify updates are less likely to remain stuck on the old build

## Replace the current Netlify version

1. Unzip this package.
2. Upload **all files inside this folder** over the files currently used by the Netlify site or its connected GitHub repository.
3. Allow Netlify to redeploy.
4. Open the site in Safari and refresh it.
5. Open **Settings → Reset levels, XP and quiz scores** before Georgia begins her clean test run.

If an old Home Screen version remains cached, remove the Home Screen icon, open the updated Netlify URL in Safari, and add it to the Home Screen again.

## A7-BAF photo

The default A7-BAF image is an externally linked personal test preview from JetPhotos, credited and linked on the home page. It is not bundled into this ZIP. Before a public or commercial release, obtain the photographer's permission or replace it with a photo that you or Georgia own. The **Use your own photo** button stores a compressed replacement on the device.

## Production note

This is a substantial working test build, but the aviation database is still curated starter data rather than a fully licensed worldwide production database. Every fact, image and trademark source should be verified before commercial release.
