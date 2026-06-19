#!/usr/bin/env python3
"""Build SEPTA subway station markers for the map.

Downloads SEPTA's GTFS, extracts the two rapid-transit subway lines —
the Market-Frankford Line ("L") and the Broad Street Line ("BSL") trunk —
dedupes directional platforms into physical stations, and writes
public/json/septa.geojson for display + route anchoring.

The Broad-Ridge Spur (B3) and Norristown High Speed Line (M1) are
excluded: the spur duplicates stations already on the L at 8th/Market and
15th/City Hall, and the NHSL is a suburban line.

Stations are effectively static (no new L/BSL station in decades), so this
runs occasionally, not on every graph build. Usage: python3 tools/build_septa.py
Stdlib only.
"""

import csv
import io
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / 'public' / 'json' / 'septa.geojson'
GTFS_URL = 'https://github.com/septadev/GTFS/releases/latest/download/gtfs_public.zip'

# line key -> (display name, route_long_name substrings to include,
#              substrings to exclude, color). Order sets sort order.
LINES = {
    'L': {
        'name': 'Market-Frankford Line',
        'include': ['market-frankford'],
        'exclude': [],
        'color': '#0097D6',
    },
    'B': {
        'name': 'Broad Street Line',
        'include': ['broad street line'],   # B1 Local + B2 Express; not B3 spur
        'exclude': ['spur'],
        'color': '#F26100',
    },
}


def fetch_bus_gtfs():
    print('Downloading SEPTA GTFS...', file=sys.stderr)
    with urllib.request.urlopen(GTFS_URL, timeout=120) as res:
        outer = zipfile.ZipFile(io.BytesIO(res.read()))
    # The City Transit (bus) sub-feed carries the subway lines.
    bus = zipfile.ZipFile(io.BytesIO(outer.read('google_bus.zip')))

    def table(name):
        with bus.open(name) as f:
            return list(csv.DictReader(io.TextIOWrapper(f, 'utf-8-sig')))

    return table('routes.txt'), table('route_stops.txt'), table('stops.txt')


def normalize_station_name(name):
    # Strip route-specific suffixes like " - B1" / " - B2 & B3".
    return name.split(' - ')[0].strip()


def build():
    routes, route_stops, stops = fetch_bus_gtfs()

    route_line = {}
    for r in routes:
        if r['route_type'] != '1':
            continue
        ln = r['route_long_name'].lower()
        for key, cfg in LINES.items():
            if any(s in ln for s in cfg['include']) \
                    and not any(s in ln for s in cfg['exclude']):
                route_line[r['route_id']] = key

    stop_lines = defaultdict(set)
    for rs in route_stops:
        line = route_line.get(rs['route_id'])
        if line:
            stop_lines[rs['stop_id']].add(line)

    stop_by_id = {s['stop_id']: s for s in stops}

    # Group directional platforms into one station per (line, name).
    groups = {}
    for sid, lines in stop_lines.items():
        s = stop_by_id[sid]
        for line in lines:
            name = normalize_station_name(s['stop_name'])
            key = (line, name.lower())
            g = groups.setdefault(key, {'name': name, 'line': line, 'lat': [], 'lon': []})
            g['lat'].append(float(s['stop_lat']))
            g['lon'].append(float(s['stop_lon']))

    features = []
    for (line, _), g in groups.items():
        features.append({
            'type': 'Feature',
            'properties': {
                'NAME': g['name'],
                'LINE': line,
                'LINE_NAME': LINES[line]['name'],
            },
            'geometry': {
                'type': 'Point',
                'coordinates': [
                    round(sum(g['lon']) / len(g['lon']), 5),
                    round(sum(g['lat']) / len(g['lat']), 5),
                ],
            },
        })

    # Stable order: line, then north-to-south / east-to-west by latitude.
    features.sort(key=lambda f: (f['properties']['LINE'],
                                 -f['geometry']['coordinates'][1]))

    import json
    OUT_PATH.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': features},
        separators=(',', ':')))

    from collections import Counter
    per_line = Counter(f['properties']['LINE'] for f in features)
    print(f'Wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e3:.0f} KB, '
          f'{len(features)} stations: {dict(per_line)})', file=sys.stderr)


if __name__ == '__main__':
    build()
