#!/usr/bin/env python3
"""Fetch ground elevation for every routing-graph node.

Reads public/json/graph.json, looks up each node's elevation from the USGS
10 m DEM (via Open-Topo-Data), and writes public/json/elevations.json — an
array of elevations (meters, one decimal) indexed to match graph nodes.
The client uses it for per-edge grade, route climb, and an elevation
profile.

Re-run after rebuilding graph.json (node order must match). The public
Open-Topo-Data instance allows 100 points/request, 1 call/sec, 1000/day;
~26k nodes is ~260 calls, a few minutes.

Usage: python3 tools/build_elevation.py
Stdlib only.
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GRAPH_PATH = REPO / 'public' / 'json' / 'graph.json'
OUT_PATH = REPO / 'public' / 'json' / 'elevations.json'
API = 'https://api.opentopodata.org/v1/ned10m'
BATCH = 100
DELAY_S = 1.1   # respect the 1 req/sec public limit


def fetch_batch(coords):
    locs = '|'.join(f'{lat:.5f},{lng:.5f}' for lat, lng in coords)
    url = f'{API}?locations={urllib.parse.quote(locs)}'
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as res:
                data = json.load(res)
            if data.get('status') == 'OK':
                return [r.get('elevation') for r in data['results']]
        except Exception as err:  # noqa: BLE001
            print(f'  retry ({err})', file=sys.stderr)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError('elevation batch failed after retries')


def build():
    graph = json.loads(GRAPH_PATH.read_text())
    scale = graph['coordScale']
    nodes = graph['nodes']
    count = len(nodes) // 2
    coords = [(nodes[i * 2 + 1] / scale, nodes[i * 2] / scale) for i in range(count)]
    print(f'Looking up elevation for {count} nodes...', file=sys.stderr)

    elev = [None] * count
    for start in range(0, count, BATCH):
        batch = coords[start:start + BATCH]
        results = fetch_batch(batch)
        for j, e in enumerate(results):
            elev[start + j] = round(e, 1) if e is not None else None
        if start % 2000 == 0:
            print(f'  {start + len(batch)}/{count}', file=sys.stderr)
        time.sleep(DELAY_S)

    # Fill any gaps (rare; e.g. a point just off the DEM) with the previous
    # known value so grade math never hits a null.
    last = 0.0
    missing = 0
    for i in range(count):
        if elev[i] is None:
            elev[i] = last
            missing += 1
        else:
            last = elev[i]

    OUT_PATH.write_text(json.dumps({
        'version': 1, 'unit': 'm', 'count': count, 'elev': elev,
    }, separators=(',', ':')))
    lo, hi = min(elev), max(elev)
    print(f'Wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e3:.0f} KB, '
          f'range {lo:.0f}-{hi:.0f} m, {missing} gaps filled)', file=sys.stderr)


if __name__ == '__main__':
    import urllib.parse  # noqa: F401  (used in fetch_batch via urllib.parse)
    build()
