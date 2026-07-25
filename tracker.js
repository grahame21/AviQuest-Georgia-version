'use strict';

const POLL_MS = 5000;
const ANIMATION_MS = 250;
const FREE_FAVOURITE_LIMIT = 5;
const FREE_SAVED_LIMIT = 10;

const elementIds = [
  'backBtn','refreshBtn','topArBtn','searchInput','clearSearch','locateBtn','favouritesBtn','savedBtn',
  'favouriteCount','savedCount','statusText','aircraftCount','listToggle','listCount','aircraftList',
  'detailsPanel','closeDetails','aircraftPhoto','detailStatus','detailCallsign','detailReg','detailType',
  'detailOperator','detailClass','detailDistance','detailAltitude','detailSpeed','detailHeading',
  'detailVerticalRate','detailSquawk','detailSource','detailSeen','militaryNote','centreAircraft','openAr',
  'saveFavourite','saveItem','liveDot','navNearby','navA7','navAr','navHome','trafficAll','trafficCivil',
  'trafficMilitary','allTrafficCount','civilTrafficCount','militaryTrafficCount'
];
const els = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));

const state = {
  map: null,
  user: null,
  aircraft: [],
  markers: new Map(),
  userMarker: null,
  selected: null,
  pollTimer: null,
  animationTimer: null,
  photoCache: new Map(),
  loading: false,
  listFilter: 'all',
  trafficFilter: 'all',
  lastRequestCentre: null,
  favourites: readStore('aviquest_favourites'),
  saved: readStore('aviquest_saved')
};

function initialiseMap() {
  state.map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
    worldCopyJump: true,
    minZoom: 2
  }).setView([-25, 134], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
  }).addTo(state.map);

  state.map.on('moveend zoomend', debounce(() => loadVisibleAircraft(false), 450));
}

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  updateSavedCounts();
}

function updateSavedCounts() {
  els.favouriteCount.textContent = state.favourites.length;
  els.savedCount.textContent = state.saved.length;
}

function itemIdentity(aircraft) {
  return clean(aircraft.registration) || clean(aircraft.hex) || clean(aircraft.callsign);
}

function getLocation(recentre = true) {
  if (!navigator.geolocation) {
    setStatus('Location is not supported on this device.', false);
    return;
  }

  setStatus('Finding your location…', false);
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.user = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      drawUser(recentre);
      loadVisibleAircraft(true);
    },
    (error) => {
      setStatus(
        error.code === 1
          ? 'Location permission is needed for My location.'
          : 'Could not get your location.',
        false
      );
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
  );
}

