#!/usr/bin/env python3
"""Build Philadelphia's High Injury Network overlay.

The HIN is the small set of street corridors that account for most of the
city's serious-injury and fatal crashes (Philadelphia Vision Zero). It
makes a high-value "avoid these" safety overlay for route planning.

Source: DVRPC hosted feature service (high_injury_network_2025).
Usage: python3 tools/build_hin.py
Stdlib only.
"""

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / 'public' / 'json' / 'hin.geojson'
HIN_URL = ('https://services1.arcgis.com/LWtWv6q6BJyKidj8/arcgis/rest/services/'
           'high_injury_network_2025/FeatureServer/0/query')


def build():
    print('Downloading Philadelphia High Injury Network...', file=sys.stderr)
    query = urllib.parse.urlencode({
        'where': '1=1', 'outFields': 'stname',
        'returnGeometry': 'true', 'outSR': 4326, 'f': 'geojson',
    })
    with urllib.request.urlopen(f'{HIN_URL}?{query}', timeout=120) as res:
        data = json.load(res)

    def round_coords(value):
        if isinstance(value, float):
            return round(value, 5)
        if isinstance(value, list):
            return [round_coords(v) for v in value]
        return value

    features = [{
        'type': 'Feature',
        'properties': {'NAME': (f['properties'].get('stname') or '').strip()},
        'geometry': {
            'type': f['geometry']['type'],
            'coordinates': round_coords(f['geometry']['coordinates']),
        },
    } for f in data['features'] if f.get('geometry')]

    OUT_PATH.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': features},
        separators=(',', ':')))
    print(f'Wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e3:.0f} KB, '
          f'{len(features)} corridors)', file=sys.stderr)


if __name__ == '__main__':
    build()
