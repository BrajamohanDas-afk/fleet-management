import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import VehicleMarker from './VehicleMarker';
import type { FleetPosition } from '../../types';
import { MAP_MIN_ZOOM, MAP_TILE_LAYER, WORLD_BOUNDS } from '../../constants/map';

interface MapViewProps {
  positions: FleetPosition[];
  showPermanentLabels: boolean;
  focusTarget: LatLngExpression | null;
}

const DEFAULT_CENTER: LatLngExpression = [17.385, 78.4867];
const DEFAULT_ZOOM = 12;

/**
 * Internal controller that reacts to props and commands the Leaflet map
 * instance (auto-fit on first load, fly-to on track).
 */
function MapController({
  positions,
  focusTarget,
  hasFittedRef,
}: {
  positions: FleetPosition[];
  focusTarget: LatLngExpression | null;
  hasFittedRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();

  // Auto-fit bounds once on first data load, then never steal zoom again.
  useEffect(() => {
    if (hasFittedRef.current) return;
    const coords: [number, number][] = positions
      .filter(
        (p): p is FleetPosition & { latitude: number; longitude: number } =>
          p.latitude != null && p.longitude != null
      )
      .map((p) => [p.latitude, p.longitude]);

    if (coords.length === 0) return;

    if (coords.length === 1) {
      map.setView(coords[0], DEFAULT_ZOOM);
    } else {
      map.fitBounds(coords, { padding: [40, 40] });
    }
    hasFittedRef.current = true;
  }, [positions, map, hasFittedRef]);

  // Fly to a vehicle when the Track button is pressed.
  useEffect(() => {
    if (!focusTarget) return;
    map.flyTo(focusTarget, Math.max(map.getZoom(), 16), {
      duration: 1,
    });
  }, [focusTarget, map]);

  return null;
}

export default function MapView({
  positions,
  showPermanentLabels,
  focusTarget,
}: MapViewProps) {
  const hasFittedRef = useRef(false);

  const center: LatLngExpression =
    positions.length > 0 && positions[0].latitude != null && positions[0].longitude != null
      ? [positions[0].latitude, positions[0].longitude]
      : DEFAULT_CENTER;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-white shadow-sm">
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        minZoom={MAP_MIN_ZOOM}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom
        worldCopyJump={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution={MAP_TILE_LAYER.attribution}
          noWrap
          url={MAP_TILE_LAYER.url}
        />
        <MapController
          positions={positions}
          focusTarget={focusTarget}
          hasFittedRef={hasFittedRef}
        />
        {positions.map((position) => (
          <VehicleMarker
            key={position.vehicle_id}
            position={position}
            showPermanentLabel={showPermanentLabels}
          />
        ))}
      </MapContainer>
    </div>
  );
}
