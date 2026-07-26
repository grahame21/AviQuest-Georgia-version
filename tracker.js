'use strict';

const POLL_MS = 5000;
let state = {
  map: null,
  aircraft: [],
  markers: new Map(),
  selected: null,
  user: null,
  pollTimer: null,
  mapType: 'satellite',
  settings: loadSettings()
};

const mapLayers = {
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: '© Esri'
  }),
  terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenStreetMap'
  }),
  street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  })
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('tracker_settings') || '{}');
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem('tracker_settings', JSON.stringify(settings));
}

function initMap() {
  state.map = L.map('map', {
    zoomControl: true,
    preferCanvas: true
  }).setView([-25, 134], 4);
  
  // Add satellite layer by default
  mapLayers.satellite.addTo(state.map);
  state.currentLayer = mapLayers.satellite;

  getLocation();
  loadAircraft();
  
  state.pollTimer = setInterval(loadAircraft, state.settings.updateFreq || POLL_MS);
}

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      state.user = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      updateUserMarker();
      loadAircraft(true);
    });
  }
}

function updateUserMarker() {
  if (!state.user) return;
  
  if (state.userMarker) {
    state.userMarker.setLatLng([state.user.lat, state.user.lon]);
  } else {
    state.userMarker = L.circleMarker([state.user.lat, state.user.lon], {
      radius: 8,
      fillColor: '#0066ff',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(state.map).bindTooltip('Your location', { permanent: false });
  }
}

async function loadAircraft(force = false) {
  try {
    const center = state.map.getCenter();
    const url = `/.netlify/functions/nearby-aircraft?lat=${center.lat}&lon=${center.lng}&radius=150&_=${Date.now()}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error || 'Failed to load aircraft');
    
    state.aircraft = data.aircraft || [];
    renderAircraft();
    renderSidebar();
  } catch (error) {
    console.error(error);
  }
}

function renderAircraft() {
  const filtered = filterAircraft();
  
  filtered.forEach(aircraft => {
    renderMarker(aircraft);
  });
  
  // Remove old markers
  state.markers.forEach((marker, hex) => {
    if (!filtered.find(a => a.hex === hex)) {
      state.map.removeLayer(marker);
      state.markers.delete(hex);
    }
  });
}

function renderMarker(aircraft) {
  const key = aircraft.hex;
  const rotation = Number.isFinite(Number(aircraft.track)) ? Number(aircraft.track) : 0;
  
  if (state.markers.has(key)) {
    state.markers.get(key).setLatLng([aircraft.lat, aircraft.lon]);
  } else {
    const icon = L.divIcon({
      className: 'aircraft-marker',
      html: `<div style="transform: rotate(${rotation}deg); font-size: 24px;">✈</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    const marker = L.marker([aircraft.lat, aircraft.lon], { icon })
      .addTo(state.map)
      .on('click', () => selectAircraft(aircraft))
      .bindTooltip(`${clean(aircraft.callsign) || aircraft.hex}`, { permanent: false });
    
    state.markers.set(key, marker);
  }
}

function renderSidebar() {
  const filtered = filterAircraft();
  const list = document.getElementById('aircraftList');
  list.innerHTML = '';
  
  filtered.slice(0, 50).forEach(aircraft => {
    const item = document.createElement('div');
    item.className = 'aircraft-item';
    if (state.selected && state.selected.hex === aircraft.hex) {
      item.classList.add('selected');
    }
    item.dataset.hex = aircraft.hex;
    
    const callsign = clean(aircraft.callsign) || clean(aircraft.registration) || aircraft.hex.toUpperCase();
    const reg = clean(aircraft.registration) || '—';
    const type = clean(aircraft.type) || 'Unknown';
    const distance = state.user ? 
      calculateDistance(state.user.lat, state.user.lon, aircraft.lat, aircraft.lon) : null;
    
    item.innerHTML = `
      <div class="aircraft-callsign">${callsign}</div>
      <div class="aircraft-details">
        <div>${reg} • ${type}</div>
        <div>${formatAlt(aircraft.altitude)} • ${formatSpeed(aircraft.speed)}</div>
        ${distance ? `<div>${distance.toFixed(1)} km away</div>` : ''}
      </div>
    `;
    
    item.addEventListener('click', () => selectAircraft(aircraft));
    list.appendChild(item);
  });
}

function selectAircraft(aircraft) {
  state.selected = aircraft;
  
  // Update sidebar selection
  document.querySelectorAll('.aircraft-item').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`[data-hex="${aircraft.hex}"]`)?.classList.add('selected');
  
  // Update marker rotation
  const marker = state.markers.get(aircraft.hex);
  if (marker) {
    const rotation = Number.isFinite(Number(aircraft.track)) ? Number(aircraft.track) : 0;
    const icon = L.divIcon({
      className: 'aircraft-marker',
      html: `<div style="transform: rotate(${rotation}deg); font-size: 28px; filter: drop-shadow(0 0 8px rgba(0, 102, 255, 0.8));">✈</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    marker.setIcon(icon);
  }
  
  // Show info panel
  const panel = document.getElementById('infoPanel');
  document.getElementById('infoCallsign').textContent = 
    clean(aircraft.callsign) || clean(aircraft.registration) || aircraft.hex;
  document.getElementById('infoAltitude').textContent = formatAlt(aircraft.altitude);
  document.getElementById('infoSpeed').textContent = formatSpeed(aircraft.speed);
  document.getElementById('infoReg').textContent = clean(aircraft.registration) || '—';
  document.getElementById('infoHeading').textContent = formatHeading(aircraft.track);
  
  if (state.user) {
    const dist = calculateDistance(state.user.lat, state.user.lon, aircraft.lat, aircraft.lon);
    document.getElementById('infoDistance').textContent = dist.toFixed(1) + ' km';
  }
  
  document.getElementById('infoOperator').textContent = clean(aircraft.operator) || '—';
  panel.classList.add('visible');
  
  // Center on aircraft
  state.map.setView([aircraft.lat, aircraft.lon], 10);
}

function filterAircraft() {
  let list = state.aircraft;
  const query = document.getElementById('searchInput').value.toLowerCase();
  
  if (query) {
    list = list.filter(a => {
      const callsign = clean(a.callsign).toLowerCase();
      const reg = clean(a.registration).toLowerCase();
      const hex = a.hex.toLowerCase();
      const operator = clean(a.operator).toLowerCase();
      return callsign.includes(query) || reg.includes(query) || hex.includes(query) || operator.includes(query);
    });
  }
  
  return list;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function formatAlt(feet) {
  if (!feet) return '—';
  const num = Number(feet);
  if (num === 0) return 'Ground';
  return Math.round(num).toLocaleString() + ' ft';
}

function formatSpeed(knots) {
  if (!knots) return '—';
  return Math.round(Number(knots)) + ' kt';
}

function formatHeading(degrees) {
  if (!degrees) return '—';
  const deg = Number(degrees);
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return Math.round(deg) + '° ' + names[index];
}

function clean(value) {
  return String(value || '').trim();
}

// Event Listeners
document.getElementById('searchInput').addEventListener('input', () => {
  renderSidebar();
});

document.getElementById('sidebarSearch').addEventListener('input', () => {
  renderSidebar();
});

document.getElementById('listBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('layersBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.add('show');
});

document.getElementById('saveSettings').addEventListener('click', () => {
  const newMapType = document.getElementById('mapType').value;
  const settings = {
    updateFreq: parseInt(document.getElementById('updateFreq').value || POLL_MS),
    mapType: newMapType
  };
  
  saveSettings(settings);
  state.settings = settings;
  
  // Change map layer
  if (newMapType !== state.mapType) {
    state.map.removeLayer(state.currentLayer);
    state.currentLayer = mapLayers[newMapType];
    state.currentLayer.addTo(state.map);
    state.mapType = newMapType;
  }
  
  // Restart polling
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(loadAircraft, settings.updateFreq);
  
  document.getElementById('settingsModal').classList.remove('show');
});

document.getElementById('arBtn').addEventListener('click', () => {
  if (!state.selected) {
    alert('Please select an aircraft first');
    return;
  }
  const reg = clean(state.selected.registration) || clean(state.selected.hex);
  window.location.href = `ar.html?aircraft=${encodeURIComponent(reg)}`;
});

document.getElementById('favBtn').addEventListener('click', () => {
  alert('Favorites feature coming soon!');
});

document.getElementById('volumeBtn').addEventListener('click', () => {
  alert('Volume control coming soon!');
});

document.getElementById('compassBtn').addEventListener('click', () => {
  if (state.user) {
    state.map.setView([state.user.lat, state.user.lon], state.map.getZoom());
  }
});

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const listBtn = document.getElementById('listBtn');
  if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !listBtn.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', initMap);
