const ROUTE = ROMV.createModule('ROUTE');

ROUTE.CONFIG = {
    graphUrl: 'public/json/graph.json?v=3',
    bikeSpeedMph: 9,
    defaultSafety: 0.8,
    laneCategories: [
        { key: 'trail',     label: 'Trail',          color: '#00897b', types: [12],     penalty: 0.65 },
        { key: 'trailSoft', label: 'Unpaved trail',  color: '#8d6e63', types: [13],     penalty: 1.4 },
        { key: 'protected', label: 'Protected lane', color: '#2e7d32', types: [0, 1, 2], penalty: 1.0 },
        { key: 'buffered',  label: 'Buffered lane',  color: '#7cb342', types: [3, 4],    penalty: 1.3 },
        { key: 'painted',   label: 'Painted lane',   color: '#1e88e5', types: [5, 6, 7, 8], penalty: 1.6 },
        { key: 'bus',       label: 'Bus & bike lane', color: '#ab47bc', types: [9],      penalty: 1.7 },
        { key: 'sharrow',   label: 'Sharrows',       color: '#fb8c00', types: [10, 11], penalty: null },
        { key: 'none',      label: 'No bike lane',   color: '#757575', types: [-1],     penalty: null },
    ],
    // Penalty for streets without their own lane penalty, by street class
    // (2 major arterial ... 5+ local). Sharrows get a small discount on
    // it, capped at collector level: the city only marks sharrows on
    // streets it designates as bike routes, so a sharrowed arterial (e.g.
    // Main St Manayunk) shouldn't price like an unmarked one.
    classPenalty: { 2: 4.5, 3: 3.4, 4: 2.4 },
    classPenaltyDefault: 1.8,
    sharrowDiscount: 0.85,
    sharrowCap: 2.3,
    // Edges on the High Injury Network cost more, scaled by the safety
    // slider (1x at Shortest, this factor at Safest). Applied ONLY to
    // streets without protective bike infrastructure (base penalty above
    // hinMinPenalty) — a protected/buffered lane on a high-injury corridor
    // is the city's mitigation, so we keep it rather than detour onto a
    // bare side street. This nudges the unprotected portions of a route off
    // the worst corridors without sacrificing the lane network.
    hinFactor: 1.8,
    hinMinPenalty: 1.4,
    // Riding against a one-way is allowed but surcharged this many times its
    // length, so the router respects one-ways unless a short wrong-way hop
    // clearly beats a long legal detour (the "walk a block" escape hatch).
    // Higher = more car-like (stricter detours); lower = ignores one-ways.
    contraflowFactor: 4,
    routeCasingStyle: { color: '#263238', weight: 9, opacity: 0.85 },
    routeStyle: { weight: 5, opacity: 0.95 },
    indegoInfoUrl: 'https://gbfs.bcycle.com/bcycle_indego/station_information.json',
    indegoStatusUrl: 'https://gbfs.bcycle.com/bcycle_indego/station_status.json',
    indegoMinZoom: 15,
    indegoColors: { empty: '#b9d7f1', filled: '#1d3a63', ebike: '#76bc21' },
    septaUrl: 'public/json/septa.geojson',
    septaMinZoom: 12,
    septaColors: { L: '#0097d6', B: '#f26100' },
};

// --- Saved waypoints (this device only) ---

ROUTE.WAYPOINTS_KEY = 'romv-saved-waypoints';
ROUTE.LEGACY_STARTS_KEY = 'romv-saved-starts';

ROUTE.loadWaypoints = () => {
    try {
        let raw = localStorage.getItem(ROUTE.WAYPOINTS_KEY);
        if (raw === null) {
            // Migrate from the earlier "saved starts" feature.
            raw = localStorage.getItem(ROUTE.LEGACY_STARTS_KEY);
            if (raw !== null) {
                localStorage.setItem(ROUTE.WAYPOINTS_KEY, raw);
                localStorage.removeItem(ROUTE.LEGACY_STARTS_KEY);
            }
        }
        const list = JSON.parse(raw || '[]');
        if (!Array.isArray(list)) return [];
        return list.filter((s) => s && typeof s.name === 'string'
            && Number.isFinite(s.lat) && Number.isFinite(s.lng));
    } catch (_) {
        return [];
    }
};

ROUTE.saveWaypoints = (list) => {
    try {
        localStorage.setItem(ROUTE.WAYPOINTS_KEY, JSON.stringify(list));
    } catch (err) {
        ROUTE.error(err);
    }
};

ROUTE.escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Neighbor-county loading is temporarily disabled while cross-border
// stitching is refined; flip to true to re-enable (build artifacts and
// merge logic are kept intact). Keeps the focus on Philadelphia.
ROUTE.COUNTIES_ENABLED = false;

// Loaded neighbor counties persist on the device so a regular cross-county
// rider doesn't re-add them every visit.
ROUTE.COUNTIES_KEY = 'romv-loaded-counties';

ROUTE.loadedCounties = () => {
    try {
        const list = JSON.parse(localStorage.getItem(ROUTE.COUNTIES_KEY) || '[]');
        return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [];
    } catch (_) {
        return [];
    }
};

ROUTE.persistCounty = (key) => {
    try {
        const set = new Set(ROUTE.loadedCounties());
        set.add(key);
        localStorage.setItem(ROUTE.COUNTIES_KEY, JSON.stringify([...set]));
    } catch (err) {
        ROUTE.error(err);
    }
};

// --- Graph + routing (no Leaflet dependency) ---

ROUTE.decodeGraph = (raw) => {
    const scale = raw.coordScale;
    const count = raw.nodes.length / 2;
    const lng = new Float64Array(count);
    const lat = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        lng[i] = raw.nodes[i * 2] / scale;
        lat[i] = raw.nodes[i * 2 + 1] / scale;
    }

    const typeCategory = {};
    ROUTE.CONFIG.laneCategories.forEach((cat, idx) => {
        cat.types.forEach((t) => { typeCategory[t] = idx; });
    });

    const adjacency = Array.from({ length: count }, () => []);
    const category = new Uint8Array(raw.edges.length);
    const penalty = new Float64Array(raw.edges.length);
    raw.edges.forEach((e, i) => {
        const [a, b, dir, type, cls] = e;
        // Both directions stay traversable, but the wrong way down a one-way
        // (e[2]: 1 = a→b only, 2 = b→a only; 0 = two-way) is flagged contra
        // and surcharged in findRoute. So one-ways are respected without the
        // hard-block detours/loops they'd otherwise force on out-and-back legs.
        adjacency[a].push({ edge: i, fwd: true, contra: dir === 2 });
        adjacency[b].push({ edge: i, fwd: false, contra: dir === 1 });

        const catIdx = typeCategory[type];
        const cat = ROUTE.CONFIG.laneCategories[catIdx];
        category[i] = catIdx;
        if (cat.penalty !== null) {
            penalty[i] = cat.penalty;
        } else {
            const base = ROUTE.CONFIG.classPenalty[cls] || ROUTE.CONFIG.classPenaltyDefault;
            penalty[i] = cat.key === 'sharrow'
                ? Math.min(base * ROUTE.CONFIG.sharrowDiscount, ROUTE.CONFIG.sharrowCap)
                : base;
        }
    });

    return { count, lat, lng, scale, edges: raw.edges, adjacency, category, penalty };
};

ROUTE.distanceM = (lat1, lng1, lat2, lng2) => {
    const rad = Math.PI / 180;
    const x = (lng2 - lng1) * rad * Math.cos((lat1 + lat2) / 2 * rad);
    const y = (lat2 - lat1) * rad;
    return Math.sqrt(x * x + y * y) * 6371000;
};

ROUTE.nearestNode = (graph, latlng) => {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < graph.count; i++) {
        const d = ROUTE.distanceM(latlng.lat, latlng.lng, graph.lat[i], graph.lng[i]);
        if (d < bestDist) {
            bestDist = d;
            best = i;
        }
    }
    return { node: best, distance: bestDist };
};

