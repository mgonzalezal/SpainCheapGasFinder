import { FUEL_MAP, FUEL_NAMES, STATIONS_API, fmtDur, getCarCfg } from './config.js';
import { calcDist, minDistToRoute, fetchRoadDist } from './routing.js';
import { showStatus, showLoading, updateLoading, hideLoading } from './ui.js';
import { addMarkersToMap, drawAllRoutesOnMap, renderRouteAltsUI, dropPin } from './map.js';
import { state } from './state.js';

// ── Single point mode ────────────────────────────────────────────────────────

export async function fetchGasStations(lat, lng) {
    document.getElementById('refreshBtn').disabled = true;
    showLoading('Buscando gasolineras', 'Conectando con el servidor...');

    try {
        document.getElementById('loIcon').textContent = '📡';
        const res  = await fetch(STATIONS_API);
        const data = await res.json();

        document.getElementById('loIcon').textContent = '📍';
        document.getElementById('loTitle').textContent = 'Procesando estaciones';
        document.getElementById('loSub').textContent   = 'Calculando distancias...';

        const candidates = data.ListaEESSPrecio
            .map(s => ({
                ...s,
                lat: parseFloat(s['Latitud'].replace(',', '.')),
                lng: parseFloat(s['Longitud (WGS84)'].replace(',', '.'))
            }))
            .filter(s => !isNaN(s.lat) && !isNaN(s.lng))
            .map(s => ({ ...s, distance: calcDist(lat, lng, s.lat, s.lng) }))
            .filter(s => s.distance <= 15)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 50);

        document.getElementById('loIcon').textContent = '⛽';
        document.getElementById('loTitle').textContent = 'Calculando rutas';
        state.stations = candidates;
        state.displayedStations = [];

        // Place user location pin
        state.markers.forEach(m => m.remove());
        state.markers = [];
        if (state.userLocation) {
            const ic = L.divIcon({
                className: '',
                html: '<div style="background:#6366f1;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(99,102,241,0.6);"></div>',
                iconSize: [18, 18]
            });
            state.markers.push(L.marker([state.userLocation.lat, state.userLocation.lng], { icon: ic }).addTo(state.map));
        }

        const fuel  = document.querySelector('input[name="fuelType"]:checked')?.value || 'g95';
        const field = FUEL_MAP[fuel];
        const allP  = candidates.map(s => parseFloat((s[field] || '0').replace(',', '.'))).filter(p => p > 0);
        const minP  = Math.min(...allP), maxP = Math.max(...allP);

        let done = 0;
        await Promise.allSettled(candidates.map(async (s, i) => {
            const r = await fetchRoadDist(lat, lng, s.lat, s.lng);
            if (r) s.roadDistance = r.distance;
            done++;
            updateLoading(done, candidates.length, `Procesando ${s['Rótulo'] || 'gasolinera'}...`);

            const mk = dropPin(s, i, field, minP, maxP);
            if (mk) {
                const distLabel = s.roadDistance ? `${s.roadDistance.toFixed(1)} km` : `${s.distance.toFixed(1)} km`;
                mk.bindPopup(`<div style="font-family:Inter,sans-serif;min-width:140px;">
                    <strong>${s['Rótulo'] || 'Gasolinera'}</strong>
                    <p style="margin:3px 0;font-size:0.78rem;color:#64748b;">${s['Dirección'] || ''}</p>
                    <p style="margin:3px 0;font-size:0.95rem;font-weight:700;color:#10b981;">${s[field]}€ <span style="font-size:0.72rem;color:#94a3b8;">${FUEL_NAMES[fuel]}</span></p>
                    <p style="margin:3px 0;font-size:0.72rem;color:#94a3b8;">${distLabel}</p>
                </div>`);
                state.markers.push(mk);
                s.marker = mk;
            }
        }));

        displayStations();
        document.getElementById('sheet-title').textContent = 'Gasolineras Cercanas';
        document.getElementById('sheet-meta').textContent  = `${candidates.length} gasolineras`;
        hideLoading();
        showStatus(`✅ ${candidates.length} gasolineras encontradas`);

    } catch (e) {
        hideLoading();
        showStatus('❌ Error: ' + e.message, true);
    }
    document.getElementById('refreshBtn').disabled = false;
}

