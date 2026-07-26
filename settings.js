'use strict';

// Settings Controller
class SettingsController {
  constructor() {
    this.settings = this.loadSettings();
    this.init();
  }

  init() {
    this.setupPanelToggle();
    this.setupTabNavigation();
    this.setupCardSelectors();
    this.setupToggles();
    this.setupSliders();
    this.setupSelects();
    this.setupButtons();
    this.loadSettingsToUI();
  }

  loadSettings() {
    try {
      return JSON.parse(localStorage.getItem('aviquest_settings') || '{}');
    } catch {
      return {};
    }
  }

  saveSettings() {
    localStorage.setItem('aviquest_settings', JSON.stringify(this.settings));
    this.applySettings();
  }

  applySettings() {
    // Map brightness
    const brightness = this.settings.mapBrightness || 100;
    const mapEl = document.getElementById('map');
    mapEl.style.filter = `brightness(${brightness}%)`;

    // Emit event for tracker.js to listen
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: this.settings }));
  }

  setupPanelToggle() {
    const btn = document.getElementById('settingsBtn');
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsOverlay');
    const close = document.getElementById('settingsPanelClose');

    btn.addEventListener('click', () => {
      panel.classList.add('show');
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    });

    const closePanel = () => {
      panel.classList.remove('show');
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    };

    close.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
  }

  setupTabNavigation() {
    const tabs = document.querySelectorAll('.settings-tab');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
      });
    });
  }

  setupCardSelectors() {
    // Map Type
    const mapCards = document.querySelectorAll('[data-map]');
    mapCards.forEach(card => {
      card.addEventListener('click', () => {
        mapCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.settings.mapType = card.dataset.map;
      });
    });
  }

  setupToggles() {
    const toggles = document.querySelectorAll('.settings-toggle');
    
    toggles.forEach(toggle => {
      // Set initial state from settings
      const key = this.getToggleKey(toggle);
      if (key && this.settings[key] !== undefined) {
        if (this.settings[key]) {
          toggle.classList.add('active');
        } else {
          toggle.classList.remove('active');
        }
      }

      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        const key = this.getToggleKey(toggle);
        if (key) {
          this.settings[key] = toggle.classList.contains('active');
        }
      });
    });
  }

  getToggleKey(toggle) {
    if (toggle.id) return toggle.id.replace('Toggle', '');
    if (toggle.dataset.source) return `source_${toggle.dataset.source}`;
    if (toggle.dataset.traffic) return `traffic_${toggle.dataset.traffic}`;
    return null;
  }

  setupSliders() {
    const sliders = document.querySelectorAll('.settings-slider');
    
    sliders.forEach(slider => {
      const key = slider.id.replace('Slider', '');
      if (this.settings[key] !== undefined) {
        slider.value = this.settings[key];
      }

      slider.addEventListener('input', (e) => {
        this.settings[key] = e.target.value;
        // Apply brightness in real-time
        if (key === 'brightnes') {
          const mapEl = document.getElementById('map');
          mapEl.style.filter = `brightness(${e.target.value}%)`;
        }
      });
    });
  }

  setupSelects() {
    const selects = document.querySelectorAll('.settings-select');
    
    selects.forEach(select => {
      const key = select.id.replace('Select', '');
      if (this.settings[key] !== undefined) {
        select.value = this.settings[key];
      }

      select.addEventListener('change', (e) => {
        this.settings[key] = e.target.value;
      });
    });
  }

  setupButtons() {
    const saveBtn = document.getElementById('settingsSaveBtn');
    const resetBtn = document.getElementById('settingsResetBtn');
    const closeBtn = document.getElementById('settingsPanelClose');

    saveBtn.addEventListener('click', () => {
      this.saveSettings();
      alert('Settings saved!');
      const panel = document.getElementById('settingsPanel');
      const overlay = document.getElementById('settingsOverlay');
      panel.classList.remove('show');
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    });

    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        this.settings = {};
        localStorage.removeItem('aviquest_settings');
        location.reload();
      }
    });
  }

  loadSettingsToUI() {
    // Map type
    if (this.settings.mapType) {
      const card = document.querySelector(`[data-map="${this.settings.mapType}"]`);
      if (card) {
        document.querySelectorAll('[data-map]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      }
    }

    // Brightness
    if (this.settings.mapBrightness) {
      document.getElementById('brightnesSlider').value = this.settings.mapBrightness;
      const mapEl = document.getElementById('map');
      mapEl.style.filter = `brightness(${this.settings.mapBrightness}%)`;
    }

    // Selects
    Object.keys(this.settings).forEach(key => {
      const select = document.getElementById(key + 'Select');
      if (select) {
        select.value = this.settings[key];
      }
    });

    // Toggles
    Object.keys(this.settings).forEach(key => {
      if (typeof this.settings[key] === 'boolean') {
        let toggle = document.getElementById(key + 'Toggle');
        if (!toggle && key.startsWith('source_')) {
          toggle = document.querySelector(`[data-source="${key.replace('source_', '')}"]`);
        }
        if (!toggle && key.startsWith('traffic_')) {
          toggle = document.querySelector(`[data-traffic="${key.replace('traffic_', '')}"]`);
        }
        if (toggle) {
          if (this.settings[key]) {
            toggle.classList.add('active');
          } else {
            toggle.classList.remove('active');
          }
        }
      }
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsController();
});
