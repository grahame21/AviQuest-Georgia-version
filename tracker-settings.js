// Settings Management Module
window.TrackerSettings = (function() {
  'use strict';

  const DEFAULT_SETTINGS = {
    mapView: 'local',
    updateFrequency: 5000,
    weatherSource: 'bom',
    showCivil: true,
    showMilitary: true,
    showGround: false,
    autoCapture: false,
    includeLocation: true,
    capturePhotos: true,
    distanceUnit: 'km',
    altitudeUnit: 'ft',
    speedUnit: 'kt',
    overlays: {
      weather: true,
      clouds: true,
      cloudCeiling: true,
      waypoints: true,
      airways: true,
      airports: true,
      militaryAirspace: false,
      restrictedAirspace: false
    }
  };

  function loadSettings() {
    try {
      const stored = localStorage.getItem('aviquest_tracker_settings');
      return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
    } catch (e) {
      console.error('Error loading settings:', e);
      return DEFAULT_SETTINGS;
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem('aviquest_tracker_settings', JSON.stringify(settings));
      console.log('Settings saved:', settings);
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }

  function updateOverlay(overlayName, enabled) {
    const settings = loadSettings();
    settings.overlays[overlayName] = enabled;
    saveSettings(settings);
    console.log(`Overlay ${overlayName} set to ${enabled}`);
  }

  function getOverlay(overlayName) {
    const settings = loadSettings();
    return settings.overlays[overlayName];
  }

  return {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    updateOverlay,
    getOverlay
  };
})();

console.log('TrackerSettings module loaded');
