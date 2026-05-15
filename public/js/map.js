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
        const div = L.DomUtil.create('div', 'map-legend');
        const rows = Object.entries(MAP.CONFIG.bikeLaneColors)
            .map(([type, color]) => `
                <div class="map-legend-row">
                    <span class="map-legend-swatch" style="background:${color}"></span>
                    <span>${type}</span>
                </div>
            `)
            .join('');
        div.innerHTML = `
            <button type="button" class="map-legend-toggle" aria-expanded="true">
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

MAP.init = () => {
    const map = MAP.create("map", { center: [39.9526, -75.1652], zoom: 12 });
    if (map) {
        MAP.labelStreets(map);
        MAP.addLegend(map);
    }
};

MAP.init();