#!/usr/bin/env python3
"""Build a routable graph for a neighboring county from DVRPC's LTS network.

Philadelphia keeps its own detailed lane-type graph (build_graph.py). A
neighbor like Delaware County is built here from DVRPC's Level of Traffic
Stress network — a directed, region-wide model network with bike-facility,
LTS score, and slope per link. The output graph-<county>.json is designed
to MERGE onto the Philadelphia graph client-side: border nodes that
coincide with a Philadelphia intersection (within a small tolerance) are
recorded so the merge fuses them, connecting the two networks at real
street crossings.

Usage: python3 tools/build_county.py delaware
Stdlib only. Set BUILD_GRAPH_CACHE=1 to cache the LTS download in /tmp.
"""

import hashlib
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PHL_GRAPH_PATH = REPO / 'public' / 'json' / 'graph.json'
LTS_URL = ('https://arcgis.dvrpc.org/portal/rest/services/transportation/'
           'lts_network/FeatureServer/0/query')
PAGE_SIZE = 2000

# LTS county_code == FIPS (state_fips + county_fips); the DVRPC county
# boundary service is keyed by the same fips string.
COUNTIES = {
    'delaware':   {'code': 42045, 'label': 'Delaware County'},
    'montgomery': {'code': 42091, 'label': 'Montgomery County'},
    'bucks':      {'code': 42017, 'label': 'Bucks County'},
    'camden':     {'code': 34007, 'label': 'Camden County'},
    'burlington': {'code': 34005, 'label': 'Burlington County'},
}

# New Jersey counties are separated from Philadelphia by the Delaware
# River; the only connections are bikeable bridges. Each is an explicit
# connector from a Philadelphia approach to the county approach (snapped
# to the nearest graph node on each side).
BRIDGES = {
    'camden': [
        # The Ben Franklin Bridge has the main Philadelphia<->Camden bike
        # path. (Betsy Ross lands on limited-access Rt 90, with no bikeable
        # surface street near it in the LTS network, so it can't connect.)
        {'name': 'Benjamin Franklin Bridge', 'phl': [-75.1438, 39.9533], 'nj': [-75.1180, 39.9482]},
    ],
    'burlington': [
        {'name': 'Tacony-Palmyra Bridge',    'phl': [-75.0420, 40.0218], 'nj': [-75.0285, 40.0070]},
    ],
}
BRIDGE_SNAP_M = 450

COUNTY_BOUNDARY_URL = ('https://arcgis.dvrpc.org/portal/rest/services/'
                       'boundaries/countyboundaries/FeatureServer/0/query')

COORD_SCALE = 1e5
BORDER_TOL_M = 25   # LTS node <-> Philadelphia node fuse distance

# Reuse Philadelphia's type table so colors/penalties match across the line.
# (Indices mirror build_graph.py's ALL_TYPES order.)
TYPE_TWO_WAY_SEP = 0
TYPE_SEPARATED = 2
TYPE_PAINT_BUFFERED = 3
TYPE_CONVENTIONAL = 5
TYPE_SHARROW = 11
TYPE_PAVED_TRAIL = 12
TYPE_NONE = -1

# DVRPC bike_facility -> (type code, is the penalty fixed by facility?)
FACILITY_TYPE = {
    'Protected Bike Lane': TYPE_SEPARATED,
    'Buffered Bike Lane': TYPE_PAINT_BUFFERED,
    'Bike Lane': TYPE_CONVENTIONAL,
    'Multi-use Trail / Off-Road': TYPE_PAVED_TRAIL,
    'Sharrows': TYPE_SHARROW,
    'Signed Bike Route': TYPE_SHARROW,
    'No Facility': TYPE_NONE,
}

# LTS score (1-4) -> a synthetic street class so the client's existing
# classPenalty table prices unlaned/sharrowed neighbor streets like
# comparable Philadelphia streets (class 2 arterial ... 5 local).
LTS_CLASS = {1: 5, 2: 4, 3: 3, 4: 2}


