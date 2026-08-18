import { useEffect } from 'react';
import { format } from 'date-fns';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import type { FleetPosition, VehicleStatus } from '../../types';

interface VehicleMarkerProps {
  map: MapLibreMap;
  position: FleetPosition;
  showPermanentLabel: boolean;
  onSelectVehicle?: (position: FleetPosition) => void;
}

const STATUS_LABELS: Record<VehicleStatus, string> = {
  moving: 'Running',
  standing: 'Stationary',
  stale: 'Stale',
  offline: 'Offline',
};

const STATUS_COLORS: Record<VehicleStatus, string> = {
  moving: '#10b981',
  standing: '#2563eb',
  stale: '#f59e0b',
  offline: '#64748b',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createMarkerElement(
  position: FleetPosition,
  showPermanentLabel: boolean
): HTMLButtonElement {
  const color = STATUS_COLORS[position.status];
  const hasHeading =
    position.heading_deg != null && Number.isFinite(position.heading_deg);
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'app-map-marker';
  marker.title = position.registration_no;
  marker.setAttribute('aria-label', `Show ${position.registration_no} on map`);
  marker.style.position = 'relative';
  marker.style.display = 'grid';
  marker.style.placeItems = 'center';
  marker.style.width = showPermanentLabel ? '124px' : '42px';
  marker.style.height = showPermanentLabel ? '56px' : '42px';
  marker.style.border = '0';
  marker.style.background = 'transparent';
  marker.style.cursor = 'pointer';
  marker.style.padding = '0';

  const halo = document.createElement('span');
  halo.style.position = 'absolute';
  halo.style.width = '38px';
  halo.style.height = '38px';
  halo.style.borderRadius = '9999px';
  halo.style.background = color;
  halo.style.opacity = position.status === 'moving' ? '0.18' : '0.1';
  halo.style.animation = position.status === 'moving' ? 'app-map-ping 1.8s ease-out infinite' : 'none';
  halo.style.transform = 'scale(1)';
  marker.appendChild(halo);

  const dot = document.createElement('span');
  dot.style.position = 'relative';
  dot.style.display = 'block';
  dot.style.width = hasHeading ? '25px' : '22px';
  dot.style.height = hasHeading ? '31px' : '22px';
  dot.style.background = color;
  dot.style.border = '3px solid #ffffff';
  dot.style.boxShadow = '0 10px 20px rgba(15, 23, 42, 0.22)';
  dot.style.transition = 'transform 0.18s ease, box-shadow 0.18s ease';
  dot.style.transform = hasHeading
    ? `rotate(${position.heading_deg}deg)`
    : 'none';
  dot.style.clipPath = hasHeading
    ? 'polygon(50% 0%, 92% 100%, 50% 72%, 8% 100%)'
    : 'none';
  dot.style.borderRadius = hasHeading ? '7px' : '9999px';
  marker.appendChild(dot);

  if (showPermanentLabel) {
    const label = document.createElement('span');
    label.textContent = position.registration_no;
    label.style.position = 'absolute';
    label.style.left = '50%';
    label.style.top = '36px';
    label.style.transform = 'translateX(-50%)';
    label.style.maxWidth = '118px';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';
    label.style.border = '1px solid rgba(16, 32, 42, 0.12)';
    label.style.borderRadius = '8px';
    label.style.background = 'rgba(255, 255, 255, 0.95)';
    label.style.padding = '3px 7px';
    label.style.fontSize = '12px';
    label.style.fontWeight = '800';
    label.style.color = '#111827';
    label.style.boxShadow = '0 8px 18px rgba(15, 23, 42, 0.12)';
    marker.appendChild(label);
  }

  return marker;
}

function formatLastSeen(value: string | null | undefined): string {
  if (!value) return '--';
  try {
    return format(new Date(value), 'dd-MM-yyyy HH:mm');
  } catch {
    return '--';
  }
}

export default function VehicleMarker({
  map,
  position,
  showPermanentLabel,
  onSelectVehicle,
}: VehicleMarkerProps) {
  useEffect(() => {
    if (position.latitude == null || position.longitude == null) return;

    const statusLabel = STATUS_LABELS[position.status];
    const speedText =
      position.speed_kmh != null ? `${Math.round(position.speed_kmh)} km/h` : '--';
    const markerElement = createMarkerElement(position, showPermanentLabel);
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 24,
    }).setHTML(`
      <div style="font: 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-width: 170px;">
        <div style="font-weight: 700; color: #111827; margin-bottom: 7px;">${escapeHtml(position.registration_no)}</div>
        <div style="display: grid; gap: 4px; color: #52656d;">
          <div>Status: <strong style="color: #111827;">${escapeHtml(statusLabel)}</strong></div>
          <div>Speed: <strong style="color: #111827;">${escapeHtml(speedText)}</strong></div>
          <div style="font-size: 12px; color: #8a9ba2; margin-top: 2px;">Last seen: ${escapeHtml(formatLastSeen(position.received_at))}</div>
        </div>
      </div>
    `);
    const marker = new maplibregl.Marker({
      element: markerElement,
      anchor: 'center',
    })
      .setLngLat([position.longitude, position.latitude])
      .setPopup(popup)
      .addTo(map);
    const handleClick = () => onSelectVehicle?.(position);
    markerElement.addEventListener('click', handleClick);

    return () => {
      markerElement.removeEventListener('click', handleClick);
      popup.remove();
      marker.remove();
    };
  }, [map, onSelectVehicle, position, showPermanentLabel]);

  return null;
}