// ── Route mode ───────────────────────────────────────────────────────────────

export async function fetchGasStationsAlongRoute() {
    if (!state.routeData) return;
    document.getElementById('refreshBtn').disabled = true;
    showLoading('Gasolineras en la Ruta', 'Conectando con el servidor...');

    try {
        document.getElementById('loIcon').textContent = '📡';
        const res  = await fetch(STATIONS_API);
        const data = await res.json();

        document.getElementById('loIcon').textContent  = '🗺️';
        document.getElementById('loTitle').textContent = 'Filtrando corredor';
        document.getElementById('loSub').textContent   = 'Buscando gasolineras en la ruta...';

        const corridorKm = parseFloat(document.getElementById('corridorSelect').value);
        const candidates = data.ListaEESSPrecio
            .map(s => {
                const lat = parseFloat(s['Latitud'].replace(',', '.'));
                const lng = parseFloat(s['Longitud (WGS84)'].replace(',', '.'));
                return { ...s, lat, lng, distToRoute: minDistToRoute(lat, lng, state.routeData.coordinates) };
            })
            .filter(s => !isNaN(s.lat) && !isNaN(s.lng) && s.distToRoute <= corridorKm)
            .slice(0, 80);

        state.routeStations = candidates;
        state.stations      = candidates;
        state.displayedStations = [];

        // Route info bar
        const bar = document.getElementById('routeInfoBar');
        bar.style.display = 'flex';
        bar.innerHTML = `
            <span class="r-badge">🛣️ ${state.routeData.distance.toFixed(1)} km</span>
            <span class="r-badge">⏱️ ${fmtDur(state.routeData.duration)}</span>
            <span class="r-badge">⛽ ${candidates.length} gasolineras</span>`;

        // A/B markers
        state.markers.forEach(m => m.remove());
        state.markers = [];
        if (state.pointALocation) {
            const ic = L.divIcon({ className: '', html: `<div style="background:#6366f1;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-family:Inter,sans-serif;font-size:12px;box-shadow:0 2px 10px rgba(99,102,241,0.5);">A</div>`, iconSize: [28, 28] });
            state.markers.push(L.marker([state.pointALocation.lat, state.pointALocation.lng], { icon: ic }).addTo(state.map));
        }
        if (state.pointBLocation) {
            const ic = L.divIcon({ className: '', html: `<div style="background:#10b981;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-family:Inter,sans-serif;font-size:12px;box-shadow:0 2px 10px rgba(16,185,129,0.5);">B</div>`, iconSize: [28, 28] });
            state.markers.push(L.marker([state.pointBLocation.lat, state.pointBLocation.lng], { icon: ic }).addTo(state.map));
        }

        document.getElementById('loIcon').textContent  = '⛽';
        document.getElementById('loTitle').textContent = 'Calculando desvíos';

        const fuel  = document.querySelector('input[name="fuelType"]:checked')?.value || 'g95';
        const field = FUEL_MAP[fuel];
        const allP  = candidates.map(s => parseFloat((s[field] || '0').replace(',', '.'))).filter(p => p > 0);
        const minP  = Math.min(...allP), maxP = Math.max(...allP);

        let done = 0;
        const ready = [];
        await Promise.allSettled(candidates.map(async (s, i) => {
            const [s1, s2] = await Promise.all([
                fetchRoadDist(state.pointALocation.lat, state.pointALocation.lng, s.lat, s.lng),
                fetchRoadDist(s.lat, s.lng, state.pointBLocation.lat, state.pointBLocation.lng)
            ]);
            done++;
            if (s1 && s2) {
                s.detourDistance     = s1.distance + s2.distance;
                s.detourExtra        = s.detourDistance - state.routeData.distance;
                s.detourDuration     = s1.duration + s2.duration;
                s.detourDurationExtra = s.detourDuration - state.routeData.duration;
                ready.push(s);
            }
            updateLoading(done, candidates.length, `Procesando ${s['Rótulo'] || 'gasolinera'}...`);

            const mk = dropPin(s, i, field, minP, maxP);
            if (mk) {
                const distLabel = s.detourExtra != null
                    ? `+${s.detourExtra.toFixed(1)} km${s.detourDurationExtra != null ? ' · +' + fmtDur(s.detourDurationExtra) : ''} desvío`
                    : '';
                mk.bindPopup(`<div style="font-family:Inter,sans-serif;min-width:140px;">
                    <strong>${s['Rótulo'] || 'Gasolinera'}</strong>
                    <p style="margin:3px 0;font-size:0.78rem;color:#64748b;">${s['Dirección'] || ''}</p>
                    <p style="margin:3px 0;font-size:0.95rem;font-weight:700;color:#10b981;">${s[field]}€ <span style="font-size:0.72rem;color:#94a3b8;">${FUEL_NAMES[fuel]}</span></p>
                    <p style="margin:3px 0;font-size:0.72rem;color:#94a3b8;">${distLabel}</p>
                </div>`);
                state.markers.push(mk);
                s.marker = mk;
            }
        }));

        state.stations = ready;
        state.displayedStations = [];
        displayStations();
        document.getElementById('sheet-title').textContent = 'Gasolineras en la Ruta';
        document.getElementById('sheet-meta').textContent  = `${ready.length} gasolineras`;
        hideLoading();
        showStatus(`✅ ${ready.length} gasolineras en ruta`);

    } catch (e) {
        hideLoading();
        showStatus('❌ Error: ' + e.message, true);
    }
    document.getElementById('refreshBtn').disabled = false;
}