def _query_lts(params, timeout=120):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(LTS_URL, data=data)  # POST (geometry can be large)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def fetch_lts(code, boundary_ring):
    cache = None
    if os.environ.get('BUILD_GRAPH_CACHE'):
        digest = hashlib.md5(f'lts{code}v2'.encode()).hexdigest()
        cache = Path(f'/tmp/build_county_cache_{digest}.json')
        if cache.exists():
            print(f'  (using cached LTS {cache.name})', file=sys.stderr)
            return json.loads(cache.read_text())

    # 1) all links inside the county
    features = []
    offset = 0
    while True:
        page = _query_lts({
            'where': f'county_code={code}',
            'outFields': 'fromnodeno,tonodeno,bike_facility,lts,slope',
            'returnGeometry': 'true', 'outSR': 4326,
            'resultOffset': offset, 'resultRecordCount': PAGE_SIZE,
            'orderByFields': 'objectid', 'f': 'geojson',
        })
        batch = page.get('features', [])
        features.extend(batch)
        print(f'  fetched {len(features)} county links...', file=sys.stderr)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    # 2) links that CROSS the county boundary (the border-spanning streets,
    #    often coded to the neighbor) — these reach real intersections in
    #    Philadelphia and create the cross-border connections.
    geom = json.dumps({'rings': [boundary_ring]})
    page = _query_lts({
        'where': '1=1',
        'geometry': geom, 'geometryType': 'esriGeometryPolygon',
        'inSR': 4326, 'spatialRel': 'esriSpatialRelCrosses',
        'outFields': 'fromnodeno,tonodeno,bike_facility,lts,slope',
        'returnGeometry': 'true', 'outSR': 4326, 'f': 'geojson',
    })
    crossing = page.get('features', [])
    print(f'  fetched {len(crossing)} boundary-crossing links', file=sys.stderr)
    features.extend(crossing)

    if cache:
        cache.write_text(json.dumps(features))
    return features


