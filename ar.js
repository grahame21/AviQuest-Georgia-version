"use strict";

const STORAGE_KEY = "ggAdventureArSpotsV1";
const FETCH_INTERVAL_MS = 10000;
const HORIZONTAL_FOV = 62;
const VERTICAL_FOV = 48;
const RADIUS_OPTIONS = [20, 50, 100, 150]; // kilometres

const state = {
  active: false,
  stream: null,
  locationWatchId: null,
  user: null,
  heading: null,
  rawPitch: 0,
  pitchOffset: 0,
  pitchCalibrated: false,
  aircraft: [],
  selectedId: null,
  radiusIndex: 1,
  fetchTimer: null,
  lastRender: 0,
  lastHeading: null,
  lastPitch: null,
  source: "",
  toastTimer: null,
  wakeLock: null,
  photoCache: new Map(),
  photoRequests: new Map(),
  markerNodes: new Map(),
  detailRequestToken: 0
};

const elements = {
  camera: document.getElementById("camera"),
  markers: document.getElementById("markers"),
  startPanel: document.getElementById("startPanel"),
  startButton: document.getElementById("startButton"),
  startMessage: document.getElementById("startMessage"),
  gpsStatus: document.getElementById("gpsStatus"),
  compassStatus: document.getElementById("compassStatus"),
  dataStatus: document.getElementById("dataStatus"),
  headingText: document.getElementById("headingText"),
  nearestCard: document.getElementById("nearestCard"),
  nearestName: document.getElementById("nearestName"),
  nearestMeta: document.getElementById("nearestMeta"),
  calibrateButton: document.getElementById("calibrateButton"),
  refreshButton: document.getElementById("refreshButton"),
  radiusButton: document.getElementById("radiusButton"),
  radiusValue: document.getElementById("radiusValue"),
  logButton: document.getElementById("logButton"),
  aircraftSheet: document.getElementById("aircraftSheet"),
  closeAircraftSheet: document.getElementById("closeAircraftSheet"),
  detailName: document.getElementById("detailName"),
  detailDescription: document.getElementById("detailDescription"),
  detailRegistration: document.getElementById("detailRegistration"),
  detailType: document.getElementById("detailType"),
  detailDistance: document.getElementById("detailDistance"),
  detailBearing: document.getElementById("detailBearing"),
  detailAltitude: document.getElementById("detailAltitude"),
  detailSpeed: document.getElementById("detailSpeed"),
  detailEta: document.getElementById("detailEta"),
  detailPhoto: document.getElementById("detailPhoto"),
  detailPhotoCredit: document.getElementById("detailPhotoCredit"),
  markSpottedButton: document.getElementById("markSpottedButton"),
  logSheet: document.getElementById("logSheet"),
  closeLogSheet: document.getElementById("closeLogSheet"),
  spotLog: document.getElementById("spotLog"),
  exportButton: document.getElementById("exportButton"),
  clearTodayButton: document.getElementById("clearTodayButton"),
  helpButton: document.getElementById("helpButton"),
  helpSheet: document.getElementById("helpSheet"),
  closeHelpSheet: document.getElementById("closeHelpSheet"),
  toast: document.getElementById("toast")
};

function setStatus(element, text, kind = "waiting") {
  element.textContent = text;
  element.classList.remove("waiting", "ready", "error");
  element.classList.add(kind);
}

function showToast(message, duration = 2800) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, duration);
}

function normaliseAngle(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function angleDelta(target, current) {
  return ((target - current + 540) % 360) - 180;
}

function smoothAngle(previous, next, factor = 0.23) {
  if (!Number.isFinite(previous)) return normaliseAngle(next);
  return normaliseAngle(previous + angleDelta(next, previous) * factor);
}

function smoothNumber(previous, next, factor = 0.2) {
  if (!Number.isFinite(previous)) return next;
  return previous + (next - previous) * factor;
}

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

function toDegrees(value) {
  return Number(value) * 180 / Math.PI;
}

function haversineMetres(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);
  const a = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lon2 - lon1);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2)
    - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return normaliseAngle(toDegrees(Math.atan2(y, x)));
}

