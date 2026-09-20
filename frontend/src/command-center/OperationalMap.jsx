import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers3,
  LocateFixed,
  Flame,
  Radio,
  Crosshair,
  Compass,
  Wind,
  Thermometer,
  Sparkles,
  Maximize2,
  Minimize2,
  Scan,
  Satellite,
  Radar,
  Eye,
} from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

// Satellite Recon & Tactical Map Layers
const MAP_THEMES = {
  satellite: {
    name: 'Orbital Recon',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Earthstar Geographics',
    maxZoom: 19,
    modeClass: 'mode-satellite',
  },
  dark: {
    name: 'Cyber Dark',
    base: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    overlay: null,
    attribution: '&copy; CARTO dark-matter',
    maxZoom: 20,
    modeClass: 'mode-dark',
  },
  thermal: {
    name: 'Thermal IR',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Thermal Multispectral Recon &copy; Esri',
    maxZoom: 19,
    modeClass: 'mode-thermal',
  },
  matrix: {
    name: 'Tactical Matrix',
    base: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    overlay: null,
    attribution: '&copy; CARTO voyager',
    maxZoom: 20,
    modeClass: 'mode-matrix',
  },
};

const facilityConfig = {
  hospital: { color: '#38bdf8', fillColor: '#0284c7', badge: 'H', title: 'Hospital' },
  fire_station: { color: '#f87171', fillColor: '#dc2626', badge: 'FS', title: 'Fire Station' },
  police: { color: '#60a5fa', fillColor: '#2563eb', badge: 'P', title: 'Police Station' },
  fuel: { color: '#facc15', fillColor: '#ca8a04', badge: '⛽', title: 'Fuel Station' },
  school: { color: '#c084fc', fillColor: '#9333ea', badge: 'S', title: 'School / Shelter' },
};

function createIncidentMarkerHtml(incident, isSelected = false) {
  const p = incident.priority || 'P2';
  const type = incident.type || 'EMERGENCY';
  const glowColor =
    p === 'P0' || incident.severity >= 4 ? '#ef4444' :
      p === 'P1' ? '#f97316' :
        p === 'P2' ? '#eab308' : '#06b6d4';

  const iconGlyph =
    type === 'FIRE' ? '🔥' :
      type === 'MEDICAL' ? '🏥' :
        type === 'POLICE' || type === 'SECURITY' ? '🛡️' :
          type === 'HAZMAT' ? '☣️' :
            type === 'FLOOD' ? '🌊' : '🚨';

  return `
    <div class="tactical-incident-marker ${isSelected ? 'selected' : ''}" style="--glow-color: ${glowColor};">
      <div class="satellite-target-bracket tl"></div>
      <div class="satellite-target-bracket tr"></div>
      <div class="satellite-target-bracket bl"></div>
      <div class="satellite-target-bracket br"></div>
      <div class="radar-pulse-ring"></div>
      <div class="radar-pulse-ring delay-1"></div>
      <div class="tactical-hex-core">
        <span class="incident-glyph">${iconGlyph}</span>
        <span class="priority-badge">${p}</span>
      </div>
      <div class="incident-label-tag">${incident.title?.slice(0, 22) || type}</div>
    </div>
  `;
}

function createResourceMarkerHtml(resource, isSelected = false) {
  const status = resource.status || 'AVAILABLE';
  const type = resource.type || 'AMBULANCE';

  const statusColor =
    status === 'AVAILABLE' ? '#22c55e' :
      status === 'EN_ROUTE' ? '#0284c7' :
        status === 'ON_SCENE' ? '#a855f7' :
          status === 'RESERVED' ? '#f59e0b' : '#64748b';

  const iconGlyph =
    type === 'AMBULANCE' ? '🚑' :
      type === 'FIRE_TRUCK' ? '🚒' :
        type === 'POLICE_UNIT' ? '🚓' :
          type === 'HELICOPTER' ? '🚁' :
            type === 'RESCUE_TEAM' ? '🦺' :
              type === 'HAZMAT_TEAM' ? '☣️' : '🚐';

  const isHeli = type === 'HELICOPTER';

  return `
    <div class="tactical-resource-marker ${isSelected ? 'selected' : ''} ${isHeli ? 'heli-unit' : ''}" style="--unit-color: ${statusColor};">
      <div class="unit-beacon-halo"></div>
      <div class="unit-core-box">
        <span class="unit-icon">${iconGlyph}</span>
        <span class="unit-status-dot"></span>
      </div>
      <div class="unit-id-tag">${resource.resourceId || resource.name}</div>
    </div>
  `;
}

