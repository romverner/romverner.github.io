#!/usr/bin/env python3
"""Build a compact bike-routing graph for Philadelphia.

Downloads the city Street Centerline dataset and the PPR_Trails dataset
(ArcGIS FeatureServer), joins bike lane types from
public/json/streets.geojson via SEG_ID, stitches bike-accessible trails
into the street network, and writes:

  public/json/graph.json   - routing graph for client-side A*
  public/json/trails.geojson - trail geometry for map display

Usage: python3 tools/build_graph.py
Stdlib only; no dependencies.
"""

import hashlib
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BIKE_LANES_PATH = REPO / 'public' / 'json' / 'streets.geojson'
OUT_PATH = REPO / 'public' / 'json' / 'graph.json'
TRAILS_OUT_PATH = REPO / 'public' / 'json' / 'trails.geojson'
CITY_LIMITS_OUT_PATH = REPO / 'public' / 'json' / 'city_limits.geojson'
META_OUT_PATH = REPO / 'public' / 'json' / 'meta.json'
LANES_OUT_PATH = REPO / 'public' / 'json' / 'lanes.geojson'

ARCGIS_BASE = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services'
CENTERLINE_URL = f'{ARCGIS_BASE}/Street_Centerline/FeatureServer/0/query'
TRAILS_URL = f'{ARCGIS_BASE}/PPR_Trails/FeatureServer/0/query'
CITY_LIMITS_URL = f'{ARCGIS_BASE}/City_Limits/FeatureServer/0/query'
PAGE_SIZE = 2000

# Street classes considered bikeable. Excluded: 1 expressway, 9/10 ramps,
# 14 city boundary/driveways, 15 walkways, 18 misc private.
BIKEABLE_CLASSES = {2, 3, 4, 5, 6, 12, 13}

# Lane types where bikes may travel both ways regardless of car one-way.
BIDIRECTIONAL_LANE_TYPES = {'Contraflow', 'Two Way Separated Bike Lane'}

# Safety rank for picking the best lane type when a SEG_ID appears more
# than once in the bike lane data (lower = safer).
TYPE_SAFETY_RANK = [
    'Two Way Separated Bike Lane',
    'One Way Separated Bike Lane',
    'Separated Bike Lane',
    'Paint Buffered',
    'Paint Buffered w Conventional',
    'Conventional',
    'Conventional & Dashed Bike Lane',
    'Dashed Bike Lane',
    'Contraflow',
    'Bus Bike Lane',
    'Conventional w Sharrows',
    'Sharrow',
]
TYPE_PAVED_TRAIL = len(TYPE_SAFETY_RANK)        # 12
TYPE_UNPAVED_TRAIL = len(TYPE_SAFETY_RANK) + 1  # 13
ALL_TYPES = TYPE_SAFETY_RANK + ['Paved Trail', 'Unpaved Trail']

# Centerline fragments named "... TRL" are trails that happen to live in
# the street file; these name fragments mark the unpaved (park) ones.
SOFT_TRAIL_NAME_HINTS = ('ORANGE', 'YELLOW', 'WHITE', 'LAVENDER')

COORD_SCALE = 1e5  # ~1 m precision
SNAP_TOL_M = 30         # trail endpoint -> street node or street polyline
TRAIL_MERGE_TOL_M = 20  # trail endpoint -> trail endpoint / trail polyline
VERTEX_REUSE_TOL_M = 3  # projected point close enough to reuse a vertex
GRID_CELL_DEG = 0.0005  # spatial hash cell (~45 m)

# Local meters-per-degree at Philadelphia's latitude, for fast projection.
M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON = 85_390.0


