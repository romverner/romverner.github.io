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