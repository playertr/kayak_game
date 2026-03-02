// ====================================================================
// MAP PROJECTION — Web Mercator with camera tracking
// ====================================================================

const DEG = Math.PI / 180;
function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)); }

const MERC_LEFT   = MAP.minLon * DEG;
const MERC_RIGHT  = MAP.maxLon * DEG;
const MERC_TOP    = mercY(MAP.maxLat);
const MERC_BOTTOM = mercY(MAP.minLat);
const MERC_W      = MERC_RIGHT - MERC_LEFT;
const MERC_H      = MERC_TOP - MERC_BOTTOM;

// Camera state — drives the viewport transform
const camera = {
  lat:  (MAP.minLat + MAP.maxLat) / 2,
  lon:  (MAP.minLon + MAP.maxLon) / 2,
  zoom: 1,                                        // 1 = whole map visible
};

// Viewport metrics (recomputed each frame or on resize)
let vpOx = 0, vpOy = 0, vpScale = 1;

function recomputeViewport() {
  const fitScale = Math.min(canvas.width / MERC_W, canvas.height / MERC_H);
  vpScale = fitScale * camera.zoom;

  // Camera centre in Mercator space
  const cmx = camera.lon * DEG;
  const cmy = mercY(camera.lat);

  // Offset so (cmx, cmy) maps to screen centre
  vpOx = canvas.width  / 2 - (cmx - MERC_LEFT) * vpScale;
  vpOy = canvas.height / 2 - (MERC_TOP - cmy)  * vpScale;

  // Clamp: never let the viewport show outside MAP bounds.
  // Screen x=0 → MERC_LEFT  requires vpOx <= 0
  // Screen x=W → MERC_RIGHT requires vpOx >= W - MERC_W*vpScale
  const mapPxW = MERC_W * vpScale;
  const mapPxH = MERC_H * vpScale;
  if (mapPxW >= canvas.width) {
    vpOx = Math.min(0, Math.max(canvas.width - mapPxW, vpOx));
  } else {
    vpOx = (canvas.width - mapPxW) / 2;       // map smaller than screen? centre it
  }
  if (mapPxH >= canvas.height) {
    vpOy = Math.min(0, Math.max(canvas.height - mapPxH, vpOy));
  } else {
    vpOy = (canvas.height - mapPxH) / 2;
  }
}

// ── Coordinate transforms ───────────────────────────────────────────

function toScreen(lat, lon) {
  const x = vpOx + (lon * DEG - MERC_LEFT) * vpScale;
  const y = vpOy + (MERC_TOP - mercY(lat)) * vpScale;
  return [x, y];
}

function toLat(sy) {
  const my = MERC_TOP - (sy - vpOy) / vpScale;
  return (2 * Math.atan(Math.exp(my)) - Math.PI / 2) / DEG;
}

function toLon(sx) {
  return (MERC_LEFT + (sx - vpOx) / vpScale) / DEG;
}

// ── Canvas sizing ───────────────────────────────────────────────────

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  recomputeViewport();
}