function drawUser(recentre) {
  if (!state.user) return;

  const icon = L.divIcon({
    className: '',
    html: '<div class="user-pin"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  if (!state.userMarker) {
    state.userMarker = L.marker([state.user.lat, state.user.lon], {
      icon,
      zIndexOffset: 1000
    }).addTo(state.map).bindTooltip('Your location');
  } else {
    state.userMarker.setLatLng([state.user.lat, state.user.lon]);
  }

  if (recentre) state.map.flyTo([state.user.lat, state.user.lon], 8);
}

function requestGeometry() {
  const centre = state.map.getCenter();
  const bounds = state.map.getBounds();
  const edgeKm = haversineKm(centre.lat, centre.lng, bounds.getNorth(), bounds.getEast());

  return {
    lat: centre.lat,
    lon: centre.lng,
    radiusNm: Math.max(10, Math.min(250, Math.ceil((edgeKm / 1.852) * 1.15)))
  };
}

async function loadVisibleAircraft(force = false) {
  if (state.loading) return;

  const geometry = requestGeometry();
  if (
    !force &&
    state.lastRequestCentre &&
    haversineKm(
      geometry.lat,
      geometry.lon,
      state.lastRequestCentre.lat,
      state.lastRequestCentre.lon
    ) < 4 &&
    geometry.radiusNm === state.lastRequestCentre.radiusNm
  ) {
    return;
  }

  state.loading = true;
  state.lastRequestCentre = geometry;
  setStatus('Updating civil and military aircraft…', false);

  try {
    const url = `/.netlify/functions/nearby-aircraft?lat=${geometry.lat.toFixed(5)}&lon=${geometry.lon.toFixed(5)}&radius=${geometry.radiusNm}&_=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Live aircraft request failed');

    const now = Date.now();
    state.aircraft = (data.aircraft || [])
      .map((aircraft) => enrichAircraft(aircraft, now))
      .sort((a, b) => compareDistances(a.distanceKm, b.distanceKm));

    updateTrafficCounts();
    renderMarkers();
    renderList();

    const stamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setStatus(`${data.source || 'Live ADS-B'} • ${stamp}`, true);
    updateVisibleCount();

    if (state.selected) {
      const updated = state.aircraft.find(
        (aircraft) => aircraftKey(aircraft) === aircraftKey(state.selected)
      );
      if (updated) selectAircraft(updated, false);
    }
  } catch (error) {
    setStatus(error.message || 'Unable to load aircraft.', false);
  } finally {
    state.loading = false;
  }
}

function enrichAircraft(aircraft, now) {
  const distanceKm = state.user
    ? haversineKm(state.user.lat, state.user.lon, aircraft.lat, aircraft.lon)
    : null;
  const old = state.aircraft.find((item) => aircraftKey(item) === aircraftKey(aircraft));

  return {
    ...aircraft,
    isMilitary: Boolean(aircraft.isMilitary),
    distanceKm,
    displayName:
      clean(aircraft.callsign) ||
      clean(aircraft.registration) ||
      clean(aircraft.hex).toUpperCase() ||
      'Unknown aircraft',
    fromLat: old?.renderLat ?? old?.lat ?? aircraft.lat,
    fromLon: old?.renderLon ?? old?.lon ?? aircraft.lon,
    toLat: aircraft.lat,
    toLon: aircraft.lon,
    renderLat: old?.renderLat ?? aircraft.lat,
    renderLon: old?.renderLon ?? aircraft.lon,
    transitionStart: now
  };
}

function compareDistances(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function animateMarkers() {
  const now = Date.now();
  const duration = Math.max(POLL_MS, 1000);

  for (const aircraft of state.aircraft) {
    const progress = Math.min(1, (now - aircraft.transitionStart) / duration);
    aircraft.renderLat = aircraft.fromLat + (aircraft.toLat - aircraft.fromLat) * progress;
    aircraft.renderLon = aircraft.fromLon + (aircraft.toLon - aircraft.fromLon) * progress;

    const marker = state.markers.get(aircraftKey(aircraft));
    if (marker) marker.setLatLng([aircraft.renderLat, aircraft.renderLon]);
  }
}

function trafficAircraft() {
  if (state.trafficFilter === 'military') {
    return state.aircraft.filter((aircraft) => aircraft.isMilitary);
  }
  if (state.trafficFilter === 'civil') {
    return state.aircraft.filter((aircraft) => !aircraft.isMilitary);
  }
  return state.aircraft;
}

function renderMarkers() {
  const active = new Set();

  trafficAircraft().forEach((aircraft) => {
    const key = aircraftKey(aircraft);
    active.add(key);
    const selected = state.selected && aircraftKey(state.selected) === key;
    const icon = aircraftIcon(aircraft, selected);
    let marker = state.markers.get(key);

    if (!marker) {
      marker = L.marker([aircraft.renderLat, aircraft.renderLon], {
        icon,
        riseOnHover: true
      }).addTo(state.map);
      state.markers.set(key, marker);
    } else {
      marker.setIcon(icon);
    }

    const category = aircraft.isMilitary ? 'Military' : 'Civil';
    marker.off('click').on('click', () => selectAircraft(aircraft));
    marker.bindTooltip(
      `<b>${escapeHtml(aircraft.displayName)}</b><br>${category} • ${
        aircraft.distanceKm === null ? 'Visible map area' : formatDistance(aircraft.distanceKm)
      }`,
      { direction: 'top', offset: [0, -14] }
    );
  });

  for (const [key, marker] of state.markers) {
    if (!active.has(key)) {
      state.map.removeLayer(marker);
      state.markers.delete(key);
    }
  }
}

function aircraftIcon(aircraft, selected) {
  const ground = Number(aircraft.altitude) === 0;
  const rotation = Number.isFinite(Number(aircraft.track)) ? Number(aircraft.track) : 0;
  const emergency = clean(aircraft.emergency).toLowerCase();
  const isEmergency = emergency && emergency !== 'none';
  const classes = [
    'plane-marker',
    aircraft.isMilitary ? 'military' : 'civil',
    ground ? 'ground' : '',
    selected ? 'selected' : '',
    isEmergency ? 'emergency' : ''
  ].filter(Boolean).join(' ');

  return L.divIcon({
    className: 'aircraft-icon',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="${classes}" style="transform:rotate(${rotation}deg)">✈</div>`
  });
}