// A* with cost = length * (1 + safety * (penalty - 1)). The straight-line
// heuristic is scaled by the cheapest possible cost-per-meter so it stays
// admissible even when a penalty dips below 1 (e.g. extra trail bias).
ROUTE.findRoute = (graph, start, goal, safety) => {
    const dist = new Float64Array(graph.count).fill(Infinity);
    const prevNode = new Int32Array(graph.count).fill(-1);
    const prevEdge = new Int32Array(graph.count).fill(-1);
    const prevFwd = new Uint8Array(graph.count);
    const closed = new Uint8Array(graph.count);

    const heapNodes = [];
    const heapScores = [];
    const heapPush = (node, score) => {
        let i = heapNodes.length;
        heapNodes.push(node);
        heapScores.push(score);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heapScores[parent] <= heapScores[i]) break;
            [heapScores[parent], heapScores[i]] = [heapScores[i], heapScores[parent]];
            [heapNodes[parent], heapNodes[i]] = [heapNodes[i], heapNodes[parent]];
            i = parent;
        }
    };
    const heapPop = () => {
        const top = heapNodes[0];
        const lastNode = heapNodes.pop();
        const lastScore = heapScores.pop();
        if (heapNodes.length) {
            heapNodes[0] = lastNode;
            heapScores[0] = lastScore;
            let i = 0;
            for (;;) {
                let smallest = i;
                const l = i * 2 + 1;
                const r = i * 2 + 2;
                if (l < heapNodes.length && heapScores[l] < heapScores[smallest]) smallest = l;
                if (r < heapNodes.length && heapScores[r] < heapScores[smallest]) smallest = r;
                if (smallest === i) break;
                [heapScores[smallest], heapScores[i]] = [heapScores[i], heapScores[smallest]];
                [heapNodes[smallest], heapNodes[i]] = [heapNodes[i], heapNodes[smallest]];
                i = smallest;
            }
        }
        return top;
    };
    const minPenalty = Math.min(1, ...ROUTE.CONFIG.laneCategories
        .filter((c) => c.penalty !== null)
        .map((c) => c.penalty));
    const heuristicScale = Math.max(0, 1 + safety * (minPenalty - 1));
    const heuristic = (n) => heuristicScale
        * ROUTE.distanceM(graph.lat[n], graph.lng[n], graph.lat[goal], graph.lng[goal]);

    dist[start] = 0;
    heapPush(start, heuristic(start));

    while (heapNodes.length) {
        const u = heapPop();
        if (u === goal) break;
        if (closed[u]) continue;
        closed[u] = 1;

        for (const { edge, fwd, contra } of graph.adjacency[u]) {
            const v = fwd ? graph.edges[edge][1] : graph.edges[edge][0];
            if (closed[v]) continue;
            const len = graph.edges[edge][5];
            // HIN surcharge, but only on streets lacking protective infra.
            const hinMult = (graph.hin && graph.hin[edge]
                && graph.penalty[edge] > ROUTE.CONFIG.hinMinPenalty)
                ? 1 + safety * (ROUTE.CONFIG.hinFactor - 1)
                : 1;
            // Flat surcharge for going the wrong way down a one-way.
            const contraMult = contra ? ROUTE.CONFIG.contraflowFactor : 1;
            const cost = len * (1 + safety * (graph.penalty[edge] - 1)) * hinMult * contraMult;
            const alt = dist[u] + cost;
            if (alt < dist[v]) {
                dist[v] = alt;
                prevNode[v] = u;
                prevEdge[v] = edge;
                prevFwd[v] = fwd ? 1 : 0;
                heapPush(v, alt + heuristic(v));
            }
        }
    }

    if (prevEdge[goal] === -1) return null;

    const steps = [];
    let distance = 0;
    for (let n = goal; n !== start; n = prevNode[n]) {
        steps.push({ edge: prevEdge[n], fwd: prevFwd[n] === 1 });
        distance += graph.edges[prevEdge[n]][5];
    }
    steps.reverse();
    return { steps, distance };
};

ROUTE.edgeLatLngs = (graph, edgeIdx, fwd) => {
    const e = graph.edges[edgeIdx];
    const [a, b] = e;
    const deltas = e[6];
    const points = [[graph.lat[a], graph.lng[a]]];
    let x = Math.round(graph.lng[a] * graph.scale);
    let y = Math.round(graph.lat[a] * graph.scale);
    for (let i = 0; i < deltas.length; i += 2) {
        x += deltas[i];
        y += deltas[i + 1];
        points.push([y / graph.scale, x / graph.scale]);
    }
    points.push([graph.lat[b], graph.lng[b]]);
    return fwd ? points : points.reverse();
};

// Merge contiguous same-category steps into single polylines so a long
// route renders as a few dozen paths instead of one per graph edge.
ROUTE.routeSegments = (graph, steps) => {
    const segments = [];
    let current = null;
    for (const step of steps) {
        const category = graph.category[step.edge];
        const pts = ROUTE.edgeLatLngs(graph, step.edge, step.fwd);
        if (current && current.category === category) {
            current.latlngs.push(...pts.slice(1));
        } else {
            current = { category, latlngs: pts };
            segments.push(current);
        }
    }
    return segments;
};

ROUTE.toGPX = (points, name) => {
    const trkpts = [];
    let prev = null;
    for (const [lat, lng] of points) {
        if (prev && prev[0] === lat && prev[1] === lng) continue;
        trkpts.push(`      <trkpt lat="${lat.toFixed(5)}" lon="${lng.toFixed(5)}"></trkpt>`);
        prev = [lat, lng];
    }
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="romverner.github.io" xmlns="http://www.topografix.com/GPX/1/1">',
        '  <metadata>',
        `    <name>${name}</name>`,
        '  </metadata>',
        '  <trk>',
        `    <name>${name}</name>`,
        '    <trkseg>',
        ...trkpts,
        '    </trkseg>',
        '  </trk>',
        '</gpx>',
        '',
    ].join('\n');
};

// High Injury Network proximity index: the HIN corridors (street
// geometry) densified to points in a spatial grid, so any route point can
// be tested for "on a high-injury corridor" with a cheap local lookup.
ROUTE.HIN_URL = 'public/json/hin.geojson';
ROUTE.HIN_CELL = 0.0005;   // ~45m grid
ROUTE.HIN_TOL_M = 18;      // route point <-> HIN corridor

ROUTE.buildHinIndex = (geojson) => {
    const grid = new Map();
    const add = (lng, lat) => {
        const key = `${Math.floor(lng / ROUTE.HIN_CELL)},${Math.floor(lat / ROUTE.HIN_CELL)}`;
        let arr = grid.get(key);
        if (!arr) { arr = []; grid.set(key, arr); }
        arr.push(lng, lat);
    };
    for (const f of geojson.features) {
        const lines = f.geometry.type === 'MultiLineString'
            ? f.geometry.coordinates : [f.geometry.coordinates];
        for (const line of lines) {
            for (let i = 0; i < line.length - 1; i++) {
                const [x1, y1] = line[i];
                const [x2, y2] = line[i + 1];
                const n = Math.max(1, Math.ceil(ROUTE.distanceM(y1, x1, y2, x2) / 9));
                for (let k = 0; k <= n; k++) {
                    const t = k / n;
                    add(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
                }
            }
        }
    }
    return grid;
};

ROUTE.nearHin = (grid, lat, lng) => {
    if (!grid) return false;
    const cx = Math.floor(lng / ROUTE.HIN_CELL);
    const cy = Math.floor(lat / ROUTE.HIN_CELL);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const arr = grid.get(`${cx + dx},${cy + dy}`);
            if (!arr) continue;
            for (let i = 0; i < arr.length; i += 2) {
                if (ROUTE.distanceM(lat, lng, arr[i + 1], arr[i]) <= ROUTE.HIN_TOL_M) return true;
            }
        }
    }
    return false;
};

