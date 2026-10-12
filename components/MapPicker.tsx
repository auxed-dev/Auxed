import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { TILE_ATTRIBUTION, TILE_CLASS, TILE_URL } from '@/lib/client/mapTiles';

/** Tap the map to drop the venue pin. */
export default function MapPicker({ lat, lng, onPick }: { lat: number | null; lng: number | null; onPick: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const cb = useRef(onPick);
  cb.current = onPick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(lat !== null && lng !== null ? [lat, lng] : [-26.2041, 28.0473], lat !== null ? 15 : 10);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, className: TILE_CLASS }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cb.current(Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || lat === null || lng === null) return;
    if (!pin.current) pin.current = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#C9F13B', fillOpacity: 1 }).addTo(m);
    else pin.current.setLatLng([lat, lng]);
    if (!m.getBounds().contains([lat, lng])) m.setView([lat, lng], 15);
  }, [lat, lng]);

  return <div ref={el} className="h-[220px] w-full overflow-hidden rounded-[18px]" aria-label="Tap to place the venue pin" />;
}