def fetch_paged(url, params):
    # BUILD_GRAPH_CACHE=1 caches raw responses in /tmp for fast iteration.
    cache = None
    if os.environ.get('BUILD_GRAPH_CACHE'):
        digest = hashlib.md5((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
        cache = Path(f'/tmp/build_graph_cache_{digest}.json')
        if cache.exists():
            print(f'  (using cached download {cache.name})', file=sys.stderr)
            return json.loads(cache.read_text())

    features = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            **params,
            'outSR': 4326,
            'resultOffset': offset,
            'resultRecordCount': PAGE_SIZE,
            'f': 'geojson',
        })
        with urllib.request.urlopen(f'{url}?{query}', timeout=120) as res:
            page = json.load(res)
        batch = page.get('features', [])
        features.extend(batch)
        print(f'  fetched {len(features)} features...', file=sys.stderr)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    if cache:
        cache.write_text(json.dumps(features))
    return features


def load_bike_types():
    data = json.loads(BIKE_LANES_PATH.read_text())
    rank = {t: i for i, t in enumerate(TYPE_SAFETY_RANK)}
    best = {}
    for f in data['features']:
        seg = f['properties'].get('SEG_ID')
        lane = f['properties'].get('TYPE')
        if seg is None or lane not in rank:
            continue
        if seg not in best or rank[lane] < rank[best[seg]]:
            best[seg] = lane
    return best


def haversine_m(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def polyline_length_m(coords):
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def q(v):
    return round(v * COORD_SCALE)


def explode_lines(geom):
    if geom is None:
        return []
    if geom['type'] == 'LineString':
        return [geom['coordinates']]
    if geom['type'] == 'MultiLineString':
        return list(geom['coordinates'])
    return []


class Grid:
    """Spatial hash from coordinate to payloads, for radius queries."""

    def __init__(self):
        self.cells = defaultdict(list)

    @staticmethod
    def key(coord):
        return (int(coord[0] / GRID_CELL_DEG), int(coord[1] / GRID_CELL_DEG))

    def add(self, coord, payload):
        self.cells[self.key(coord)].append((coord, payload))

    def nearest(self, coord, max_m):
        cx, cy = self.key(coord)
        best, best_d = None, max_m
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other, payload in self.cells.get((cx + dx, cy + dy), []):
                    d = haversine_m(coord, other)
                    if d <= best_d:
                        best, best_d = payload, d
        return best, best_d


def collect_street_records(raw, bike_types):
    records = []
    skipped = Counter()
    joined = 0
    relabeled_trails = 0

    for f in raw:
        props = f['properties']
        geom = f.get('geometry')
        if not geom or geom['type'] != 'LineString' or len(geom['coordinates']) < 2:
            skipped['bad geometry'] += 1
            continue
        if props.get('class') not in BIKEABLE_CLASSES:
            skipped['class excluded'] += 1
            continue

        coords = geom['coordinates']
        lane = bike_types.get(props.get('seg_id'))
        if lane is not None:
            joined += 1
        type_code = TYPE_SAFETY_RANK.index(lane) if lane else -1

        # Trail fragments living in the street file: give them trail types
        # so they rate as trails rather than unlaned streets.
        name = (props.get('stname') or '').strip()
        if type_code == -1 and (name.endswith(' TRL') or ' TRL ' in f'{name} '):
            soft = any(hint in name for hint in SOFT_TRAIL_NAME_HINTS)
            type_code = TYPE_UNPAVED_TRAIL if soft else TYPE_PAVED_TRAIL
            relabeled_trails += 1

        oneway = (props.get('oneway') or 'B').strip()
        if lane in BIDIRECTIONAL_LANE_TYPES or type_code >= TYPE_PAVED_TRAIL:
            direction = 0
        elif oneway == 'FT':
            direction = 1
        elif oneway == 'TF':
            direction = 2
        else:
            direction = 0

        records.append({
            'coords': coords,
            'type': type_code,
            'cls': props['class'],
            'dir': direction,
            'akey': ('n', props['fnode_']) if props.get('fnode_') else ('c', q(coords[0][0]), q(coords[0][1])),
            'bkey': ('n', props['tnode_']) if props.get('tnode_') else ('c', q(coords[-1][0]), q(coords[-1][1])),
        })

    print(f'  kept {len(records)} street records, skipped {dict(skipped)}', file=sys.stderr)
    print(f'  bike lane join: {joined} segments matched', file=sys.stderr)
    print(f'  centerline trail fragments relabeled: {relabeled_trails}', file=sys.stderr)
    return records


def collect_trail_records(raw):
    records = []
    display_features = []
    for f in raw:
        props = f['properties']
        surface = (props.get('trail_surface') or '').strip().upper()
        type_code = TYPE_UNPAVED_TRAIL if surface == 'SOFT' else TYPE_PAVED_TRAIL
        for coords in explode_lines(f.get('geometry')):
            if len(coords) < 2:
                continue
            coords = [[c[0], c[1]] for c in coords]  # drop any Z values
            records.append({'coords': coords, 'type': type_code, 'cls': 0, 'dir': 0})
            display_features.append({
                'type': 'Feature',
                'properties': {
                    'NAME': (props.get('trail_name') or '').strip(),
                    'SURFACE': 'Unpaved' if surface == 'SOFT' else 'Paved',
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [[round(c[0], 5), round(c[1], 5)] for c in coords],
                },
            })
    return records, display_features


def project_to_segment(p, a, b):
    """Project p onto segment a-b. Returns (distance_m, t, point)."""
    ax = (a[0] - p[0]) * M_PER_DEG_LON
    ay = (a[1] - p[1]) * M_PER_DEG_LAT
    bx = (b[0] - p[0]) * M_PER_DEG_LON
    by = (b[1] - p[1]) * M_PER_DEG_LAT
    dx, dy = bx - ax, by - ay
    norm2 = dx * dx + dy * dy
    t = 0.0 if norm2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / norm2))
    d = math.hypot(ax + t * dx, ay + t * dy)
    point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    return d, t, point