function cardinalDirection(degrees) {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(normaliseAngle(degrees) / 45) % 8];
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function aircraftIdentifier(aircraft) {
  return cleanText(aircraft.hex || aircraft.icao || aircraft.id || aircraft.registration || aircraft.callsign || "unknown").toLowerCase();
}

function displayName(aircraft) {
  return cleanText(aircraft.callsign) || cleanText(aircraft.registration) || cleanText(aircraft.hex).toUpperCase() || "Unknown aircraft";
}

function displayType(aircraft) {
  return cleanText(aircraft.type) || cleanText(aircraft.description) || "Unknown type";
}

function altitudeFeet(aircraft) {
  const candidates = [aircraft.altitude, aircraft.alt_baro, aircraft.alt_geom];
  for (const value of candidates) {
    if (String(value).toLowerCase() === "ground") return 0;
    const number = numericOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function calculateAircraftGeometry(aircraft) {
  if (!state.user) return null;
  const latitude = numericOrNull(aircraft.lat);
  const longitude = numericOrNull(aircraft.lon);
  if (latitude === null || longitude === null) return null;

  const distanceMetres = haversineMetres(
    state.user.latitude,
    state.user.longitude,
    latitude,
    longitude
  );
  const bearing = bearingDegrees(
    state.user.latitude,
    state.user.longitude,
    latitude,
    longitude
  );

  const feet = altitudeFeet(aircraft);
  const aircraftAltitudeMetres = feet === null ? null : feet * 0.3048;
  const observerAltitude = Number.isFinite(state.user.altitude) ? state.user.altitude : 0;
  const elevation = aircraftAltitudeMetres === null
    ? 0
    : toDegrees(Math.atan2(aircraftAltitudeMetres - observerAltitude, Math.max(distanceMetres, 1)));

  return {
    ...aircraft,
    id: aircraftIdentifier(aircraft),
    distanceMetres,
    distanceNm: distanceMetres / 1852,
    distanceKm: distanceMetres / 1000,
    bearing,
    elevation,
    etaSeconds: estimateArrivalSeconds(aircraft, latitude, longitude, distanceMetres)
  };
}

function estimateArrivalSeconds(aircraft, latitude, longitude, distanceMetres) {
  const speedKnots = numericOrNull(aircraft.speed ?? aircraft.gs);
  const track = numericOrNull(aircraft.track);
  if (!speedKnots || speedKnots < 5 || track === null || altitudeFeet(aircraft) === 0) return null;

  const bearingToObserver = bearingDegrees(latitude, longitude, state.user.latitude, state.user.longitude);
  const closingAngle = Math.abs(angleDelta(bearingToObserver, track));
  const closingSpeed = speedKnots * 0.514444 * Math.cos(toRadians(closingAngle));
  if (closingSpeed < 5) return null;
  const seconds = distanceMetres / closingSpeed;
  return seconds > 0 && seconds < 7200 ? seconds : null;
}

function formatEta(seconds, aircraft) {
  if (altitudeFeet(aircraft) === 0) return "ground";
  if (!Number.isFinite(seconds)) return "not approaching";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

function photoKey(aircraft) {
  return cleanText(aircraft.registration || aircraft.hex).toUpperCase();
}

async function loadAircraftPhoto(aircraft) {
  const key = photoKey(aircraft);
  if (!key) return null;

  const cached = state.photoCache.get(key);
  if (cached && cached.status === "ready") return cached.photo;
  if (cached && cached.status === "missing" && Date.now() - cached.checkedAt < 30 * 60 * 1000) return null;
  if (state.photoRequests.has(key)) return state.photoRequests.get(key);

  const request = (async () => {
    try {
      const url = new URL("/.netlify/functions/aircraft-photo", window.location.origin);
      if (cleanText(aircraft.registration)) url.searchParams.set("registration", cleanText(aircraft.registration));
      if (cleanText(aircraft.hex)) url.searchParams.set("hex", cleanText(aircraft.hex));
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "force-cache" });
      if (!response.ok) throw new Error(`Photo service returned ${response.status}`);
      const data = await response.json();
      const photo = data?.photo?.image || data?.photo?.thumbnail ? data.photo : null;
      state.photoCache.set(key, { status: photo ? "ready" : "missing", photo, checkedAt: Date.now() });
      aircraft.photo = photo;
      updateMarkerPhoto(aircraft.id, photo);
      updateOpenDetailPhoto(aircraft, photo);
      return photo;
    } catch (error) {
      console.info("Aircraft photo unavailable", key, error);
      state.photoCache.set(key, { status: "missing", photo: null, checkedAt: Date.now() });
      return null;
    } finally {
      state.photoRequests.delete(key);
    }
  })();

  state.photoRequests.set(key, request);
  return request;
}

function cachedPhoto(aircraft) {
  return aircraft.photo || state.photoCache.get(photoKey(aircraft))?.photo || null;
}

function updateMarkerPhoto(id, photo) {
  const marker = state.markerNodes.get(id);
  const image = marker?.querySelector(".marker-photo");
  if (!image || !photo) return;
  const source = photo.thumbnail || photo.image;
  if (source && image.dataset.source !== source) {
    image.dataset.source = source;
    image.src = source;
  }
}

function updateOpenDetailPhoto(aircraft, photo) {
  if (!photo || state.selectedId !== aircraft.id || elements.aircraftSheet.classList.contains("hidden")) return;
  elements.detailPhoto.src = photo.image || photo.thumbnail || "images/aircraft-placeholder.svg";
  elements.detailPhotoCredit.textContent = photo.photographer ? `Photo: ${photo.photographer}` : "Aircraft photo";
}

function preloadVisiblePhotos() {
  state.aircraft.slice(0, 10).forEach((aircraft) => { loadAircraftPhoto(aircraft); });
}

function readSpots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Could not read AR spotting log", error);
    return [];
  }
}

