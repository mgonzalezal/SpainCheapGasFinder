// ── Constants ────────────────────────────────────────────────────────────────

export const FUEL_MAP = {
    g95:    'Precio Gasolina 95 E5',
    g98:    'Precio Gasolina 98 E5',
    diesel: 'Precio Gasoleo A',
    dieselb:'Precio Gasoleo B'
};

export const FUEL_NAMES = {
    g95:    'G95',
    g98:    'G98',
    diesel: 'Diesel A',
    dieselb:'Diesel B'
};

export const ROUTE_COLORS = ['#6366f1', '#f59e0b', '#06b6d4', '#ec4899'];
export const ROUTE_NAMES  = ['Ruta Principal', 'Ruta Alternativa 1', 'Ruta Alternativa 2', 'Ruta Alternativa 3'];

export const STATIONS_API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
export const NOMINATIM_UA = 'GasolinerasEspana/1.0';

// ── Car config ───────────────────────────────────────────────────────────────

export function getCarCfg() {
    return {
        c: parseFloat(document.getElementById('carConsumption').value) || 7,
        l: parseFloat(document.getElementById('carLiters').value)      || 50
    };
}

export function saveCarCfg() {
    try {
        const { c, l } = getCarCfg();
        localStorage.setItem('carConsumption', c);
        localStorage.setItem('carLiters', l);
    } catch {}
}

export function loadCarCfg() {
    try {
        const c = localStorage.getItem('carConsumption');
        const l = localStorage.getItem('carLiters');
        if (c) document.getElementById('carConsumption').value = c;
        if (l) document.getElementById('carLiters').value = l;
    } catch {}
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function fmtDur(m) {
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    return `${h}h ${Math.round(m % 60)}min`;
}