def build_segment_grid(records):
    """Index every polyline segment, sampled along its length so a radius
    query around any point near the segment finds it."""
    grid = Grid()
    step = GRID_CELL_DEG * M_PER_DEG_LON * 0.8
    for i, r in enumerate(records):
        coords = r['coords']
        for s in range(len(coords) - 1):
            n = max(1, int(haversine_m(coords[s], coords[s + 1]) // step))
            for k in range(n + 1):
                t = k / n
                pt = [coords[s][0] + t * (coords[s + 1][0] - coords[s][0]),
                      coords[s][1] + t * (coords[s + 1][1] - coords[s][1])]
                grid.add(pt, (i, s))
    return grid


def stitch_trails(street_records, trail_records):
    """Snap trail endpoints onto the street network.

    Per endpoint, in order of preference: an existing street node within
    SNAP_TOL_M; a projection onto a street polyline within SNAP_TOL_M or
    another trail's polyline within TRAIL_MERGE_TOL_M (the target edge is
    split at the projected point); a previously-placed trail endpoint
    within TRAIL_MERGE_TOL_M; otherwise it becomes a new isolated node.
    Endpoint-only snapping avoids falsely connecting grade-separated
    crossings (e.g. a trail bridge passing over a street).
    """
    records = street_records + trail_records
    n_street = len(street_records)

    node_grid = Grid()
    seen_keys = set()
    for r in street_records:
        for end, key_name in ((0, 'akey'), (-1, 'bkey')):
            key = r[key_name]
            if key not in seen_keys:
                seen_keys.add(key)
                node_grid.add(r['coords'][end], key)

    seg_grid = build_segment_grid(records)
    decided_grid = Grid()          # trail endpoint coord -> final key
    endpoint_keys = {}             # quantized endpoint coord -> final key
    insertions = defaultdict(list)  # record idx -> [(seg_idx, t, point)]
    vertex_splits = defaultdict(set)  # record idx -> interior vertex idx
    stats = Counter()

    def project_candidates(coord, self_idx):
        cx, cy = Grid.key(coord)
        cands = set()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for _, payload in seg_grid.cells.get((cx + dx, cy + dy), []):
                    cands.add(payload)
        best = None
        for ri, si in cands:
            if ri == self_idx:
                continue
            rc = records[ri]['coords']
            d, t, pt = project_to_segment(coord, rc[si], rc[si + 1])
            tol = SNAP_TOL_M if ri < n_street else TRAIL_MERGE_TOL_M
            if d <= tol and (best is None or d < best[0]):
                best = (d, ri, si, t, pt)
        return best

    def attach_to_record(ri, si, t, pt):
        """Connect at a projected point on records[ri], reusing a nearby
        vertex when possible. Returns the node key."""
        rc = records[ri]['coords']
        for vi in (si, si + 1):
            if haversine_m(pt, rc[vi]) <= VERTEX_REUSE_TOL_M:
                if vi == 0:
                    return records[ri].get('akey') or ('c', q(rc[0][0]), q(rc[0][1]))
                if vi == len(rc) - 1:
                    return records[ri].get('bkey') or ('c', q(rc[-1][0]), q(rc[-1][1]))
                vertex_splits[ri].add(vi)
                return ('c', q(rc[vi][0]), q(rc[vi][1]))
        insertions[ri].append((si, t, pt))
        return ('c', q(pt[0]), q(pt[1]))

    placed_endpoints = []  # (key, coord, type) of every decided trail endpoint

    for t_i, r in enumerate(trail_records):
        rec_idx = n_street + t_i
        keys = []
        for end in (0, -1):
            coord = r['coords'][end]
            ckey = ('c', q(coord[0]), q(coord[1]))
            if ckey in endpoint_keys:
                keys.append(endpoint_keys[ckey])
                continue

            key, _ = node_grid.nearest(coord, SNAP_TOL_M)
            if key is not None:
                stats['snapped to street node'] += 1
            else:
                hit = project_candidates(coord, rec_idx)
                if hit is not None:
                    _, ri, si, t, pt = hit
                    key = attach_to_record(ri, si, t, pt)
                    stats['split street edge' if ri < n_street else 'split trail edge'] += 1
                    # If we landed on a trail's own endpoint coordinate,
                    # make sure that endpoint adopts the same key later.
                    if ri >= n_street and key[0] == 'c':
                        endpoint_keys.setdefault(key, key)
                else:
                    key, _ = decided_grid.nearest(coord, TRAIL_MERGE_TOL_M)
                    if key is not None:
                        stats['merged with trail endpoint'] += 1
                    else:
                        key = ckey
                        stats['new trail node'] += 1
            decided_grid.add(coord, key)
            endpoint_keys[ckey] = key
            placed_endpoints.append((key, coord, r['type']))
            keys.append(key)
        r['akey'], r['bkey'] = keys

    # Trail endpoints that anchored to different nodes but sit within the
    # merge tolerance of each other (e.g. two trails meeting across a road
    # in a ramp tangle) get an explicit connector edge, so anchoring to
    # disjoint street objects can't sever the trail network.
    connector_grid = Grid()
    connectors = []
    linked = set()
    for key, coord, ttype in placed_endpoints:
        connector_grid.add(coord, (key, coord, ttype))
    for key, coord, ttype in placed_endpoints:
        cx, cy = Grid.key(coord)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for _, (okey, ocoord, otype) in connector_grid.cells.get((cx + dx, cy + dy), []):
                    if okey == key:
                        continue
                    pair = tuple(sorted((key, okey), key=repr))
                    if pair in linked:
                        continue
                    if haversine_m(coord, ocoord) > TRAIL_MERGE_TOL_M:
                        continue
                    linked.add(pair)
                    paved = TYPE_PAVED_TRAIL in (ttype, otype)
                    connectors.append({
                        'coords': [coord, ocoord],
                        'type': TYPE_PAVED_TRAIL if paved else TYPE_UNPAVED_TRAIL,
                        'cls': 0,
                        'dir': 0,
                        'akey': key,
                        'bkey': okey,
                    })
    stats['connector edges added'] = len(connectors)

    # Apply insertions and vertex splits, cutting records into pieces.
    out = []
    for i, r in enumerate(records):
        ins = sorted(insertions.get(i, []), key=lambda x: (x[0], x[1]))
        vsplits = vertex_splits.get(i, set())
        if not ins and not vsplits:
            out.append(r)
            continue

        coords = r['coords']
        new_coords = []
        cut_at = set()
        ins_i = 0
        for s in range(len(coords) - 1):
            new_coords.append(coords[s])
            if s in vsplits and s != 0:
                cut_at.add(len(new_coords) - 1)
            while ins_i < len(ins) and ins[ins_i][0] == s:
                pt = ins[ins_i][2]
                prev = new_coords[-1]
                if q(pt[0]) != q(prev[0]) or q(pt[1]) != q(prev[1]):
                    new_coords.append(pt)
                cut_at.add(len(new_coords) - 1)
                ins_i += 1
        new_coords.append(coords[-1])

        cuts = sorted(c for c in cut_at if 0 < c < len(new_coords) - 1)
        bounds = [0] + cuts + [len(new_coords) - 1]
        for s in range(len(bounds) - 1):
            lo, hi = bounds[s], bounds[s + 1]
            piece = dict(r)
            piece['coords'] = new_coords[lo:hi + 1]
            pa, pb = piece['coords'][0], piece['coords'][-1]
            piece['akey'] = r['akey'] if lo == 0 else ('c', q(pa[0]), q(pa[1]))
            piece['bkey'] = r['bkey'] if hi == len(new_coords) - 1 else ('c', q(pb[0]), q(pb[1]))
            out.append(piece)
        stats['records split'] += 1

    print(f'  trail stitching: {dict(stats)}', file=sys.stderr)
    return out + connectors


def round_coords(value):
    if isinstance(value, float):
        return round(value, 5)
    if isinstance(value, list):
        return [round_coords(v) for v in value]
    return value


def fetch_city_limits():
    query = urllib.parse.urlencode({
        'where': '1=1', 'outFields': '', 'outSR': 4326, 'f': 'geojson',
    })
    with urllib.request.urlopen(f'{CITY_LIMITS_URL}?{query}', timeout=120) as res:
        data = json.load(res)
    features = [{
        'type': 'Feature',
        'properties': {},
        'geometry': {
            'type': f['geometry']['type'],
            'coordinates': round_coords(f['geometry']['coordinates']),
        },
    } for f in data['features']]
    CITY_LIMITS_OUT_PATH.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': features},
        separators=(',', ':')))
    print(f'Wrote {CITY_LIMITS_OUT_PATH} '
          f'({CITY_LIMITS_OUT_PATH.stat().st_size / 1e3:.0f} KB)', file=sys.stderr)