function filteredAircraft() {
  let list = trafficAircraft();
  const query = els.searchInput.value.trim().toLowerCase();

  if (state.listFilter === 'favourites') {
    list = list.filter((aircraft) => state.favourites.includes(itemIdentity(aircraft)));
  }

  if (state.listFilter === 'saved') {
    list = list.filter((aircraft) =>
      state.saved.some((savedItem) => savedItem.id === itemIdentity(aircraft))
    );
  }

  if (query) {
    list = list.filter((aircraft) =>
      [
        aircraft.callsign,
        aircraft.registration,
        aircraft.hex,
        aircraft.type,
        aircraft.description,
        aircraft.operator,
        aircraft.category,
        aircraft.squawk
      ].some((value) => clean(value).toLowerCase().includes(query))
    );
  }

  return list;
}

function renderList() {
  const list = filteredAircraft();
  els.listCount.textContent = list.length;

  if (!list.length) {
    els.aircraftList.innerHTML = '<div class="empty-list">No matching aircraft are loaded in the visible map area. Pan or zoom the map to search another region.</div>';
    return;
  }

  els.aircraftList.innerHTML = '';
  list.slice(0, 150).forEach((aircraft) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `aircraft-row${aircraft.isMilitary ? ' military-row' : ''}`;
    const classification = aircraft.isMilitary ? 'MILITARY' : 'CIVIL';
    const secondary = clean(aircraft.registration) || clean(aircraft.type) || 'Live aircraft';

    button.innerHTML = `
      <img src="images/aircraft-placeholder.svg" alt="">
      <div>
        <strong>${escapeHtml(aircraft.displayName)}</strong>
        <small><span class="aircraft-badge ${aircraft.isMilitary ? 'military-badge' : 'civil-badge'}">${classification}</span> ${escapeHtml(secondary)}</small>
      </div>
      <span class="distance">${aircraft.distanceKm === null ? 'On map' : formatDistance(aircraft.distanceKm)}</span>
    `;

    button.addEventListener('click', () => selectAircraft(aircraft));
    els.aircraftList.appendChild(button);

    loadPhoto(aircraft).then((photo) => {
      if (photo?.thumbnail) button.querySelector('img').src = photo.thumbnail;
    });
  });
}

async function selectAircraft(aircraft, open = true) {
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

  const photo = await loadPhoto(aircraft);
  if (
    state.selected &&
    aircraftKey(state.selected) === aircraftKey(aircraft) &&
    photo?.image
  ) {
    els.aircraftPhoto.src = photo.image;
  }
}

async function loadPhoto(aircraft) {
  const key = clean(aircraft.registration) || clean(aircraft.hex);
  if (!key) return null;
  if (state.photoCache.has(key)) return state.photoCache.get(key);

  const promise = fetch(
    `/.netlify/functions/aircraft-photo?registration=${encodeURIComponent(clean(aircraft.registration))}&hex=${encodeURIComponent(clean(aircraft.hex))}`
  )
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  state.photoCache.set(key, promise);
  return promise;
}

function toggleFavourite() {
  if (!state.selected) return;

  const id = itemIdentity(state.selected);
  const index = state.favourites.indexOf(id);

  if (index >= 0) {
    state.favourites.splice(index, 1);
  } else {
    if (state.favourites.length >= FREE_FAVOURITE_LIMIT) {
      setStatus(`Free accounts can save ${FREE_FAVOURITE_LIMIT} favourites.`, false);
      return;
    }
    state.favourites.push(id);
  }

  writeStore('aviquest_favourites', state.favourites);
  updateSaveButtons();
  renderList();
}

