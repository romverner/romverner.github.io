const MAP = ROMV.createModule('MAP');

MAP.CONFIG = {
    basemaps: {
        // CARTO Positron: muted out of the box — no per-frame CSS
        // desaturation filter needed (expensive on weak GPUs).
        carto: {
            label: 'Muted',
            url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
        },
        osm: {
            label: 'Classic',
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            subdomains: 'abc',
            maxZoom: 19,
        },
    },
    laneDetailZoom: 13,
    majorLaneTypes: [
        'Two Way Separated Bike Lane',
        'One Way Separated Bike Lane',
        'Separated Bike Lane',
        'Paint Buffered',
        'Paint Buffered w Conventional',
    ],
    septaColors: { L: '#0097d6', B: '#f26100' },
    hinUrl: 'public/json/hin.geojson',
    hinColor: '#e53935',
    streetsUrl: 'public/json/lanes.geojson',
    trailsUrl: 'public/json/trails.geojson',
    cityLimitsUrl: 'public/json/city_limits.geojson',
    counties: Object.fromEntries(
        ['delaware', 'montgomery', 'bucks', 'camden', 'burlington'].map((k) => [k, {
            label: { delaware: 'Delaware County', montgomery: 'Montgomery County',
                     bucks: 'Bucks County', camden: 'Camden County',
                     burlington: 'Burlington County' }[k],
            boundaryUrl: `public/json/county-${k}.geojson`,
            lanesUrl: `public/json/lanes-${k}.geojson`,
        }])),
    metaUrl: 'public/json/meta.json',
    trailColors: {
        'Paved Trail':   '#00897b',
        'Unpaved Trail': '#8d6e63',
    },
    bikeLaneColors: {
        'Two Way Separated Bike Lane':     '#1b5e20',
        'One Way Separated Bike Lane':     '#2e7d32',
        'Separated Bike Lane':              '#43a047',
        'Paint Buffered':                   '#7cb342',
        'Paint Buffered w Conventional':    '#aed581',
        'Conventional':                     '#1e88e5',
        'Dashed Bike Lane':                 '#64b5f6',
        'Conventional & Dashed Bike Lane':  '#42a5f5',
        'Conventional w Sharrows':          '#ffa726',
        'Sharrow':                          '#fb8c00',
        'Bus Bike Lane':                    '#ab47bc',
        'Contraflow':                       '#e53935',
    },
    bikeLaneFallbackColor: '#888',
};

MAP.SETTINGS_KEY = 'romv-settings';

MAP.loadSettings = () => {
    const defaults = { basemap: 'carto', reduceTransparency: false, throttleTiles: false };
    try {
        return { ...defaults, ...JSON.parse(localStorage.getItem(MAP.SETTINGS_KEY) || '{}') };
    } catch (_) {
        return defaults;
    }
};

