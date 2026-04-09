import { FUEL_MAP, FUEL_NAMES, ROUTE_COLORS, ROUTE_NAMES, fmtDur } from './config.js';
import { fetchRouteGeom, fetchAllRoutes, geocodeAddress, fetchRoadDist } from './routing.js';
import { showStatus, openModal } from './ui.js';
import { state } from './state.js';

// ── Map init ─────────────────────────────────────────────────────────────────

export function initMap(lat = 40.4168, lng = -3.7038) {
    if (state.map) state.map.remove();
    state.map = L.map('map').setView([lat, lng], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.map);

    state.map.on('click', async (e) => {
        if (!state.mapClickTarget) return;
        const { lat, lng } = e.latlng;
        let label = null;
        try {
            const r = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                { headers: { 'User-Agent': 'GasolinerasEspana/1.0' } }
            );
            const d = await r.json();
            if (d?.display_name) label = d.display_name.split(',').slice(0, 3).join(',');
        } catch {}
        const pt = state.mapClickTarget;
        state.mapClickTarget = null;
        document.getElementById('map').classList.remove('map-click-active');
        document.getElementById('pointABadge').classList.remove('map-selecting');
        document.getElementById('pointBBadge').classList.remove('map-selecting');
        await setPointFromCoords(pt, lat, lng, label);
        openModal('routeModal');
    });
}

// ── Markers ──────────────────────────────────────────────────────────────────

export function addMarkersToMap() {
    state.markers.forEach(m => m.remove());
    state.markers = [];
    const fuel  = document.querySelector('input[name="fuelType"]:checked')?.value || 'g95';
    const field = FUEL_MAP[fuel];

    if (state.currentMode === 'single' && state.userLocation) {
        const ic = L.divIcon({
            className: '',
            html: '<div style="background:#6366f1;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(99,102,241,0.6);"></div>',
            iconSize: [18, 18]
        });
        state.markers.push(L.marker([state.userLocation.lat, state.userLocation.lng], { icon: ic }).addTo(state.map));
    }

    if (state.currentMode === 'route') {
        if (state.pointALocation) {
            const ic = L.divIcon({ className: '', html: `<div style="background:#6366f1;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-family:Inter,sans-serif;font-size:12px;box-shadow:0 2px 10px rgba(99,102,241,0.5);">A</div>`, iconSize: [28, 28] });
            state.markers.push(L.marker([state.pointALocation.lat, state.pointALocation.lng], { icon: ic }).addTo(state.map));
        }
        if (state.pointBLocation) {
            const ic = L.divIcon({ className: '', html: `<div style="background:#10b981;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-family:Inter,sans-serif;font-size:12px;box-shadow:0 2px 10px rgba(16,185,129,0.5);">B</div>`, iconSize: [28, 28] });
            state.markers.push(L.marker([state.pointBLocation.lat, state.pointBLocation.lng], { icon: ic }).addTo(state.map));
        }
    }

    const display = state.displayedStations?.length ? state.displayedStations : state.stations;
    display.forEach((s, i) => {
        const price = s[field];
        if (!price) return;
        const pv   = parseFloat(price.replace(',', '.'));
        const allP = display.map(x => parseFloat((x[field] || '0').replace(',', '.'))).filter(p => p > 0);
        const norm = allP.length > 1 ? (pv - Math.min(...allP)) / (Math.max(...allP) - Math.min(...allP)) : 0.5;
        const rc   = Math.round(norm * 220);
        const gc   = Math.round((1 - norm) * 170);
        const ic   = L.divIcon({
            className: '',
            html: `<div style="background:rgb(${rc},${gc},20);color:white;border-radius:14px;padding:3px 8px;font-size:0.68rem;font-weight:700;border:2px solid rgba(255,255,255,0.8);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-family:Inter,sans-serif;">${i + 1}</div>`,
            iconSize: [32, 22]
        });
        const mk = L.marker([s.lat, s.lng], { icon: ic }).addTo(state.map);
        const distLabel = state.currentMode === 'route'
            ? (s.detourExtra != null ? `+${s.detourExtra.toFixed(1)} km${s.detourDurationExtra != null ? ' · +' + fmtDur(s.detourDurationExtra) : ''} desvío` : '')
            : (s.roadDistance ? `${s.roadDistance.toFixed(1)} km` : `${s.distance.toFixed(1)} km`);
        mk.bindPopup(`<div style="font-family:Inter,sans-serif;min-width:140px;">
            <strong>${s['Rótulo'] || 'Gasolinera'}</strong>
            <p style="margin:3px 0;font-size:0.78rem;color:#64748b;">${s['Dirección'] || ''}</p>
            <p style="margin:3px 0;font-size:0.95rem;font-weight:700;color:#10b981;">${price}€ <span style="font-size:0.72rem;color:#94a3b8;">${FUEL_NAMES[fuel]}</span></p>
            <p style="margin:3px 0;font-size:0.72rem;color:#94a3b8;">${distLabel}</p>
        </div>`);
        state.markers.push(mk);
        s.marker = mk;
    });
}

