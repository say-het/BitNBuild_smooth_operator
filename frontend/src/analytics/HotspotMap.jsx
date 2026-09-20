import { useEffect, useRef } from 'react';
import L from 'leaflet';

export function HotspotMap({ data }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: false }).setView([23.0225, 72.5714], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => map.remove();
  }, []);
  useEffect(() => {
    if (!mapRef.current) return;
    layerRef.current.clearLayers();
    const points = data.features.map(({ geometry, properties }) => {
      const point = [geometry.coordinates[1], geometry.coordinates[0]];
      const count = Number(properties.incidentCount ?? 1);
      L.circle(point, { radius: Math.max(300, Number(properties.severityWeight ?? 1) * 230), color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.18 }).addTo(layerRef.current);
      L.circleMarker(point, { radius: Math.min(15, 4 + count), color: '#fecaca', weight: 1, fillColor: '#ef4444', fillOpacity: 0.7 }).bindTooltip(`${count} incidents`).addTo(layerRef.current);
      return point;
    });
    if (points.length) mapRef.current.fitBounds(L.latLngBounds(points), { padding: [55, 55], maxZoom: 13 });
  }, [data]);
  return <div ref={containerRef} className="analytics-hotspot-map" aria-label="Incident hotspot map" />;
}
