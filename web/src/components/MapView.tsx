import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Listing } from '../types';
import { fmtBeds, fmtPrice, priceTier } from '../lib';

interface Props {
  listings: Listing[];
  onFavorite(l: Listing): void;
  onHide(l: Listing): void;
}

const CENTER: [number, number] = [36.86, -76.12]; // between Norfolk and Va Beach

export default function MapView({ listings, onFavorite, onHide }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // keep latest handlers without rebuilding pins
  const handlers = useRef({ onFavorite, onHide });
  handlers.current = { onFavorite, onHide };

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { center: CENTER, zoom: 11, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const geocoded = listings.filter((l) => l.lat != null && l.lng != null);
    for (const l of geocoded) {
      const tier = priceTier(l.price);
      const marker = L.circleMarker([l.lat!, l.lng!], {
        radius: 9,
        color: '#0b0f19',
        weight: 1.5,
        fillColor: tier.color,
        fillOpacity: 0.92,
      });
      const el = document.createElement('div');
      el.style.minWidth = '210px';
      el.innerHTML = `
        <div style="font-size:20px;font-weight:800;color:${tier.color}">${fmtPrice(l.price)}<span style="font-size:11px;color:#94a3b8">/mo</span></div>
        <div style="font-size:12px;color:#cbd5e1;margin:2px 0">${fmtBeds(l.beds)}${l.baths != null ? ` · ${l.baths} ba` : ''}${l.sqft ? ` · ${l.sqft} ft²` : ''}${l.isSample ? ' · <b style="color:#eab308">SAMPLE</b>' : ''}${l.dupGroup ? ' · <b style="color:#e879f9">DUPE?</b>' : ''}${l.isNew ? ' · <b style="color:#38bdf8">NEW</b>' : ''}</div>
        <div style="font-size:11px;color:#94a3b8">${(l.address ?? l.title).replace(/</g, '&lt;')}</div>
        <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
          <a href="${l.url}" target="_blank" rel="noreferrer" style="font-size:12px;color:#38bdf8">Open listing ↗</a>
          <button data-act="fav" style="margin-left:auto;cursor:pointer;background:${l.isFavorite ? '#eab308' : '#243049'};border:none;border-radius:6px;padding:2px 6px">⭐</button>
          <button data-act="hide" style="cursor:pointer;background:#243049;border:none;border-radius:6px;padding:2px 6px">🚫</button>
        </div>`;
      el.querySelector('[data-act="fav"]')!.addEventListener('click', () => handlers.current.onFavorite(l));
      el.querySelector('[data-act="hide"]')!.addEventListener('click', () => handlers.current.onHide(l));
      marker.bindPopup(el);
      marker.addTo(layer);
    }
  }, [listings]);

  const missing = listings.length - listings.filter((l) => l.lat != null && l.lng != null).length;

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[420px] overflow-hidden rounded-xl border border-ink-700">
      <div ref={divRef} className="h-full w-full" />
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-ink-900/90 px-3 py-2 text-[11px] text-slate-300 shadow backdrop-blur">
        <div className="mb-1 font-semibold text-slate-200">Price tier</div>
        {[['#34d399', '< $1,300'], ['#fbbf24', '$1,300–1,800'], ['#fb923c', '$1,800–2,400'], ['#f87171', '> $2,400']].map(([c, t]) => (
          <div key={t} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{t}</div>
        ))}
        {missing > 0 && <div className="mt-1 border-t border-ink-700 pt-1 text-slate-500">{missing} not geocoded yet</div>}
      </div>
    </div>
  );
}
