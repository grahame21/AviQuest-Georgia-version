'use strict';

const POLL_MS = 5000;
let state = {
  map: null,
  aircraft: [],
  markers: new Map(),
  selected: null,
  user: null,
  pollTimer: null,
  mapType: 'standard',
  settings: loadSettings()
};

const mapLayers = {
  standard: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: '© Esri'
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: '© Esri'
  }),
  hybrid: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: '© Esri'
  })
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('aviquest_settings') || '{}');
  } catch {
    return {};
  }
}

function initMap() {
  state.map = L.map('map', {
    zoomControl: false,
    preferCanvas: true
  }).setView([-25, 134], 6);
  
  const mapType = state.settings.mapType || 'standard';
  mapLayers[mapType].addTo(state.map);
  state.currentLayer = mapLayers[mapType];
  state.mapType = mapType;

  // Listen for settings changes
  window.addEventListener('settingsChanged', (e) => {
    const settings = e.detail;
    
    // Handle map type change
    if (settings.mapType && settings.mapType !== state.mapType) {
      state.map.removeLayer(state.currentLayer);
      state.currentLayer = mapLayers[settings.mapType];
      state.currentLayer.addTo(state.map);
      state.mapType = settings.mapType;
    }
  });

  getLocation();
  loadAircraft();
  
  state.pollTimer = setInterval(loadAircraft, POLL_MS);
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
    console.error('Error loading aircraft:', error);
  }
}

function renderAircraft() {
  const filtered = filterAircraft();
  
  filtered.forEach(aircraft => {
    renderMarker(aircraft);
  });
  
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
    const marker = state.markers.get(key);
    marker.setLatLng([aircraft.lat, aircraft.lon]);
    const icon = L.divIcon({
      className: 'aircraft-marker',
      html: `<div style="transform: rotate(${rotation}deg); font-size: 24px;">✈</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    marker.setIcon(icon);
  } else {
    const icon = L.divIcon({
      className: 'aircraft-marker',
      html: `<div style="transform: rotate(${rotation}deg); font-size: 24px;">✈</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    const callsign = clean(aircraft.callsign) || clean(aircraft.registration) || aircraft.hex.toUpperCase();
    const marker = L.marker([aircraft.lat, aircraft.lon], { icon })
      .addTo(state.map)
      .on('click', () => selectAircraft(aircraft))
      .bindTooltip(callsign, { permanent: false });
    
    state.markers.set(key, marker);
  }
}

function renderSidebar() {
  const filtered = filterAircraft();
  const list = document.getElementById('aircraftList');
  list.innerHTML = '';
  
  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">No aircraft found</div>';
    return;
  }
  
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
    
    const altUnit = state.settings.altitudeUnitSelect === 'm' ? 'm' : 'ft';
    const altitude = state.settings.altitudeUnitSelect === 'm' ? 
      Math.round(Number(aircraft.altitude) * 0.3048) : aircraft.altitude;
    
    const speedUnit = state.settings.speedUnitSelect || 'kt';
    const speedConversions = { kmh: 1.852, mph: 1.15078, kt: 1 };
    const speed = Math.round(Number(aircraft.speed) * (speedConversions[speedUnit] || 1));
    
    item.innerHTML = `
      <div class="aircraft-callsign">${callsign}</div>
      <div class="aircraft-details">
        <div>${reg} • ${type}</div>
        <div>${formatNumber(altitude)} ${altUnit} • ${speed} ${speedUnit}</div>
        ${distance ? `<div>${formatDistance(distance)}</div>` : ''}
      </div>
    `;
    
    item.addEventListener('click', () => selectAircraft(aircraft));
    list.appendChild(item);
  });
}

