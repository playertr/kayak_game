// ====================================================================
// LAND — Ray-cast collision + direct canvas rendering
// ====================================================================

// Precomputed bounding boxes for frustum culling
let landBBoxes = null;

function initLandBounds() {
  landBBoxes = LAND_POLYS.map(({ name, pts }) => {
    let minLa = Infinity,  maxLa = -Infinity;
    let minLo = Infinity,  maxLo = -Infinity;
    for (const [la, lo] of pts) {
      if (la < minLa) minLa = la;  if (la > maxLa) maxLa = la;
      if (lo < minLo) minLo = lo;  if (lo > maxLo) maxLo = lo;
    }
    return { name, pts, minLa, maxLa, minLo, maxLo };
  });
}

// ── Point-in-polygon (ray-cast) ─────────────────────────────────────

function pointInPoly(lat, lon, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if ((yi > lat) !== (yj > lat) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isLand(lat, lon) {
  if (!landBBoxes) return false;
  for (const b of landBBoxes) {
    if (lat < b.minLa || lat > b.maxLa) continue;
    if (lon < b.minLo || lon > b.maxLo) continue;
    if (pointInPoly(lat, lon, b.pts)) return true;
  }
  return false;
}

// ── Rendering (direct draw each frame — needed for camera moves) ────

function drawLand() {
  // Viewport bounds in world coords for culling
  const vpMinLat = toLat(canvas.height);
  const vpMaxLat = toLat(0);
  const vpMinLon = toLon(0);
  const vpMaxLon = toLon(canvas.width);

  for (const b of landBBoxes) {
    // AABB frustum cull
    if (b.maxLa < vpMinLat || b.minLa > vpMaxLat) continue;
    if (b.maxLo < vpMinLon || b.minLo > vpMaxLon) continue;

    ctx.beginPath();
    for (let i = 0; i < b.pts.length; i++) {
      const [sx, sy] = toScreen(b.pts[i][0], b.pts[i][1]);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();

    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#1e5a32');
    g.addColorStop(0.5, '#2a6b3e');
    g.addColorStop(1, '#1a5028');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#c2b280';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,140,80,0.25)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // Labels
  for (const lb of MAP_LABELS) {
    const [lx, ly] = toScreen(lb.lat, lb.lon);
    if (lx < -100 || lx > canvas.width + 100) continue;
    if (ly < -100 || ly > canvas.height + 100) continue;
    ctx.fillStyle = lb.color;
    ctx.font = `bold ${lb.size}px sans-serif`;
    ctx.textAlign = 'center';
    lb.text.split('\n').forEach((line, i) =>
      ctx.fillText(line, lx, ly + i * (lb.size + 2)));
  }
}