def write_lanes_display():
    """Display-only copy of the bike lane network: just TYPE and rounded
    coordinates. streets.geojson stays untouched as the build source."""
    data = json.loads(BIKE_LANES_PATH.read_text())
    features = [{
        'type': 'Feature',
        'properties': {'TYPE': f['properties'].get('TYPE')},
        'geometry': {
            'type': f['geometry']['type'],
            'coordinates': round_coords(f['geometry']['coordinates']),
        },
    } for f in data['features']]
    LANES_OUT_PATH.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': features},
        separators=(',', ':')))
    print(f'Wrote {LANES_OUT_PATH} '
          f'({LANES_OUT_PATH.stat().st_size / 1e6:.1f} MB, '
          f'{len(features)} features)', file=sys.stderr)


def build():
    print('Downloading city limits...', file=sys.stderr)
    fetch_city_limits()

    print('Writing display lane network...', file=sys.stderr)
    write_lanes_display()

    print('Loading bike lane types...', file=sys.stderr)
    bike_types = load_bike_types()

    print('Downloading street centerlines...', file=sys.stderr)
    raw_streets = fetch_paged(CENTERLINE_URL, {
        'where': '1=1',
        'outFields': 'seg_id,fnode_,tnode_,oneway,class,stname',
        'orderByFields': 'objectid',
    })

    print('Downloading PPR trails...', file=sys.stderr)
    raw_trails = fetch_paged(TRAILS_URL, {
        'where': "bike_access='Y' AND trail_status='EXISTING'",
        'outFields': 'trail_name,trail_surface',
        'orderByFields': 'objectid',
    })

    street_records = collect_street_records(raw_streets, bike_types)
    trail_records, trail_display = collect_trail_records(raw_trails)
    print(f'  {len(trail_records)} trail records', file=sys.stderr)

    records = stitch_trails(street_records, trail_records)

    node_ids = {}
    node_coords = []
    edges = []
    dropped = Counter()

    def node_index(key, coord):
        idx = node_ids.get(key)
        if idx is None:
            idx = len(node_coords)
            node_ids[key] = idx
            node_coords.append([q(coord[0]), q(coord[1])])
        return idx

    for r in records:
        coords = r['coords']
        a = node_index(r['akey'], coords[0])
        b = node_index(r['bkey'], coords[-1])
        if a == b:
            dropped['self loop'] += 1
            continue
        length = polyline_length_m(coords)
        if length < 1:
            dropped['zero length'] += 1
            continue

        deltas = []
        prev = [q(coords[0][0]), q(coords[0][1])]
        for pt in coords[1:-1]:
            cur = [q(pt[0]), q(pt[1])]
            deltas.extend([cur[0] - prev[0], cur[1] - prev[1]])
            prev = cur

        edges.append([a, b, r['dir'], r['type'], r['cls'], round(length), deltas])

    if dropped:
        print(f'  dropped {dict(dropped)}', file=sys.stderr)

    # Keep only the largest weakly-connected component so snapping never
    # lands on a disconnected island.
    adj = defaultdict(list)
    for e in edges:
        adj[e[0]].append(e[1])
        adj[e[1]].append(e[0])
    seen = {}
    comp = 0
    for start in adj:
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
    comp_sizes = Counter(seen.values())
    main_comp, main_size = comp_sizes.most_common(1)[0]
    print(f'  {comp} components; largest has {main_size}/{len(adj)} nodes',
          file=sys.stderr)
    pruned_trail = sum(1 for e in edges
                       if seen[e[0]] != main_comp and e[3] >= TYPE_PAVED_TRAIL)
    print(f'  pruned edges: {sum(1 for e in edges if seen[e[0]] != main_comp)} '
          f'({pruned_trail} trail)', file=sys.stderr)
    edges = [e for e in edges if seen[e[0]] == main_comp]

    # Remap node indices to the surviving set.
    remap = {}
    new_coords = []
    for e in edges:
        for end in (0, 1):
            old = e[end]
            if old not in remap:
                remap[old] = len(new_coords)
                new_coords.append(node_coords[old])
            e[end] = remap[old]

    graph = {
        'version': 2,
        'coordScale': COORD_SCALE,
        'types': ALL_TYPES,
        'nodes': [v for xy in new_coords for v in xy],
        'edges': edges,
    }
    OUT_PATH.write_text(json.dumps(graph, separators=(',', ':')))
    TRAILS_OUT_PATH.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': trail_display},
        separators=(',', ':')))

    META_OUT_PATH.write_text(json.dumps({
        'updated': date.today().isoformat(),
        'nodes': len(new_coords),
        'edges': len(edges),
    }, separators=(',', ':')))

    trail_edges = sum(1 for e in edges if e[3] >= TYPE_PAVED_TRAIL)
    print(f'Wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e6:.1f} MB, '
          f'{len(new_coords)} nodes, {len(edges)} edges, '
          f'{trail_edges} trail edges)', file=sys.stderr)
    print(f'Wrote {TRAILS_OUT_PATH} '
          f'({TRAILS_OUT_PATH.stat().st_size / 1e6:.1f} MB, '
          f'{len(trail_display)} features)', file=sys.stderr)


if __name__ == '__main__':
    build()
