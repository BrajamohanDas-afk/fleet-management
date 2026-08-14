import type { LatLngBoundsExpression } from 'leaflet';

export const MAP_TILE_LAYER = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
} as const;

export const WORLD_BOUNDS: LatLngBoundsExpression = [
  [-85.05112878, -180],
  [85.05112878, 180],
];

export const MAP_MIN_ZOOM = 3;