// ── Drop a single pin (during loading) ───────────────────────────────────────

export function dropPin(s, index, field, minP, maxP) {
    const price = s[field];
    if (!price) return null;
    const pv   = parseFloat(price.replace(',', '.'));
    const norm = (maxP > minP) ? (pv - minP) / (maxP - minP) : 0.5;
    const rc   = Math.round(norm * 220);
    const gc   = Math.round((1 - norm) * 170);
    const ic   = L.divIcon({
        className: '',
        html: `<div class="pin-dropping" style="background:rgb(${rc},${gc},20);color:white;border-radius:14px;padding:3px 8px;font-size:0.68rem;font-weight:700;border:2px solid rgba(255,255,255,0.8);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-family:Inter,sans-serif;">${index + 1}</div>`,
        iconSize: [32, 22]
    });
    return L.marker([s.lat, s.lng], { icon: ic }).addTo(state.map);
}

// ── Route drawing ─────────────────────────────────────────────────────────────

export function clearAllRoutesFromMap() {
    state.routeLayers.forEach(l => l.remove());
    state.routeLayers = [];
}

export function drawAllRoutesOnMap(routes, activeIdx) {
    clearAllRoutesFromMap();
    state.routeLayers = routes.map((r, i) => {
        const ll    = r.coordinates.map(([lng, lat]) => [lat, lng]);
        const layer = L.polyline(ll, {
            color:     ROUTE_COLORS[i % 4],
            weight:    i === activeIdx ? 7 : 4,
            opacity:   i === activeIdx ? 0.9 : 0.4,
            dashArray: i === activeIdx ? null : '6 4'
        }).addTo(state.map);
        layer.on('click', () => selectRoute(i));
        return layer;
    });
    if (state.routeLayers[activeIdx]) {
        state.map.fitBounds(state.routeLayers[activeIdx].getBounds(), { padding: [60, 60] });
    }
}

export function renderRouteAltsUI(routes, activeIdx) {
    const c = document.getElementById('routeAlternatives');
    const l = document.getElementById('routeAltList');
    if (routes.length <= 1) { c.style.display = 'none'; return; }
    c.style.display = 'block';
    l.innerHTML = routes.map((r, i) => `
        <div class="route-alt-card ${i === activeIdx ? 'active' : ''}" onclick="selectRoute(${i})">
            <div>
                <div class="alt-name" style="color:${ROUTE_COLORS[i % 4]}">${ROUTE_NAMES[i]}</div>
                <div class="alt-meta">🛣️ ${r.distance.toFixed(1)} km · ⏱️ ${fmtDur(r.duration)}${i > 0 ? ` <span style="color:var(--warning)">+${(r.distance - routes[0].distance).toFixed(1)} km</span>` : ''}</div>
            </div>
            ${i === activeIdx ? '<span class="alt-badge">✓ Activa</span>' : '<span style="font-size:0.73rem;color:var(--muted)">Seleccionar</span>'}
        </div>`).join('');
}

// ── Station preview (tap on card) ────────────────────────────────────────────

export async function showStationPreview(idx) {
    if (state.previewLayer) { state.previewLayer.remove(); state.previewLayer = null; }
    document.querySelectorAll('.station-card').forEach(c => c.classList.remove('selected'));
    const card    = document.querySelector(`.station-card[data-index="${idx}"]`);
    const station = (state.displayedStations || state.stations)[idx];
    if (!station) return;
    if (card) card.classList.add('selected');
    if (station.marker) station.marker.openPopup();

    let geom = null;
    if (state.currentMode === 'single' && state.userLocation) {
        geom = await fetchRouteGeom(state.userLocation.lat, state.userLocation.lng, station.lat, station.lng);
    } else if (state.currentMode === 'route' && state.pointALocation && state.pointBLocation) {
        const [s1, s2] = await Promise.all([
            fetchRouteGeom(state.pointALocation.lat, state.pointALocation.lng, station.lat, station.lng),
            fetchRouteGeom(station.lat, station.lng, state.pointBLocation.lat, state.pointBLocation.lng)
        ]);
        if (s1 && s2) geom = { distance: s1.distance + s2.distance, duration: s1.duration + s2.duration, coordinates: [...s1.coordinates, ...s2.coordinates] };
    }
    if (!geom) return;

    state.previewLayer = L.polyline(
        geom.coordinates.map(([lng, lat]) => [lat, lng]),
        { color: '#10b981', weight: 5, opacity: 0.85, dashArray: '8 5' }
    ).addTo(state.map);
    state.map.fitBounds(state.previewLayer.getBounds(), { padding: [60, 60] });

    if (card) {
        const el = card.querySelector('.road-dist-info');
        if (el) {
            el.innerHTML = `🛣️ <strong>${geom.distance.toFixed(1)} km</strong> · ⏱️ ${fmtDur(geom.duration)}`;
            el.classList.remove('road-dist-loading');
        }
    }
}

