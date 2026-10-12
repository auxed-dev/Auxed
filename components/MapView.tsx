import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { FriendDTO, VenueDTO } from '@/lib/types';
import { TILE_ATTRIBUTION, TILE_CLASS, TILE_URL } from '@/lib/client/mapTiles';

export interface MapVenue extends VenueDTO {
  heat: number;
  live: { id: string; title: string; performer: string; nowPlaying: string | null }[];
}
export interface MapEvent {
  id: string;
  title: string;
  lat: number;
  lng: number;
  imageUrl: string | null;
  startsAt: string;
  venueId: string | null;
}

export interface MapViewProps {
  venues: MapVenue[];
  events: MapEvent[];
  friends: FriendDTO[];
  focus?: { lat: number; lng: number; zoom?: number } | null;
  fitFriends?: boolean;
  me?: { lat: number; lng: number } | null;
  onVenue: (v: MapVenue) => void;
  onEvent: (e: MapEvent) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function waitLabel(min: number | null) {
  if (min === null || min === undefined) return '';
  const long = min >= 45;
  const text = min >= 60 ? `${Math.round((min / 60) * 10) / 10}HRS WAIT` : `${min} MIN WAIT`;
  return `<div style="margin-top:3px;font:800 9px/1.1 var(--font-barlow),sans-serif;letter-spacing:.06em;color:${long ? '#ff8a8a' : '#a7f3a0'};text-shadow:0 0 6px ${long ? 'rgba(255,60,60,.7)' : 'rgba(80,220,90,.7)'};white-space:nowrap">${text}</div>`;
}

export default function MapView({ venues, events, friends, focus, fitFriends, me, onVenue, onEvent }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onVenue, onEvent });
  handlers.current = { onVenue, onEvent };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([-26.2041, 28.0473], 11);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, className: TILE_CLASS }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();

    venues.forEach((v) => {
      const span = 0.0022 + 0.0042 * Math.max(0.15, v.heat);
      L.imageOverlay('/art/heat.png', [
        [v.lat - span, v.lng - span * 0.8],
        [v.lat + span, v.lng + span * 0.8],
      ], { opacity: 0.55 + 0.35 * v.heat, interactive: false, className: 'auxed-heat' }).addTo(g);

      const live = v.live[0];
      const glow = live ? 'rgba(120,140,255,.9)' : 'rgba(255,255,255,.35)';
      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);width:120px">
          ${live ? `<div style="font-size:15px;line-height:1;color:#fff;margin-bottom:2px;text-shadow:0 0 6px #fff">♪♫</div>` : ''}
          <div style="width:46px;height:46px;border-radius:50%;overflow:hidden;background:#222;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 22px 6px ${glow}">
            ${v.imageUrl ? `<img src="${esc(v.imageUrl)}" style="width:100%;height:100%;object-fit:cover" alt=""/>` : ''}
          </div>
          <div style="margin-top:5px;font:700 10px/1.1 var(--font-barlow),sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;text-shadow:0 1px 4px #000;white-space:nowrap">${esc(v.name)}</div>
          ${live?.nowPlaying ? `<div style="font:600 8px/1.2 var(--font-barlow),sans-serif;letter-spacing:.08em;color:#fff;opacity:.85;white-space:nowrap;text-transform:uppercase">PLAYING: ${esc(live.nowPlaying).slice(0, 26)}</div>` : ''}
          ${waitLabel(v.waitMinutes)}
        </div>`;
      L.marker([v.lat, v.lng], { icon: L.divIcon({ html, className: '', iconSize: [0, 0] }), title: v.name, keyboard: true })
        .on('click', () => handlers.current.onVenue(v))
        .addTo(g);
    });

    events
      .filter((e) => !e.venueId || !venues.some((v) => v.id === e.venueId))
      .forEach((e) => {
        const html = `<div style="transform:translate(-50%,-50%);width:54px;height:54px;border-radius:14px;overflow:hidden;box-shadow:0 0 0 2px #fff,0 0 18px rgba(255,255,255,.4);background:#0b1660">${
          e.imageUrl ? `<img src="${esc(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover" alt=""/>` : ''
        }</div>`;
        L.marker([e.lat, e.lng], { icon: L.divIcon({ html, className: '', iconSize: [0, 0] }), title: e.title })
          .on('click', () => handlers.current.onEvent(e))
          .addTo(g);
      });

    friends.forEach((f) => {
      if (f.lat === null || f.lng === null) return;
      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);width:130px">
          <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#1b1b22;box-shadow:0 0 0 2px ${esc(f.ring ?? '#fff')},0 0 20px 6px rgba(110,230,140,.55);display:flex;align-items:center;justify-content:center;color:#fff;font:700 13px var(--font-barlow),sans-serif">
            ${f.avatarUrl ? `<img src="${esc(f.avatarUrl)}" style="width:100%;height:100%;object-fit:cover" alt=""/>` : esc(f.userName.slice(0, 2).toUpperCase())}
          </div>
          <div style="margin-top:4px;font:700 9px/1.1 var(--font-barlow),sans-serif;letter-spacing:.06em;color:#fff;text-shadow:0 1px 4px #000;white-space:nowrap">${esc(f.userName)}</div>
          ${f.statusText ? `<div style="font:600 8px/1.2 var(--font-barlow),sans-serif;letter-spacing:.06em;color:#fff;opacity:.8;text-transform:uppercase;white-space:nowrap">${esc(f.statusText)}</div>` : ''}
        </div>`;
      L.marker([f.lat, f.lng], { icon: L.divIcon({ html, className: '', iconSize: [0, 0] }), title: f.userName }).addTo(g);
    });

    if (me) {
      L.circleMarker([me.lat, me.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#4f7cff', fillOpacity: 1 }).addTo(g);
    }
  }, [venues, events, friends, me]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (focus) m.flyTo([focus.lat, focus.lng], focus.zoom ?? 15, { duration: 0.8 });
  }, [focus]);

  useEffect(() => {
    const m = map.current;
    if (!m || !fitFriends) return;
    const pts = friends.filter((f) => f.lat !== null && f.lng !== null).map((f) => [f.lat!, f.lng!] as [number, number]);
    if (me) pts.push([me.lat, me.lng]);
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 15 });
  }, [fitFriends, friends, me]);

  return <div ref={el} className="absolute inset-0 z-0" role="application" aria-label="Map of venues and friends" />;
}
