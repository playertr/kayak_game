# Multiplayer — Seventy48 Kayak Race

An HTML5 Canvas kayak-racing game set in the real waters of Puget Sound.
Race from Tacoma to Port Townsend (~70 miles) dodging orcas and WSF
ferries, with real NOAA tidal currents pushing you north or south.

## Quick start

```bash
node scripts/bundle.js --check   # builds multiplayer-kayak.html + syntax check
open multiplayer-kayak.html
```

The output is a **single self-contained HTML file** — no server required.
Works in any modern browser, including mobile (virtual joystick) and
iframed in Google Sites (fullscreen button included).

## Modes

- **Solo** — One double kayak (Tim & Madelyn). WASD, arrow keys, or
  touch joystick.
- **Multiplayer** — Two single kayaks on one keyboard:

| Player              | Up | Down | Left | Right |
|---------------------|:--:|:----:|:----:|:-----:|
| **Tim** (cyan)      | W  |  S   |  A   |   D   |
| **Madelyn** (orange) | ↑ |  ↓   |  ←   |   →   |

## Project structure

```
kayak_game/
├── shell.html              HTML template (CSS + DOM + {{BUNDLE}} placeholder)
├── multiplayer-kayak.html  Built output (single self-contained file)
├── src/
│   ├── config.js           Map bounds, speed constants
│   ├── projection.js       Web Mercator + camera system
│   ├── tides.js            8 NOAA tide stations, current vector field
│   ├── land.js             Ray-cast point-in-polygon collision
│   ├── entities.js         Players, orcas, ferries
│   ├── update.js           Physics, movement, camera tracking
│   ├── render.js           All canvas drawing
│   └── game.js             Input handling, lifecycle, boot
├── data/
│   ├── coastline-data.js   327 OSM land polygons (auto-generated)
│   ├── map-labels.js       Place name labels
│   └── noaa-tide-data.json Cached raw NOAA API responses
├── scripts/
│   ├── bundle.js           Concatenation bundler → multiplayer-kayak.html
│   ├── fetch-coastlines.js Overpass API → data/coastline-data.js
│   ├── fetch-tides.js      NOAA CO-OPS API → data/noaa-tide-data.json
│   ├── screenshot-test.js  Headless Chrome integration test
│   └── diagnose-land.js    isLand() diagnostic utility
└── screenshots/            Test screenshots (auto-generated)
```

## How it works

- **Projection** — Web Mercator. All entities store lat/lon; `toScreen()`
  converts at render time. Camera follows the mean of both boats with
  dynamic zoom (closer boats → more zoom). Viewport is clamped so map
  edges are never visible.

- **Coastlines** — 327 simplified polygons from OpenStreetMap via the
  Overpass API, covering 45.5°–49.5° N / 125.5°–121° W (Olympic
  Peninsula, Vancouver Island, the Columbia River, and the Cascades
  foothills). Douglas-Peucker simplification at ε ≈ 0.001° (~100 m).
  Uses the OSM coastline winding convention (land on the left → CCW
  rings enclose land) to correctly classify land vs water.

- **Tides** — Hard-coded hourly NOAA predictions for May 29 – Jun 1,
  2026, from 8 stations. Current vectors are computed via inverse-distance
  weighting of the tide rate-of-change at each station, with a small
  spatial wobble for variety.

- **Collision** — Ray-cast point-in-polygon with AABB culling. Players
  slide along coastlines; an emergency nudge prevents getting stuck in
  land. Orca and ferry collisions use land-safe pushback. Orcas bounce
  off land; ferries run fixed WSF routes.

- **Spawn** — Deterministic: all players start at a hard-coded point in
  open water near Commencement Bay (47.29° N, 122.46° W).

## Tide stations

| ID        | Name           | Lat    | Lon      |
|-----------|----------------|--------|----------|
| 9446484   | Tacoma         | 47.27  | -122.42  |
| 9447130   | Seattle        | 47.60  | -122.34  |
| 9444900   | Port Townsend  | 48.11  | -122.76  |
| 9443090   | Neah Bay       | 48.37  | -124.62  |
| 9441102   | Westport       | 46.90  | -124.10  |
| 9439040   | Astoria        | 46.21  | -123.77  |
| 9449880   | Friday Harbor  | 48.55  | -123.01  |
| 9449424   | Cherry Point   | 48.86  | -122.76  |

### Re-fetching tide data

If you need predictions for different dates, edit `scripts/fetch-tides.js` and run:

```bash
node scripts/fetch-tides.js   # writes data/noaa-tide-data.json
```

Then manually copy the new arrays into `src/tides.js`.

### Re-fetching coastline data

```bash
node scripts/fetch-coastlines.js > data/coastline-data.js
```

Edit the `BBOX` constant in `scripts/fetch-coastlines.js` to change the region.

## Testing

Requires Google Chrome installed at the default macOS path.

```bash
npm install puppeteer-core              # one-time
node scripts/screenshot-test.js         # headless Chrome: screenshots + error check
node scripts/diagnose-land.js           # verify isLand() at key coordinates
```

## Credits

- Coastline data © [OpenStreetMap](https://www.openstreetmap.org/) contributors (ODbL)
- Tide predictions from [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/)
- Built for the [Seventy48](https://www.seventy48.com/) race, May 2026