MAP.saveSettings = (settings) => {
    try {
        localStorage.setItem(MAP.SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
        MAP.error(err);
    }
};

MAP.applyBasemap = (map, key) => {
    const bm = MAP.CONFIG.basemaps[key] || MAP.CONFIG.basemaps.carto;
    if (MAP.tileLayer) map.removeLayer(MAP.tileLayer);
    // Weak-device tile budget (opt-in via settings): hold tile requests until
    // the pan settles and skip mid-zoom refreshes, so dragging doesn't fire a
    // request storm or repaint the grid every animation frame. Off by default
    // because it trades snappy in-gesture tile loading for fewer redraws.
    const throttle = MAP.loadSettings().throttleTiles;
    MAP.tileLayer = L.tileLayer(bm.url, {
        attribution: bm.attribution,
        subdomains: bm.subdomains,
        maxZoom: bm.maxZoom,
        updateWhenIdle: throttle,
        updateWhenZooming: !throttle,
    }).addTo(map);
    MAP.log('Basemap applied', { basemap: key, throttleTiles: throttle });
};

MAP.applyTransparency = (reduce) => {
    document.body.classList.toggle('no-blur', reduce);
};

MAP.create = (elementId, { center = [0, 0], zoom = 2 } = {}) => {
    try {
        // rotate:true enables the leaflet-rotate plugin's bearing support
        // (used by navigation mode to keep the user's heading pointing up).
        // We supply our own nav button, so the plugin's default control is off.
        const map = L.map(elementId, { rotate: true, rotateControl: false })
            .setView(center, zoom);
        map.zoomControl.setPosition('topright');

        const settings = MAP.loadSettings();
        MAP.applyBasemap(map, settings.basemap);
        MAP.applyTransparency(settings.reduceTransparency);

        MAP.log('Map initialized', { elementId, center, zoom });

        return map;
    } catch (err) {
        MAP.error(err);
        return null;
    }
};

MAP.labelStreets = async (map) => {
    try {
        const res = await fetch(MAP.CONFIG.streetsUrl);
        const data = await res.json();

        // At citywide zooms only major infrastructure is drawn; the
        // thousands of conventional/sharrow segments are sub-pixel noise
        // there and dominate the canvas redraw cost on weak devices.
        const major = [];
        const minor = [];
        for (const f of data.features) {
            (MAP.CONFIG.majorLaneTypes.includes(f.properties.TYPE) ? major : minor).push(f);
        }
        const renderer = L.canvas();
        const style = (feature) => ({
            color: MAP.CONFIG.bikeLaneColors[feature.properties.TYPE] || MAP.CONFIG.bikeLaneFallbackColor,
            weight: 2,
            opacity: 0.85,
        });
        const majorLayer = L.geoJSON({ type: 'FeatureCollection', features: major }, { renderer, style });

        MAP.streetsLayer = L.layerGroup([majorLayer]).addTo(map);
        // The minor segments are sub-pixel noise at citywide zooms, so defer
        // building their (thousands of) path objects until the first time the
        // user actually zooms into lane-detail range — a startup cost a weak
        // device never pays if it stays zoomed out.
        let minorLayer = null;
        const syncLaneDetail = () => {
            if (map.getZoom() >= MAP.CONFIG.laneDetailZoom) {
                if (!minorLayer) {
                    minorLayer = L.geoJSON({ type: 'FeatureCollection', features: minor }, { renderer, style });
                }
                MAP.streetsLayer.addLayer(minorLayer);
            } else if (minorLayer) {
                MAP.streetsLayer.removeLayer(minorLayer);
            }
        };
        map.on('zoomend', syncLaneDetail);
        syncLaneDetail();

        MAP.log('Streets labeled', { major: major.length, minor: minor.length });
    } catch (err) {
        MAP.error(err);
    }
};

// Philadelphia's High Injury Network: the corridors where most serious
// crashes happen. An opt-in safety overlay, drawn as a translucent red
// halo beneath the bike lanes in its own pane (off by default).
// Off by default, so only the (cheap) pane is set up at startup; the 252KB
// fetch and vector-layer build are deferred to the first toggle-on, work a
// weak device never does unless the user opts into the overlay.
MAP.labelHIN = (map) => {
    map.createPane('hin');
    map.getPane('hin').style.zIndex = 350;
};

MAP._loadHIN = (map) => {
    if (MAP._hinLoading) return MAP._hinLoading;
    MAP._hinLoading = (async () => {
        try {
            const data = await (await fetch(MAP.CONFIG.hinUrl)).json();
            MAP.hinLayer = L.geoJSON(data, {
                pane: 'hin',
                renderer: L.canvas({ pane: 'hin' }),
                style: { color: MAP.CONFIG.hinColor, weight: 6, opacity: 0.45 },
                interactive: false,
            });
            MAP.log('HIN loaded', { corridors: data.features.length });
        } catch (err) {
            MAP.error(err);
        }
    })();
    return MAP._hinLoading;
};

MAP.toggleHIN = (map) => {
    // First activation builds the layer lazily; _hinWanted tracks the user's
    // intent so a quick toggle-off before the fetch resolves still wins.
    if (!MAP.hinLayer) {
        MAP._hinWanted = true;
        MAP._loadHIN(map).then(() => {
            if (MAP.hinLayer && MAP._hinWanted) MAP.hinLayer.addTo(map);
        });
        return true;
    }
    const visible = map.hasLayer(MAP.hinLayer);
    MAP._hinWanted = !visible;
    if (visible) map.removeLayer(MAP.hinLayer);
    else MAP.hinLayer.addTo(map);
    return !visible;
};

MAP.labelTrails = async (map) => {
    try {
        const res = await fetch(MAP.CONFIG.trailsUrl);
        const data = await res.json();

        MAP.trailsLayer = L.geoJSON(data, {
            renderer: L.canvas(),
            style: (feature) => ({
                color: feature.properties.SURFACE === 'Unpaved'
                    ? MAP.CONFIG.trailColors['Unpaved Trail']
                    : MAP.CONFIG.trailColors['Paved Trail'],
                weight: 3,
                opacity: 0.85,
                dashArray: '6 4',
            }),
        }).addTo(map);

        MAP.log('Trails labeled', { count: data.features.length });
    } catch (err) {
        MAP.error(err);
    }
};

// Covered regions (Philadelphia + any loaded neighbor counties) un-dim
// the basemap; everything else stays dimmed. The mask lives in its own
// low pane so re-drawing it when a county is added never covers the
// bike-lane/route layers above it.
MAP._regionRings = [];   // array of [lat,lng] outer rings to un-dim
MAP._maskLayer = null;
MAP.countyLaneLayers = [];

const ringsFromGeoJSON = (data) => {
    const rings = [];
    for (const f of data.features) {
        const polys = f.geometry.type === 'Polygon'
            ? [f.geometry.coordinates]
            : f.geometry.coordinates;
        for (const poly of polys) {
            rings.push(poly[0].map(([lng, lat]) => [lat, lng]));
        }
    }
    return rings;
};

MAP.redrawMask = (map) => {
    if (MAP._maskLayer) map.removeLayer(MAP._maskLayer);
    const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
    MAP._maskLayer = L.polygon([world, ...MAP._regionRings], {
        pane: 'coverageMask',
        stroke: false,
        fillColor: '#1c262c',
        fillOpacity: 0.42,
        interactive: false,
    }).addTo(map);
};

MAP.addRegion = (map, data, dashed) => {
    MAP._regionRings.push(...ringsFromGeoJSON(data));
    MAP.redrawMask(map);
    L.geoJSON(data, {
        style: { color: '#37474f', weight: 2, dashArray: dashed, fill: false },
        interactive: false,
    }).addTo(map);
};

MAP.drawCityLimits = async (map) => {
    try {
        map.createPane('coverageMask');
        map.getPane('coverageMask').style.zIndex = 250;
        map.getPane('coverageMask').style.pointerEvents = 'none';
        const data = await (await fetch(MAP.CONFIG.cityLimitsUrl)).json();
        MAP.addRegion(map, data, '8 6');
        MAP.log('City limits drawn');
    } catch (err) {
        MAP.error(err);
    }
};

// Draw a county's bike facilities + un-dim it (display only — the routing
// graph is loaded separately via ROUTE.loadCounty).
MAP.drawCountyDisplay = async (map, key) => {
    const cfg = MAP.CONFIG.counties[key];
    const [boundary, lanes] = await Promise.all([
        fetch(cfg.boundaryUrl).then((r) => r.json()),
        fetch(cfg.lanesUrl).then((r) => r.json()),
    ]);
    const layer = L.geoJSON(lanes, {
        renderer: L.canvas(),
        style: (f) => ({
            color: f.properties.COLOR,
            weight: 2,
            opacity: 0.85,
            dashArray: f.properties.DASH || null,
        }),
    }).addTo(map);
    MAP.countyLaneLayers.push(layer);
    MAP.addRegion(map, boundary, '6 6');
    return boundary;
};

// Clickable affordance for a county that hasn't been added yet.
MAP.addCounties = async (map) => {
    // Temporarily disabled — keep the focus on Philadelphia. (Re-enable via
    // ROUTE.COUNTIES_ENABLED; all county build artifacts are preserved.)
    if (typeof ROUTE === 'undefined' || !ROUTE.COUNTIES_ENABLED) return;
    const loaded = new Set((ROUTE.loadedCounties) ? ROUTE.loadedCounties() : []);
    for (const [key, cfg] of Object.entries(MAP.CONFIG.counties)) {
        if (loaded.has(key)) {
            MAP.drawCountyDisplay(map, key).catch(MAP.error);
            continue;
        }
        try {
            const boundary = await (await fetch(cfg.boundaryUrl)).json();
            MAP.addCountyAffordance(map, key, cfg, boundary);
        } catch (err) {
            MAP.error(err);
        }
    }
};

MAP.COUNTY_REST = { color: '#78909c', weight: 1.5, dashArray: '5 5',
                    fillColor: '#78909c', fillOpacity: 0.06 };
MAP.COUNTY_HOVER = { color: '#b0bec5', weight: 2, dashArray: null,
                     fillColor: '#90a4ae', fillOpacity: 0.22 };

MAP.addCountyAffordance = (map, key, cfg, boundary) => {
    const group = L.layerGroup().addTo(map);
    const region = L.geoJSON(boundary, { style: MAP.COUNTY_REST }).addTo(group);
    region.eachLayer((l) => l.getElement && l.getElement()?.classList.add('map-county-add'));

    const center = region.getBounds().getCenter();
    const chip = L.marker(center, {
        icon: L.divIcon({
            className: '',
            html: `<button type="button" class="map-county-chip">+ Add ${cfg.label}</button>`,
            iconSize: [null, null],
        }),
    }).addTo(group);

    // Hover anywhere on the county (region or its chip) highlights it.
    let hovering = false;
    const setHover = (on) => {
        hovering = on;
        region.setStyle(on ? MAP.COUNTY_HOVER : MAP.COUNTY_REST);
        const btn = chip.getElement()?.querySelector('.map-county-chip');
        if (btn && !btn.disabled) btn.classList.toggle('is-hover', on);
    };
    region.on('mouseover', () => setHover(true));
    region.on('mouseout', () => setHover(false));
    chip.on('mouseover', () => setHover(true));
    chip.on('mouseout', () => setHover(false));

    const activate = async (ev) => {
        if (ev) L.DomEvent.stop(ev);
        const btn = chip.getElement()?.querySelector('.map-county-chip');
        if (btn) { btn.textContent = `Loading ${cfg.label}…`; btn.disabled = true; }
        try {
            await Promise.all([
                MAP.drawCountyDisplay(map, key),
                (typeof ROUTE !== 'undefined' && ROUTE.loadCounty)
                    ? ROUTE.loadCounty(key) : Promise.resolve(),
            ]);
            map.removeLayer(group);
            MAP.log('County added', { key });
        } catch (err) {
            MAP.error(err);
            if (btn) { btn.textContent = `+ Add ${cfg.label}`; btn.disabled = false; }
        }
    };
    region.on('click', activate);
    chip.on('click', activate);
};

MAP.addMetaBanner = async (map) => {
    try {
        const res = await fetch(MAP.CONFIG.metaUrl);
        const meta = await res.json();

        // Dismissing the banner accepts the disclaimer for this data
        // version; a newer build shows it again.
        const dismissKey = 'romv-meta-dismissed';
        try {
            if (localStorage.getItem(dismissKey) === meta.updated) return;
        } catch (_) { /* storage unavailable; always show */ }

        const [y, m, d] = meta.updated.split('-').map(Number);
        const date = new Date(y, m - 1, d).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });

        const div = L.DomUtil.create('div', 'map-meta', map.getContainer());
        div.innerHTML = `
            <button type="button" class="map-meta-close" aria-label="Dismiss notice" title="Dismiss">×</button>
            <div class="map-meta-updated">Routes last updated ${date}</div>
            <div class="map-meta-disclaimer">
                A personal project for planning and discovering rides — not for
                turn-by-turn navigation. Defer to official sources and posted
                signage when riding.
            </div>
        `;

        L.DomEvent.disableClickPropagation(div);

        // Stop explicitly: removing the banner detaches the click target
        // mid-dispatch, which defeats Leaflet's control-click detection
        // and would let the click land on the map as a pin placement.
        div.querySelector('.map-meta-close').addEventListener('click', (e) => {
            L.DomEvent.stopPropagation(e);
            div.remove();
            try {
                localStorage.setItem(dismissKey, meta.updated);
            } catch (_) { /* best effort */ }
            MAP.log('Meta banner dismissed', meta);
        });

        MAP.log('Meta banner added', meta);
    } catch (err) {
        MAP.error(err);
    }
};

