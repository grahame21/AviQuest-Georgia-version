// Settings & Configuration Module for Flight Tracker
// Manages all user preferences and map overlay settings

const STORAGE_KEY = 'aviquest_tracker_settings';

// Default settings
const DEFAULT_SETTINGS = {
  // Display Options
  mapView: 'global', // 'global', 'region', 'local'
  updateFrequency: 5000, // milliseconds
  
  // Overlay Toggles
  overlays: {
    weather: true,
    clouds: true,
    cloudCeiling: true,
    waypoints: true,
    airways: true,
    airports: true,
    militaryAirspace: false,
    restrictedAirspace: false
  },
  
  // Weather Configuration
  weatherSource: 'bom', // 'bom' for Australia, 'openweather' for rest of world
  boMEnabled: true,
  
  // Aircraft Filters
  showCivil: true,
  showMilitary: true,
  showGround: false,
  
  // Capture Settings
  autoCapture: false,
  captureLocation: true,
  capturePhotos: true,
  
  // FlightRadar24 Integration (optional premium)
  flightRadar24: {
    enabled: false,
    apiKey: null
  },
  
  // Time & Location
  timezone: 'Australia/Sydney',
  useLocalTime: true,
  
  // Display Preferences
  distanceUnit: 'km', // 'km' or 'nm'
  altitudeUnit: 'ft', // 'ft' or 'm'
  speedUnit: 'kt', // 'kt' or 'km/h'
  
  // Data Sources
  preferredDataSource: 'opensky', // 'opensky' (free) or 'flightradar24' (paid)
  useOpenSkyOnly: true
};

/**
 * Load settings from localStorage
 */
function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Failed to save settings:', e);
    return false;
  }
}

/**
 * Update a single setting
 */
function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

/**
 * Update overlay settings
 */
function updateOverlay(overlayName, enabled) {
  const settings = loadSettings();
  settings.overlays[overlayName] = enabled;
  saveSettings(settings);
  return settings;
}

/**
 * Get all overlay statuses
 */
function getOverlayStatus() {
  const settings = loadSettings();
  return settings.overlays;
}

/**
 * Create HTML settings panel
 */
