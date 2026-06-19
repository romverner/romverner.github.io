# Hello!
Welcome to my humble GitHub.io page. I recently shut down my blog on Heroku 
after they introduced their new pricing model, so for now, this is serves as my
online portfolio.

If you're reading this page, chances are you didn't navigate to the home HTML
file, located here:
<a>https://www.romverner.github.io/index.html</a>

## Bike route planner

The map includes a safety-aware bike route planner for Philadelphia. Routing
runs entirely in the browser (A* over a precomputed street graph in
`public/json/graph.json`); a slider trades off shortest vs. safest, where
safety is weighted by the city's bike lane classification (trails >
protected > buffered > painted > sharrows > no lane, penalized further on
arterials). Park trails come from the city's PPR_Trails dataset and are
stitched into the street network at trail access points.
Routes can be exported as GPX via the native share sheet on phones (Komoot,
Strava, Garmin, etc.) or as a file download on desktop.

To rebuild the graph after the city updates its data:

```
python3 tools/build_graph.py
```

This re-downloads the Street Centerline and PPR_Trails datasets from the
city's ArcGIS server, joins bike lane types from
`public/json/streets.geojson` via `SEG_ID`, and rewrites
`public/json/graph.json`, `public/json/trails.geojson`, and
`public/json/lanes.geojson` (a slim display copy of the lane network). No
dependencies beyond Python 3.

SEPTA subway stations (Market-Frankford "L" and Broad Street "BSL" lines)
are shown as line-colored bullets that can anchor a route. They rarely
change, so they're built separately from SEPTA's GTFS feed:

```
python3 tools/build_septa.py
```

This rewrites `public/json/septa.geojson` (the L plus the Broad Street
trunk; the Broad-Ridge Spur and NHSL are excluded).

### Elevation

The route panel shows total climb (↑ ft) and an elevation profile. Ground
elevation for every graph node comes from the USGS 10 m DEM:

```
python3 tools/build_elevation.py
```

This reads `public/json/graph.json`, looks up each node via Open-Topo-Data,
and writes `public/json/elevations.json` (one elevation per node, indexed
to match). Re-run after rebuilding the graph, since node order must match.

### Densifying long edges

Trail edges can run for kilometers between intersections, leaving no node
to snap a pin to mid-trail (a pin would land on a nearby road instead).
After building the graph and elevations, split the long edges:

```
python3 tools/densify_graph.py
```

This splits any edge over 100 m at its existing geometry vertices (adding
snappable nodes) and interpolates elevation for the new nodes. Run order:
`build_graph.py` → `build_elevation.py` → `densify_graph.py`. Bump the
`?v=` query on `graphUrl` in `route.js` after regenerating so clients
reload.

### High Injury Network

The ⚠ control toggles Philadelphia's High Injury Network — the corridors
that account for most serious-injury and fatal crashes (Vision Zero) — as
a red safety overlay, off by default. Rebuild it (it updates periodically)
with:

```
python3 tools/build_hin.py
```

This rewrites `public/json/hin.geojson` from DVRPC's hosted feature
service.

### Neighboring counties

Philadelphia always loads. The five counties that border it — Delaware,
Montgomery, Bucks (PA) and Camden, Burlington (NJ) — show as outlined,
hover-highlighted regions beyond the city; tapping "+ Add <county>" loads
that county on demand and makes it routable. Each is built from DVRPC's
region-wide Level of Traffic Stress network and stitched onto the
Philadelphia graph at the street intersections where the two networks
coincide along the border.

```
python3 tools/build_county.py <delaware|montgomery|bucks|camden|burlington>
```

This writes `public/json/graph-<county>.json` (routing graph with a
`border` map onto Philadelphia node indices, and a `bridges` list for
river crossings), `public/json/lanes-<county>.geojson` (bike-facility
display segments), and fetches `public/json/county-<county>.geojson` (the
boundary) from DVRPC. Philadelphia keeps its own detailed lane-type model
(`build_graph.py`); only neighbors use LTS, mapped to comparable penalties.

The PA counties stitch at shared road intersections (Montgomery has 184
crossings; Delaware 17; Bucks 25 at the small NE corner). The NJ counties
are separated by the Delaware River, so they connect only via explicit
bikeable-bridge connectors (Camden via the Ben Franklin Bridge, Burlington
via the Tacony-Palmyra Bridge). Gloucester County is excluded — its river
frontage faces Delaware County, not Philadelphia.