// Is a route edge on the HIN? Sample points along it; majority near a
// corridor counts (street blocks are short, so this is a good proxy).
ROUTE.edgeOnHin = (graph, edge, fwd, grid) => {
    if (!grid) return false;
    const pts = ROUTE.edgeLatLngs(graph, edge, fwd);
    const step = Math.max(1, Math.floor(pts.length / 4));
    let near = 0;
    let total = 0;
    for (let i = 0; i < pts.length; i += step) {
        total++;
        if (ROUTE.nearHin(grid, pts[i][0], pts[i][1])) near++;
    }
    return total > 0 && near / total >= 0.5;
};

// Flag every edge as on/off the High Injury Network (once, after the HIN
// index is available) so routing can weight it without a per-route scan.
ROUTE.computeHinFlags = (graph, hinGrid) => {
    const hin = new Uint8Array(graph.edges.length);
    if (hinGrid) {
        for (let i = 0; i < graph.edges.length; i++) {
            if (ROUTE.edgeOnHin(graph, i, true, hinGrid)) hin[i] = 1;
        }
    }
    return hin;
};

// Trail categories are off-street, so the High Injury Network (a
// street-crash dataset) never applies to them — even where a trail runs
// parallel to a high-injury road like the SRT alongside MLK Drive.
ROUTE.HIN_EXEMPT_KEYS = new Set(['trail', 'trailSoft']);

// Rate a route by how much of it follows higher-crash corridors. Buckets
// keep the readout calm and at-a-glance (a colored word, not a red
// sentence). Thresholds are share-of-route on the HIN.
ROUTE.HIN_RATINGS = [
    { max: 35,  key: 'low',   label: 'Low' },
    { max: 70,  key: 'mod',   label: 'Moderate' },
    { max: 100,  key: 'high',  label: 'High' },
    // { max: 120, key: 'vhigh', label: 'Very high' },
];

ROUTE.hinRating = (pct) =>
    ROUTE.HIN_RATINGS.find((r) => pct < r.max) || ROUTE.HIN_RATINGS[ROUTE.HIN_RATINGS.length - 1];

ROUTE.routeStats = (graph, route, hinGrid) => {
    const byCategory = ROUTE.CONFIG.laneCategories.map(() => 0);
    const hinByCategory = ROUTE.CONFIG.laneCategories.map(() => 0);
    for (const { edge, fwd } of route.steps) {
        const cat = graph.category[edge];
        const len = graph.edges[edge][5];
        byCategory[cat] += len;
        if (hinGrid && !ROUTE.HIN_EXEMPT_KEYS.has(ROUTE.CONFIG.laneCategories[cat].key)
            && ROUTE.edgeOnHin(graph, edge, fwd, hinGrid)) {
            hinByCategory[cat] += len;
        }
    }
    return ROUTE.CONFIG.laneCategories
        .map((cat, i) => ({ ...cat, meters: byCategory[i], hinMeters: hinByCategory[i] }))
        .filter((c) => c.meters > 0);
};

// --- Elevation (per-node ground elevation, indexed to graph nodes) ---

ROUTE.ELEV_URL = 'public/json/elevations.json';
ROUTE.M_TO_FT = 3.28084;

ROUTE.routeNodeSeq = (graph, steps) => {
    if (!steps.length) return [];
    const first = steps[0];
    const start = first.fwd ? graph.edges[first.edge][0] : graph.edges[first.edge][1];
    const seq = [{ node: start, dist: 0 }];
    let cum = 0;
    for (const s of steps) {
        const e = graph.edges[s.edge];
        cum += e[5];
        seq.push({ node: s.fwd ? e[1] : e[0], dist: cum });
    }
    return seq;
};

// Total climb/descent in feet along the route (sum of node-to-node rises).
ROUTE.routeClimb = (graph, steps) => {
    if (!graph.elev) return null;
    const seq = ROUTE.routeNodeSeq(graph, steps);
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < seq.length; i++) {
        const dz = graph.elev[seq[i].node] - graph.elev[seq[i - 1].node];
        if (Number.isFinite(dz)) { if (dz > 0) gain += dz; else loss -= dz; }
    }
    return { gainFt: gain * ROUTE.M_TO_FT, lossFt: loss * ROUTE.M_TO_FT };
};

// Elevation profile points (distance m, elevation ft) for a sparkline.
ROUTE.elevProfile = (graph, steps) => {
    if (!graph.elev) return null;
    return ROUTE.routeNodeSeq(graph, steps)
        .map((p) => ({ d: p.dist, z: graph.elev[p.node] * ROUTE.M_TO_FT }))
        .filter((p) => Number.isFinite(p.z));
};

// --- Map UI ---

