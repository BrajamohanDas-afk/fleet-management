import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import VehicleMarker from './VehicleMarker';
import type { FleetPosition } from '../../types';
import {
  DEFAULT_MAP_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FOCUS_ZOOM,
  MAP_MIN_ZOOM,
  MAP_STYLE_URL,
  type MapCoordinate,
} from '../../constants/map';

interface MapViewProps {
  positions: FleetPosition[];
  showPermanentLabels: boolean;
  focusTarget: MapCoordinate | null;
  onSelectVehicle?: (position: FleetPosition) => void;
}

function toLngLat([lat, lng]: MapCoordinate): [number, number] {
  return [lng, lat];
}

function getPositionCoordinate(position: FleetPosition): MapCoordinate | null {
  if (position.latitude == null || position.longitude == null) return null;
  return [position.latitude, position.longitude];
}

function buildBounds(positions: FleetPosition[]): [[number, number], [number, number]] | null {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  positions.forEach((position) => {
    if (position.latitude == null || position.longitude == null) return;
    minLat = Math.min(minLat, position.latitude);
    maxLat = Math.max(maxLat, position.latitude);
    minLng = Math.min(minLng, position.longitude);
    maxLng = Math.max(maxLng, position.longitude);
  });

  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export default function MapView({
  positions,
  showPermanentLabels,
  focusTarget,
  onSelectVehicle,
}: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasFittedRef = useRef(false);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const validPositions = useMemo(
    () => positions.filter((position) => position.latitude != null && position.longitude != null),
    [positions]
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const nextMap = new maplibregl.Map({
      container: mapElementRef.current,
      style: MAP_STYLE_URL,
      center: toLngLat(DEFAULT_MAP_CENTER),
      zoom: MAP_DEFAULT_ZOOM,
      minZoom: MAP_MIN_ZOOM,
      attributionControl: false,
    });

    nextMap.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    nextMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    nextMap.on('error', () => {
      setLoadError('The open map could not be loaded. Check the network connection.');
    });
    mapRef.current = nextMap;
    setMap(nextMap);

    return () => {
      nextMap.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map || hasFittedRef.current || validPositions.length === 0) return;

    if (validPositions.length === 1) {
      const coordinate = getPositionCoordinate(validPositions[0]);
      if (coordinate) {
        map.easeTo({ center: toLngLat(coordinate), zoom: MAP_DEFAULT_ZOOM, duration: 400 });
      }
    } else {
      const bounds = buildBounds(validPositions);
      if (bounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: MAP_FOCUS_ZOOM, duration: 400 });
      }
    }

    hasFittedRef.current = true;
  }, [map, validPositions]);

  useEffect(() => {
    if (!map || !focusTarget) return;
    map.easeTo({ center: toLngLat(focusTarget), zoom: Math.max(map.getZoom(), MAP_FOCUS_ZOOM), duration: 450 });
  }, [focusTarget, map]);

  return (
    <div className="app-card app-animate-in relative h-full min-h-[31rem] w-full overflow-hidden" data-testid="fleet-map-container">
      <div ref={mapElementRef} className="h-full w-full" data-testid="fleet-map" />

      <div className="app-chip pointer-events-none absolute left-4 top-4 bg-white/90 backdrop-blur">
        {validPositions.length} tracked
      </div>

      {loadError && (
        <div className="absolute left-4 top-16 max-w-sm rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--danger-50)', borderColor: 'var(--danger-100)', color: 'var(--danger-text)' }}>
          {loadError}
        </div>
      )}
      {!map && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          Loading map...
        </div>
      )}
      {map &&
        validPositions.map((position) => (
          <VehicleMarker
            key={position.vehicle_id}
            map={map}
            position={position}
            showPermanentLabel={showPermanentLabels}
            onSelectVehicle={onSelectVehicle}
          />
        ))}
    </div>
  );
}