function toggleSaved() {
  if (!state.selected) return;

  const id = itemIdentity(state.selected);
  const index = state.saved.findIndex((savedItem) => savedItem.id === id);

  if (index >= 0) {
    state.saved.splice(index, 1);
  } else {
    if (state.saved.length >= FREE_SAVED_LIMIT) {
      setStatus(`Free accounts can save ${FREE_SAVED_LIMIT} items.`, false);
      return;
    }

    state.saved.push({
      id,
      name: state.selected.displayName,
      registration: clean(state.selected.registration),
      type: clean(state.selected.type),
      isMilitary: Boolean(state.selected.isMilitary)
    });
  }

  writeStore('aviquest_saved', state.saved);
  updateSaveButtons();
  renderList();
}

function updateSaveButtons() {
  if (!state.selected) return;

  const id = itemIdentity(state.selected);
  els.saveFavourite.textContent = state.favourites.includes(id)
    ? '★ Favourited'
    : '☆ Favourite';
  els.saveItem.textContent = state.saved.some((savedItem) => savedItem.id === id)
    ? '▣ Saved'
    : '▣ Save aircraft';
}

function setListFilter(filter) {
  state.listFilter = state.listFilter === filter ? 'all' : filter;
  els.favouritesBtn.classList.toggle('active', state.listFilter === 'favourites');
  els.savedBtn.classList.toggle('active', state.listFilter === 'saved');
  renderList();
  els.aircraftList.classList.add('open');
}

function setTrafficFilter(filter) {
  state.trafficFilter = filter;
  [els.trafficAll, els.trafficCivil, els.trafficMilitary].forEach((button) => {
    button.classList.toggle('active', button.dataset.trafficFilter === filter);
  });

  if (state.selected && !trafficAircraft().some((aircraft) => aircraftKey(aircraft) === aircraftKey(state.selected))) {
    state.selected = null;
    els.detailsPanel.classList.add('hidden');
  }

  renderMarkers();
  renderList();
  updateVisibleCount();
}

function updateTrafficCounts() {
  const military = state.aircraft.filter((aircraft) => aircraft.isMilitary).length;
  const civil = state.aircraft.length - military;
  els.allTrafficCount.textContent = state.aircraft.length;
  els.civilTrafficCount.textContent = civil;
  els.militaryTrafficCount.textContent = military;
}

function updateVisibleCount() {
  const visible = trafficAircraft().length;
  els.aircraftCount.textContent = `${visible} aircraft`;
  els.listCount.textContent = filteredAircraft().length;
}

function searchA7() {
  els.searchInput.value = 'A7-BAF';
  state.listFilter = 'all';
  setTrafficFilter('all');
  renderList();
  els.aircraftList.classList.add('open');

  const a7 = state.aircraft.find(
    (aircraft) => clean(aircraft.registration).toUpperCase() === 'A7-BAF'
  );

  if (a7) {
    selectAircraft(a7);
    state.map.flyTo([a7.lat, a7.lon], 8);
  } else {
    setStatus(
      'A7-BAF is not in the currently loaded map area. Pan to its region or add a worldwide registration-search provider.',
      false
    );
  }
}

function openAr() {
  const id = state.selected ? itemIdentity(state.selected) : '';
  location.href = `ar.html${id ? `?aircraft=${encodeURIComponent(id)}` : ''}`;
}

function setStatus(text, live) {
  els.statusText.textContent = text;
  els.liveDot.classList.toggle('live', Boolean(live));
}

function aircraftKey(aircraft) {
  return (
    clean(aircraft.hex) ||
    clean(aircraft.registration) ||
    `${aircraft.lat},${aircraft.lon},${aircraft.callsign}`
  );
}