def _dp_simplify(pts, eps):
    """Douglas-Peucker, iterative (rings can have thousands of points)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        lo, hi = stack.pop()
        a, b = pts[lo], pts[hi]
        dx, dy = b[0] - a[0], b[1] - a[1]
        norm2 = dx * dx + dy * dy
        dmax, idx = 0.0, -1
        for i in range(lo + 1, hi):
            p = pts[i]
            if norm2 == 0:
                d = math.hypot(p[0] - a[0], p[1] - a[1])
            else:
                t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / norm2))
                d = math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
            if d > dmax:
                dmax, idx = d, i
        if dmax > eps and idx != -1:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [p for p, k in zip(pts, keep) if k]


def ensure_boundary(county_key):
    """Fetch + simplify the county boundary into county-<key>.geojson."""
    path = REPO / 'public' / 'json' / f'county-{county_key}.geojson'
    if path.exists():
        return path
    cfg = COUNTIES[county_key]
    print(f'  fetching {cfg["label"]} boundary...', file=sys.stderr)
    query = urllib.parse.urlencode({
        'where': f"fips='{cfg['code']}'", 'outFields': 'co_name',
        'returnGeometry': 'true', 'outSR': 4326, 'f': 'geojson',
    })
    with urllib.request.urlopen(f'{COUNTY_BOUNDARY_URL}?{query}', timeout=120) as res:
        data = json.load(res)
    geom = data['features'][0]['geometry']
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    main = max(polys, key=lambda p: len(p[0]))  # mainland ring, drop islands
    ring = _dp_simplify([[round(x, 5), round(y, 5)] for x, y in main[0]], 0.00025)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [{
        'type': 'Feature',
        'properties': {'NAME': cfg['label'], 'KEY': county_key},
        'geometry': {'type': 'Polygon', 'coordinates': [ring]},
    }]}, separators=(',', ':')))
    print(f'  wrote boundary ({len(ring)} vertices)', file=sys.stderr)
    return path


def haversine_m(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def polyline_length_m(coords):
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def q(v):
    return round(v * COORD_SCALE)


def load_phl_border_index():
    """Spatial grid of Philadelphia graph node coords for border fusion."""
    g = json.loads(PHL_GRAPH_PATH.read_text())
    scale = g['coordScale']
    count = len(g['nodes']) // 2
    cell = 0.003
    grid = defaultdict(list)
    for i in range(count):
        lng = g['nodes'][i * 2] / scale
        lat = g['nodes'][i * 2 + 1] / scale
        grid[(int(lng / cell), int(lat / cell))].append((i, lng, lat))
    return grid, cell


def nearest_phl_node(grid, cell, coord, tol=BORDER_TOL_M):
    cx, cy = int(coord[0] / cell), int(coord[1] / cell)
    best, best_d = None, tol
    span = max(1, int(tol / (cell * 85000)) + 1)
    for dx in range(-span, span + 1):
        for dy in range(-span, span + 1):
            for idx, lng, lat in grid.get((cx + dx, cy + dy), []):
                d = haversine_m(coord, (lng, lat))
                if d <= best_d:
                    best, best_d = (idx, lng, lat), d
    return best  # (idx, lng, lat) or None


# Display color + dash per facility, matching the Philadelphia lane palette.
FACILITY_DISPLAY = {
    'Protected Bike Lane': ('#43a047', None),
    'Buffered Bike Lane': ('#7cb342', None),
    'Bike Lane': ('#1e88e5', None),
    'Multi-use Trail / Off-Road': ('#00897b', '6 4'),
    'Sharrows': ('#fb8c00', None),
    'Signed Bike Route': ('#fb8c00', None),
}


def edge_attrs(props):
    fac = (props.get('bike_facility') or 'No Facility').strip()
    type_code = FACILITY_TYPE.get(fac, TYPE_NONE)
    lts = int(props.get('lts') or 2)
    cls = LTS_CLASS.get(lts, 4)
    return type_code, cls


def build(county_key):
    cfg = COUNTIES[county_key]
    out_path = REPO / 'public' / 'json' / f'graph-{county_key}.json'
    lanes_path = REPO / 'public' / 'json' / f'lanes-{county_key}.geojson'
    boundary_path = REPO / 'public' / 'json' / f'county-{county_key}.geojson'

    ensure_boundary(county_key)
    boundary = json.loads(boundary_path.read_text())
    boundary_ring = boundary['features'][0]['geometry']['coordinates'][0]

    print(f'Loading Philadelphia border index...', file=sys.stderr)
    grid, cell = load_phl_border_index()

    print(f'Downloading {cfg["label"]} LTS network...', file=sys.stderr)
    links = fetch_lts(cfg['code'], boundary_ring)

    # Node coords keyed by LTS node number; edges as directed links.
    node_coord = {}
    raw_edges = []  # (from_no, to_no, type, cls, length, deltas, coords)
    lane_features = []
    seen_links = set()
    skipped = Counter()
    for f in links:
        geom = f.get('geometry')
        props = f.get('properties', {})
        if not geom or geom['type'] != 'LineString' or len(geom['coordinates']) < 2:
            skipped['bad geometry'] += 1
            continue
        coords = [[c[0], c[1]] for c in geom['coordinates']]
        fn = props.get('fromnodeno')
        tn = props.get('tonodeno')
        if fn is None or tn is None or fn == tn:
            skipped['no/loop node'] += 1
            continue
        if (fn, tn) in seen_links:  # dedupe county + crossing fetches
            skipped['duplicate'] += 1
            continue
        seen_links.add((fn, tn))
        node_coord[fn] = coords[0]
        node_coord[tn] = coords[-1]
        length = polyline_length_m(coords)
        if length < 1:
            skipped['zero length'] += 1
            continue
        type_code, cls = edge_attrs(props)
        raw_edges.append((fn, tn, type_code, cls, length, coords))

        # Display feature for segments with a real bike facility (one per
        # physical street: skip the reverse directed link).
        fac = (props.get('bike_facility') or 'No Facility').strip()
        disp = FACILITY_DISPLAY.get(fac)
        if disp and (tn, fn) not in seen_links:
            color, dash = disp
            lane_features.append({
                'type': 'Feature',
                'properties': {'COLOR': color, 'DASH': dash},
                'geometry': {'type': 'LineString',
                             'coordinates': [[round(c[0], 5), round(c[1], 5)] for c in coords]},
            })

    print(f'  {len(node_coord)} nodes, {len(raw_edges)} directed links, '
          f'skipped {dict(skipped)}', file=sys.stderr)

    # Assign local indices to LTS nodes; record which fuse to Philadelphia.
    lts_to_local = {}
    local_coords = []
    border = {}  # local index -> Philadelphia global index
    border_hits = 0
    for lts_no, coord in node_coord.items():
        local = len(local_coords)
        lts_to_local[lts_no] = local
        local_coords.append([q(coord[0]), q(coord[1])])
        phl = nearest_phl_node(grid, cell, coord)
        if phl is not None:
            border[local] = phl[0]
            border_hits += 1
    print(f'  border fusions to Philadelphia: {border_hits}', file=sys.stderr)

    # Explicit bikeable-bridge connectors (New Jersey counties): snap each
    # bridge's Philadelphia and county approach to the nearest graph node.
    bridges = []  # (county_local_node, phl_node, length_m)
    for br in BRIDGES.get(county_key, []):
        phl = nearest_phl_node(grid, cell, br['phl'], BRIDGE_SNAP_M)
        nj_node, nj_d = None, BRIDGE_SNAP_M
        for lts_no, coord in node_coord.items():
            d = haversine_m(br['nj'], coord)
            if d < nj_d:
                nj_node, nj_d = lts_no, d
        if phl is None or nj_node is None:
            print(f'  ! bridge "{br["name"]}" not snapped '
                  f'(phl={phl is not None}, nj={nj_node is not None})', file=sys.stderr)
            continue
        length = haversine_m((phl[1], phl[2]), node_coord[nj_node])
        bridges.append((lts_to_local[nj_node], phl[0], round(length)))
        print(f'  bridge "{br["name"]}" connected ({round(length)}m)', file=sys.stderr)

    edges = []
    for fn, tn, type_code, cls, length, coords in raw_edges:
        a = lts_to_local[fn]
        b = lts_to_local[tn]
        deltas = []
        prev = [q(coords[0][0]), q(coords[0][1])]
        for pt in coords[1:-1]:
            cur = [q(pt[0]), q(pt[1])]
            deltas.extend([cur[0] - prev[0], cur[1] - prev[1]])
            prev = cur
        # dir=1: directed forward only; the reverse LTS link supplies b->a.
        edges.append([a, b, 1, type_code, cls, round(length), deltas])

    # Keep the largest weakly-connected component that contains the border
    # nodes (so the merged graph can actually reach Philadelphia).
    adj = defaultdict(list)
    for e in edges:
        adj[e[0]].append(e[1])
        adj[e[1]].append(e[0])
    seen = {}
    comp = 0
    for start in list(adj):
        if start in seen:
            continue
        stack = [start]
        seen[start] = comp
        while stack:
            n = stack.pop()
            for m in adj[n]:
                if m not in seen:
                    seen[m] = comp
                    stack.append(m)
        comp += 1
    # Keep the largest component plus every component that has a border
    # connection — so no street crossing is lost to pruning.
    comp_size = Counter(seen.values())
    largest = comp_size.most_common(1)[0][0]
    keep_comps = {largest} | {seen[l] for l in border if l in seen}
    keep_comps |= {seen[b[0]] for b in bridges if b[0] in seen}
    edges = [e for e in edges if seen.get(e[0]) in keep_comps]
    kept_border = sum(1 for l in border if seen.get(l) in keep_comps)
    print(f'  {comp} components; kept {len(keep_comps)} '
          f'({kept_border} border crossings reachable)', file=sys.stderr)

    # Remap to surviving nodes.
    remap = {}
    new_coords = []
    new_border = {}
    for e in edges:
        for end in (0, 1):
            old = e[end]
            if old not in remap:
                remap[old] = len(new_coords)
                new_coords.append(local_coords[old])
                if old in border:
                    new_border[len(new_coords) - 1] = border[old]
            e[end] = remap[old]

    out_bridges = [[remap[b[0]], b[1], b[2]] for b in bridges if b[0] in remap]

    graph = {
        'version': 1,
        'county': county_key,
        'label': cfg['label'],
        'coordScale': COORD_SCALE,
        'nodes': [v for xy in new_coords for v in xy],
        'border': [[int(k), int(v)] for k, v in new_border.items()],
        'bridges': out_bridges,
        'edges': edges,
    }
    out_path.write_text(json.dumps(graph, separators=(',', ':')))
    print(f'Wrote {out_path} ({out_path.stat().st_size / 1e6:.1f} MB raw, '
          f'{len(new_coords)} nodes, {len(edges)} edges, '
          f'{len(new_border)} border fusions, {len(out_bridges)} bridges)', file=sys.stderr)

    lanes_path.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': lane_features},
        separators=(',', ':')))
    print(f'Wrote {lanes_path} ({lanes_path.stat().st_size / 1e3:.0f} KB, '
          f'{len(lane_features)} facility segments)', file=sys.stderr)


if __name__ == '__main__':
    key = sys.argv[1] if len(sys.argv) > 1 else 'delaware'
    if key not in COUNTIES:
        sys.exit(f'unknown county: {key} (have: {", ".join(COUNTIES)})')
    build(key)
