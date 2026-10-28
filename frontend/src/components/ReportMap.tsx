import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ReportItem, MunicipalAsset } from '../types';

interface ReportMapProps {
  reports: ReportItem[];
  assets: MunicipalAsset[];
  selectedReport?: ReportItem | null;
  onSelectReport?: (report: ReportItem) => void;
  interactiveSelectLocation?: boolean;
  onLocationSelected?: (lat: number, lon: number) => void;
  selectedCoord?: { lat: number; lon: number } | null;
  heightClass?: string;
  showDrains?: boolean;
  showWaterways?: boolean;
}

export function ReportMap({
  reports,
  assets,
  selectedReport,
  onSelectReport,
  interactiveSelectLocation = false,
  onLocationSelected,
  selectedCoord,
  heightClass = 'h-full',
  showDrains = true,
  showWaterways = true,
}: ReportMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const clickMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Center on Pune municipal hub
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView([18.5204, 73.8368], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Map click handler for location selection
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!interactiveSelectLocation) return;
      const { lat, lng } = e.latlng;
      if (onLocationSelected) {
        onLocationSelected(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [interactiveSelectLocation, onLocationSelected]);

  // Invalidate map size on layout/visibility changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  // Update selected incident location marker (pin) and center map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (clickMarkerRef.current) {
      clickMarkerRef.current.remove();
      clickMarkerRef.current = null;
    }

    if (selectedCoord) {
      const icon = L.divIcon({
        className: 'custom-pin',
        html: `
          <div style="background-color: #047857; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
            <div style="transform: rotate(45deg); color: white; font-size: 13px; font-weight: bold;">📍</div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([selectedCoord.lat, selectedCoord.lon], { icon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #047857;">Incident Location</strong><br/>
          <span style="font-family: monospace; color: #475569;">Lat: ${selectedCoord.lat.toFixed(6)}, Lon: ${selectedCoord.lon.toFixed(6)}</span>
        </div>
      `);
      clickMarkerRef.current = marker;
      map.setView([selectedCoord.lat, selectedCoord.lon], Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [selectedCoord]);

  // Update report markers and municipal asset layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // 1. Plot Municipal Assets
    assets.forEach((asset) => {
      const isWaterway = ['river', 'canal', 'retention_pond'].includes(asset.asset_type);
      if (isWaterway && !showWaterways) return;
      if (!isWaterway && !showDrains) return;

      const color = isWaterway ? '#0284c7' : '#059669';

      const marker = L.circleMarker([asset.latitude, asset.longitude], {
        radius: isWaterway ? 9 : 7,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 200px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: ${color};">${asset.name}</strong>
          </div>
          <div style="font-size: 11px; color: #475569;">
            Type: <b style="text-transform: uppercase;">${asset.asset_type.replace('_', ' ')}</b>
          </div>
          <div style="font-size: 11px; color: #475569;">
            Status: <b style="text-transform: uppercase; color: ${asset.capacity_status === 'choked' ? '#dc2626' : '#1e293b'}">${asset.capacity_status}</b>
          </div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
            ${asset.description}
          </div>
        </div>
      `);
      layer.addLayer(marker);
    });

    // 2. Plot Citizen Reports with deliberate high-contrast risk badges
    reports.forEach((rep) => {
      const isCritical = rep.risk_score >= 75;
      const isHigh = rep.risk_score >= 50 && rep.risk_score < 75;
      const isModerate = rep.risk_score >= 25 && rep.risk_score < 50;

      const bgColor = isCritical
        ? '#b91c1c'
        : isHigh
        ? '#c2410c'
        : isModerate
        ? '#b45309'
        : '#15803d';

      const isSelected = selectedReport?.id === rep.id;

      const icon = L.divIcon({
        className: 'report-risk-badge',
        html: `
          <div style="
            background-color: ${bgColor}; 
            color: #ffffff; 
            width: ${isSelected ? '36px' : '30px'}; 
            height: ${isSelected ? '36px' : '30px'}; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: ${isSelected ? '12px' : '11px'}; 
            font-weight: 700; 
            font-family: inherit; 
            border: 2px solid ${isSelected ? '#0f172a' : '#ffffff'}; 
            box-shadow: ${isSelected ? '0 0 0 3px rgba(15,23,42,0.4), 0 4px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.25)'};
            transition: all 150ms ease;
          ">
            ${rep.risk_score}
          </div>
        `,
        iconSize: [isSelected ? 36 : 30, isSelected ? 36 : 30],
        iconAnchor: [isSelected ? 18 : 15, isSelected ? 18 : 15],
      });

      const marker = L.marker([rep.latitude, rep.longitude], { icon });

      marker.on('click', () => {
        if (onSelectReport) onSelectReport(rep);
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; width: 220px; line-height: 1.4;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${rep.id}</span>
            <span style="background-color: ${bgColor}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
              Score: ${rep.risk_score}
            </span>
          </div>
          <img src="${rep.image_path}" style="width: 100%; height: 96px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 6px;" />
          <div style="font-weight: 600; color: #0f172a; margin-bottom: 2px;">${rep.title}</div>
          <div style="font-size: 11px; color: #475569;">
            Detected: <b>${rep.ml_category}</b> (${Math.round(rep.ml_confidence * 100)}%)
          </div>
          <div style="font-size: 11px; color: #475569;">
            Status: <b>${rep.status}</b>
          </div>
        </div>
      `);

      layer.addLayer(marker);
    });

    if (selectedReport) {
      map.setView([selectedReport.latitude, selectedReport.longitude], 15, { animate: true });
    }
  }, [reports, assets, selectedReport, onSelectReport, showDrains, showWaterways]);

  return (
    <div className={`relative w-full ${heightClass} bg-slate-100 overflow-hidden`}>
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