ROUTE.attach = (map) => {
    const state = {
        graph: null,
        rawGraph: null,
        counties: {},
        loading: false,
        active: false,
        start: null,
        end: null,
        vias: [],
        legPaths: null,
        breakdownOpen: false,
        waypointsOpen: false,
        hinGrid: null,
        elevData: null,
        safety: ROUTE.CONFIG.defaultSafety,
        routeLayer: L.layerGroup().addTo(map),
    };

    // Apply per-edge HIN flags once both the graph and the HIN index exist
    // (either may finish loading first).
    const applyHinFlags = () => {
        if (state.graph && state.hinGrid && !state.graph.hin) {
            state.graph.hin = ROUTE.computeHinFlags(state.graph, state.hinGrid);
            ROUTE.log('HIN edge flags applied',
                { flagged: state.graph.hin.reduce((a, b) => a + b, 0) });
        }
    };

    // Attach per-node elevations to the graph once both are loaded.
    const applyElev = () => {
        if (state.graph && state.elevData && !state.graph.elev) {
            state.graph.elev = state.elevData;  // index i = graph node i
            ROUTE.log('Elevations attached', { nodes: state.elevData.length });
        }
    };

    (async () => {
        try {
            const data = await (await fetch(ROUTE.ELEV_URL)).json();
            state.elevData = data.elev || [];
            applyElev();
        } catch (err) {
            ROUTE.error(err);
        }
    })();

    // Load the High Injury Network proximity index in the background so the
    // route breakdown can flag high-injury sections and routing can weight
    // them.
    (async () => {
        try {
            const data = await (await fetch(ROUTE.HIN_URL)).json();
            state.hinGrid = ROUTE.buildHinIndex(data);
            applyHinFlags();
            ROUTE.log('HIN index built', { corridors: data.features.length });
        } catch (err) {
            ROUTE.error(err);
        }
    })();

    const control = L.control({ position: 'topleft' });

    control.onAdd = () => {
        const div = L.DomUtil.create('div', 'map-route is-collapsed');
        div.innerHTML = `
            <div class="map-route-grabber" aria-hidden="true"></div>
            <div class="map-route-header">
                <button type="button" class="map-route-toggle" aria-expanded="false" title="Plan a bike route">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="5.5" cy="17.5" r="3.5"/>
                        <circle cx="18.5" cy="17.5" r="3.5"/>
                        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>
                    </svg>
                    <span>Plan a route</span>
                </button>
                <button type="button" class="map-route-help" aria-label="How to use the route planner" title="How to use">?</button>
            </div>
            <div class="map-route-body">
                <div class="map-route-hint"></div>
                <div class="map-route-waypoints"></div>
                <label class="map-route-slider-row">
                    <span>Shortest</span>
                    <input type="range" min="0" max="100" value="${Math.round(state.safety * 100)}" aria-label="Route preference between shortest and safest">
                    <span>Safest</span>
                </label>
                <div class="map-route-summary"></div>
                <div class="map-route-breakdown"></div>
                <button type="button" class="map-route-export" hidden>Export Route (.gpx)</button>
                <div class="map-route-actions">
                    <button type="button" class="map-route-reverse" title="Swap start and destination">⇅ Reverse</button>
                    <button type="button" class="map-route-clear">Clear route</button>
                </div>
            </div>
        `;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        const toggle = div.querySelector('.map-route-toggle');
        const helpBtn = div.querySelector('.map-route-help');
        const waypointsDiv = div.querySelector('.map-route-waypoints');
        const hint = div.querySelector('.map-route-hint');
        const slider = div.querySelector('input[type=range]');
        const summary = div.querySelector('.map-route-summary');
        const breakdown = div.querySelector('.map-route-breakdown');
        const exportBtn = div.querySelector('.map-route-export');
        const reverseBtn = div.querySelector('.map-route-reverse');
        const clearBtn = div.querySelector('.map-route-clear');

        const setHint = (text) => { hint.textContent = text; };

        // Teardrop rotated so the tail points straight down; the anchor
        // sits on the tip, so the pin points at the exact route location.
        const pinIcon = (label, cls) => L.divIcon({
            className: '',
            html: `<div class="map-route-pin ${cls}"><span>${label}</span></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 31],
        });

        // Merge Philadelphia (kept as raw) with any loaded neighbor-county
        // graphs into one decoded graph. Each county's `border` array maps
        // its local node indices onto the Philadelphia node they fuse to,
        // so cross-border edges connect at shared intersections.
        const rebuildGraph = () => {
            const phl = state.rawGraph;
            const counties = Object.values(state.counties);
            if (!counties.length) {
                state.graph = ROUTE.decodeGraph(phl);
                return;
            }
            const nodes = phl.nodes.slice();
            const edges = phl.edges.slice();
            let next = nodes.length / 2;
            for (const c of counties) {
                const border = new Map(c.border);
                const count = c.nodes.length / 2;
                const remap = new Int32Array(count);
                for (let d = 0; d < count; d++) {
                    if (border.has(d)) {
                        remap[d] = border.get(d);
                    } else {
                        remap[d] = next++;
                        nodes.push(c.nodes[d * 2], c.nodes[d * 2 + 1]);
                    }
                }
                for (const e of c.edges) {
                    const ne = e.slice();
                    ne[0] = remap[e[0]];
                    ne[1] = remap[e[1]];
                    edges.push(ne);
                }
                // Bikeable river bridges: a two-way path edge from the
                // county approach to the Philadelphia approach (type 12 =
                // trail, so the router treats it as a comfortable crossing).
                for (const [countyNode, phlNode, lengthM] of (c.bridges || [])) {
                    edges.push([remap[countyNode], phlNode, 0, 12, 0, lengthM, []]);
                }
            }
            state.graph = ROUTE.decodeGraph({
                coordScale: phl.coordScale, types: phl.types, nodes, edges,
            });
        };

        const fetchCounty = async (key) => {
            const res = await fetch(`public/json/graph-${key}.json`);
            state.counties[key] = await res.json();
        };

        const ensureGraph = () => {
            if (!state.graphPromise) {
                state.graphPromise = (async () => {
                    setHint('Loading street network…');
                    try {
                        state.rawGraph = await (await fetch(ROUTE.CONFIG.graphUrl)).json();
                        if (ROUTE.COUNTIES_ENABLED) {
                            for (const key of ROUTE.loadedCounties()) {
                                try { await fetchCounty(key); }
                                catch (e) { ROUTE.error(e); }
                            }
                        }
                        rebuildGraph();
                        applyHinFlags();
                        applyElev();
                        ROUTE.log('Graph loaded', {
                            nodes: state.graph.count, edges: state.graph.edges.length,
                            counties: Object.keys(state.counties),
                        });
                        setHint('Click the map to set your start point.');
                    } catch (err) {
                        ROUTE.error(err);
                        setHint('Could not load the street network.');
                        state.graphPromise = null;
                    }
                })();
            }
            return state.graphPromise;
        };

        // Public: load a neighboring county and merge it in. The map UI
        // calls this when the user taps a county to add it.
        ROUTE.loadCounty = async (key) => {
            if (!ROUTE.COUNTIES_ENABLED) return false;
            await ensureGraph();
            if (!state.rawGraph || state.counties[key]) return !!state.counties[key];
            await fetchCounty(key);
            rebuildGraph();
            ROUTE.persistCounty(key);
            if (state.start && state.end) drawRoute();
            return true;
        };

        const drawRoute = () => {
            state.routeLayer.clearLayers();
            summary.innerHTML = '';
            breakdown.innerHTML = '';
            state.lastPath = null;
            state.lastMiles = 0;
            state.legPaths = null;
            exportBtn.hidden = true;
            if (!state.graph || !state.start || !state.end) return;

            const waypoints = [state.start, ...state.vias, state.end]
                .map((m) => m.getLatLng());
            const allSteps = [];
            const legPaths = [];
            let distance = 0;
            for (let i = 0; i < waypoints.length - 1; i++) {
                const from = ROUTE.nearestNode(state.graph, waypoints[i]);
                const to = ROUTE.nearestNode(state.graph, waypoints[i + 1]);
                if (from.node === to.node) {
                    legPaths.push([]);
                    continue;
                }
                const leg = ROUTE.findRoute(state.graph, from.node, to.node, state.safety);
                if (!leg) {
                    setHint('No route found between those points.');
                    return;
                }
                const path = [];
                for (const step of leg.steps) {
                    path.push(...ROUTE.edgeLatLngs(state.graph, step.edge, step.fwd));
                }
                legPaths.push(path);
                allSteps.push(...leg.steps);
                distance += leg.distance;
            }
            if (!allSteps.length) {
                setHint('No route found between those points.');
                return;
            }
            const route = { steps: allSteps, distance };
            state.legPaths = legPaths;

            const fullPath = legPaths.flat();
            L.polyline(fullPath, { ...ROUTE.CONFIG.routeCasingStyle, interactive: false })
                .addTo(state.routeLayer);
            for (const seg of ROUTE.routeSegments(state.graph, route.steps)) {
                L.polyline(seg.latlngs, {
                    ...ROUTE.CONFIG.routeStyle,
                    color: ROUTE.CONFIG.laneCategories[seg.category].color,
                    interactive: false,
                }).addTo(state.routeLayer);
            }
            const hit = L.polyline(fullPath, { opacity: 0, weight: 20 }).addTo(state.routeLayer);
            hit.on('mousedown', startRouteDrag);
            hit.on('click', (e) => L.DomEvent.stopPropagation(e.originalEvent));

            const miles = route.distance / 1609.344;
            const minutes = Math.round((miles / ROUTE.CONFIG.bikeSpeedMph) * 60);
            const climb = ROUTE.routeClimb(state.graph, route.steps);
            summary.textContent = `${miles.toFixed(1)} mi · ~${minutes} min`
                + (climb ? ` · ↑${Math.round(climb.gainFt)} ft` : '');
            state.lastPath = fullPath;
            state.lastMiles = miles;
            exportBtn.hidden = false;

            const stats = ROUTE.routeStats(state.graph, route, state.hinGrid);
            const hinMeters = stats.reduce((s, c) => s + c.hinMeters, 0);
            const bar = stats.map((c) =>
                `<span style="flex:${c.meters};background:${c.color}"></span>`).join('');
            // A thin red bar under the lane bar, aligned by the same flex
            // weights: each segment's red span marks the share of that lane
            // type that runs on a high-injury corridor.
            const hinbar = hinMeters > 0
                ? stats.map((c) => `<span style="flex:${c.meters}"><i style="width:${(c.hinMeters / c.meters) * 100}%"></i></span>`).join('')
                : '';
            const rows = stats.map((c) => `
                <div class="map-route-breakdown-row">
                    <span class="map-legend-swatch" style="background:${c.color}"></span>
                    <span>${c.label}</span>
                    <span class="map-route-breakdown-pct">${Math.round((c.meters / route.distance) * 100)}%</span>
                </div>
            `).join('');
            const hinPct = (hinMeters / route.distance) * 100;
            const rating = ROUTE.hinRating(hinPct);
            const hinNote = state.hinGrid
                ? `<div class="map-route-hin-rating">
                       <span class="map-route-hin-label">Crash corridors</span>
                       <span class="map-route-hin-badge is-${rating.key}">${rating.label}</span>
                       <button type="button" class="map-route-hin-info" aria-label="What is this rating?">?</button>
                   </div>`
                : '';

            // Elevation profile sparkline (shown in the expanded breakdown).
            const profile = ROUTE.elevProfile(state.graph, route.steps);
            let elevBlock = '';
            if (climb && profile && profile.length > 1) {
                const W = 100;
                const H = 28;
                const maxD = profile[profile.length - 1].d || 1;
                let minZ = Infinity;
                let maxZ = -Infinity;
                for (const p of profile) { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
                const range = Math.max(maxZ - minZ, 1);
                const px = (d) => (d / maxD) * W;
                const py = (z) => H - 2 - ((z - minZ) / range) * (H - 4);
                const pts = profile.map((p) => `${px(p.d).toFixed(1)},${py(p.z).toFixed(1)}`);
                const line = `M${pts.join(' L')}`;
                elevBlock = `
                    <div class="map-route-elev-head">
                        <span>Elevation</span>
                        <span class="map-route-elev-stat">↑${Math.round(climb.gainFt)} ft · ↓${Math.round(climb.lossFt)} ft</span>
                    </div>
                    <svg class="map-route-elev" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
                        <path class="map-route-elev-area" d="${line} L${W},${H} L0,${H} Z"/>
                        <path class="map-route-elev-line" d="${line}"/>
                    </svg>`;
            }

            breakdown.innerHTML = `
                <button type="button" class="map-route-bar-toggle" title="Show lane mix"
                    aria-expanded="${state.breakdownOpen}">
                    <span class="map-route-bar-stack">
                        <span class="map-route-bar">${bar}</span>
                        ${hinbar ? `<span class="map-route-hinbar">${hinbar}</span>` : ''}
                    </span>
                    <span class="map-legend-chevron" aria-hidden="true">▾</span>
                </button>
                <div class="map-route-breakdown-rows">${elevBlock}${rows}${hinNote}</div>
            `;
            breakdown.classList.toggle('is-collapsed', !state.breakdownOpen);
            const barToggle = breakdown.querySelector('.map-route-bar-toggle');
            barToggle.addEventListener('click', () => {
                state.breakdownOpen = !state.breakdownOpen;
                breakdown.classList.toggle('is-collapsed', !state.breakdownOpen);
                barToggle.setAttribute('aria-expanded', String(state.breakdownOpen));
            });
            breakdown.querySelector('.map-route-hin-info')?.addEventListener('click', openHinInfo);

            setHint('Drag the route line to add a via point; double-click a via to remove it.');
            refreshSheet();

            // First complete route of this planning session: tuck the
            // Indego pins away and fit the view to the whole route.
            // One-shot — afterwards the camera and the toggle button are
            // the user's until the next Clear.
            if (!state.indegoAutoHidden) {
                state.indegoAutoHidden = true;
                if (indegoVisible) setIndegoVisible(false);
                fitRouteInView(fullPath);
            }
            ROUTE.log('Route computed', { miles, safety: state.safety, steps: route.steps.length, vias: state.vias.length });
        };

        // Fit the whole route on screen, keeping it clear of the planner:
        // the panel on the left on desktop, the bottom sheet on mobile.
        const fitRouteInView = (path) => {
            const bounds = L.latLngBounds(path);
            if (isMobile()) {
                const sheetTop = div.getBoundingClientRect().top;
                const covered = Math.max(0, window.innerHeight - sheetTop);
                map.fitBounds(bounds, {
                    paddingTopLeft: [30, 70],
                    paddingBottomRight: [30, covered + 30],
                    maxZoom: 16,
                });
            } else {
                map.fitBounds(bounds, {
                    paddingTopLeft: [280, 60],
                    paddingBottomRight: [60, 60],
                    maxZoom: 16,
                });
            }
        };

        const nearestLegIndex = (latlng) => {
            let best = 0;
            let bestDist = Infinity;
            (state.legPaths || []).forEach((path, i) => {
                for (const [lat, lng] of path) {
                    const d = ROUTE.distanceM(latlng.lat, latlng.lng, lat, lng);
                    if (d < bestDist) {
                        bestDist = d;
                        best = i;
                    }
                }
            });
            return best;
        };

        const removeVia = (marker) => {
            map.removeLayer(marker);
            state.vias = state.vias.filter((v) => v !== marker);
            drawRoute();
        };

        const createVia = (latlng) => {
            const marker = L.marker(latlng, {
                draggable: true,
                icon: L.divIcon({
                    className: '',
                    html: '<div class="map-route-via"></div>',
                    iconSize: [14, 14],
                    iconAnchor: [7, 7],
                }),
            }).addTo(map);
            marker.on('dragend', drawRoute);
            marker.on('dblclick contextmenu', (e) => {
                L.DomEvent.stop(e.originalEvent);
                removeVia(marker);
            });
            return marker;
        };

        const startRouteDrag = (e) => {
            L.DomEvent.stop(e.originalEvent);
            map.dragging.disable();

            const via = createVia(e.latlng);
            state.vias.splice(nearestLegIndex(e.latlng), 0, via);

            let raf = null;
            const move = (ev) => {
                via.setLatLng(ev.latlng);
                if (!raf) {
                    raf = requestAnimationFrame(() => {
                        raf = null;
                        drawRoute();
                    });
                }
            };
            const up = () => {
                map.off('mousemove', move);
                map.off('mouseup', up);
                map.dragging.enable();
                drawRoute();
            };
            map.on('mousemove', move);
            map.on('mouseup', up);
        };

        const renderWaypoints = () => {
            const wpts = ROUTE.loadWaypoints();
            const meChip = state.myLocation
                ? '<button type="button" class="map-route-wpt-me" title="Use my current location">📍 My location</button>'
                : '';
            const chips = wpts.map((s, i) => `
                <span class="map-route-wpt-chip">
                    <button type="button" class="map-route-wpt-use" data-i="${i}"
                        title="Route via ${ROUTE.escapeHtml(s.name)}">${ROUTE.escapeHtml(s.name)}</button>
                    <button type="button" class="map-route-wpt-del" data-i="${i}"
                        aria-label="Delete ${ROUTE.escapeHtml(s.name)}">×</button>
                </span>
            `).join('');
            const saveChips = [
                state.start ? '<button type="button" class="map-route-wpt-add" data-pin="start">☆ Save A</button>' : '',
                state.end ? '<button type="button" class="map-route-wpt-add" data-pin="end">☆ Save B</button>' : '',
            ].join('');
            if (!meChip && !chips && !saveChips) {
                waypointsDiv.innerHTML = '';
                return;
            }
            waypointsDiv.innerHTML = `
                <button type="button" class="map-route-waypoints-toggle"
                    aria-expanded="${state.waypointsOpen}">
                    <span>Saved waypoints${wpts.length ? ` (${wpts.length})` : ''}</span>
                    <span class="map-legend-chevron" aria-hidden="true">▾</span>
                </button>
                <div class="map-route-waypoints-body">
                    <div class="map-route-waypoints-row">${meChip}${chips}${saveChips}</div>
                </div>
            `;
            waypointsDiv.classList.toggle('is-collapsed', !state.waypointsOpen);
        };

        const openSaveWaypoint = (pin) => {
            if (!pin) return;
            const latlng = pin.getLatLng();
            const overlay = L.DomUtil.create('div', 'map-route-help-overlay', map.getContainer());
            overlay.innerHTML = `
                <div class="map-route-help-card map-route-save-card">
                    <div class="map-route-help-head">
                        <h3>Save waypoint</h3>
                        <button type="button" class="map-route-help-close" aria-label="Close">×</button>
                    </div>
                    <p class="map-route-save-note">Keeps this spot on this device so you
                    can use it as a start or destination with one tap.</p>
                    <input type="text" class="map-route-save-name" maxlength="40"
                        placeholder="e.g. Home, Work" aria-label="Name for this waypoint">
                    <button type="button" class="map-route-save-confirm" disabled>Save</button>
                </div>
            `;
            L.DomEvent.disableClickPropagation(overlay);
            L.DomEvent.disableScrollPropagation(overlay);

            const input = overlay.querySelector('.map-route-save-name');
            const confirm = overlay.querySelector('.map-route-save-confirm');
            // Removing the overlay detaches the click target mid-dispatch,
            // which would let the click fall through to the map as a pin
            // placement — always stop propagation before closing.
            const close = (e) => {
                if (e) L.DomEvent.stopPropagation(e);
                overlay.remove();
            };

            input.addEventListener('input', () => {
                const name = input.value.trim();
                confirm.disabled = !name;
                const exists = ROUTE.loadWaypoints().some((s) => s.name === name);
                confirm.textContent = exists ? `Overwrite “${name}”` : 'Save';
            });
            const save = (e) => {
                const name = input.value.trim();
                if (!name) return;
                const wpts = ROUTE.loadWaypoints().filter((s) => s.name !== name);
                wpts.push({ name, lat: latlng.lat, lng: latlng.lng });
                ROUTE.saveWaypoints(wpts);
                close(e);
                renderWaypoints();
                ROUTE.log('Waypoint saved', { name });
            };
            confirm.addEventListener('click', save);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') save();
            });
            overlay.querySelector('.map-route-help-close').addEventListener('click', close);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(e);
            });
            input.focus();
        };

        // Shared placement semantics for waypoint chips and "my location":
        // first use sets the start, next the destination, after that it
        // moves the destination.
        const useWaypointLatLng = (latlng) => {
            if (!state.graph) return;
            if (!state.start) {
                placePin(latlng);
                map.setView(latlng, Math.max(map.getZoom(), 14));
            } else if (!state.end) {
                placePin(latlng);
            } else {
                state.end.setLatLng(latlng);
                drawRoute();
            }
        };

        waypointsDiv.addEventListener('click', (e) => {
            // Stop before this handler re-renders the chips: a detached
            // click target defeats Leaflet's control-click detection and
            // the event would land on the map as a pin placement.
            L.DomEvent.stopPropagation(e);
            if (e.target.closest('.map-route-wpt-me')) {
                if (state.myLocation) useWaypointLatLng(L.latLng(state.myLocation));
                return;
            }
            if (e.target.closest('.map-route-waypoints-toggle')) {
                state.waypointsOpen = !state.waypointsOpen;
                waypointsDiv.classList.toggle('is-collapsed', !state.waypointsOpen);
                waypointsDiv.querySelector('.map-route-waypoints-toggle')
                    .setAttribute('aria-expanded', String(state.waypointsOpen));
                return;
            }
            const add = e.target.closest('.map-route-wpt-add');
            if (add) {
                openSaveWaypoint(add.dataset.pin === 'end' ? state.end : state.start);
                return;
            }
            const use = e.target.closest('.map-route-wpt-use');
            const del = e.target.closest('.map-route-wpt-del');
            if (use || del) {
                const wpts = ROUTE.loadWaypoints();
                const entry = wpts[Number((use || del).dataset.i)];
                if (!entry) return;
                if (del) {
                    ROUTE.saveWaypoints(wpts.filter((s) => s !== entry));
                    renderWaypoints();
                    return;
                }
                useWaypointLatLng(L.latLng(entry.lat, entry.lng));
            }
        });

        const placePin = (latlng) => {
            if (!state.graph) return;
            if (!state.start) {
                state.start = L.marker(latlng, { draggable: true, icon: pinIcon('A', 'is-start') }).addTo(map);
                state.start.on('dragend', drawRoute);
                setHint('Click the map to set your destination.');
                renderWaypoints();
            } else if (!state.end) {
                state.end = L.marker(latlng, { draggable: true, icon: pinIcon('B', 'is-end') }).addTo(map);
                state.end.on('dragend', drawRoute);
                drawRoute();
                renderWaypoints();
            }
            // Both pins placed: stray map clicks are ignored — pins move
            // only by dragging, so a tap can't wipe out the route.
        };

        const exportGpx = async () => {
            if (!state.lastPath) return;
            const name = `Philly bike route (${state.lastMiles.toFixed(1)} mi)`;
            const gpx = ROUTE.toGPX(state.lastPath, name);
            // iOS picks share-sheet apps from the extension-derived UTI;
            // a custom XML MIME makes WebKit treat the file as generic
            // text and drop GPX-capable apps from the suggestions. A
            // generic binary type keeps the .gpx extension authoritative.
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const file = new File([gpx], 'philly-bike-route.gpx', {
                type: isIOS ? 'application/octet-stream' : 'application/gpx+xml',
            });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: name });
                    ROUTE.log('Route shared via share sheet', { name });
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    ROUTE.error(err);
                }
            }

            const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'philly-bike-route.gpx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            ROUTE.log('Route downloaded as GPX', { name });
        };

        const reverseRoute = () => {
            if (!state.start || !state.end) return;
            const startLatLng = state.start.getLatLng();
            state.start.setLatLng(state.end.getLatLng());
            state.end.setLatLng(startLatLng);
            state.vias.reverse();
            drawRoute();
        };

        const clearRoute = () => {
            state.routeLayer.clearLayers();
            if (state.start) map.removeLayer(state.start);
            if (state.end) map.removeLayer(state.end);
            for (const via of state.vias) map.removeLayer(via);
            state.start = null;
            state.end = null;
            state.vias = [];
            state.legPaths = null;
            state.lastPath = null;
            state.lastMiles = 0;
            summary.innerHTML = '';
            breakdown.innerHTML = '';
            exportBtn.hidden = true;
            state.indegoAutoHidden = false;
            renderWaypoints();
            refreshSheet();
            if (state.active) setHint('Click the map to set your start point.');
        };

        // Focused explainer for the higher-crash-corridor rating.
        const openHinInfo = () => {
            const overlay = L.DomUtil.create('div', 'map-route-help-overlay', map.getContainer());
            overlay.innerHTML = `
                <div class="map-route-help-card map-route-hin-card">
                    <div class="map-route-help-head">
                        <h3>Higher-crash corridors</h3>
                        <button type="button" class="map-route-help-close" aria-label="Close">×</button>
                    </div>
                    <p>Philadelphia's <strong>High Injury Network</strong> is the set of
                    streets that see the most reported traffic crashes — a small share of
                    streets accounting for most of the city's serious ones (it's the basis
                    of the city's Vision Zero work).</p>
                    <p><strong>It counts everyone.</strong> Those crash tallies include
                    drivers, pedestrians, and cyclists together — the data doesn't break
                    out cycling. So a “High” rating doesn't mean a route is dangerous for
                    you specifically; it just means more of it runs along the city's
                    busier, crash-prone corridors.</p>
                    <p><strong>How it's used here.</strong> The rating reflects how much of
                    your route follows these corridors (off-street trails never count).
                    The planner also nudges the unprotected parts of a route off them when
                    a calmer option exists — and you can see them in red with the ⚠ map
                    toggle. Treat it as a gentle heads-up, not a warning.</p>
                </div>
            `;
            L.DomEvent.disableClickPropagation(overlay);
            L.DomEvent.disableScrollPropagation(overlay);
            const close = (e) => { if (e) L.DomEvent.stopPropagation(e); overlay.remove(); };
            overlay.querySelector('.map-route-help-close').addEventListener('click', close);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(e); });
        };

        let helpModal = null;
        const toggleHelp = () => {
            if (helpModal) {
                helpModal.remove();
                helpModal = null;
                return;
            }
            helpModal = L.DomUtil.create('div', 'map-route-help-overlay', map.getContainer());
            helpModal.innerHTML = `
                <div class="map-route-help-card">
                    <div class="map-route-help-head">
                        <h3>Using the route planner</h3>
                        <button type="button" class="map-route-help-close" aria-label="Close help">×</button>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Plan</div>
                        <p>Click the map to drop your start (A), then again for your
                        destination (B). Once both are placed, drag a pin to move
                        it — stray taps on the map won't disturb the route.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Guide the route</div>
                        <p>Grab the route line and drag it to add a via point the
                        route must pass through. Add as many as you like; drag a via
                        to move it, double-click to remove it.</p>
                    </div>
                    <div class="map-route-help-item is-tip">
                        <div class="map-route-help-item-title">Shortest ↔ Safest</div>
                        <p>The slider trades distance for bike infrastructure —
                        trails first, then protected, buffered, and painted lanes,
                        while avoiding busy streets with no lanes.</p>
                        <p>Worth experimenting: the safest extreme can add turns and
                        detours for only a marginal safety gain. A notch or two toward
                        the middle often gives a simpler ride that's nearly as safe.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Read the route</div>
                        <p>The route is colored by lane type, and the panel shows the
                        mix — tap the colored bar for the full breakdown — plus
                        distance and a rough time.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Indego stations</div>
                        <p>Bike-share stations appear as blue pins once you zoom in.
                        Each pin fills with the share of bikes currently docked, and
                        a green lightning badge means e-bikes are available. Tap one
                        to start or end your route there. The pins tuck away once
                        your route is set — the pin button on the right brings them
                        back.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Subway stations</div>
                        <p>SEPTA Market-Frankford (L, blue) and Broad Street (B,
                        orange) stations show as line bullets when you zoom in — handy
                        for a bike-and-ride trip. Tap one to start or end your route
                        there.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Saved waypoints</div>
                        <p>Save the A or B pin as a named waypoint (Home, Work…) —
                        stored on this device only. Tap a saved waypoint to use it:
                        it becomes your start, or your destination if a start is
                        already placed.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Reverse</div>
                        <p>Swaps A and B. One-way streets mean the return leg can be a
                        genuinely different route — worth checking before heading back.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Higher-crash corridors</div>
                        <p>The ⚠ button overlays Philadelphia's High Injury Network in
                        red — the streets that see more reported crashes. One thing to
                        know: this data counts all crashes (drivers, pedestrians, and
                        cyclists together), so it's a general awareness cue, not a
                        cyclist-specific danger map. Handy for giving busier corridors a
                        bit of extra attention.</p>
                    </div>
                    <div class="map-route-help-item">
                        <div class="map-route-help-item-title">Export</div>
                        <p>Share the route as a GPX file to apps like Komoot, Strava,
                        or Garmin (downloads on desktop).</p>
                    </div>
                </div>
            `;
            L.DomEvent.disableClickPropagation(helpModal);
            L.DomEvent.disableScrollPropagation(helpModal);
            const close = (e) => {
                L.DomEvent.stopPropagation(e);
                toggleHelp();
            };
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) close(e);
            });
            helpModal.querySelector('.map-route-help-close').addEventListener('click', close);
        };

        const setActive = (active) => {
            state.active = active;
            div.classList.toggle('is-collapsed', !active);
            toggle.setAttribute('aria-expanded', String(active));
            map.getContainer().classList.toggle('is-routing', active);
            if (active) {
                ensureGraph().then(() => {
                    if (state.graph && !state.start) setHint('Click the map to set your start point.');
                });
            } else {
                clearRoute();
            }
        };

        // On phones the planner is a bottom sheet with three resting
        // tiers: 'up' shows everything, 'mid' tucks the action buttons
        // below the fold (they mostly matter once planning is done),
        // 'down' leaves just the header peek. Collapsing keeps the
        // route; the sheet never deactivates planning.
        const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
        const grabber = div.querySelector('.map-route-grabber');
        const header = div.querySelector('.map-route-header');
        const actionsRow = div.querySelector('.map-route-actions');

        const sheetTiers = () => {
            const down = Math.max(0, div.offsetHeight - header.offsetHeight - grabber.offsetHeight);
            const buttons = exportBtn.hidden ? actionsRow : exportBtn;
            const mid = Math.min(down, Math.max(0, div.offsetHeight - buttons.offsetTop));
            return { up: 0, mid, down };
        };
        const setSheet = (pos) => {
            state.sheetPos = pos;
            div.classList.toggle('is-sheet-down', pos === 'down');
            div.style.transform = pos === 'mid' ? `translateY(${sheetTiers().mid}px)` : '';
            if (pos !== 'down' && !state.active) setActive(true);
        };
        // Re-measure the mid tier when panel content changes height.
        const refreshSheet = () => {
            if (isMobile() && state.sheetPos === 'mid') setSheet('mid');
        };

        let drag = null;
        const onTouchStart = (e) => {
            if (!isMobile()) return;
            const tiers = sheetTiers();
            drag = {
                startY: e.touches[0].clientY,
                tiers,
                base: state.active ? tiers[state.sheetPos || 'up'] : tiers.down,
                delta: 0,
                offset: null,
            };
            div.classList.add('is-dragging');
        };
        const onTouchMove = (e) => {
            if (!drag) return;
            drag.delta = e.touches[0].clientY - drag.startY;
            drag.offset = Math.min(Math.max(drag.base + drag.delta, 0), drag.tiers.down);
            div.style.transform = `translateY(${drag.offset}px)`;
        };
        const onTouchEnd = () => {
            if (!drag) return;
            div.classList.remove('is-dragging');
            if (!state.active) {
                div.style.transform = '';
                if (drag.delta < -40) setSheet('up');
            } else if (drag.offset === null) {
                setSheet(state.sheetPos || 'up');
            } else {
                let best = 'up';
                for (const pos of ['mid', 'down']) {
                    if (Math.abs(drag.offset - drag.tiers[pos])
                        < Math.abs(drag.offset - drag.tiers[best])) best = pos;
                }
                // Skip a degenerate mid tier (no buttons rendered yet, or
                // nearly coincident with up/down).
                if (best === 'mid' && (drag.tiers.mid <= 4
                    || drag.tiers.down - drag.tiers.mid <= 4)) {
                    best = drag.offset < drag.tiers.down - drag.offset ? 'up' : 'down';
                }
                setSheet(best);
            }
            drag = null;
        };
        for (const el of [grabber, header]) {
            el.addEventListener('touchstart', onTouchStart, { passive: true });
            el.addEventListener('touchmove', onTouchMove, { passive: true });
            el.addEventListener('touchend', onTouchEnd);
        }

        window.addEventListener('resize', () => {
            if (!isMobile()) {
                state.sheetPos = 'up';
                div.classList.remove('is-sheet-down');
                div.style.transform = '';
            }
        });

        toggle.addEventListener('click', () => {
            if (isMobile()) {
                setSheet(!state.active || state.sheetPos === 'down' ? 'up' : 'down');
            } else {
                setActive(!state.active);
            }
        });
        helpBtn.addEventListener('click', toggleHelp);
        exportBtn.addEventListener('click', exportGpx);
        reverseBtn.addEventListener('click', reverseRoute);
        clearBtn.addEventListener('click', clearRoute);
        slider.addEventListener('input', () => {
            state.safety = slider.value / 100;
            drawRoute();
        });
        map.on('click', (e) => {
            if (state.active) placePin(e.latlng);
        });

        // The locate control broadcasts on the map; once we know where
        // the user is, offer it as a waypoint.
        map.on('locationfound', (e) => {
            state.myLocation = e.latlng;
            renderWaypoints();
        });

        // Indego bike share stations: shown when zoomed in, with live
        // availability and shortcuts to route from/to a station.
        // Shared by Indego and SEPTA station popups: route from/to a
        // station, activating the planner and loading the graph if needed.
        const useStation = async (latlng, act, ev) => {
            L.DomEvent.stopPropagation(ev);
            map.closePopup();
            if (!state.active) setActive(true);
            await ensureGraph();
            if (!state.graph) return;
            if (act === 'start') {
                if (!state.start) {
                    placePin(latlng);
                } else {
                    state.start.setLatLng(latlng);
                    drawRoute();
                }
            } else if (state.end) {
                state.end.setLatLng(latlng);
                drawRoute();
            } else {
                state.end = L.marker(latlng, { draggable: true, icon: pinIcon('B', 'is-end') }).addTo(map);
                state.end.on('dragend', drawRoute);
                if (state.start) drawRoute();
                else setHint('Click the map to set your start point.');
                renderWaypoints();
            }
        };

        // Viewport culling for DOM marker layers: only the markers on
        // screen (plus a margin) stay attached, so panning/zooming doesn't
        // reposition hundreds of off-screen marker elements. Returns a
        // sync function; call it when the active condition changes.
        const cullMarkers = (markers, layer, isActive) => {
            const attached = new Set();
            const sync = () => {
                if (!isActive()) {
                    if (map.hasLayer(layer)) map.removeLayer(layer);
                    return;
                }
                if (!map.hasLayer(layer)) layer.addTo(map);
                const bounds = map.getBounds().pad(0.25);
                for (const m of markers) {
                    const inView = bounds.contains(m.getLatLng());
                    if (inView && !attached.has(m)) { layer.addLayer(m); attached.add(m); }
                    else if (!inView && attached.has(m)) { layer.removeLayer(m); attached.delete(m); }
                }
            };
            map.on('moveend zoomend', sync);
            return sync;
        };

        const indegoLayer = L.layerGroup();
        const indegoMarkers = [];
        let indegoVisible = true;
        let syncIndego = null;
        const setIndegoVisible = (visible) => {
            indegoVisible = visible;
            if (syncIndego) syncIndego();
            map.fire('romv:indego', { visible });
        };
        ROUTE.toggleIndego = () => {
            setIndegoVisible(!indegoVisible);
            return indegoVisible;
        };
        const addIndegoStations = async () => {
            try {
                const [infoRes, statusRes] = await Promise.all([
                    fetch(ROUTE.CONFIG.indegoInfoUrl),
                    fetch(ROUTE.CONFIG.indegoStatusUrl).catch(() => null),
                ]);
                const info = await infoRes.json();
                const status = {};
                if (statusRes && statusRes.ok) {
                    for (const s of (await statusRes.json()).data.stations) {
                        status[s.station_id] = s;
                    }
                }

                // Indego-app-style pin: the teardrop fills bottom-up with
                // the share of docks holding bikes; a lightning badge
                // marks stations with e-bikes available. Fill is bucketed
                // to eighths so all 310 markers share a couple dozen cached
                // icons instead of one unique gradient each.
                const colors = ROUTE.CONFIG.indegoColors;
                const iconCache = {};
                const pinIcon = (frac, hasEbike) => {
                    const bucket = Math.max(0, Math.min(8, Math.round(frac * 8)));
                    const key = `${bucket}${hasEbike ? 'e' : ''}`;
                    if (iconCache[key]) return iconCache[key];
                    const off = 1 - bucket / 8;
                    const badge = hasEbike ? `
                        <circle cx="8" cy="8" r="6.5" fill="${colors.ebike}" stroke="#fff" stroke-width="1.5"/>
                        <path d="M9.2 3.8 5.4 8.9h2.2l-0.8 3.3 3.8-5.1H8.4z" fill="#fff"/>
                    ` : '';
                    iconCache[key] = L.divIcon({
                        className: 'map-indego-pin',
                        html: `
                            <svg width="27" height="33" viewBox="0 0 34 42" aria-hidden="true">
                                <defs>
                                    <linearGradient id="indego-fill-${key}" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="${off}" stop-color="${colors.empty}"/>
                                        <stop offset="${off}" stop-color="${colors.filled}"/>
                                    </linearGradient>
                                </defs>
                                <path transform="translate(6,6)"
                                    d="M14 0C6.27 0 0 6.27 0 14c0 9.8 14 22 14 22s14-12.2 14-22C28 6.27 21.73 0 14 0Z"
                                    fill="url(#indego-fill-${key})" stroke="#fff" stroke-width="1.5"/>
                                ${badge}
                            </svg>
                        `,
                        iconSize: [27, 33],
                        iconAnchor: [16, 33],
                        popupAnchor: [0, -31],
                    });
                    return iconCache[key];
                };

                for (const st of info.data.stations) {
                    const s = status[st.station_id];
                    const bikes = s ? s.num_bikes_available : null;
                    const docks = s ? s.num_docks_available : null;
                    const ebikes = (s && s.num_bikes_available_types
                        && s.num_bikes_available_types.electric) || 0;
                    const frac = bikes !== null && bikes + docks > 0
                        ? bikes / (bikes + docks)
                        : 0;
                    const marker = L.marker([st.lat, st.lon], {
                        icon: pinIcon(frac, ebikes > 0),
                    });
                    const stats = s
                        ? `${bikes} bikes${ebikes ? ` (${ebikes} electric)` : ''} · ${docks} docks`
                        : '';
                    marker.bindPopup(`
                        <div class="map-indego-popup">
                            <div class="map-indego-name">${ROUTE.escapeHtml(st.name)}</div>
                            ${stats ? `<div class="map-indego-stats">${stats}</div>` : ''}
                            <div class="map-indego-actions">
                                <button type="button" data-act="start">Start here</button>
                                <button type="button" data-act="end">Route here</button>
                            </div>
                        </div>
                    `);
                    marker.on('popupopen', () => {
                        for (const btn of marker.getPopup().getElement().querySelectorAll('button[data-act]')) {
                            btn.addEventListener('click', (ev) =>
                                useStation(L.latLng(st.lat, st.lon), btn.dataset.act, ev));
                        }
                    });
                    indegoMarkers.push(marker);
                }

                syncIndego = cullMarkers(indegoMarkers, indegoLayer,
                    () => indegoVisible && map.getZoom() >= ROUTE.CONFIG.indegoMinZoom);
                syncIndego();
                ROUTE.log('Indego stations loaded', { count: info.data.stations.length });
            } catch (err) {
                ROUTE.error(err);
            }
        };
        addIndegoStations();

        // SEPTA subway stations (Market-Frankford "L" + Broad Street "BSL"):
        // colored line-letter bullets, tappable as a route start/end.
        const septaLayer = L.layerGroup();
        const septaMarkers = [];
        let septaVisible = true;
        let syncSepta = null;
        const setSeptaVisible = (visible) => {
            septaVisible = visible;
            if (syncSepta) syncSepta();
            map.fire('romv:septa', { visible });
        };
        ROUTE.toggleSepta = () => {
            setSeptaVisible(!septaVisible);
            return septaVisible;
        };
        const addSeptaStations = async () => {
            try {
                const res = await fetch(ROUTE.CONFIG.septaUrl);
                const data = await res.json();

                const colors = ROUTE.CONFIG.septaColors;
                const iconCache = {};
                const bulletIcon = (line) => {
                    if (iconCache[line]) return iconCache[line];
                    const color = colors[line] || '#555';
                    iconCache[line] = L.divIcon({
                        className: 'map-septa-pin',
                        html: `<span class="map-septa-bullet" style="background:${color}">${line}</span>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10],
                        popupAnchor: [0, -11],
                    });
                    return iconCache[line];
                };

                for (const f of data.features) {
                    const [lon, lat] = f.geometry.coordinates;
                    const p = f.properties;
                    const marker = L.marker([lat, lon], { icon: bulletIcon(p.LINE) });
                    marker.bindPopup(`
                        <div class="map-indego-popup">
                            <div class="map-indego-name">${ROUTE.escapeHtml(p.NAME)}</div>
                            <div class="map-indego-stats">${ROUTE.escapeHtml(p.LINE_NAME)}</div>
                            <div class="map-indego-actions">
                                <button type="button" data-act="start">Start here</button>
                                <button type="button" data-act="end">Route here</button>
                            </div>
                        </div>
                    `);
                    marker.on('popupopen', () => {
                        for (const btn of marker.getPopup().getElement().querySelectorAll('button[data-act]')) {
                            btn.addEventListener('click', (ev) =>
                                useStation(L.latLng(lat, lon), btn.dataset.act, ev));
                        }
                    });
                    septaMarkers.push(marker);
                }

                syncSepta = cullMarkers(septaMarkers, septaLayer,
                    () => septaVisible && map.getZoom() >= ROUTE.CONFIG.septaMinZoom);
                syncSepta();
                ROUTE.log('SEPTA stations loaded', { count: data.features.length });
            } catch (err) {
                ROUTE.error(err);
            }
        };
        addSeptaStations();

        renderWaypoints();

        // On phones, open the sheet right away — a docked-but-inert peek
        // reads as broken when a drag does nothing.
        setTimeout(() => {
            if (isMobile()) setSheet('up');
        }, 0);

        return div;
    };

    control.addTo(map);
};

if (typeof MAP !== 'undefined' && MAP.instance) {
    ROUTE.attach(MAP.instance);
}
