export type MapCoordinate = [number, number];

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_TILE_LAYER = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
} as const;

export const DEFAULT_MAP_CENTER: MapCoordinate = [17.385, 78.4867];
export const MAP_DEFAULT_ZOOM = 12;
export const MAP_FOCUS_ZOOM = 16;

export const WORLD_BOUNDS: [MapCoordinate, MapCoordinate] = [
  [-85.05112878, -180],
  [85.05112878, 180],
];

export const MAP_MIN_ZOOM = 3;