function createSettingsPanel() {
  const settings = loadSettings();
  
  return `
    <div class="settings-panel" id="settingsPanel">
      <div class="settings-header">
        <h2>Flight Tracker Settings</h2>
        <button class="close-settings" type="button">×</button>
      </div>
      
      <div class="settings-content">
        <!-- Map View Section -->
        <div class="setting-group">
          <label>Map View</label>
          <select id="mapViewSelect">
            <option value="global" ${settings.mapView === 'global' ? 'selected' : ''}>Global (All Aircraft Worldwide)</option>
            <option value="region" ${settings.mapView === 'region' ? 'selected' : ''}>Region (Australia + NZ)</option>
            <option value="local" ${settings.mapView === 'local' ? 'selected' : ''}>Local (500km radius)</option>
          </select>
        </div>
        
        <!-- Update Frequency Section -->
        <div class="setting-group">
          <label>Update Frequency</label>
          <select id="updateFreqSelect">
            <option value="1000" ${settings.updateFrequency === 1000 ? 'selected' : ''}>Every 1 second</option>
            <option value="5000" ${settings.updateFrequency === 5000 ? 'selected' : ''}>Every 5 seconds</option>
            <option value="10000" ${settings.updateFrequency === 10000 ? 'selected' : ''}>Every 10 seconds</option>
            <option value="30000" ${settings.updateFrequency === 30000 ? 'selected' : ''}>Every 30 seconds</option>
            <option value="60000" ${settings.updateFrequency === 60000 ? 'selected' : ''}>Every 1 minute</option>
          </select>
          <small>⚠️ Faster updates use more data</small>
        </div>
        
        <!-- Map Overlays Section -->
        <div class="setting-group">
          <label>Map Overlays</label>
          <div class="checkbox-group">
            <label><input type="checkbox" class="overlay-toggle" data-overlay="weather" ${settings.overlays.weather ? 'checked' : ''} /> Weather</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="clouds" ${settings.overlays.clouds ? 'checked' : ''} /> Cloud Coverage</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="cloudCeiling" ${settings.overlays.cloudCeiling ? 'checked' : ''} /> Cloud Ceiling (Low Level)</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="waypoints" ${settings.overlays.waypoints ? 'checked' : ''} /> Waypoints</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="airways" ${settings.overlays.airways ? 'checked' : ''} /> Airways</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="airports" ${settings.overlays.airports ? 'checked' : ''} /> Airports</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="militaryAirspace" ${settings.overlays.militaryAirspace ? 'checked' : ''} /> Military Airspace</label>
            <label><input type="checkbox" class="overlay-toggle" data-overlay="restrictedAirspace" ${settings.overlays.restrictedAirspace ? 'checked' : ''} /> Restricted Airspace</label>
          </div>
        </div>
        
        <!-- Weather Source Section -->
        <div class="setting-group">
          <label>Weather Data Source (Australia)</label>
          <select id="weatherSourceSelect">
            <option value="bom" ${settings.weatherSource === 'bom' ? 'selected' : ''}>Bureau of Meteorology (BoM) - Most Accurate</option>
            <option value="openweather" ${settings.weatherSource === 'openweather' ? 'selected' : ''}>OpenWeatherMap - Worldwide</option>
          </select>
          <small>✓ BoM recommended for Australia tracking</small>
        </div>
        
        <!-- Aircraft Filters Section -->
        <div class="setting-group">
          <label>Aircraft Display Filters</label>
          <div class="checkbox-group">
            <label><input type="checkbox" id="showCivilCheck" ${settings.showCivil ? 'checked' : ''} /> Show Civil Aircraft</label>
            <label><input type="checkbox" id="showMilitaryCheck" ${settings.showMilitary ? 'checked' : ''} /> Show Military Aircraft</label>
            <label><input type="checkbox" id="showGroundCheck" ${settings.showGround ? 'checked' : ''} /> Show Aircraft on Ground</label>
          </div>
        </div>
        
        <!-- Capture Settings Section -->
        <div class="setting-group">
          <label>Capture Settings</label>
          <div class="checkbox-group">
            <label><input type="checkbox" id="autoCaptureCheck" ${settings.autoCapture ? 'checked' : ''} /> Auto-Capture Nearby Flights</label>
            <label><input type="checkbox" id="captureLocationCheck" ${settings.captureLocation ? 'checked' : ''} /> Include Location Data</label>
            <label><input type="checkbox" id="capturePhotosCheck" ${settings.capturePhotos ? 'checked' : ''} /> Capture Photos</label>
          </div>
        </div>
        
        <!-- Data Source Section -->
        <div class="setting-group">
          <label>Data Source Configuration</label>
          <div class="data-source-info">
            <h4>✓ Current: OpenSky Network (Free)</h4>
            <p>Coverage: ~20,000-50,000 aircraft worldwide</p>
            <p>Update: Every 5-10 seconds</p>
            <p>Cost: $0</p>
            <small>No ADS-B capture equipment needed</small>
          </div>
          
          <details class="premium-option">
            <summary>🔒 Upgrade to FlightRadar24 Premium (Optional)</summary>
            <div class="premium-settings">
              <input type="text" id="fr24ApiKey" placeholder="FlightRadar24 API Key" />
              <button type="button" onclick="window.open('https://www.flightradar24.com/premium/', '_blank')">Get API Key</button>
              <small>For premium: 200,000+ aircraft, real-time updates, $100-500/month</small>
            </div>
          </details>
        </div>
        
        <!-- Units Section -->
        <div class="setting-group">
          <label>Display Units</label>
          <div class="units-grid">
            <div>
              <label>Distance</label>
              <select id="distanceUnitSelect">
                <option value="km" ${settings.distanceUnit === 'km' ? 'selected' : ''}>Kilometers (km)</option>
                <option value="nm" ${settings.distanceUnit === 'nm' ? 'selected' : ''}>Nautical Miles (nm)</option>
              </select>
            </div>
            <div>
              <label>Altitude</label>
              <select id="altitudeUnitSelect">
                <option value="ft" ${settings.altitudeUnit === 'ft' ? 'selected' : ''}>Feet (ft)</option>
                <option value="m" ${settings.altitudeUnit === 'm' ? 'selected' : ''}>Meters (m)</option>
              </select>
            </div>
            <div>
              <label>Speed</label>
              <select id="speedUnitSelect">
                <option value="kt" ${settings.speedUnit === 'kt' ? 'selected' : ''}>Knots (kt)</option>
                <option value="km/h" ${settings.speedUnit === 'km/h' ? 'selected' : ''}>Kilometers/hour</option>
              </select>
            </div>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="settings-actions">
          <button type="button" id="resetSettingsBtn" class="secondary">Reset to Defaults</button>
          <button type="button" id="saveSettingsBtn" class="primary">Save Changes</button>
        </div>
      </div>
    </div>
  `;
}

// Export settings management functions
window.TrackerSettings = {
  loadSettings,
  saveSettings,
  updateSetting,
  updateOverlay,
  getOverlayStatus,
  createSettingsPanel,
  DEFAULT_SETTINGS
};
