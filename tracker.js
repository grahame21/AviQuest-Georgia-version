'use strict';

const POLL_MS = 5000;
let state = {
  map: null,
  aircraft: [],
  markers: new Map(),
  selected: null,
  user: null,
  pollTimer: null,
  filter: 'all',
  settings: loadSettings()
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
  state.map = L.map('map').setView([-25, 134], 4);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(state.map);

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
      radius: 6,
      fillColor: '#1e90ff',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(state.map).bindTooltip('Your location');
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
    updateStats();
    updateStatus(true);
  } catch (error) {
    updateStatus(false, error.message);
  }
}

function renderAircraft() {
  const filtered = filterAircraft();
  const list = document.getElementById('aircraftList');
  list.innerHTML = '';
  
  filtered.slice(0, 100).forEach(aircraft => {
    const item = document.createElement('div');
    item.className = 'aircraft-item';
    item.dataset.hex = aircraft.hex;
    
    const callsign = clean(aircraft.callsign) || clean(aircraft.registration) || aircraft.hex.toUpperCase();
    const reg = clean(aircraft.registration) || '—';
    const type = clean(aircraft.type) || 'Unknown';
    const isMilitary = aircraft.isMilitary;
    
    const distance = state.user ? 
      calculateDistance(state.user.lat, state.user.lon, aircraft.lat, aircraft.lon) : null;
    
    item.innerHTML = `
      <div class="aircraft-callsign">${callsign}</div>
      <div class="aircraft-details">
        <div class="detail-line"><span class="detail-value">${reg}</span></div>
        <div class="detail-line">${formatAlt(aircraft.altitude)} / ${formatSpeed(aircraft.speed)}</div>
        <div class="detail-line">${type}</div>
        <div class="detail-line">${distance ? distance.toFixed(1) + ' km' : 'N/A'}</div>
      </div>
      <span class="aircraft-badge ${isMilitary ? 'badge-military' : 'badge-civil'}">
        ${isMilitary ? 'MILITARY' : 'CIVIL'}
      </span>
    `;
    
    item.addEventListener('click', () => selectAircraft(aircraft, item));
    list.appendChild(item);
    
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
  const isMilitary = aircraft.isMilitary;
  
  if (state.markers.has(key)) {
    state.markers.get(key).setLatLng([aircraft.lat, aircraft.lon]);
  } else {
    const icon = L.divIcon({
      className: 'aircraft-marker ' + (isMilitary ? 'military' : 'civil'),
      html: '✈',
      iconSize: [28, 28]
    });
    
    const marker = L.marker([aircraft.lat, aircraft.lon], { icon })
      .addTo(state.map)
      .on('click', () => selectAircraft(aircraft));
    
    state.markers.set(key, marker);
  }
}

function selectAircraft(aircraft, element) {
  state.selected = aircraft;
  
  // Update selection
  document.querySelectorAll('.aircraft-item').forEach(el => {
    el.classList.remove('selected');
  });
  if (element) element.classList.add('selected');
  
  // Update marker
  state.markers.forEach((marker, hex) => {
    if (hex === aircraft.hex) {
      marker.setIcon(L.divIcon({
        className: 'aircraft-marker ' + (aircraft.isMilitary ? 'military' : 'civil') + ' selected',
        html: '✈',
        iconSize: [32, 32]
      }));
    }
  });
  
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
  
  // Hide sidebar on mobile
  closeSidebar();
}

function filterAircraft() {
  let list = state.aircraft;
  const filter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
  const query = document.getElementById('searchInput').value.toLowerCase();
  
  if (filter === 'civil') {
    list = list.filter(a => !a.isMilitary);
  } else if (filter === 'military') {
    list = list.filter(a => a.isMilitary);
  }
  
  if (query) {
    list = list.filter(a => {
      const callsign = clean(a.callsign).toLowerCase();
      const reg = clean(a.registration).toLowerCase();
      const hex = a.hex.toLowerCase();
      return callsign.includes(query) || reg.includes(query) || hex.includes(query);
    });
  }
  
  return list;
}

function updateStats() {
  document.getElementById('aircraftCount').textContent = `${state.aircraft.length} aircraft`;
}

function updateStatus(live, message = null) {
  const status = document.getElementById('statusText');
  if (live) {
    status.textContent = 'Live · OpenSky';
  } else {
    status.textContent = message || 'Offline';
  }
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
  if (num === 0) return 'GND';
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

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('visible');
}

function closeSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('visible');
  }
}

// Event Listeners
document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);

document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.add('show');
});

document.getElementById('saveSettings').addEventListener('click', () => {
  const settings = {
    updateFreq: parseInt(document.getElementById('updateFreq').value || POLL_MS),
    weatherSource: document.getElementById('weatherSource').value
  };
  saveSettings(settings);
  state.settings = settings;
  
  // Restart polling with new frequency
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(loadAircraft, settings.updateFreq);
  
  document.getElementById('settingsModal').classList.remove('show');
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderAircraft();
  });
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderAircraft();
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('toggleSidebar');
  if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
    closeSidebar();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', initMap);
