import { loadCarCfg, saveCarCfg } from './config.js';
import { openModal, closeModal, toggleSheet, showStatus } from './ui.js';
import { geocodeAddress, fetchAllRoutes } from './routing.js';
import {
    initMap, addMarkersToMap, setupAC, setMapClickTarget,
    setPointFromCoords, showStationPreview, drawAllRoutesOnMap,
    renderRouteAltsUI, clearAllRoutesFromMap
} from './map.js';
import { fetchGasStations, fetchGasStationsAlongRoute, displayStations, selectRoute } from './stations.js';
import { state } from './state.js';

// ── Init ─────────────────────────────────────────────────────────────────────

loadCarCfg();
initMap();

// ── Event listeners ───────────────────────────────────────────────────────────

document.querySelectorAll('input[name="fuelType"]').forEach(r =>
    r.addEventListener('change', () => { if (state.stations.length) displayStations(); })
);
document.getElementById('sortSelect').addEventListener('change', () => {
    if (state.stations.length) displayStations();
});
document.getElementById('carConsumption').addEventListener('input', () => {
    saveCarCfg(); if (state.stations.length) displayStations();
});
document.getElementById('carLiters').addEventListener('input', () => {
    saveCarCfg(); if (state.stations.length) displayStations();
});
document.getElementById('addressInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') searchByAddress();
});

// Autocomplete
setupAC('addressInput', 'acSingle', (lat, lng, label) => {
    state.userLocation = { lat, lng };
    initMap(lat, lng);
    fetchGasStations(lat, lng);
});
setupAC('pointAInput', 'acPointA', (lat, lng, label) => setPointFromCoords('A', lat, lng, label));
setupAC('pointBInput', 'acPointB', (lat, lng, label) => setPointFromCoords('B', lat, lng, label));

// ── Mode switch ───────────────────────────────────────────────────────────────

function switchMode(mode) {
    state.currentMode = mode;
    document.getElementById('tabSingle').classList.toggle('active', mode === 'single');
    document.getElementById('tabRoute').classList.toggle('active', mode === 'route');
    document.getElementById('singleBox').style.display   = mode === 'single' ? '' : 'none';
    document.getElementById('openRouteBtn').style.display = mode === 'route' ? 'flex' : 'none';
    document.getElementById('sheet-title').textContent   = mode === 'single' ? 'Gasolineras Cercanas' : 'Gasolineras en la Ruta';
    document.getElementById('sheet-meta').textContent    = '';
    document.getElementById('stationList').innerHTML     = `<div class="loading">${mode === 'single' ? 'Busca tu ubicación para comenzar' : 'Configura origen y destino'}</div>`;
    document.getElementById('routeInfoBar').style.display = 'none';
    document.getElementById('toast').style.display = 'none';

    if (mode === 'route') openModal('routeModal');
    if (mode === 'single') {
        clearAllRoutesFromMap();
        if (state.previewLayer) { state.previewLayer.remove(); state.previewLayer = null; }
        state.allRoutes = []; state.selectedRouteIdx = 0; state.routeData = null;
        state.pointALocation = null; state.pointBLocation = null; state.routeStations = [];
        state.displayedStations = [];
        document.getElementById('routeAlternatives').style.display = 'none';
        addMarkersToMap();
    }
}

// ── Address search ────────────────────────────────────────────────────────────

async function searchByAddress() {
    const addr = document.getElementById('addressInput').value.trim();
    if (!addr) { showStatus('⚠️ Introduce una dirección', true); return; }
    showStatus('🔍 Buscando...');
    const loc = await geocodeAddress(addr);
    if (!loc) { showStatus('❌ No se encontró la dirección', true); return; }
    state.userLocation = { lat: loc.lat, lng: loc.lng };
    initMap(loc.lat, loc.lng);
    await fetchGasStations(loc.lat, loc.lng);
}

