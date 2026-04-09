// ── Geo helpers ──────────────────────────────────────────────────────────────

export function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function minDistToRoute(lat, lng, coords) {
    let min = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
        const [aLng, aLat] = coords[i];
        const [bLng, bLat] = coords[i + 1];
        const dx = bLng - aLng, dy = bLat - aLat;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((lng - aLng) * dx + (lat - aLat) * dy) / len)) : 0;
        const d = calcDist(lat, lng, aLat + t * dy, aLng + t * dx);
        if (d < min) min = d;
    }
    return min;
}

// ── Road distance / routing API ───────────────────────────────────────────────

const roadDistanceCache = {};

export async function fetchRoadDist(aLat, aLng, bLat, bLng) {
    const k = `${aLat.toFixed(5)},${aLng.toFixed(5)}_${bLat.toFixed(5)},${bLng.toFixed(5)}`;
    if (roadDistanceCache[k]) return roadDistanceCache[k];
    try {
        const r = await fetch(
            `https://routing.openstreetmap.de/routed-car/route/v1/driving/${aLng},${aLat};${bLng},${bLat}?overview=false`
        );
        const d = await r.json();
        if (d.code !== 'Ok' || !d.routes[0]) throw 0;
        const res = {
            distance: d.routes[0].distance / 1000,
            duration: d.routes[0].duration / 60
        };
        roadDistanceCache[k] = res;
        return res;
    } catch { return null; }
}

export async function fetchRouteGeom(aLat, aLng, bLat, bLng) {
    try {
        const r = await fetch(
            `https://routing.openstreetmap.de/routed-car/route/v1/driving/${aLng},${aLat};${bLng},${bLat}?overview=full&geometries=geojson`
        );
        const d = await r.json();
        if (d.code !== 'Ok' || !d.routes[0]) throw 0;
        return {
            distance:    d.routes[0].distance / 1000,
            duration:    d.routes[0].duration / 60,
            coordinates: d.routes[0].geometry.coordinates
        };
    } catch { return null; }
}

export async function fetchAllRoutes(aLat, aLng, bLat, bLng) {
    const r = await fetch(
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${aLng},${aLat};${bLng},${bLat}?overview=full&geometries=geojson&alternatives=true`
    );
    const d = await r.json();
    if (d.code !== 'Ok' || !d.routes?.length) throw new Error('Sin ruta');
    return d.routes.map(r => ({
        distance:    r.distance / 1000,
        duration:    r.duration / 60,
        coordinates: r.geometry.coordinates
    }));
}

// ── Geocoding ────────────────────────────────────────────────────────────────

import { NOMINATIM_UA } from './config.js';

export async function geocodeAddress(addr) {
    try {
        const r = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=es`,
            { headers: { 'User-Agent': NOMINATIM_UA } }
        );
        const d = await r.json();
        if (!d.length) return null;
        return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), displayName: d[0].display_name };
    } catch { return null; }
}
