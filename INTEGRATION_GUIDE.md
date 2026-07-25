# Integration Guide: Adding Enhanced Functions to tracker.js

This guide explains how to integrate the new OpenSky Network functions into your existing `tracker.js` file.

## 📝 Overview

You now have:
1. **4 new Netlify serverless functions** in the `functions/` folder
2. **Helper functions** in `tracker-enhanced.js`
3. **Enhanced CSS styles** in `tracker-enhancements.css`

No changes needed to your current tracker until you want to activate enhanced features.

## 🔄 Data Flow

```
User clicks aircraft
     ↓
selectAircraft() triggers
     ↓
Fetch aircraft metadata (background)
     ↓
/.netlify/functions/aircraft-data?icao24=ABC123
     ↓
OpenSky API returns registration, manufacturer, model
     ↓
Update detail panel with enhanced info
```

## 🚀 Option 1: Minimal Integration (Recommended for Start)

Keep your existing `tracker.js` as-is. The new Netlify functions work independently.

**Current flow:**
- Your existing `nearby-aircraft.js` function → stays the same
- Still uses OpenSky Network (via new function)
- No code changes needed
- Just needs environment variables set

## 🔧 Option 2: Full Enhancement Integration

If you want to use the enhanced aircraft metadata and history:

### Step 1: Copy the enhanced functions

```javascript
// Add to the end of your tracker.js file:

// From tracker-enhanced.js:
async function fetchAircraftMetadata(aircraft) {
  if (!aircraft.hex) return null;
  
  try {
    const response = await fetch(
      `/.netlify/functions/aircraft-data?icao24=${aircraft.hex.toUpperCase()}`,
      { cache: 'force-cache' }
    );
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Failed to fetch aircraft metadata:', error);
  }
  return null;
}

async function fetchFlightHistory(hex) {
  if (!hex) return null;
  
  try {
    const response = await fetch(
      `/.netlify/functions/flight-history?hex=${hex.toUpperCase()}`,
      { cache: 'no-cache' }
    );
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Failed to fetch flight history:', error);
  }
  return null;
}
```

### Step 2: Update selectAircraft function

Find this section in your `tracker.js`:

```javascript
async function selectAircraft(aircraft, open = true) {
  state.selected = aircraft;
  renderMarkers();

  els.detailStatus.textContent = aircraft.isMilitary ? 'LIVE MILITARY' : 'LIVE CIVIL';
  // ... existing code ...
  
  if (open) {
    els.detailsPanel.classList.remove('hidden');
    els.aircraftList.classList.remove('open');
  }

  const photo = await loadPhoto(aircraft);
  // ... rest of function
}
```

Add this after `updateSaveButtons();`:

```javascript
  // NEW: Fetch enhanced metadata from OpenSky
  try {
    const metadata = await fetchAircraftMetadata(aircraft);
    if (metadata && state.selected && aircraftKey(state.selected) === aircraftKey(aircraft)) {
      // Update with enhanced data if available
      if (metadata.operatorCallsign) {
        els.detailOperator.textContent = metadata.operatorCallsign;
      }
      if (metadata.model) {
        els.detailType.textContent = `${metadata.manufacturer} ${metadata.model}`;
      }
      if (metadata.registration) {
        els.detailReg.textContent = metadata.registration;
      }
    }
  } catch (e) {
    console.warn('Enhanced metadata fetch failed:', e);
  }
```

### Step 3: Add enhanced CSS

In `tracker.html`, add the enhanced styles to your `<head>`:

```html
<link rel="stylesheet" href="tracker.css?v=4" />
<link rel="stylesheet" href="tracker-enhancements.css?v=1" />
```

## 🎨 HTML Changes (Optional)

If you want to display flight history in the details panel:

### Find this in tracker.html:
```html
<div class="detail-actions">
  <button id="centreAircraft" type="button">Centre</button>
  <button id="openAr" class="primary" type="button">Open in AR</button>
</div>
```

### Add after it:
```html
<!-- Enhanced actions section -->
<div class="enhanced-actions" id="enhancedActions">
  <button id="viewHistory" type="button">📋 Flight History</button>
  <button id="trackRoute" type="button">🗺️ Show Route</button>
</div>

<!-- Flight history container -->
<div id="historyPanel" class="flight-history hidden"></div>
```