function saveSpots(spots) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function spottedIds() {
  const today = localDateKey();
  return new Set(
    readSpots()
      .filter((spot) => localDateKey(spot.timestamp) === today)
      .map((spot) => cleanText(spot.aircraftId))
  );
}

async function requestOrientationAccess() {
  if (!("DeviceOrientationEvent" in window)) {
    return { granted: false, reason: "Compass sensor is unavailable in this browser." };
  }

  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      let permission;
      try {
        permission = await DeviceOrientationEvent.requestPermission(true);
      } catch (absoluteError) {
        permission = await DeviceOrientationEvent.requestPermission();
      }
      if (permission !== "granted") {
        return { granted: false, reason: "Motion & Orientation permission was not allowed." };
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    return { granted: true };
  } catch (error) {
    return { granted: false, reason: error.message || "Compass permission failed." };
  }
}

async function requestCameraAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot open the camera.");
  }

  stopCamera();
  elements.camera.setAttribute("autoplay", "");
  elements.camera.setAttribute("muted", "");
  elements.camera.setAttribute("playsinline", "");
  elements.camera.muted = true;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: "environment" } }
    });
  } catch (rearError) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  }

  state.stream = stream;
  elements.camera.srcObject = stream;
  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Camera opened but no video frame arrived.")), 7000);
    const ready = async () => {
      window.clearTimeout(timer);
      try { await elements.camera.play(); resolve(); } catch (error) { reject(error); }
    };
    if (elements.camera.readyState >= 2 && elements.camera.videoWidth > 0) ready();
    else elements.camera.addEventListener("loadedmetadata", ready, { once: true });
  });

  if (!elements.camera.videoWidth || !elements.camera.videoHeight) {
    stopCamera();
    throw new Error("The rear camera stream is black. Close other camera apps, reload Safari and try again.");
  }
  return stream;
}

function requestInitialLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is unavailable on this device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000
    });
  });
}

function applyLocation(position) {
  state.user = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    altitude: Number.isFinite(position.coords.altitude) ? position.coords.altitude : 0,
    accuracy: position.coords.accuracy
  };
  setStatus(elements.gpsStatus, `GPS ±${Math.round(position.coords.accuracy)}m`, "ready");
}

function startLocationWatch() {
  if (!navigator.geolocation) return;
  if (state.locationWatchId !== null) {
    navigator.geolocation.clearWatch(state.locationWatchId);
  }

  state.locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      applyLocation(position);
    },
    (error) => {
      setStatus(elements.gpsStatus, "GPS unavailable", "error");
      console.warn("Location watch error", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000
    }
  );
}

function handleOrientation(event) {
  let heading = null;

  if (Number.isFinite(event.webkitCompassHeading)) {
    heading = event.webkitCompassHeading;
  } else if (Number.isFinite(event.alpha)) {
    heading = 360 - event.alpha;
  }

  if (heading !== null) {
    state.heading = smoothAngle(state.lastHeading, heading);
    state.lastHeading = state.heading;
    const rounded = Math.round(state.heading);
    elements.headingText.textContent = `${String(rounded).padStart(3, "0")}° ${cardinalDirection(rounded)}`;
    setStatus(elements.compassStatus, `Compass ${cardinalDirection(rounded)}`, "ready");
  }

  if (Number.isFinite(event.beta)) {
    const rawPitch = 90 - event.beta;
    state.rawPitch = smoothNumber(state.lastPitch, rawPitch);
    state.lastPitch = state.rawPitch;
  }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      state.wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (error) {
    console.info("Screen wake lock was not available", error);
  }
}

async function startLiveAr() {
  elements.startButton.disabled = true;
  elements.startButton.textContent = "Starting…";
  elements.startMessage.textContent = "Opening camera, GPS and compass…";
  setStatus(elements.gpsStatus, "GPS…", "waiting");
  setStatus(elements.compassStatus, "Compass…", "waiting");
  setStatus(elements.dataStatus, "Aircraft…", "waiting");

  // The orientation permission call must happen directly from this button tap on iPhone.
  const orientationResult = await Promise.resolve(requestOrientationAccess())
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));

  const [cameraResult, locationResult] = await Promise.allSettled([
    requestCameraAccess(),
    requestInitialLocation()
  ]);

  if (cameraResult.status === "rejected") {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "Try again";
    elements.startMessage.textContent = `Camera error: ${cameraResult.reason?.message || cameraResult.reason}`;
    setStatus(elements.dataStatus, "Camera blocked", "error");
    return;
  }

  if (locationResult.status === "rejected") {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "Try again";
    elements.startMessage.textContent = "Location is required to find nearby aircraft. Check Safari location permission and try again.";
    setStatus(elements.gpsStatus, "GPS blocked", "error");
    stopCamera();
    return;
  }

  applyLocation(locationResult.value);
  startLocationWatch();

  const orientation = orientationResult.status === "fulfilled"
    ? orientationResult.value
    : { granted: false, reason: orientationResult.reason?.message || "Compass permission failed." };

  if (!orientation.granted) {
    setStatus(elements.compassStatus, "Compass blocked", "error");
    showToast(`${orientation.reason} The nearest-aircraft card still works, but camera labels cannot align.` , 5200);
  }

  state.active = true;
  elements.startPanel.classList.add("hidden");
  await requestWakeLock();
  await fetchNearbyAircraft();
  scheduleFetches();
  window.requestAnimationFrame(renderLoop);
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    elements.camera.srcObject = null;
  }
}

function scheduleFetches() {
  window.clearInterval(state.fetchTimer);
  state.fetchTimer = window.setInterval(fetchNearbyAircraft, FETCH_INTERVAL_MS);
}

function currentRadius() {
  return RADIUS_OPTIONS[state.radiusIndex];
}

