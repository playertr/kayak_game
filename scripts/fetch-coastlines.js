#!/usr/bin/env node
/**
 * Fetch coastline polygons from the Overpass (OpenStreetMap) API,
 * assemble coastline ways into closed land polygons, simplify with
 * Douglas-Peucker, and output JavaScript-ready LAND_POLYS data.
 *
 * OSM convention: coastline ways have land on the LEFT. Assembled rings
 * that are CCW (positive signed area) enclose land; CW = water → skipped.
 *
 * Usage:  node scripts/fetch-coastlines.js > data/coastline-data.js
 * Then:   node scripts/bundle.js --check
 */

const BBOX = { south: 45.50, west: -125.50, north: 49.50, east: -121.00 };

// ── Overpass query: get all coastline ways in the bounding box ──────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const query = `
[out:json][timeout:180];
way["natural"="coastline"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
out geom;
`;

// ── Douglas-Peucker simplification ─────────────────────────────────────
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return Math.sqrt((point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2);
  const u = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (mag * mag);
  const ix = lineStart[0] + u * dx;
  const iy = lineStart[1] + u * dy;
  return Math.sqrt((point[0] - ix) ** 2 + (point[1] - iy) ** 2);
}

function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

// ── Assemble ways into closed rings ────────────────────────────────────
function assemblePolygons(ways) {
  // Each way is an array of {lat, lon} nodes.
  // Coastlines in OSM have land on the LEFT (water on the right).
  // We need to join ways end-to-end into closed rings.

  // Convert to arrays of [lon, lat] (matching our lat/lon convention)
  const segments = ways.map(w => w.geometry.map(n => [n.lon, n.lat]));

  // Build adjacency by endpoint
  const unused = new Set(segments.map((_, i) => i));
  const rings = [];

  while (unused.size > 0) {
    const startIdx = unused.values().next().value;
    unused.delete(startIdx);
    let ring = [...segments[startIdx]];

    let changed = true;
    while (changed) {
      changed = false;
      const head = ring[0];
      const tail = ring[ring.length - 1];

      // Check if ring is closed
      if (ring.length > 3 && Math.abs(head[0] - tail[0]) < 1e-6 && Math.abs(head[1] - tail[1]) < 1e-6) {
        break;
      }

      for (const idx of unused) {
        const seg = segments[idx];
        const segHead = seg[0];
        const segTail = seg[seg.length - 1];

        // Try to append to tail
        if (Math.abs(tail[0] - segHead[0]) < 1e-6 && Math.abs(tail[1] - segHead[1]) < 1e-6) {
          ring = ring.concat(seg.slice(1));
          unused.delete(idx);
          changed = true;
          break;
        }
        // Try reversed append to tail
        if (Math.abs(tail[0] - segTail[0]) < 1e-6 && Math.abs(tail[1] - segTail[1]) < 1e-6) {
          ring = ring.concat(seg.slice(0, -1).reverse());
          unused.delete(idx);
          changed = true;
          break;
        }
        // Try to prepend to head
        if (Math.abs(head[0] - segTail[0]) < 1e-6 && Math.abs(head[1] - segTail[1]) < 1e-6) {
          ring = seg.slice(0, -1).concat(ring);
          unused.delete(idx);
          changed = true;
          break;
        }
        // Try reversed prepend to head
        if (Math.abs(head[0] - segHead[0]) < 1e-6 && Math.abs(head[1] - segHead[1]) < 1e-6) {
          ring = seg.slice(1).reverse().concat(ring);
          unused.delete(idx);
          changed = true;
          break;
        }
      }
    }

    rings.push(ring);
  }

  return rings;
}

// ── Close open rings at the bounding box ───────────────────────────────
// OSM convention: walking along a coastline way, land is on the LEFT.
// Assembled rings that enclose land are therefore CCW → positive signed area
// in [lon, lat] (standard math x/y). We try both bbox-trace directions and
// keep the closure that yields a positive (land) polygon.
function closeRingAtBbox(ring, bbox) {
  const head = ring[0];
  const tail = ring[ring.length - 1];
  if (Math.abs(head[0] - tail[0]) < 1e-6 && Math.abs(head[1] - tail[1]) < 1e-6) {
    return ring; // already closed
  }

  const corners = [
    [bbox.west, bbox.north],  // NW  0
    [bbox.east, bbox.north],  // NE  1
    [bbox.east, bbox.south],  // SE  2
    [bbox.west, bbox.south],  // SW  3
  ];

  function nearestCornerIdx(pt) {
    let minDist = Infinity, idx = 0;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.abs(pt[0] - corners[i][0]) + Math.abs(pt[1] - corners[i][1]);
      if (d < minDist) { minDist = d; idx = i; }
    }
    return idx;
  }

  const tailCorner = nearestCornerIdx(tail);
  const headCorner = nearestCornerIdx(head);

  function buildClosing(direction) {
    const pts = [tail];
    let ci = tailCorner;
    for (let step = 0; step < 5; step++) {
      pts.push(corners[ci]);
      if (ci === headCorner) break;
      ci = (ci + direction + 4) % 4;
    }
    pts.push(head);
    return pts.slice(1);
  }

  const ringA = ring.concat(buildClosing(1));
  const ringB = ring.concat(buildClosing(-1));
  const areaA = signedArea(ringA);
  const areaB = signedArea(ringB);

  // Positive signed area = CCW = land (OSM convention). Pick that one.
  if (areaA > 0 && areaB > 0) return areaA <= areaB ? ringA : ringB;
  if (areaA > 0) return ringA;
  if (areaB > 0) return ringB;
  // Neither positive — return the less-negative one
  return areaA >= areaB ? ringA : ringB;
}

// ── Compute signed area (for winding order detection) ──────────────────
function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return area / 2;
}

// ── Filter: keep only polygons that intersect our game area ────────────
function polygonIntersectsBox(ring, bbox) {
  for (const pt of ring) {
    if (pt[0] >= bbox.west && pt[0] <= bbox.east && pt[1] >= bbox.south && pt[1] <= bbox.north) {
      return true;
    }
  }
  return false;
}

// ── Name polygons heuristically ────────────────────────────────────────
function namePolygon(ring, index) {
  // Compute centroid
  let cx = 0, cy = 0;
  for (const pt of ring) { cx += pt[0]; cy += pt[1]; }
  cx /= ring.length; cy /= ring.length;

  const area = Math.abs(signedArea(ring));

  // Heuristic naming based on centroid location
  if (cy > 48.5 && cx < -123.0) return `vancouver_island_${index}`;
  if (cy > 48.0 && cx > -122.7 && cx < -122.4) return `whidbey_area_${index}`;
  if (cy > 47.5 && cy < 47.65 && cx > -122.55 && cx < -122.4) return `bainbridge_${index}`;
  if (cy > 47.35 && cy < 47.5 && cx > -122.5 && cx < -122.35) return `vashon_${index}`;
  if (cy > 47.5 && cy < 47.7 && cx > -122.65 && cx < -122.5) return `kitsap_${index}`;
  if (cy < 46.5 && cx < -123.0) return `columbia_river_${index}`;
  if (cy > 47.0 && cx < -123.5) return `olympic_coast_${index}`;
  if (cx < -122.6) return `olympic_west_${index}`;
  if (cx > -122.4) return `east_mainland_${index}`;
  return `poly_${index}`;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.error('Fetching coastlines from Overpass API...');
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    console.error(`HTTP ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  console.error(`Got ${data.elements.length} coastline ways`);

  // Assemble into rings
  const rings = assemblePolygons(data.elements);
  console.error(`Assembled ${rings.length} rings`);

  // Close open rings at bounding box, simplify, and filter
  const EPSILON = 0.001; // ~100m simplification tolerance in degrees
  const processed = [];

  for (let i = 0; i < rings.length; i++) {
    let ring = closeRingAtBbox(rings[i], BBOX);

    // OSM convention: CCW ring (positive signed area in [lon,lat]) = land.
    // Negative = water polygon → skip.
    const area = signedArea(ring);

    // Skip tiny rings
    if (Math.abs(area) < 0.00001) {
      console.error(`  Ring ${i}: skipping (too small, area=${area.toFixed(8)})`);
      continue;
    }

    // Skip water polygons
    if (area < 0) {
      console.error(`  Ring ${i}: skipping (water, area=${area.toFixed(6)})`);
      continue;
    }

    // Simplify
    ring = douglasPeucker(ring, EPSILON);

    // Filter to game area
    if (!polygonIntersectsBox(ring, BBOX)) {
      console.error(`  Ring ${i}: skipping (outside game area)`);
      continue;
    }

    const name = namePolygon(ring, i);
    console.error(`  Ring ${i} → ${name}: ${ring.length} points (area=${Math.abs(area).toFixed(6)})`);

    // Convert to [lat, lon] pairs for the game (matching existing LAND_POLYS format)
    const gameCoords = ring.map(p => [parseFloat(p[1].toFixed(5)), parseFloat(p[0].toFixed(5))]);
    processed.push({ name, coords: gameCoords });
  }

  console.error(`\nFinal: ${processed.length} land polygons`);

  // Output as JavaScript
  let js = '// Auto-generated from OpenStreetMap coastline data via Overpass API\n';
  js += '// Generated on ' + new Date().toISOString() + '\n';
  js += '// Douglas-Peucker simplification epsilon: ' + EPSILON + ' degrees (~80m)\n';
  js += 'const LAND_POLYS = [\n';
  for (const poly of processed) {
    js += `  { name: '${poly.name}', pts: [\n`;
    for (const pt of poly.coords) {
      js += `    [${pt[0]}, ${pt[1]}],\n`;
    }
    js += `  ]},\n`;
  }
  js += '];\n';

  // Write to stdout
  process.stdout.write(js);
}

main().catch(e => { console.error(e); process.exit(1); });
