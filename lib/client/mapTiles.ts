/**
 * Map tiles. Set NEXT_PUBLIC_MAP_TILE_URL (+ _ATTRIBUTION) to a dark style from your tile provider
 * (e.g. MapTiler / Stadia / Mapbox with an API key) for production. Without it we fall back to
 * OpenStreetMap's standard tiles, darkened with a CSS filter — fine for development and light use
 * under the OSM tile usage policy, not for production traffic.
 */
export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Darken light fallback tiles to match the design; custom (already dark) tiles are left alone. */
export const TILE_CLASS = process.env.NEXT_PUBLIC_MAP_TILE_URL ? '' : 'auxed-dark-tiles';
