#!/usr/bin/env python3
"""Split long routing-graph edges into short pieces.

Trail edges in particular can run for kilometers between intersections
(the Schuylkill River Trail has single 4 km edges). With no intermediate
nodes, a pin dropped mid-trail snaps to a nearby road node instead of the
trail. This splits any edge longer than MAX_EDGE_M at its existing
geometry vertices, adding snappable nodes — and interpolates elevation for
the new nodes so elevations.json stays in sync without re-querying.

Run after build_graph.py + build_elevation.py:
    python3 tools/densify_graph.py
Stdlib only.
"""

import json
import math
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GRAPH_PATH = REPO / 'public' / 'json' / 'graph.json'
ELEV_PATH = REPO / 'public' / 'json' / 'elevations.json'
MAX_EDGE_M = 100


def haversine_m(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def build():
    graph = json.loads(GRAPH_PATH.read_text())
    scale = graph['coordScale']
    nodes = list(graph['nodes'])          # flat [lng*scale, lat*scale, ...]
    edges = graph['edges']

    elev = None
    if ELEV_PATH.exists():
        elev = list(json.loads(ELEV_PATH.read_text())['elev'])

    def node_lnglat(i):
        return (nodes[2 * i] / scale, nodes[2 * i + 1] / scale)

    def add_node(sx, sy, z):
        nodes.append(sx)
        nodes.append(sy)
        if elev is not None:
            elev.append(round(z, 1))
        return len(nodes) // 2 - 1

    new_edges = []
    split_count = 0

    for e in edges:
        a, b, direction, type_code, cls, length, deltas = e
        if length <= MAX_EDGE_M:
            new_edges.append(e)
            continue

        # Reconstruct the scaled-int polyline: a, intermediate deltas, b.
        scaled = [(nodes[2 * a], nodes[2 * a + 1])]
        cx, cy = nodes[2 * a], nodes[2 * a + 1]
        for k in range(0, len(deltas), 2):
            cx += deltas[k]
            cy += deltas[k + 1]
            scaled.append((cx, cy))
        scaled.append((nodes[2 * b], nodes[2 * b + 1]))

        pts = [(sx / scale, sy / scale) for sx, sy in scaled]
        za, zb = (elev[a], elev[b]) if elev is not None else (0, 0)

        # Cumulative distance along the polyline.
        cum = [0.0]
        for i in range(1, len(pts)):
            cum.append(cum[-1] + haversine_m(pts[i - 1], pts[i]))
        total = cum[-1] or 1.0
        n_pieces = max(1, math.ceil(total / MAX_EDGE_M))
        target = total / n_pieces

        # Walk vertices, cutting a new node each time we pass a target mark.
        seg_start = 0          # index into scaled/pts
        node_at = {0: a, len(pts) - 1: b}
        next_cut = target
        for i in range(1, len(pts) - 1):
            if cum[i] >= next_cut:
                z = za + (zb - za) * (cum[i] / total)
                node_at[i] = add_node(scaled[i][0], scaled[i][1], z)
                next_cut += target

        # Emit a sub-edge for each consecutive pair of cut points.
        cut_indices = sorted(node_at)
        for s in range(len(cut_indices) - 1):
            lo, hi = cut_indices[s], cut_indices[s + 1]
            sub_deltas = []
            prev = scaled[lo]
            for j in range(lo + 1, hi):
                sub_deltas.extend([scaled[j][0] - prev[0], scaled[j][1] - prev[1]])
                prev = scaled[j]
            sub_len = round(cum[hi] - cum[lo])
            new_edges.append([node_at[lo], node_at[hi], direction,
                              type_code, cls, sub_len, sub_deltas])
        split_count += 1

    graph['nodes'] = nodes
    graph['edges'] = new_edges
    GRAPH_PATH.write_text(json.dumps(graph, separators=(',', ':')))
    print(f'Split {split_count} long edges; graph now '
          f'{len(nodes) // 2} nodes, {len(new_edges)} edges '
          f'({GRAPH_PATH.stat().st_size / 1e6:.1f} MB)', file=sys.stderr)

    if elev is not None:
        ELEV_PATH.write_text(json.dumps({
            'version': 1, 'unit': 'm', 'count': len(elev), 'elev': elev,
        }, separators=(',', ':')))
        print(f'Elevations updated to {len(elev)} nodes', file=sys.stderr)


if __name__ == '__main__':
    build()
