// ── Shared application state ─────────────────────────────────────────────────
// A single object passed around to avoid globals across modules.

export const state = {
    map:              null,
    userLocation:     null,
    markers:          [],
    stations:         [],
    displayedStations:[],
    currentMode:      'single',

    // Route mode
    pointALocation:   null,
    pointBLocation:   null,
    allRoutes:        [],
    routeLayers:      [],
    selectedRouteIdx: 0,
    routeData:        null,
    routeStations:    [],
    previewLayer:     null,

    // Map click
    mapClickTarget:   null,
};