function createHospitalMarkerHtml(hospital, isSelected = false) {
  const isOverloaded = hospital.status === 'OVERLOADED';
  const color = isOverloaded ? '#ef4444' : hospital.status === 'LIMITED' ? '#f59e0b' : '#38bdf8';

  return `
    <div class="tactical-hospital-marker ${isSelected ? 'selected' : ''}" style="--hosp-color: ${color};">
      <div class="hospital-shield">
        <span class="hospital-cross">✚</span>
        <span class="icu-badge">${hospital.availableIcuBeds ?? '—'}</span>
      </div>
      <div class="hospital-name-tag">${hospital.name?.slice(0, 20) || 'Hospital'}</div>
    </div>
  `;
}

export function OperationalMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const groupsRef = useRef({});
  const fittedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('satellite'); // Default: Satellite Recon
  const [radarSweepEnabled, setRadarSweepEnabled] = useState(false);
  const [scanlinesEnabled, setScanlinesEnabled] = useState(false);
  const [mouseCoords, setMouseCoords] = useState({ lat: 23.0225, lng: 72.5714 });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const lastMouseUpdateRef = useRef(0);

  const {
    incidents,
    resources,
    hospitals,
    roads,
    liveContext,
    mapFilters,
    selectedIncidentId,
    selectedResourceId,
    selectedHospitalId,
    selectIncident,
    selectResource,
    selectHospital,
    toggleLayer,
  } = useCommandCenter();

  // Initialize Map with Satellite Layer Default
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 4,
      maxZoom: 19,
      preferCanvas: true,
    }).setView([23.0225, 72.5714], 12);

    const initialTheme = MAP_THEMES.satellite;

    const baseLayer = L.tileLayer(initialTheme.base, {
      maxZoom: initialTheme.maxZoom,
      subdomains: 'abcd',
    }).addTo(map);

    const overlayLayer = initialTheme.overlay
      ? L.tileLayer(initialTheme.overlay, {
        maxZoom: initialTheme.maxZoom,
        opacity: 0.95,
      }).addTo(map)
      : null;

    baseLayerRef.current = baseLayer;
    overlayLayerRef.current = overlayLayer;

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    // Tactical Layer Groups
    groupsRef.current = {
      radarSweep: L.layerGroup().addTo(map),
      routes: L.layerGroup().addTo(map),
      facilities: L.layerGroup().addTo(map),
      hospitals: L.layerGroup().addTo(map),
      resources: L.layerGroup().addTo(map),
      incidents: L.layerGroup().addTo(map),
    };

    // Track mouse coordinates for Satellite HUD (throttled to 250ms to eliminate lag)
    map.on('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMouseUpdateRef.current > 250) {
        lastMouseUpdateRef.current = now;
        setMouseCoords({
          lat: Number(e.latlng.lat.toFixed(4)),
          lng: Number(e.latlng.lng.toFixed(4)),
        });
      }
    });

    requestAnimationFrame(() => setReady(true));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle Satellite / Theme Switching
  useEffect(() => {
    if (!mapRef.current || !baseLayerRef.current) return;
    const map = mapRef.current;
    const theme = MAP_THEMES[currentTheme] || MAP_THEMES.satellite;

    baseLayerRef.current.setUrl(theme.base);

    if (overlayLayerRef.current) {
      map.removeLayer(overlayLayerRef.current);
      overlayLayerRef.current = null;
    }

    if (theme.overlay) {
      const newOverlay = L.tileLayer(theme.overlay, {
        maxZoom: theme.maxZoom,
        opacity: 0.95,
      }).addTo(map);
      overlayLayerRef.current = newOverlay;
    }
  }, [currentTheme]);

  // Handle Layer Filters
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const groups = groupsRef.current;

    Object.entries(groups).forEach(([name, group]) => {
      const enabled = mapFilters[name] ?? true;
      if (enabled && !map.hasLayer(group)) group.addTo(map);
      if (!enabled && map.hasLayer(group)) map.removeLayer(group);
    });
  }, [mapFilters, ready]);

  // Render All Satellite Tactical Entities
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const map = mapRef.current;
    const groups = groupsRef.current;
    const allCoordinates = [];

    // Clear previous elements
    Object.values(groups).forEach((group) => group.clearLayers());

    // 1. Radar Sweep Beacon at Center
    if (radarSweepEnabled) {
      L.circle([23.0225, 72.5714], {
        radius: 14000,
        color: '#06b6d4',
        weight: 1,
        fillColor: '#0891b2',
        fillOpacity: 0.03,
        dashArray: '4, 12',
      }).addTo(groups.radarSweep);

      L.circle([23.0225, 72.5714], {
        radius: 7000,
        color: '#06b6d4',
        weight: 1,
        fillColor: 'transparent',
        dashArray: '2, 8',
      }).addTo(groups.radarSweep);
    }

    // 2. Render Incident Markers with Recon Threat Blast Zones
    const incidentList = Object.values(incidents || {}).filter(
      (inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status)
    );

    incidentList.forEach((incident) => {
      const lat = Number(incident.latitude);
      const lng = Number(incident.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      allCoordinates.push([lat, lng]);
      const isSelected = selectedIncidentId === incident.incidentId;

      // Outer evacuation perimeter + inner epicenter
      const radiusMeters = incident.priority === 'P0' ? 900 : incident.priority === 'P1' ? 600 : 350;
      const ringColor = incident.priority === 'P0' ? '#ef4444' : incident.priority === 'P1' ? '#f97316' : '#06b6d4';

      L.circle([lat, lng], {
        radius: radiusMeters,
        color: ringColor,
        weight: isSelected ? 2.5 : 1.2,
        dashArray: isSelected ? '4, 4' : '8, 8',
        fillColor: ringColor,
        fillOpacity: isSelected ? 0.22 : 0.08,
      }).addTo(groups.incidents);

      // Inner epicenter ring
      L.circle([lat, lng], {
        radius: radiusMeters * 0.35,
        color: ringColor,
        weight: 1.5,
        fillColor: ringColor,
        fillOpacity: 0.35,
      }).addTo(groups.incidents);

      // Glowing Hex Marker
      const icon = L.divIcon({
        className: 'custom-tactical-div-icon',
        html: createIncidentMarkerHtml(incident, isSelected),
        iconSize: [46, 46],
        iconAnchor: [23, 23],
      });

      const marker = L.marker([lat, lng], { icon, zIndexOffset: isSelected ? 1000 : 500 })
        .on('click', () => selectIncident(incident.incidentId))
        .bindPopup(`
          <div class="tactical-popup satellite-popup">
            <div class="popup-header">
              <span class="popup-type">🛰️ SATELLITE RECON // ${incident.type}</span>
              <span class="popup-status status-${incident.status?.toLowerCase()}">${incident.priority}</span>
            </div>
            <strong class="popup-title">${incident.title}</strong>
            <p class="popup-desc">${incident.summary || 'Active emergency anomaly detected in orbital sector.'}</p>
            <div class="popup-meta">
              <span><b>Target Coordinates:</b> ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</span>
              <span><b>Confidence Rating:</b> ${Math.round((incident.confidence || 0.88) * 100)}% (Multi-Vector)</span>
              <span><b>Active Hazards:</b> ${(incident.hazards || ['active']).join(', ')}</span>
            </div>
          </div>
        `)
        .addTo(groups.incidents);

      if (isSelected) {
        marker.openPopup();
      }
    });

    // 3. Render Tactical Fleet Units (Ambulances, Fire, Police, Choppers)
    const resourceList = Object.values(resources || {});
    resourceList.forEach((resource) => {
      const lat = Number(resource.latitude);
      const lng = Number(resource.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      allCoordinates.push([lat, lng]);
      const isSelected = selectedResourceId === resource.resourceId;

      const icon = L.divIcon({
        className: 'custom-tactical-div-icon',
        html: createResourceMarkerHtml(resource, isSelected),
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      L.marker([lat, lng], { icon, zIndexOffset: isSelected ? 900 : 400 })
        .on('click', () => selectResource(resource.resourceId))
        .bindPopup(`
          <div class="tactical-popup satellite-popup">
            <div class="popup-header">
              <span class="popup-type">UNIT TELEMETRY // ${resource.type}</span>
              <span class="popup-status status-${resource.status?.toLowerCase()}">${resource.status}</span>
            </div>
            <strong class="popup-title">${resource.name}</strong>
            <div class="popup-meta">
              <span><b>Callsign:</b> ${resource.resourceId}</span>
              <span><b>Assigned Sector:</b> ${resource.currentIncident?.incidentId || 'Ready for Dispatch'}</span>
              <span><b>GPS Fix:</b> ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</span>
            </div>
          </div>
        `)
        .addTo(groups.resources);

      // Glowing Neon Route Lines to Assigned Incidents
      if (resource.currentIncident?.incidentId && incidents[resource.currentIncident.incidentId]) {
        const targetInc = incidents[resource.currentIncident.incidentId];
        const targetLat = Number(targetInc.latitude);
        const targetLng = Number(targetInc.longitude);

        if (Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
          // Glow halo corridor
          L.polyline([[lat, lng], [targetLat, targetLng]], {
            color: '#06b6d4',
            weight: 7,
            opacity: 0.35,
          }).addTo(groups.routes);

          // Flowing dashed neon core
          L.polyline([[lat, lng], [targetLat, targetLng]], {
            color: '#22d3ee',
            weight: 3,
            dashArray: '8, 8',
            className: 'pulsing-neon-route',
            opacity: 0.98,
          }).addTo(groups.routes);
        }
      }
    });

    // 4. Render Hospitals
    const hospitalList = Object.values(hospitals || {});
    hospitalList.forEach((hospital) => {
      const lat = Number(hospital.latitude);
      const lng = Number(hospital.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      allCoordinates.push([lat, lng]);
      const isSelected = selectedHospitalId === hospital.hospitalId;

      const icon = L.divIcon({
        className: 'custom-tactical-div-icon',
        html: createHospitalMarkerHtml(hospital, isSelected),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      L.marker([lat, lng], { icon, zIndexOffset: 300 })
        .on('click', () => selectHospital(hospital.hospitalId))
        .bindPopup(`
          <div class="tactical-popup satellite-popup">
            <div class="popup-header">
              <span class="popup-type">MED-EVAC FACILITY</span>
              <span class="popup-status status-${hospital.status?.toLowerCase()}">${hospital.status}</span>
            </div>
            <strong class="popup-title">${hospital.name}</strong>
            <div class="popup-stats-grid">
              <div><small>Available Beds</small><b>${hospital.availableBeds ?? 0} / ${hospital.totalBeds ?? 0}</b></div>
              <div><small>Available ICU</small><b>${hospital.availableIcuBeds ?? 0} / ${hospital.icuBeds ?? 0}</b></div>
              <div><small>Emergency Dock</small><b>${hospital.availableEmergencyCapacity ?? 0}</b></div>
              <div><small>Ambulance Bay</small><b>${hospital.ambulanceCapacity ?? 'Active'}</b></div>
            </div>
          </div>
        `)
        .addTo(groups.hospitals);
    });

    // 5. Render Preloaded OSM Infrastructure Nodes
    const facilitiesList = liveContext?.facilities || [];
    facilitiesList.forEach((facility) => {
      const lat = Number(facility.location?.lat);
      const lng = Number(facility.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      allCoordinates.push([lat, lng]);
      const cfg = facilityConfig[facility.type] || {
        color: '#cbd5e1',
        fillColor: '#0f766e',
        badge: 'F',
        title: 'Facility',
      };

      L.circleMarker([lat, lng], {
        radius: 7,
        color: cfg.color,
        weight: 1.8,
        fillColor: cfg.fillColor,
        fillOpacity: 0.95,
      })
        .bindTooltip(cfg.badge, {
          permanent: true,
          direction: 'center',
          className: `map-label facility-label facility-${facility.type}`,
        })
        .bindPopup(`
          <div class="tactical-popup satellite-popup">
            <strong class="popup-title">${facility.name}</strong>
            <span class="popup-type">${cfg.title} · OpenStreetMap Intelligence</span>
          </div>
        `)
        .addTo(groups.facilities);
    });

    // Auto-fit on initial render
    if (!fittedRef.current && allCoordinates.length > 0) {
      map.fitBounds(L.latLngBounds(allCoordinates), {
        padding: [60, 60],
        maxZoom: 14,
      });
      fittedRef.current = true;
    }
  }, [
    ready,
    incidents,
    resources,
    hospitals,
    liveContext,
    selectedIncidentId,
    selectedResourceId,
    selectedHospitalId,
    radarSweepEnabled,
    selectIncident,
    selectResource,
    selectHospital,
  ]);

  const handleFocusIncidents = () => {
    if (!mapRef.current) return;
    const activeCoords = Object.values(incidents || {})
      .filter((i) => !['RESOLVED', 'CANCELLED'].includes(i.status))
      .map((i) => [Number(i.latitude), Number(i.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (activeCoords.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(activeCoords), {
        padding: [80, 80],
        maxZoom: 15,
        animate: true,
      });
    }
  };

  const handleResetView = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo([23.0225, 72.5714], 12, { duration: 1.2 });
  };

  const weather = liveContext?.weather?.current;
  const activeThemeObj = MAP_THEMES[currentTheme] || MAP_THEMES.satellite;

  return (
    <section
      className={`map-shell tactical-map-shell ${activeThemeObj.modeClass} ${isFullScreen ? 'fullscreen-map' : ''}`}
      aria-label="Satellite Reconnaissance Command Map"
    >
      {/* Scanline CRT overlay effect */}
      {scanlinesEnabled && <div className="satellite-scanlines-overlay" />}

      {/* Rotating Radar Sweep Cone Effect */}
      {radarSweepEnabled && <div className="radar-sweep-cone" />}

      <div ref={containerRef} className="operational-map tactical-canvas" />

      {!ready && (
        <div className="map-message">
          <Sparkles className="spin tone-cyan" size={26} />
          <span>ESTABLISHING HIGH-RES SATELLITE RECON LINK…</span>
        </div>
      )}

      {/* Top Left: Orbital Satellite Pass Telemetry */}
      <div className="map-tactical-hud-top-left">
        <div className="hud-badge-title satellite-hud-title">
          <Satellite size={14} className="tone-cyan pulsate" />
          <span>ORBITAL RECON // RESQ-SAT-4A (0.35m/px)</span>
        </div>

        {weather && (
          <div className="hud-weather-pill">
            <span><Thermometer size={12} className="tone-amber" /> {Math.round(weather.temperature_2m)}°C</span>
            <span><Wind size={12} className="tone-cyan" /> {Math.round(weather.wind_speed_10m)} km/h</span>
            <span
              className="wind-direction-arrow"
              style={{ transform: `rotate(${weather.wind_direction_10m || 0}deg)` }}
              title={`Wind direction: ${weather.wind_direction_10m}°`}
            >
              <Compass size={12} />
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Satellite Mode Selector */}
      <div className="map-tactical-hud-top-right">
        <div className="theme-switcher-bar satellite-mode-bar">
          {Object.entries(MAP_THEMES).map(([key, theme]) => (
            <button
              key={key}
              type="button"
              className={`theme-btn ${currentTheme === key ? 'active' : ''}`}
              onClick={() => setCurrentTheme(key)}
              title={theme.name}
            >
              {key === 'satellite' ? '🛰️ Satellite' : key === 'thermal' ? '📡 Thermal IR' : key === 'dark' ? '🌃 Cyber Dark' : '🗺️ Matrix'}
            </button>
          ))}

          <button
            type="button"
            className={`theme-btn radar-toggle-btn ${radarSweepEnabled ? 'active' : ''}`}
            onClick={() => setRadarSweepEnabled(!radarSweepEnabled)}
            title="Toggle Radar Sweep Beacon"
          >
            <Radar size={13} className={radarSweepEnabled ? 'spin-slow' : ''} />
          </button>

          <button
            type="button"
            className={`theme-btn scanline-toggle-btn ${scanlinesEnabled ? 'active' : ''}`}
            onClick={() => setScanlinesEnabled(!scanlinesEnabled)}
            title="Toggle Scanline Grid"
          >
            <Scan size={13} />
          </button>

          <button
            type="button"
            className="theme-btn fullscreen-toggle"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Bottom Right: Satellite Overlays Key */}
      <div className="map-tactical-hud-bottom-right">
        <fieldset className="layer-controls tactical-layer-controls">
          <legend>
            <Layers3 size={11} /> Satellite Overlays
          </legend>
          <div className="layer-chip-grid">
            <label className="layer-chip">
              <input
                type="checkbox"
                checked={mapFilters.incidents ?? true}
                onChange={() => toggleLayer('incidents')}
              />
              <span className="tone-red">🔥 Incidents ({Object.keys(incidents || {}).length})</span>
            </label>
            <label className="layer-chip">
              <input
                type="checkbox"
                checked={mapFilters.resources ?? true}
                onChange={() => toggleLayer('resources')}
              />
              <span className="tone-cyan">🚑 Fleet Units ({Object.keys(resources || {}).length})</span>
            </label>
            <label className="layer-chip">
              <input
                type="checkbox"
                checked={mapFilters.hospitals ?? true}
                onChange={() => toggleLayer('hospitals')}
              />
              <span className="tone-green">🏥 Hospitals ({Object.keys(hospitals || {}).length})</span>
            </label>
            <label className="layer-chip">
              <input
                type="checkbox"
                checked={mapFilters.facilities ?? true}
                onChange={() => toggleLayer('facilities')}
              />
              <span className="tone-violet">🏛️ OSM Facilities ({liveContext?.facilities?.length || 0})</span>
            </label>
            <label className="layer-chip">
              <input
                type="checkbox"
                checked={mapFilters.routes ?? true}
                onChange={() => toggleLayer('routes')}
              />
              <span className="tone-amber">⚡ Corridors</span>
            </label>
          </div>
        </fieldset>
      </div>

      {/* Bottom Left: Mouse Telemetry Reticle & Quick Focus Toolbar */}
      <div className="map-tactical-hud-bottom-left">
        <div className="telemetry-bar satellite-telemetry-bar">
          <span className="telemetry-item">
            <Crosshair size={11} className="tone-cyan" /> LAT: <b>{mouseCoords.lat}°N</b>
          </span>
          <span className="telemetry-item">
            LNG: <b>{mouseCoords.lng}°E</b>
          </span>
          <span className="telemetry-item">
            TARGET: <b>LOCKED</b>
          </span>
        </div>

        <div className="quick-action-toolbar">
          <button
            type="button"
            onClick={handleFocusIncidents}
            className="quick-hud-btn"
            title="Focus All Active Incidents"
          >
            <Flame size={12} className="tone-red" /> Focus Active Incidents
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="quick-hud-btn"
            title="Reset to Ahmedabad Metro"
          >
            <LocateFixed size={12} className="tone-cyan" /> Center Command
          </button>
        </div>
      </div>
    </section>
  );
}