function clean(value) {
  return String(value ?? '').trim();
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDifference = toRadians(lat2 - lat1);
  const longitudeDifference = toRadians(lon2 - lon1);
  const h =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function formatAltitude(feet) {
  if (!Number.isFinite(Number(feet))) return 'Unknown';
  if (Number(feet) === 0) return 'Ground';
  return `${Math.round(Number(feet)).toLocaleString()} ft`;
}

function formatSpeed(knots) {
  return Number.isFinite(Number(knots)) ? `${Math.round(Number(knots))} kt` : 'Unknown';
}

function formatVerticalRate(feetPerMinute) {
  if (!Number.isFinite(Number(feetPerMinute))) return 'Unknown';
  const value = Math.round(Number(feetPerMinute));
  if (Math.abs(value) < 64) return 'Level';
  return `${value > 0 ? '+' : ''}${value.toLocaleString()} ft/min`;
}

function formatHeading(degrees) {
  if (!Number.isFinite(Number(degrees))) return 'Unknown';
  const direction = ((Number(degrees) % 360) + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${Math.round(direction)}° ${names[Math.round(direction / 45) % 8]}`;
}

function formatSeen(seconds) {
  if (!Number.isFinite(Number(seconds))) return 'Live';
  if (Number(seconds) < 2) return 'Just now';
  return `${Math.round(Number(seconds))} sec ago`;
}

function formatSourceType(sourceType) {
  const labels = {
    adsb_icao: 'ADS-B',
    adsb_icao_nt: 'ADS-B non-transponder',
    adsr_icao: 'ADS-R',
    tisb_icao: 'TIS-B',
    adsc: 'ADS-C satellite',
    mlat: 'MLAT',
    other: 'Other feed',
    mode_s: 'Mode S',
    adsb_other: 'ADS-B anonymous',
    adsr_other: 'ADS-R anonymous',
    tisb_other: 'TIS-B anonymous',
    tisb_trackfile: 'Radar track file'
  };
  return labels[clean(sourceType)] || clean(sourceType).toUpperCase() || 'Unknown';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function debounce(fn, milliseconds) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), milliseconds);
  };
}

els.backBtn.addEventListener('click', () => { location.href = 'index.html'; });
els.navHome.addEventListener('click', () => { location.href = 'index.html'; });
els.topArBtn.addEventListener('click', openAr);
els.navAr.addEventListener('click', openAr);
els.openAr.addEventListener('click', openAr);
els.refreshBtn.addEventListener('click', () => loadVisibleAircraft(true));
els.locateBtn.addEventListener('click', () => getLocation(true));
els.searchInput.addEventListener('input', () => { renderList(); updateVisibleCount(); });
els.searchInput.addEventListener('focus', () => els.aircraftList.classList.add('open'));
els.clearSearch.addEventListener('click', () => {
  els.searchInput.value = '';
  renderList();
  updateVisibleCount();
});
els.listToggle.addEventListener('click', () => els.aircraftList.classList.toggle('open'));
els.closeDetails.addEventListener('click', () => {
  state.selected = null;
  els.detailsPanel.classList.add('hidden');
  renderMarkers();
});
els.centreAircraft.addEventListener('click', () => {
  if (state.selected) state.map.flyTo([state.selected.lat, state.selected.lon], 10);
});
els.saveFavourite.addEventListener('click', toggleFavourite);
els.saveItem.addEventListener('click', toggleSaved);
els.favouritesBtn.addEventListener('click', () => setListFilter('favourites'));
els.savedBtn.addEventListener('click', () => setListFilter('saved'));
els.trafficAll.addEventListener('click', () => setTrafficFilter('all'));
els.trafficCivil.addEventListener('click', () => setTrafficFilter('civil'));
els.trafficMilitary.addEventListener('click', () => setTrafficFilter('military'));
els.navA7.addEventListener('click', searchA7);
els.navNearby.addEventListener('click', () => {
  state.listFilter = 'all';
  els.searchInput.value = '';
  renderList();
  els.aircraftList.classList.add('open');
});

initialiseMap();
updateSavedCounts();
loadVisibleAircraft(true);
getLocation(false);
state.pollTimer = setInterval(() => loadVisibleAircraft(true), POLL_MS);
state.animationTimer = setInterval(animateMarkers, ANIMATION_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadVisibleAircraft(true);
});