// ── Display / sort ────────────────────────────────────────────────────────────

export function displayStations() {
    const listDiv = document.getElementById('stationList');
    const fuel    = document.querySelector('input[name="fuelType"]:checked')?.value || 'g95';
    const field   = FUEL_MAP[fuel];
    const sort    = document.getElementById('sortSelect')?.value || 'savings';
    const { c, l } = getCarCfg();

    let f = state.stations.filter(s => s[field] && s[field] !== '');
    const prices = f.map(s => parseFloat((s[field] || '0').replace(',', '.'))).filter(p => p > 0);
    const refP   = prices.length ? Math.max(...prices) : 0;

    f.forEach(s => {
        const p = parseFloat((s[field] || '0').replace(',', '.'));
        if (!p) { s._net = null; return; }
        const km      = state.currentMode === 'route' ? (s.detourExtra || 0) : (s.roadDistance || s.distance || 0);
        s._fuel       = (refP - p) * l;
        s._detourCost = (km / 100) * c * p;
        s._net        = s._fuel - s._detourCost;
    });

    f.sort((a, b) => {
        if (sort === 'distance') return state.currentMode === 'route' ? (a.detourExtra || 0) - (b.detourExtra || 0) : (a.distance || 0) - (b.distance || 0);
        if (sort === 'price')    return parseFloat((a[field] || '999').replace(',', '.')) - parseFloat((b[field] || '999').replace(',', '.'));
        if (sort === 'savings')  return (b._net || 0) - (a._net || 0);
        return 0;
    });

    state.displayedStations = f;
    if (!f.length) {
        listDiv.innerHTML = '<div class="loading">No hay gasolineras con el combustible seleccionado</div>';
        addMarkersToMap();
        return;
    }

    let summary = '';
    if (state.currentMode === 'route' && state.routeData) {
        const best  = [...f].sort((a, b) => (b._net || 0) - (a._net || 0))[0];
        const cheap = [...f].sort((a, b) => parseFloat((a[field] || '999').replace(',', '.')) - parseFloat((b[field] || '999').replace(',', '.')))[0];
        summary = `<div class="route-summary">
            <div class="rs-title">🗺️ Resumen de Ruta</div>
            <div class="rs-grid">
                <div><div class="rs-label">Distancia</div><div class="rs-val">${state.routeData.distance.toFixed(1)} km</div></div>
                <div><div class="rs-label">Tiempo</div><div class="rs-val">${fmtDur(state.routeData.duration)}</div></div>
                <div><div class="rs-label">Precio más bajo</div><div class="rs-val" style="color:var(--success)">${cheap?.[field] || '-'}€</div></div>
                ${best?._net != null ? `<div><div class="rs-label">Mejor ahorro</div><div class="rs-val" style="color:${best._net >= 0 ? 'var(--success)' : 'var(--danger)'};">${best._net >= 0 ? '+' : ''}${best._net.toFixed(2)}€</div></div>` : ''}
            </div>
        </div>`;
    }

    listDiv.innerHTML = summary + f.map((s, i) => {
        const price = s[field] || '-';
        let distBadge = '';
        if (state.currentMode === 'route') {
            const col       = s.detourExtra > 5 ? 'var(--danger)' : s.detourExtra > 2 ? 'var(--warning)' : 'var(--success)';
            const timeExtra = s.detourDurationExtra != null ? ` · ${s.detourDurationExtra > 0 ? '+' : ''}${fmtDur(s.detourDurationExtra)}` : '';
            distBadge = `<span class="s-detour">🛣️ <strong>${s.detourDistance.toFixed(1)} km</strong></span><span class="s-detour" style="color:${col};border-color:${col};background:transparent;">${s.detourExtra > 0 ? '+' : ''}${s.detourExtra.toFixed(1)} km${timeExtra} desvío</span>`;
        } else {
            const hasR = s.roadDistance != null;
            distBadge = `<span class="s-dist road-dist-info${hasR ? '' : ' road-dist-loading'}">${hasR ? `🛣️ <strong>${s.roadDistance.toFixed(1)} km</strong>` : `📍 ${s.distance.toFixed(1)} km`}</span>`;
        }

        let savBadge = '';
        if (s._net != null) {
            const cls  = s._net > 0.5 ? 'pos' : s._net < -0.5 ? 'neg' : 'neu';
            const sign = s._net > 0 ? '+' : '';
            const parts = [];
            if (s._fuel != null)      parts.push(`${s._fuel >= 0 ? '+' : ''}${s._fuel.toFixed(2)}€ precio`);
            if (s._detourCost > 0.01) parts.push(`−${s._detourCost.toFixed(2)}€ desvío`);
            savBadge = `<div class="savings ${cls}">💰 Ahorro neto: <strong>${sign}${s._net.toFixed(2)}€</strong>${parts.length ? `<span class="savings-detail"> (${parts.join(' · ')})</span>` : ''}</div>`;
        }

        return `<div class="station-card" data-index="${i}" data-station-id="${s['IDEESS']}" onclick="showStationPreview(${i})">
            <div class="s-name"><span class="s-num">#${i + 1}</span>${s['Rótulo'] || 'Gasolinera'}</div>
            ${distBadge}
            <div class="s-addr">${s['Dirección']}, ${s['Localidad']}</div>
            <div class="price-row"><div class="price-chip"><span class="price-type">${FUEL_NAMES[fuel]}</span><span class="price-val">${price}€</span></div></div>
            ${savBadge}
        </div>`;
    }).join('');

    addMarkersToMap();
}

// ── Select route alternative ──────────────────────────────────────────────────

export function selectRoute(idx) {
    state.selectedRouteIdx = idx;
    state.routeData = state.allRoutes[idx];
    drawAllRoutesOnMap(state.allRoutes, idx);
    renderRouteAltsUI(state.allRoutes, idx);
    state.stations = state.routeStations;
    fetchGasStationsAlongRoute();
}