// ── Map click target ──────────────────────────────────────────────────────────

export function setMapClickTarget(pt) {
    if (state.mapClickTarget === pt) {
        state.mapClickTarget = null;
        document.getElementById('map').classList.remove('map-click-active');
        document.getElementById('pointABadge').classList.remove('map-selecting');
        document.getElementById('pointBBadge').classList.remove('map-selecting');
        return;
    }
    state.mapClickTarget = pt;
    document.getElementById('map').classList.add('map-click-active');
    document.getElementById('pointABadge').classList.toggle('map-selecting', pt === 'A');
    document.getElementById('pointBBadge').classList.toggle('map-selecting', pt === 'B');
    openModal('routeModal'); // close — re-opens after click
    showStatus(`🖱️ Toca el mapa para fijar Punto ${pt}`);
}

export async function setPointFromCoords(pt, lat, lng, label) {
    if (pt === 'A') {
        state.pointALocation = { lat, lng };
        document.getElementById('pointAInput').value = label || `${lat.toFixed(4)},${lng.toFixed(4)}`;
    } else {
        state.pointBLocation = { lat, lng };
        document.getElementById('pointBInput').value = label || `${lat.toFixed(4)},${lng.toFixed(4)}`;
    }
    if (!state.map) initMap(lat, lng);
    else state.map.setView([lat, lng], 13);
    addMarkersToMap();
    showStatus(`✅ Punto ${pt}: ${label || `${lat.toFixed(4)},${lng.toFixed(4)}`}`);
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

const acTimers = {}, acIndex = {};

export function setupAC(inputId, dropdownId, onSelect) {
    const inp  = document.getElementById(inputId);
    const drop = document.getElementById(dropdownId);
    acIndex[inputId] = -1;

    inp.addEventListener('input', () => {
        clearTimeout(acTimers[inputId]);
        const v = inp.value.trim();
        if (v.length < 3) { closeDrop(drop); return; }
        acTimers[inputId] = setTimeout(() => fetchSugg(v, drop, inp, inputId, onSelect), 300);
    });

    inp.addEventListener('keydown', e => {
        const its = drop.querySelectorAll('.autocomplete-item');
        if (!its.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); acIndex[inputId] = Math.min(acIndex[inputId] + 1, its.length - 1); setActive(its, acIndex[inputId]); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex[inputId] = Math.max(acIndex[inputId] - 1, 0); setActive(its, acIndex[inputId]); }
        else if (e.key === 'Enter' && acIndex[inputId] >= 0) { e.preventDefault(); its[acIndex[inputId]].click(); }
        else if (e.key === 'Escape') closeDrop(drop);
    });

    document.addEventListener('click', e => {
        if (!inp.contains(e.target) && !drop.contains(e.target)) closeDrop(drop);
    });
}

function setActive(items, i) {
    items.forEach((el, j) => el.classList.toggle('active', j === i));
}

function closeDrop(d) {
    d.classList.remove('open');
    d.innerHTML = '';
}

async function fetchSugg(q, drop, inp, id, onSelect) {
    try {
        const r = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', España')}&format=json&limit=6&addressdetails=1`,
            { headers: { 'User-Agent': 'GasolinerasEspana/1.0' } }
        );
        const data = await r.json();
        if (!data.length) { closeDrop(drop); return; }
        acIndex[id] = -1;
        drop.innerHTML = data.map(item => {
            const p = item.display_name.split(',');
            return `<div class="autocomplete-item" data-lat="${item.lat}" data-lng="${item.lon}" data-label="${p.slice(0, 3).join(',')}">
                <div class="ac-main">${p.slice(0, 2).join(',').trim()}</div>
                <div class="ac-sub">${p.slice(2, 5).join(',').trim()}</div>
            </div>`;
        }).join('');
        drop.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
                inp.value = el.dataset.label;
                closeDrop(drop);
                onSelect(parseFloat(el.dataset.lat), parseFloat(el.dataset.lng), el.dataset.label);
            });
        });
        drop.classList.add('open');
    } catch { closeDrop(drop); }
}
