// Enhanced tracker.js with OpenSky Network integration
// This file contains NEW functions to integrate with the Netlify serverless backend
// Add these functions to your existing tracker.js

/**
 * Fetch enhanced aircraft data from OpenSky Network
 * @param {Object} aircraft - Aircraft object from main tracker
 * @returns {Promise<Object>} Enhanced aircraft metadata
 */
async function fetchAircraftMetadata(aircraft) {
  if (!aircraft.hex) return null;
  
  try {
    const response = await fetch(
      `/.netlify/functions/aircraft-data?icao24=${aircraft.hex.toUpperCase()}`,
      { cache: 'force-cache', headers: { 'pragma': 'no-cache' } }
    );
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Failed to fetch aircraft metadata:', error);
  }
  return null;
}

/**
 * Fetch airport information
 * @param {string} icaoCode - ICAO airport code
 * @returns {Promise<Object>} Airport data
 */
async function fetchAirportInfo(icaoCode) {
  if (!icaoCode) return null;
  
  try {
    const response = await fetch(
      `/.netlify/functions/airport-data?icao=${icaoCode.toUpperCase()}`,
      { cache: 'force-cache' }
    );
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Failed to fetch airport info:', error);
  }
  return null;
}

/**
 * Fetch flight history for an aircraft
 * @param {string} hex - ICAO24 hex code
 * @returns {Promise<Object>} Flight history data
 */
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

/**
 * Enhanced selectAircraft with metadata integration
 * REPLACE the existing selectAircraft function with this version
 */
async function selectAircraftEnhanced(aircraft, open = true) {
  state.selected = aircraft;
  renderMarkers();

  els.detailStatus.textContent = aircraft.isMilitary ? 'LIVE MILITARY' : 'LIVE CIVIL';
  els.detailStatus.classList.toggle('military-status', aircraft.isMilitary);
  els.detailCallsign.textContent = aircraft.displayName;
  els.detailReg.textContent =
    clean(aircraft.registration) ||
    clean(aircraft.hex).toUpperCase() ||
    'Registration unavailable';
  els.detailType.textContent = clean(aircraft.description) || clean(aircraft.type) || 'Unknown';
  els.detailOperator.textContent = clean(aircraft.operator) || 'Not supplied';
  els.detailClass.textContent = aircraft.isMilitary ? 'Military' : 'Civil / commercial';
  els.detailDistance.textContent =
    aircraft.distanceKm === null
      ? 'Outside your location range'
      : formatDistance(aircraft.distanceKm);
  els.detailAltitude.textContent = formatAltitude(aircraft.altitude);
  els.detailSpeed.textContent = formatSpeed(aircraft.speed);
  els.detailHeading.textContent = formatHeading(aircraft.track);
  els.detailVerticalRate.textContent = formatVerticalRate(aircraft.verticalRate);
  els.detailSquawk.textContent = clean(aircraft.squawk) || 'Not supplied';
  els.detailSource.textContent = formatSourceType(aircraft.sourceType);
  els.detailSeen.textContent = formatSeen(aircraft.seenPosition ?? aircraft.seen);
  els.militaryNote.hidden = !aircraft.isMilitary;
  els.aircraftPhoto.src = 'images/aircraft-placeholder.svg';

  updateSaveButtons();

  if (open) {
    els.detailsPanel.classList.remove('hidden');
    els.aircraftList.classList.remove('open');
  }

  // NEW: Fetch enhanced metadata in background
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
    }
  } catch (e) {
    console.warn('Enhanced metadata fetch failed:', e);
  }

  // Fetch photo
  const photo = await loadPhoto(aircraft);
  if (
    state.selected &&
    aircraftKey(state.selected) === aircraftKey(aircraft) &&
    photo?.image
  ) {
    els.aircraftPhoto.src = photo.image;
  }
}

/**
 * Draw flight route on map
 * @param {Array} waypoints - Array of {lat, lon} points
 * @param {string} color - Line color
 */
function drawFlightRoute(waypoints, color = '#1597e5') {
  if (!waypoints || waypoints.length < 2) return;

  const latlngs = waypoints.map(point => [point.lat, point.lon]);
  
  // Draw the route
  const polyline = L.polyline(latlngs, {
    color: color,
    weight: 2,
    opacity: 0.7,
    dashArray: '5, 10',
    className: 'flight-route'
  }).addTo(state.map);

  // Fit map to route with padding
  if (latlngs.length > 0) {
    state.map.fitBounds(polyline.getBounds().pad(0.1));
  }

  return polyline;
}

/**
 * Add a flight history panel to details
 */
async function showFlightHistory() {
  if (!state.selected) return;

  setStatus('Loading flight history...', false);
  
  try {
    const history = await fetchFlightHistory(state.selected.hex);
    
    if (history && history.recentFlights) {
      let historyHtml = '<div class="flight-history"><h4>Recent Flights (7 days)</h4>';
      
      history.recentFlights.slice(0, 5).forEach((flight, index) => {
        const depTime = new Date(flight.firstSeen).toLocaleString();
        const arrTime = new Date(flight.lastSeen).toLocaleString();
        historyHtml += `
          <div class="history-item">
            <small>Flight ${index + 1}</small>
            <strong>${flight.callsign || 'Unknown'}</strong>
            <p>${flight.estDepartureAirport || '?'} → ${flight.estArrivalAirport || '?'}</p>
            <small>${depTime}</small>
          </div>
        `;
      });
      
      historyHtml += '</div>';
      
      // Append to details panel
      const historyContainer = document.createElement('div');
      historyContainer.innerHTML = historyHtml;
      els.detailsPanel.appendChild(historyContainer);
      
      setStatus('Flight history loaded', true);
    }
  } catch (error) {
    setStatus('Could not load flight history', false);
    console.error('History error:', error);
  }
}

// Export functions for use in main tracker.js
window.AviQuestEnhanced = {
  fetchAircraftMetadata,
  fetchAirportInfo,
  fetchFlightHistory,
  selectAircraftEnhanced,
  drawFlightRoute,
  showFlightHistory
};
