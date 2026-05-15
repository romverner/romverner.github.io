const MAP = ROMV.createModule('MAP');

MAP.CONFIG = {
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    streetsUrl: 'public/json/streets.geojson',
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

MAP.create = (elementId, { center = [0, 0], zoom = 2 } = {}) => {
    try {
        const map = L.map(elementId).setView(center, zoom);
        
        L.tileLayer(MAP.CONFIG.tileUrl, {
            attribution: MAP.CONFIG.attribution,
        }).addTo(map);

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

        L.geoJSON(data, {
            renderer: L.canvas(),
            style: (feature) => ({
                color: MAP.CONFIG.bikeLaneColors[feature.properties.TYPE] || MAP.CONFIG.bikeLaneFallbackColor,
                weight: 3,
                opacity: 0.85,
            }),
        }).addTo(map);

        MAP.log('Streets labeled', { count: data.features.length });
    } catch (err) {
        MAP.error(err);
    }
};

MAP.addLegend = (map) => {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'map-legend is-collapsed');
        const rows = Object.entries(MAP.CONFIG.bikeLaneColors)
            .map(([type, color]) => `
                <div class="map-legend-row">
                    <span class="map-legend-swatch" style="background:${color}"></span>
                    <span>${type}</span>
                </div>
            `)
            .join('');
        div.innerHTML = `
            <button type="button" class="map-legend-toggle" aria-expanded="false">
                <span>Bike Lanes</span>
                <span class="map-legend-chevron" aria-hidden="true">▾</span>
            </button>
            <div class="map-legend-body">${rows}</div>
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

MAP.addLocateControl = (map) => {
    const control = L.control({ position: 'topleft' });

    control.onAdd = () => {
        const div = L.DomUtil.create('div', 'leaflet-bar map-locate');
        div.innerHTML = `
            <button type="button" class="map-locate-btn" aria-label="Show my location" title="Show my location">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
                    <circle cx="12" cy="12" r="7"/>
                    <line x1="12" y1="2" x2="12" y2="5"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                    <line x1="2" y1="12" x2="5" y2="12"/>
                    <line x1="19" y1="12" x2="22" y2="12"/>
                </svg>
            </button>
        `;

        const btn = div.querySelector('.map-locate-btn');
        let marker = null;
        let accuracyCircle = null;

        btn.addEventListener('click', () => {
            btn.classList.add('is-loading');
            map.locate({ setView: true, maxZoom: 15, timeout: 10000, enableHighAccuracy: true });
        });

        map.on('locationfound', (e) => {
            btn.classList.remove('is-loading');
            if (marker) map.removeLayer(marker);
            if (accuracyCircle) map.removeLayer(accuracyCircle);

            accuracyCircle = L.circle(e.latlng, {
                radius: e.accuracy,
                color: '#1e88e5',
                fillColor: '#1e88e5',
                fillOpacity: 0.12,
                weight: 1,
            }).addTo(map);

            marker = L.circleMarker(e.latlng, {
                radius: 7,
                color: '#fff',
                fillColor: '#1e88e5',
                fillOpacity: 1,
                weight: 2,
            }).addTo(map);

            MAP.log('Location found', { latlng: e.latlng, accuracy: e.accuracy });
        });

        map.on('locationerror', (e) => {
            btn.classList.remove('is-loading');
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
        MAP.labelStreets(map);
        MAP.addLegend(map);
        MAP.addLocateControl(map);
    }
};

MAP.init();