function filterAircraft() {
  let list = state.aircraft;
  
  const mainSearch = document.getElementById('searchInput').value.toLowerCase();
  const sidebarSearch = document.getElementById('sidebarSearch').value.toLowerCase();
  const query = mainSearch || sidebarSearch;
  
  list = list.filter(a => {
    const altitude = Number(a.altitude) || 0;
    const speed = Number(a.speed) || 0;
    
    // Traffic type filters
    const isAirborne = altitude > 0;
    const isGround = altitude === 0;
    const isHeli = clean(a.type).toUpperCase().includes('H');
    const isMilitary = clean(a.callsign).toUpperCase().match(/MIL|USAF|NAVY|ARMY|COAST|RAF|RAAF/);
    
    if (isAirborne && !state.settings.traffic_airborne) return false;
    if (isGround && !state.settings.traffic_ground) return false;
    if (isHeli && !state.settings.traffic_heli) return false;
    if (isMilitary && !state.settings.traffic_military) return false;
    
    // Data source filters
    if (!state.settings.source_adsb && a.source === 'adsb') return false;
    if (!state.settings.source_mlat && a.source === 'mlat') return false;
    
    // Search filter
    if (query) {
      const callsign = clean(a.callsign).toLowerCase();
      const reg = clean(a.registration).toLowerCase();
      const hex = a.hex.toLowerCase();
      const operator = clean(a.operator).toLowerCase();
      if (!callsign.includes(query) && !reg.includes(query) && !hex.includes(query) && !operator.includes(query)) {
        return false;
      }
    }
    
    return true;
  });
  
  return list.sort((a, b) => {
    if (state.user) {
      const distA = calculateDistance(state.user.lat, state.user.lon, a.lat, a.lon);
      const distB = calculateDistance(state.user.lat, state.user.lon, b.lat, b.lon);
      return distA - distB;
    }
    return 0;
  });
}

function selectAircraft(aircraft) {
  state.selected = aircraft;
  
  document.querySelectorAll('.aircraft-item').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`[data-hex="${aircraft.hex}"]`)?.classList.add('selected');
  
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
  
  const panel = document.getElementById('infoPanel');
  const altUnit = state.settings.altitudeUnitSelect === 'm' ? 'm' : 'ft';
  const altitude = state.settings.altitudeUnitSelect === 'm' ? 
    Math.round(Number(aircraft.altitude) * 0.3048) : aircraft.altitude;
  
  const speedUnit = state.settings.speedUnitSelect || 'kt';
  const speedConversions = { kmh: 1.852, mph: 1.15078, kt: 1 };
  const speed = Math.round(Number(aircraft.speed) * (speedConversions[speedUnit] || 1));
  
  document.getElementById('infoCallsign').textContent = 
    clean(aircraft.callsign) || clean(aircraft.registration) || aircraft.hex;
  document.getElementById('infoAltitude').textContent = formatNumber(altitude) + ' ' + altUnit;
  document.getElementById('infoSpeed').textContent = speed + ' ' + speedUnit;
  document.getElementById('infoReg').textContent = clean(aircraft.registration) || '—';
  document.getElementById('infoHeading').textContent = formatHeading(aircraft.track);
  
  if (state.user) {
    const dist = calculateDistance(state.user.lat, state.user.lon, aircraft.lat, aircraft.lon);
    const distUnit = state.settings.distanceUnitSelect || 'km';
    document.getElementById('infoDistance').textContent = formatDistance(dist, distUnit);
  }
  
  document.getElementById('infoOperator').textContent = clean(aircraft.operator) || '—';
  panel.classList.add('visible');
  
  state.map.setView([aircraft.lat, aircraft.lon], 10);
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

function formatDistance(km, unit = 'km') {
  if (!km) return '—';
  const conversions = { 
    km: { factor: 1, label: 'km' },
    mi: { factor: 0.621371, label: 'mi' },
    nm: { factor: 0.539957, label: 'nm' }
  };
  const conv = conversions[unit] || conversions.km;
  return (km * conv.factor).toFixed(1) + ' ' + conv.label;
}

function formatNumber(num) {
  if (!num && num !== 0) return '—';
  return Math.round(Number(num)).toLocaleString();
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

document.getElementById('compassBtn').addEventListener('click', () => {
  if (state.user) {
    state.map.setView([state.user.lat, state.user.lon], state.map.getZoom());
  } else {
    alert('Getting your location...');
    getLocation();
  }
});

document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const listBtn = document.getElementById('listBtn');
  if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !listBtn.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

document.addEventListener('DOMContentLoaded', initMap);
