// Flight Plans Tracking Module
window.TrackerFlightPlans = (function() {
  'use strict';

  const API_BASE = '/.netlify/functions';

  async function getFlightSchedules(aircraft) {
    try {
      const response = await fetch(
        `${API_BASE}/flight-schedules?callsign=${encodeURIComponent(aircraft.callsign)}&registration=${encodeURIComponent(aircraft.registration)}`,
        { cache: 'no-store' }
      );
      return response.ok ? response.json() : null;
    } catch (e) {
      console.error('Error fetching flight schedules:', e);
      return null;
    }
  }

  async function getPreDeparture(airport) {
    try {
      const response = await fetch(
        `${API_BASE}/pre-departure?airport=${encodeURIComponent(airport)}`,
        { cache: 'no-store' }
      );
      return response.ok ? response.json() : null;
    } catch (e) {
      console.error('Error fetching pre-departure flights:', e);
      return null;
    }
  }

  async function getWeatherOverlay(lat, lon) {
    try {
      const response = await fetch(
        `${API_BASE}/weather-overlay?lat=${lat}&lon=${lon}`,
        { cache: 'no-store' }
      );
      return response.ok ? response.json() : null;
    } catch (e) {
      console.error('Error fetching weather overlay:', e);
      return null;
    }
  }

  async function getWaypointsData(lat, lon, radius) {
    try {
      const response = await fetch(
        `${API_BASE}/waypoints-data?lat=${lat}&lon=${lon}&radius=${radius}`,
        { cache: 'no-store' }
      );
      return response.ok ? response.json() : null;
    } catch (e) {
      console.error('Error fetching waypoints:', e);
      return null;
    }
  }

  return {
    getFlightSchedules,
    getPreDeparture,
    getWeatherOverlay,
    getWaypointsData
  };
})();

console.log('TrackerFlightPlans module loaded');