### Add event listeners in tracker.js:
```javascript
els.viewHistory.addEventListener('click', async () => {
  if (state.selected) {
    const history = await fetchFlightHistory(state.selected.hex);
    if (history && history.recentFlights) {
      let html = '<h4>Recent Flights (Last 7 Days)</h4>';
      history.recentFlights.forEach((flight, i) => {
        html += `
          <div class="history-item">
            <strong>${flight.callsign || 'Unknown'}</strong>
            <p>${flight.estDepartureAirport || '?'} → ${flight.estArrivalAirport || '?'}</p>
            <small>${new Date(flight.firstSeen).toLocaleString()}</small>
          </div>
        `;
      });
      els.historyPanel.innerHTML = html;
      els.historyPanel.classList.remove('hidden');
    }
  }
});
```

## 🔍 Testing the Integration

### With Netlify CLI (Local):

```bash
# Terminal 1: Start dev server
netlify dev

# Terminal 2: Watch for changes
ls -la functions/
```

Then:
1. Open http://localhost:8888
2. Click "Live Aviation"
3. Allow location
4. Zoom in on an area with aircraft
5. Click an aircraft
6. Watch the details panel populate
7. Open browser DevTools (F12 → Network tab)
8. You should see calls to `/.netlify/functions/aircraft-data`

### After Deployment:

1. Open your live site
2. Open DevTools (F12)
3. Go to Network tab
4. Click an aircraft
5. Look for successful calls to:
   - `aircraft-data` (200 OK)
   - `aircraft-photo` (200 OK or 404 - normal)

## 🐛 Debugging

### Function not returning data:

1. **Check Netlify logs:**
   ```
   https://app.netlify.com → Your Site → Functions
   ```

2. **Test function URL directly** (replace values):
   ```
   https://your-site.netlify.app/.netlify/functions/aircraft-data?icao24=aa0a0a
   ```

3. **Check for 401 errors:**
   - OpenSky credentials are wrong
   - Fix in Netlify environment variables

4. **Check console errors:**
   - Press F12 in browser
   - Go to Console tab
   - Look for red error messages

## 📦 File Structure After Integration

```
AviQuest-Georgia-version/
├── functions/
│   ├── opensky-tracker.js          ← Main tracker
│   ├── aircraft-data.js            ← Aircraft metadata
│   ├── airport-data.js             ← Airport info
│   └── flight-history.js           ← Historical data
├── tracker.html                     ← Updated with new buttons
├── tracker.js                       ← Enhanced with metadata fetching
├── tracker.css                      ← Existing styles
├── tracker-enhancements.css         ← New styles
├── tracker-enhanced.js              ← Helper functions (for reference)
├── .env.example                     ← Credential template
└── SETUP.md / INTEGRATION_GUIDE.md  ← Documentation
```

## 🚨 Important: Environment Variables

**MUST be set in Netlify before functions will work:**

1. Go to Netlify dashboard
2. Site settings → Build & deploy → Environment
3. Add:
   - `OPENSKY_USERNAME`
   - `OPENSKY_PASSWORD`
4. Redeploy site

## ✅ Verification

After integration, verify:

- [ ] Aircraft still appear on map
- [ ] Clicking aircraft shows details
- [ ] No console errors (F12)
- [ ] Metadata populates after 1-2 seconds
- [ ] Flight history button works (if added)
- [ ] Netlify functions show successful executions

## 🤔 FAQ

**Q: Will this break my existing tracker?**  
A: No. The new functions are separate. Your existing code stays unchanged.

**Q: Do I have to use all the enhancements?**  
A: No. Start with just `opensky-tracker.js`, add others gradually.

**Q: Can I revert if something breaks?**  
A: Yes. Merge `main` branch again or use Git rollback.

**Q: How do I know if functions are working?**  
A: Check Netlify logs (Site → Functions) and browser DevTools (F12 → Network).

## 📞 Need Help?

Check:
1. Netlify function logs
2. Browser console (F12)
3. `.env.example` for credential format
4. OpenSky Network API docs

---

You're all set! Enjoy your premium flight tracker. 🚀