async function fetchNearbyAircraft() {
  if (!state.user) return;
  setStatus(elements.dataStatus, "Updating…", "waiting");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);
  const url = new URL("/.netlify/functions/nearby-aircraft", window.location.origin);
  url.searchParams.set("lat", state.user.latitude.toFixed(6));
  url.searchParams.set("lon", state.user.longitude.toFixed(6));
  url.searchParams.set("radius", String(Math.max(1, Math.round(currentRadius() / 1.852))));

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Aircraft service returned ${response.status}.`);
    }

    const records = Array.isArray(payload.aircraft) ? payload.aircraft : [];
    state.aircraft = records
      .map(calculateAircraftGeometry)
      .filter(Boolean)
      .sort((a, b) => a.distanceMetres - b.distanceMetres);
    state.source = cleanText(payload.source) || "live ADS-B";

    setStatus(
      elements.dataStatus,
      `${state.aircraft.length} aircraft`,
      "ready"
    );
    updateNearestCard();
    preloadVisiblePhotos();
  } catch (error) {
    console.error("Aircraft update failed", error);
    setStatus(elements.dataStatus, "Data unavailable", "error");
    showToast(error.name === "AbortError" ? "Aircraft update timed out." : error.message, 3500);
  } finally {
    window.clearTimeout(timeout);
  }
}

function updateNearestCard() {
  const nearest = state.aircraft[0];
  if (!nearest) {
    elements.nearestCard.classList.add("hidden");
    return;
  }

  elements.nearestName.textContent = displayName(nearest);
  elements.nearestMeta.textContent = `${formatDistance(nearest.distanceMetres)} · ${formatEta(nearest.etaSeconds, nearest)} · ${Math.round(nearest.bearing)}° ${cardinalDirection(nearest.bearing)} · ${formatAltitude(altitudeFeet(nearest))}`;
  elements.nearestCard.classList.remove("hidden");
}

function formatAltitude(value) {
  if (value === null || !Number.isFinite(value)) return "altitude unknown";
  if (value <= 0) return "ground";
  return `${Math.round(value).toLocaleString("en-AU")} ft`;
}

function formatSpeed(value) {
  const number = numericOrNull(value);
  return number === null ? "Unknown" : `${Math.round(number)} kt`;
}

function formatDistance(metres) {
  if (!Number.isFinite(metres)) return "Unknown";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

function renderLoop(timestamp) {
  if (!state.active) return;
  if (timestamp - state.lastRender >= 120) {
    renderMarkers();
    state.lastRender = timestamp;
  }
  window.requestAnimationFrame(renderLoop);
}

function renderMarkers() {
  if (!Number.isFinite(state.heading)) {
    for (const node of state.markerNodes.values()) node.remove();
    state.markerNodes.clear();
    return;
  }

  const cameraPitch = state.rawPitch - state.pitchOffset;
  const spots = spottedIds();
  const candidates = state.aircraft.map((aircraft) => {
    const horizontalDifference = angleDelta(aircraft.bearing, state.heading);
    const verticalDifference = aircraft.elevation - cameraPitch;
    return {
      aircraft,
      horizontalDifference,
      verticalDifference,
      score: Math.hypot(horizontalDifference, verticalDifference * 1.35)
    };
  }).filter((item) =>
    Math.abs(item.horizontalDifference) <= HORIZONTAL_FOV * 0.56 &&
    Math.abs(item.verticalDifference) <= VERTICAL_FOV * 0.62
  ).sort((a, b) => a.score - b.score || a.aircraft.distanceMetres - b.aircraft.distanceMetres)
   .slice(0, 6);

  const visibleIds = new Set();
  const occupied = [];

  for (const item of candidates) {
    const { aircraft, horizontalDifference, verticalDifference } = item;
    let x = Math.max(9, Math.min(91, 50 + (horizontalDifference / HORIZONTAL_FOV) * 100));

    // Deliberately inverted from the previous build: raising the phone now moves
    // labels upward on screen, matching the direction reported in FlightAware/FR24.
    let y = Math.max(22, Math.min(68, 50 + (verticalDifference / VERTICAL_FOV) * 100));

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const clash = occupied.some((box) => Math.abs(box.x - x) < 23 && Math.abs(box.y - y) < 13);
      if (!clash) break;
      const direction = attempt % 2 === 0 ? 1 : -1;
      y = Math.max(22, Math.min(68, y + direction * (10 + attempt * 2)));
      x = Math.max(9, Math.min(91, x - direction * 7));
    }
    if (occupied.some((box) => Math.abs(box.x - x) < 20 && Math.abs(box.y - y) < 11)) continue;
    occupied.push({ x, y });
    visibleIds.add(aircraft.id);

    let marker = state.markerNodes.get(aircraft.id);
    if (!marker) {
      marker = createMarkerNode(aircraft);
      state.markerNodes.set(aircraft.id, marker);
      elements.markers.append(marker);
    }

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.classList.toggle("spotted", spots.has(aircraft.id));
    marker.classList.toggle("centred", item.score < 7);
    marker.hidden = false;
    updateMarkerNode(marker, aircraft);
  }

  for (const [id, marker] of state.markerNodes) {
    if (!visibleIds.has(id)) {
      marker.remove();
      state.markerNodes.delete(id);
    }
  }
}

function createMarkerNode(aircraft) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = "aircraft-marker";
  marker.dataset.aircraftId = aircraft.id;

  const photo = document.createElement("img");
  photo.className = "marker-photo";
  photo.alt = "";
  photo.decoding = "async";
  photo.src = "images/aircraft-placeholder.svg";
  photo.dataset.source = photo.src;
  photo.addEventListener("error", () => {
    if (!photo.src.endsWith("aircraft-placeholder.svg")) {
      photo.dataset.source = "images/aircraft-placeholder.svg";
      photo.src = "images/aircraft-placeholder.svg";
    }
  });

  const content = document.createElement("span");
  content.className = "marker-content";
  const top = document.createElement("span");
  top.className = "marker-top";
  const plane = document.createElement("span");
  plane.className = "plane-symbol";
  plane.textContent = "✈";
  const name = document.createElement("strong");
  name.className = "marker-name";
  top.append(plane, name);
  const registration = document.createElement("small");
  registration.className = "marker-registration";
  const meta = document.createElement("small");
  meta.className = "marker-meta";
  content.append(top, registration, meta);
  marker.append(photo, content);
  return marker;
}

function updateMarkerNode(marker, aircraft) {
  marker.dataset.aircraftId = aircraft.id;
  marker.setAttribute("aria-label", `Open ${displayName(aircraft)} aircraft details`);
  marker.querySelector(".marker-name").textContent = displayName(aircraft);
  marker.querySelector(".marker-registration").textContent = cleanText(aircraft.registration) || displayType(aircraft);
  marker.querySelector(".marker-meta").textContent = `${formatDistance(aircraft.distanceMetres)} · ${formatEta(aircraft.etaSeconds, aircraft)}`;

  const photo = cachedPhoto(aircraft);
  if (photo) updateMarkerPhoto(aircraft.id, photo);
  else loadAircraftPhoto(aircraft);
}

function findAircraft(id) {
  return state.aircraft.find((aircraft) => aircraft.id === id) || null;
}

function openAircraftSheet(aircraft) {
  const requestToken = ++state.detailRequestToken;
  state.selectedId = aircraft.id;
  elements.detailName.textContent = displayName(aircraft);
  elements.detailDescription.textContent = cleanText(aircraft.description) || "Live ADS-B aircraft position";
  elements.detailRegistration.textContent = cleanText(aircraft.registration) || "Unknown";
  elements.detailType.textContent = cleanText(aircraft.type) || "Unknown";
  elements.detailDistance.textContent = formatDistance(aircraft.distanceMetres);
  elements.detailEta.textContent = formatEta(aircraft.etaSeconds, aircraft);
  elements.detailBearing.textContent = `${Math.round(aircraft.bearing)}° ${cardinalDirection(aircraft.bearing)}`;
  elements.detailAltitude.textContent = formatAltitude(altitudeFeet(aircraft));
  elements.detailSpeed.textContent = formatSpeed(aircraft.speed || aircraft.gs);

  const photo = cachedPhoto(aircraft);
  elements.detailPhoto.src = photo?.image || photo?.thumbnail || "images/aircraft-placeholder.svg";
  elements.detailPhotoCredit.textContent = photo?.photographer ? `Photo: ${photo.photographer}` : "Looking for an aircraft photo…";

  const alreadySpotted = spottedIds().has(aircraft.id);
  elements.markSpottedButton.textContent = alreadySpotted ? "✓ Already spotted today" : "✓ Mark this aircraft spotted";
  elements.markSpottedButton.disabled = alreadySpotted;

  closeAllSheets(false);
  state.selectedId = aircraft.id;
  elements.aircraftSheet.classList.remove("hidden");

  if (!photo) {
    loadAircraftPhoto(aircraft).then((loaded) => {
      if (requestToken !== state.detailRequestToken || state.selectedId !== aircraft.id || elements.aircraftSheet.classList.contains("hidden")) return;
      if (loaded) updateOpenDetailPhoto(aircraft, loaded);
      else elements.detailPhotoCredit.textContent = "No aircraft photo found";
    });
  }
}

function closeAllSheets(clearSelection = true) {
  elements.aircraftSheet.classList.add("hidden");
  elements.logSheet.classList.add("hidden");
  elements.helpSheet.classList.add("hidden");
  if (clearSelection) {
    state.selectedId = null;
    state.detailRequestToken += 1;
  }
}

function markSelectedAircraftSpotted() {
  const aircraft = findAircraft(state.selectedId);
  if (!aircraft) return;

  const spots = readSpots();
  const today = localDateKey();
  const duplicate = spots.some((spot) =>
    cleanText(spot.aircraftId) === aircraft.id && localDateKey(spot.timestamp) === today
  );

  if (!duplicate) {
    spots.unshift({
      id: `${Date.now()}-${aircraft.id}`,
      aircraftId: aircraft.id,
      timestamp: new Date().toISOString(),
      callsign: cleanText(aircraft.callsign),
      registration: cleanText(aircraft.registration),
      type: cleanText(aircraft.type),
      description: cleanText(aircraft.description),
      hex: cleanText(aircraft.hex),
      altitudeFeet: altitudeFeet(aircraft),
      speedKnots: numericOrNull(aircraft.speed || aircraft.gs),
      distanceNm: Number(aircraft.distanceNm.toFixed(2)),
      distanceKm: Number(aircraft.distanceKm.toFixed(2)),
      bearing: Math.round(aircraft.bearing),
      observerLatitude: state.user?.latitude ?? null,
      observerLongitude: state.user?.longitude ?? null,
      aircraftLatitude: numericOrNull(aircraft.lat),
      aircraftLongitude: numericOrNull(aircraft.lon),
      source: state.source
    });
    saveSpots(spots);
  }

  elements.markSpottedButton.textContent = "✓ Already spotted today";
  elements.markSpottedButton.disabled = true;
  showToast(`${displayName(aircraft)} added to today’s spotting list.`);
  renderMarkers();
}

function renderSpotLog() {
  const today = localDateKey();
  const spots = readSpots().filter((spot) => localDateKey(spot.timestamp) === today);
  elements.spotLog.replaceChildren();

  if (spots.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "No aircraft ticked off yet. Tap a live aircraft label, then choose “Mark spotted”.";
    elements.spotLog.append(empty);
    return;
  }

  spots.forEach((spot) => {
    const entry = document.createElement("article");
    entry.className = "spot-entry";
    const title = document.createElement("strong");
    title.textContent = spot.callsign || spot.registration || spot.hex?.toUpperCase() || "Unknown aircraft";
    const details = document.createElement("span");
    const registration = spot.registration ? ` · ${spot.registration}` : "";
    const type = spot.type ? ` · ${spot.type}` : "";
    details.textContent = `${Number.isFinite(Number(spot.distanceKm)) ? `${Number(spot.distanceKm).toFixed(1)} km` : `${(Number(spot.distanceNm) * 1.852).toFixed(1)} km`}${registration}${type}`;
    const time = document.createElement("small");
    time.textContent = new Date(spot.timestamp).toLocaleTimeString("en-AU", {
      hour: "numeric",
      minute: "2-digit"
    });
    entry.append(title, details, time);
    elements.spotLog.append(entry);
  });
}

function openSpotLog() {
  closeAllSheets();
  renderSpotLog();
  elements.logSheet.classList.remove("hidden");
}

function exportSpotLog() {
  const spots = readSpots();
  const payload = {
    app: "GG’s Adventure Live AR Spotter",
    exportedAt: new Date().toISOString(),
    sightings: spots
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gg-adventure-ar-spots-${localDateKey()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Spotting log exported.");
}

function clearToday() {
  const today = localDateKey();
  const spots = readSpots();
  const remaining = spots.filter((spot) => localDateKey(spot.timestamp) !== today);
  if (remaining.length === spots.length) {
    showToast("There are no sightings to clear today.");
    return;
  }
  if (!window.confirm("Remove all aircraft ticked off today?")) return;
  saveSpots(remaining);
  renderSpotLog();
  renderMarkers();
  showToast("Today’s AR spotting list was cleared.");
}

function calibrateHorizon() {
  if (!state.active) {
    showToast("Start Live AR first.");
    return;
  }
  state.pitchOffset = state.rawPitch;
  state.pitchCalibrated = true;
  showToast("Horizon calibrated. Pan slowly toward the aircraft.");
}

function cycleRadius() {
  state.radiusIndex = (state.radiusIndex + 1) % RADIUS_OPTIONS.length;
  elements.radiusValue.textContent = String(currentRadius());
  showToast(`Search radius changed to ${currentRadius()} kilometres.`);
  fetchNearbyAircraft();
}

function openHelp() {
  closeAllSheets();
  elements.helpSheet.classList.remove("hidden");
}

function handleMarkerClick(event) {
  const marker = event.target.closest("[data-aircraft-id]");
  if (!marker) return;
  const aircraft = findAircraft(marker.dataset.aircraftId);
  if (aircraft) openAircraftSheet(aircraft);
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && state.active) {
    requestWakeLock();
    fetchNearbyAircraft();
  }
}

function cleanUp() {
  stopCamera();
  window.clearInterval(state.fetchTimer);
  if (state.locationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.locationWatchId);
  }
  if (state.wakeLock) {
    state.wakeLock.release().catch(() => {});
  }
}

elements.startButton.addEventListener("click", startLiveAr);
elements.markers.addEventListener("click", handleMarkerClick);
elements.calibrateButton.addEventListener("click", calibrateHorizon);
elements.refreshButton.addEventListener("click", fetchNearbyAircraft);
elements.radiusButton.addEventListener("click", cycleRadius);
elements.logButton.addEventListener("click", openSpotLog);
elements.closeAircraftSheet.addEventListener("click", () => closeAllSheets(true));
elements.closeLogSheet.addEventListener("click", () => closeAllSheets(true));
elements.markSpottedButton.addEventListener("click", markSelectedAircraftSpotted);
elements.exportButton.addEventListener("click", exportSpotLog);
elements.clearTodayButton.addEventListener("click", clearToday);
elements.helpButton.addEventListener("click", openHelp);
elements.closeHelpSheet.addEventListener("click", () => closeAllSheets(true));
document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("pagehide", cleanUp);
window.addEventListener("beforeunload", cleanUp);

elements.radiusValue.textContent = String(currentRadius());