function getUserLocationAndLoad() {
    if (!navigator.geolocation) { showStatus('❌ Geolocalización no disponible', true); return; }
    showStatus('📍 Obteniendo ubicación...');
    navigator.geolocation.getCurrentPosition(
        p => {
            state.userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
            initMap(state.userLocation.lat, state.userLocation.lng);
            fetchGasStations(state.userLocation.lat, state.userLocation.lng);
        },
        e => { showStatus(e.code === e.PERMISSION_DENIED ? '❌ Permiso denegado' : '❌ Error de ubicación', true); initMap(); }
    );
}

// ── Route actions ─────────────────────────────────────────────────────────────

async function searchPoint(pt) {
    const addr = document.getElementById(pt === 'A' ? 'pointAInput' : 'pointBInput').value.trim();
    if (!addr) { showStatus(`⚠️ Introduce dirección para Punto ${pt}`, true); return; }
    showStatus('🔍 Buscando...');
    const loc = await geocodeAddress(addr);
    if (!loc) { showStatus('❌ No encontrado', true); return; }
    await setPointFromCoords(pt, loc.lat, loc.lng, loc.displayName.split(',').slice(0, 3).join(','));
}

function useMyLocationForPoint(pt) {
    if (!navigator.geolocation) { showStatus('❌ Geolocalización no disponible', true); return; }
    navigator.geolocation.getCurrentPosition(
        async p => await setPointFromCoords(pt, p.coords.latitude, p.coords.longitude, 'Mi ubicación'),
        () => showStatus('❌ No se pudo obtener ubicación', true)
    );
}

function invertRoute() {
    [state.pointALocation, state.pointBLocation] = [state.pointBLocation, state.pointALocation];
    const va = document.getElementById('pointAInput').value;
    document.getElementById('pointAInput').value = document.getElementById('pointBInput').value;
    document.getElementById('pointBInput').value = va;
    addMarkersToMap();
    showStatus('🔄 Ruta invertida');
}

async function traceRoute() {
    if (!state.pointALocation) { showStatus('⚠️ Falta el Punto A', true); return; }
    if (!state.pointBLocation) { showStatus('⚠️ Falta el Punto B', true); return; }
    closeModal('routeModal');
    const { showLoading, hideLoading } = await import('./ui.js');
    showLoading('Calculando rutas', 'Conectando con el servidor de rutas...');
    document.getElementById('loIcon').textContent = '🗺️';
    document.getElementById('sheet-title').textContent = 'Gasolineras en la Ruta';
    try {
        state.allRoutes = await fetchAllRoutes(state.pointALocation.lat, state.pointALocation.lng, state.pointBLocation.lat, state.pointBLocation.lng);
        state.selectedRouteIdx = 0;
        state.routeData = state.allRoutes[0];
        drawAllRoutesOnMap(state.allRoutes, 0);
        renderRouteAltsUI(state.allRoutes, 0);
        await fetchGasStationsAlongRoute();
        showStatus(`✅ ${state.allRoutes.length} ruta(s) encontrada(s)`);
    } catch (e) {
        hideLoading();
        showStatus('❌ ' + e.message, true);
    }
}

async function refreshData() {
    if (state.currentMode === 'single' && state.userLocation)
        await fetchGasStations(state.userLocation.lat, state.userLocation.lng);
    else if (state.currentMode === 'route' && state.routeData)
        await fetchGasStationsAlongRoute();
}

// ── Expose to HTML onclick handlers ──────────────────────────────────────────
// ES modules don't pollute window by default, so we expose what the HTML needs.

window.openModal            = openModal;
window.closeModal           = closeModal;
window.toggleSheet          = toggleSheet;
window.switchMode           = switchMode;
window.getUserLocationAndLoad = getUserLocationAndLoad;
window.refreshData          = refreshData;
window.searchPoint          = searchPoint;
window.useMyLocationForPoint = useMyLocationForPoint;
window.invertRoute          = invertRoute;
window.traceRoute           = traceRoute;
window.setMapClickTarget    = setMapClickTarget;
window.showStationPreview   = showStationPreview;
window.selectRoute          = selectRoute;