MAP.addLegend = (map) => {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'map-legend is-collapsed');
        const legendRow = (type, color, dashed) => `
            <div class="map-legend-row">
                <span class="map-legend-swatch" style="background:${dashed
                    ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 6px)`
                    : color}"></span>
                <span>${type}</span>
            </div>
        `;
        const rows = Object.entries(MAP.CONFIG.trailColors)
            .map(([type, color]) => legendRow(type, color, true))
            .concat(Object.entries(MAP.CONFIG.bikeLaneColors)
                .map(([type, color]) => legendRow(type, color, false)))
            .join('');
        const indegoRow = `
            <div class="map-legend-row">
                <span class="map-legend-swatch map-legend-swatch-pin">
                    <svg width="12" height="15" viewBox="-2 -2 32 40" aria-hidden="true">
                        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.8 14 22 14 22s14-12.2 14-22C28 6.27 21.73 0 14 0Z"
                            fill="#1d3a63" stroke="#b9d7f1" stroke-width="3"/>
                    </svg>
                </span>
                <span>Indego station</span>
            </div>
        `;
        const septaRow = (line, color, label) => `
            <div class="map-legend-row">
                <span class="map-legend-swatch map-legend-swatch-bullet"
                    style="background:${color}">${line}</span>
                <span>${label}</span>
            </div>
        `;
        const septaRows = septaRow('L', MAP.CONFIG.septaColors.L, 'Market-Frankford Line')
            + septaRow('B', MAP.CONFIG.septaColors.B, 'Broad Street Line');
        const hinRow = `
            <div class="map-legend-row">
                <span class="map-legend-swatch" style="background:${MAP.CONFIG.hinColor};opacity:0.55;height:6px"></span>
                <span>Higher-crash corridor</span>
            </div>
        `;
        div.innerHTML = `
            <button type="button" class="map-legend-toggle" aria-expanded="false">
                <span>Bike Lanes</span>
                <span class="map-legend-chevron" aria-hidden="true">▾</span>
            </button>
            <div class="map-legend-body">${rows}${indegoRow}${septaRows}${hinRow}</div>
        `;

        const toggle = div.querySelector('.map-legend-toggle');
        toggle.addEventListener('click', () => {
            const collapsed = div.classList.toggle('is-collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
        });

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        return div;
    };

    legend.addTo(map);
};

MAP.openSettings = (map) => {
    const existing = document.querySelector('.map-settings-overlay');
    if (existing) {
        existing.remove();
        return;
    }
    const settings = MAP.loadSettings();
    const overlay = L.DomUtil.create('div', 'map-route-help-overlay map-settings-overlay', map.getContainer());
    const basemapButtons = Object.entries(MAP.CONFIG.basemaps).map(([key, bm]) => `
        <button type="button" data-basemap="${key}"
            class="${settings.basemap === key ? 'is-active' : ''}">${bm.label}</button>
    `).join('');
    overlay.innerHTML = `
        <div class="map-route-help-card map-settings-card">
            <div class="map-route-help-head">
                <h3>Settings</h3>
                <button type="button" class="map-route-help-close" aria-label="Close settings">×</button>
            </div>
            <div class="map-settings-group">
                <div class="map-settings-label">Map style</div>
                <div class="map-settings-options">${basemapButtons}</div>
            </div>
            <div class="map-settings-group">
                <label class="map-settings-check">
                    <input type="checkbox" class="map-settings-blur"
                        ${settings.reduceTransparency ? 'checked' : ''}>
                    <span>Reduce transparency
                        <small>Solid panels instead of frosted glass — smoother on
                        older devices.</small>
                    </span>
                </label>
                <label class="map-settings-check">
                    <input type="checkbox" class="map-settings-throttle"
                        ${settings.throttleTiles ? 'checked' : ''}>
                    <span>Throttle map tiles
                        <small>Load tiles only after panning stops and skip
                        mid-zoom refreshes — fewer redraws on older devices.</small>
                    </span>
                </label>
            </div>
            <button type="button" class="map-settings-share">Share with friends</button>
        </div>
    `;
    L.DomEvent.disableClickPropagation(overlay);
    L.DomEvent.disableScrollPropagation(overlay);

    // Stop before removing: a detached click target defeats Leaflet's
    // control-click detection and the click would land on the map.
    const close = (e) => {
        L.DomEvent.stopPropagation(e);
        overlay.remove();
    };
    overlay.querySelector('.map-route-help-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(e);
    });

    for (const btn of overlay.querySelectorAll('button[data-basemap]')) {
        btn.addEventListener('click', () => {
            const next = MAP.loadSettings();
            next.basemap = btn.dataset.basemap;
            MAP.saveSettings(next);
            MAP.applyBasemap(map, next.basemap);
            for (const b of overlay.querySelectorAll('button[data-basemap]')) {
                b.classList.toggle('is-active', b === btn);
            }
        });
    }

    overlay.querySelector('.map-settings-blur').addEventListener('change', (e) => {
        const next = MAP.loadSettings();
        next.reduceTransparency = e.target.checked;
        MAP.saveSettings(next);
        MAP.applyTransparency(next.reduceTransparency);
    });

    overlay.querySelector('.map-settings-throttle').addEventListener('change', (e) => {
        const next = MAP.loadSettings();
        next.throttleTiles = e.target.checked;
        MAP.saveSettings(next);
        // Rebuild the tile layer so the new update options take effect; the
        // current basemap and view are preserved.
        MAP.applyBasemap(map, next.basemap);
    });

    const shareBtn = overlay.querySelector('.map-settings-share');
    shareBtn.addEventListener('click', async () => {
        const url = location.origin + location.pathname;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: document.title,
                    text: 'Plan safer bike routes in Philadelphia',
                    url,
                });
                MAP.log('Site shared');
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                MAP.error(err);
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            shareBtn.textContent = 'Link copied ✓';
            setTimeout(() => { shareBtn.textContent = 'Share with friends'; }, 1500);
            MAP.log('Site link copied', { url });
        } catch (err) {
            MAP.error(err);
        }
    });
};

MAP.addLocateControl = (map) => {
    const control = L.control({ position: 'topright' });

    control.onAdd = () => {
        const div = L.DomUtil.create('div', 'leaflet-bar map-locate');
        div.innerHTML = `
            <button type="button" class="map-locate-btn map-compass-btn" aria-label="Reset map to north" title="Reset north" hidden>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <g class="map-compass-needle">
                        <path d="M12 4 9.5 12.5h5z" fill="#e53935"/>
                        <path d="M12 20 9.5 11.5h5z" fill="#9fb1ba"/>
                    </g>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-locate-me" aria-pressed="false" aria-label="Track my location" title="Track my location">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
                    <circle cx="12" cy="12" r="7"/>
                    <line x1="12" y1="2" x2="12" y2="5"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                    <line x1="2" y1="12" x2="5" y2="12"/>
                    <line x1="19" y1="12" x2="22" y2="12"/>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-nav-toggle is-off" aria-pressed="false" aria-label="Navigation mode (follow and rotate to heading)" title="Navigation mode (center & rotate to heading)">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
                    <path d="M12 2 5 21l7-4 7 4z"/>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-toggle-lanes" aria-pressed="true" aria-label="Toggle bike lanes" title="Toggle bike lanes">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M8 20 12 4" stroke-dasharray="3.5 3"/>
                    <path d="M3 20 7 4"/>
                    <path d="M13 20 17 4"/>
                    <path d="M18 20 22 4" stroke-dasharray="3.5 3"/>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-toggle-indego" aria-pressed="true" aria-label="Toggle Indego stations" title="Toggle Indego stations">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2C8.1 2 5 5.1 5 9c0 5 7 13 7 13s7-8 7-13c0-3.9-3.1-7-7-7Z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-toggle-septa" aria-pressed="true" aria-label="Toggle SEPTA subway stations" title="Toggle SEPTA subway stations">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="3" width="12" height="15" rx="3"/>
                    <path d="M6 11h12"/>
                    <path d="M9 18 7 21"/>
                    <path d="M15 18l2 3"/>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-toggle-hin is-off" aria-pressed="false" aria-label="Toggle High Injury Network" title="High Injury Network (crash corridors)">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </button>
            <button type="button" class="map-locate-btn map-open-settings" aria-label="Settings" title="Settings">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            </button>
        `;

        const lanesBtn = div.querySelector('.map-toggle-lanes');
        lanesBtn.addEventListener('click', () => {
            if (!MAP.streetsLayer) return;
            const visible = map.hasLayer(MAP.streetsLayer);
            for (const layer of [MAP.streetsLayer, MAP.trailsLayer, ...MAP.countyLaneLayers]) {
                if (!layer) continue;
                if (visible) map.removeLayer(layer);
                else layer.addTo(map);
            }
            lanesBtn.classList.toggle('is-off', visible);
            lanesBtn.setAttribute('aria-pressed', String(!visible));
            MAP.log('Bike lanes and trails toggled', { visible: !visible });
        });

        const indegoBtn = div.querySelector('.map-toggle-indego');
        indegoBtn.addEventListener('click', () => {
            if (typeof ROUTE === 'undefined' || !ROUTE.toggleIndego) return;
            ROUTE.toggleIndego();
        });
        // Visibility can also change programmatically (auto-hide once a
        // route is placed), so the button mirrors the broadcast state.
        map.on('romv:indego', (e) => {
            indegoBtn.classList.toggle('is-off', !e.visible);
            indegoBtn.setAttribute('aria-pressed', String(e.visible));
            MAP.log('Indego visibility', { visible: e.visible });
        });

        const septaBtn = div.querySelector('.map-toggle-septa');
        septaBtn.addEventListener('click', () => {
            if (typeof ROUTE === 'undefined' || !ROUTE.toggleSepta) return;
            ROUTE.toggleSepta();
        });
        map.on('romv:septa', (e) => {
            septaBtn.classList.toggle('is-off', !e.visible);
            septaBtn.setAttribute('aria-pressed', String(e.visible));
            MAP.log('SEPTA visibility', { visible: e.visible });
        });

        const hinBtn = div.querySelector('.map-toggle-hin');
        hinBtn.addEventListener('click', () => {
            const visible = MAP.toggleHIN(map);
            hinBtn.classList.toggle('is-off', !visible);
            hinBtn.setAttribute('aria-pressed', String(visible));
            MAP.log('HIN visibility', { visible });
        });

        div.querySelector('.map-open-settings').addEventListener('click', () => {
            MAP.openSettings(map);
        });

        const locateBtn = div.querySelector('.map-locate-me');
        const navBtn = div.querySelector('.map-nav-toggle');
        let marker = null;
        let accuracyCircle = null;
        let trackingTimer = null;
        let navMode = false;
        let lastFix = null;

        // The location marker is a screen-aligned div (leaflet-rotate doesn't
        // spin marker icons with the map), so the heading arrow's own rotation
        // must add the map bearing back in: heading + getBearing(). In nav mode
        // bearing == -heading, so that sum is 0 and the arrow points straight up.
        const userIcon = (e) => {
            const bearingDeg = (map.getBearing && map.getBearing()) || 0;
            const rot = Number.isFinite(e.heading) ? e.heading + bearingDeg : null;
            const rotor = rot === null
                ? '<div class="map-user-rotor"><div class="map-user-dot"></div></div>'
                : `<div class="map-user-rotor" style="transform:rotate(${rot}deg)"><span class="map-user-arrow"></span><div class="map-user-dot"></div></div>`;
            return L.divIcon({ className: 'map-user-marker', html: rotor, iconSize: [40, 40], iconAnchor: [20, 20] });
        };

        const updateLocationMarker = (e) => {
            if (!accuracyCircle) {
                accuracyCircle = L.circle(e.latlng, {
                    radius: e.accuracy, color: '#1e88e5', fillColor: '#1e88e5',
                    fillOpacity: 0.12, weight: 1, interactive: false,
                }).addTo(map);
            } else {
                accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
            }
            if (!marker) {
                marker = L.marker(e.latlng, {
                    icon: userIcon(e), interactive: false, keyboard: false, zIndexOffset: 1000,
                }).addTo(map);
            } else {
                marker.setLatLng(e.latlng).setIcon(userIcon(e));
            }
        };

        const clearLocationMarker = () => {
            if (marker) { map.removeLayer(marker); marker = null; }
            if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
        };

        // exitNav is a hoisted declaration so stopTracking (below) can call it.
        function exitNav() {
            if (!navMode) return;
            navMode = false;
            navBtn.classList.add('is-off');
            navBtn.classList.remove('is-active');
            navBtn.setAttribute('aria-pressed', 'false');
            if (map.setBearing) map.setBearing(0);
            if (lastFix) updateLocationMarker(lastFix);
            MAP.log('Navigation mode off');
        }

        const applyNav = (e) => {
            map.setView(e.latlng, map.getZoom(), { animate: false });
            if (map.setBearing && Number.isFinite(e.heading)) map.setBearing(-e.heading);
            updateLocationMarker(e);
        };

        const ping = (setView) => map.locate({ setView, maxZoom: 16, enableHighAccuracy: true, timeout: 9000 });

        const startTracking = () => {
            if (trackingTimer) return;
            locateBtn.classList.add('is-loading', 'is-active');
            locateBtn.setAttribute('aria-pressed', 'true');
            ping(true);                                       // first fix recenters
            trackingTimer = setInterval(() => ping(false), 750);   // then poll every 3s
            MAP.log('Location tracking on (3s poll)');
        };

        const stopTracking = () => {
            if (trackingTimer) { clearInterval(trackingTimer); trackingTimer = null; }
            if (map.stopLocate) map.stopLocate();
            locateBtn.classList.remove('is-loading', 'is-active');
            locateBtn.setAttribute('aria-pressed', 'false');
            exitNav();
            clearLocationMarker();
            MAP.log('Location tracking off');
        };

        const enterNav = () => {
            navMode = true;
            navBtn.classList.remove('is-off');
            navBtn.classList.add('is-active');
            navBtn.setAttribute('aria-pressed', 'true');
            startTracking();                  // nav mode needs the live position
            if (lastFix) applyNav(lastFix);
            MAP.log('Navigation mode on');
        };

        locateBtn.addEventListener('click', () => {
            if (trackingTimer) stopTracking();
            else startTracking();
        });

        navBtn.addEventListener('click', () => {
            if (navMode) exitNav();
            else enterNav();
        });

        // North-up reset: a compass that surfaces only while the map is
        // rotated, its needle pointing to true north. Tapping it leaves
        // follow-mode (so it won't immediately re-rotate) and snaps to north.
        const compassBtn = div.querySelector('.map-compass-btn');
        const compassNeedle = div.querySelector('.map-compass-needle');
        const syncCompass = () => {
            const bearing = map.getBearing ? map.getBearing() : 0;
            const offNorth = Math.abs(((bearing + 180) % 360) - 180);   // 0 at north
            compassBtn.hidden = offNorth < 0.5;
            compassNeedle.style.transform = `rotate(${bearing}deg)`;
        };
        compassBtn.addEventListener('click', () => {
            exitNav();
            if (map.setBearing) map.setBearing(0);
            syncCompass();
        });
        map.on('rotate', syncCompass);
        syncCompass();

        map.on('locationfound', (e) => {
            locateBtn.classList.remove('is-loading');
            lastFix = e;
            if (navMode) applyNav(e);
            else updateLocationMarker(e);
            MAP.log('Location found', { accuracy: e.accuracy, heading: e.heading });
        });

        map.on('locationerror', (e) => {
            locateBtn.classList.remove('is-loading');
            MAP.error(e);
        });

        L.DomEvent.disableClickPropagation(div);
        return div;
    };

    control.addTo(map);
};

MAP.init = () => {
    const map = MAP.create("map", { center: [39.9526, -75.1652], zoom: 12 });
    if (map) {
        MAP.instance = map;
        MAP.drawCityLimits(map);
        MAP.labelStreets(map);
        MAP.labelTrails(map);
        MAP.labelHIN(map);
        MAP.addMetaBanner(map);
        MAP.addLegend(map);
        MAP.addLocateControl(map);
        // Defer one tick so route.js (loaded after map.js) has defined
        // ROUTE.loadedCounties() before we decide add-affordance vs restore.
        setTimeout(() => MAP.addCounties(map), 0);
    }
};

MAP.init();