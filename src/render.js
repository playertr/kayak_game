// ====================================================================
// RENDER — All drawing functions
// ====================================================================

function render() {
  const now = Date.now();

  drawWater();
  drawWaves(now);
  drawTideArrows();

  // Ferry route helper lines
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (const f of ferries) {
    const [fx1, fy1] = toScreen(f.fromLat, f.fromLon);
    const [fx2, fy2] = toScreen(f.toLat, f.toLon);
    ctx.beginPath(); ctx.moveTo(fx1, fy1); ctx.lineTo(fx2, fy2); ctx.stroke();
  }
  ctx.setLineDash([]);

  drawLand();
  drawStartFinish();
  drawOrcas(now);
  drawFerries();
  for (const p of players) drawPlayer(p, now);

  updateHUD();
  drawTideChart();
}

// ── Water ───────────────────────────────────────────────────────────

function drawWater() {
  const wg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  wg.addColorStop(0,   '#081e30');
  wg.addColorStop(0.5, '#0c2840');
  wg.addColorStop(1,   '#0a2035');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWaves(now) {
  ctx.strokeStyle = 'rgba(40,100,160,0.05)';
  ctx.lineWidth = 1;
  for (let wy = 0; wy < canvas.height; wy += 22) {
    ctx.beginPath();
    for (let wx = 0; wx < canvas.width; wx += 4) {
      const off = Math.sin(wx * 0.015 + now * 0.0007 + wy * 0.02) * 4;
      wx === 0 ? ctx.moveTo(wx, wy + off) : ctx.lineTo(wx, wy + off);
    }
    ctx.stroke();
  }
}

// ── Tide arrows ─────────────────────────────────────────────────────

function drawTideArrows() {
  // Grid is fixed in lat/lon so arrows stay anchored to geography
  const latStep = 0.04;
  const lonStep = 0.05;

  // Visible lat/lon bounds
  const vpMinLat = toLat(canvas.height);
  const vpMaxLat = toLat(0);
  const vpMinLon = toLon(0);
  const vpMaxLon = toLon(canvas.width);

  // Snap to grid
  const startLat = Math.ceil(vpMinLat / latStep) * latStep;
  const startLon = Math.ceil(vpMinLon / lonStep) * lonStep;

  for (let lat = startLat; lat <= vpMaxLat; lat += latStep) {
    for (let lon = startLon; lon <= vpMaxLon; lon += lonStep) {
      if (isLand(lat, lon)) continue;

      const c = getCurrentAt(lat, lon, simTimeMs);
      const mag = Math.sqrt(c.dlat * c.dlat + c.dlon * c.dlon);
      if (mag < PADDLE_SPEED * 0.02) continue;

      const [sx, sy] = toScreen(lat, lon);
      if (sx < -20 || sx > canvas.width + 20 || sy < -20 || sy > canvas.height + 20) continue;

      // Arrow direction in screen space
      const [ax, ay] = toScreen(lat + c.dlat * 200, lon + c.dlon * 200);
      const angle = Math.atan2(ay - sy, ax - sx);

      const normMag = Math.min(mag / (MAX_CURRENT * 1.2), 1);
      const len = normMag * 16 + 4;
      const alpha = 0.07 + normMag * 0.5;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.strokeStyle = `rgba(80,180,240,${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-len, 0); ctx.lineTo(len, 0);
      ctx.lineTo(len - 5, -3); ctx.moveTo(len, 0); ctx.lineTo(len - 5, 3);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Start / Finish lines ────────────────────────────────────────────

function drawStartFinish() {
  // Start line
  const [sx1, sy1]  = toScreen(START_LINE.aLat, START_LINE.aLon);
  const [sx2, sy2]  = toScreen(START_LINE.bLat, START_LINE.bLon);
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(255,255,100,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,100,0.5)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('START — Tacoma', (sx1 + sx2) / 2, Math.max(sy1, sy2) + 14);

  // Finish line (chequered) — Port Townsend to Whidbey Island
  const [fx1, fy1] = toScreen(FINISH_LINE.aLat, FINISH_LINE.aLon);
  const [fx2, fy2] = toScreen(FINISH_LINE.bLat, FINISH_LINE.bLon);
  const fdx = fx2 - fx1, fdy = fy2 - fy1;
  const fLen = Math.hypot(fdx, fdy);
  const sq = 7;
  const steps = Math.floor(fLen / sq);
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const cx = fx1 + fdx * t;
    const cy = fy1 + fdy * t;
    ctx.fillStyle = i % 2 === 0
      ? 'rgba(255,255,255,0.55)' : 'rgba(40,40,40,0.55)';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(fdy, fdx));
    ctx.fillRect(0, -sq / 2, sq, sq);
    ctx.restore();
  }
  ctx.fillStyle = '#ffdd44';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏁 FINISH — Port Townsend ↔ Whidbey', (fx1 + fx2) / 2, Math.min(fy1, fy2) - 10);
}

// ── Orcas ───────────────────────────────────────────────────────────

function drawOrcas(now) {
  for (const o of orcas) {
    if (!o.visible) continue;
    const [ox, oy] = toScreen(o.lat, o.lon);
    if (ox < -50 || ox > canvas.width + 50) continue;
    if (oy < -50 || oy > canvas.height + 50) continue;

    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, 0, o.size, o.size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.ellipse(0, o.size * 0.08, o.size * 0.28, o.size * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(-3, -o.size * 0.38);
    ctx.lineTo( 0, -o.size * 0.8);
    ctx.lineTo( 3, -o.size * 0.38);
    ctx.fill();
    ctx.restore();
  }
}

// ── Ferries ─────────────────────────────────────────────────────────

function drawFerries() {
  for (const f of ferries) {
    const flat = f.fromLat + (f.toLat - f.fromLat) * f.progress;
    const flon = f.fromLon + (f.toLon - f.fromLon) * f.progress;
    const [fx, fy] = toScreen(flat, flon);
    if (fx < -60 || fx > canvas.width + 60) continue;
    if (fy < -60 || fy > canvas.height + 60) continue;

    const hw = f.w / 2, hh = f.h / 2;
    ctx.save(); ctx.translate(fx, fy);
    // No rotation — narrow side always faces north (screen top)

    // Hull — trapezoid: wide at bottom (waterline), narrow on top (cabin)
    // Symmetrical about the lengthwise (horizontal) axis
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.moveTo(-hw,       hh);            // bottom-left (wide)
    ctx.lineTo( hw,       hh);            // bottom-right (wide)
    ctx.lineTo( hw * 0.7, -hh);           // top-right (narrow)
    ctx.lineTo(-hw * 0.7, -hh);           // top-left (narrow)
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8899aa'; ctx.lineWidth = 1; ctx.stroke();

    // Five circular windows evenly spaced along the hull centre
    ctx.fillStyle = '#55aadd';
    const winStart = -hw * 0.55;
    const winEnd   =  hw * 0.55;
    const winGap   = (winEnd - winStart) / 4;   // 5 windows, 4 gaps
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(winStart + i * winGap, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ── Player ──────────────────────────────────────────────────────────

function drawPlayer(p, now) {
  const [px, py] = toScreen(p.lat, p.lon);

  // Trail
  for (const t of p.trail) {
    const al = (1 - t.age / 240) * 0.18;
    if (al <= 0) continue;
    const [tx, ty] = toScreen(t.lat, t.lon);
    ctx.fillStyle = `${p.color}${Math.round(al * 255).toString(16).padStart(2, '0')}`;
    ctx.beginPath(); ctx.arc(tx, ty, 2, 0, Math.PI * 2); ctx.fill();
  }

  if (p.stunTimer > 0 && Math.floor(now / 80) % 2 === 0) return;

  ctx.save(); ctx.translate(px, py);

  if (p.isDouble) {
    // Double kayak — wider, two heads, two paddles
    ctx.fillStyle = p.color;
    ctx.beginPath();
    const kw = 9, kh = 26;
    ctx.moveTo(0, -kh);
    ctx.quadraticCurveTo(kw + 3, -kh / 2, kw, 0);
    ctx.quadraticCurveTo(kw + 2,  kh / 2, 0, kh);
    ctx.quadraticCurveTo(-kw - 2, kh / 2, -kw, 0);
    ctx.quadraticCurveTo(-kw - 3, -kh / 2, 0, -kh);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();

    // Centre line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, -kh + 6); ctx.lineTo(0, kh - 6); ctx.stroke();

    // Two heads (front paddler and rear paddler)
    ctx.fillStyle = '#ffd5a0';
    ctx.beginPath(); ctx.arc(0, -8, 3, 0, Math.PI * 2); ctx.fill(); // front
    ctx.beginPath(); ctx.arc(0,  6, 3, 0, Math.PI * 2); ctx.fill(); // rear

    // Front paddle
    const pa1 = Math.sin(p.paddleAngle) * 0.7;
    ctx.save(); ctx.translate(0, -8); ctx.rotate(pa1);
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.fillStyle = '#ff9800'; ctx.fillRect(-15, -2, 4, 4); ctx.fillRect(11, -2, 4, 4);
    ctx.restore();

    // Rear paddle (slightly offset phase)
    const pa2 = Math.sin(p.paddleAngle + Math.PI * 0.7) * 0.7;
    ctx.save(); ctx.translate(0, 6); ctx.rotate(pa2);
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.fillStyle = '#ff9800'; ctx.fillRect(-15, -2, 4, 4); ctx.fillRect(11, -2, 4, 4);
    ctx.restore();

    // Name tag
    ctx.fillStyle = p.color;
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(p.name, 0, kh + 11);
  } else {
    // Single kayak (original)
    ctx.fillStyle = p.color;
    ctx.beginPath();
    const kw = 7, kh = 18;
    ctx.moveTo(0, -kh);
    ctx.quadraticCurveTo(kw + 2, -kh / 2, kw, 0);
    ctx.quadraticCurveTo(kw + 1,  kh / 2, 0, kh);
    ctx.quadraticCurveTo(-kw - 1, kh / 2, -kw, 0);
    ctx.quadraticCurveTo(-kw - 2, -kh / 2, 0, -kh);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();

    // Head
    ctx.fillStyle = '#ffd5a0';
    ctx.beginPath(); ctx.arc(0, -2, 3, 0, Math.PI * 2); ctx.fill();

    // Paddle
    const pa = Math.sin(p.paddleAngle) * 0.7;
    ctx.save(); ctx.rotate(pa);
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
    ctx.fillStyle = '#ff9800';
    ctx.fillRect(-13, -2, 4, 4);
    ctx.fillRect(9, -2, 4, 4);
    ctx.restore();

    // Name tag
    ctx.fillStyle = p.color;
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(p.name, 0, 18 + 11);
  }

  if (p.finished) {
    ctx.fillStyle = '#ffdd44'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('🏁', 0, p.isDouble ? -32 : -24);
  }
  ctx.restore();
}

// ── HUD ─────────────────────────────────────────────────────────────

function updateHUD() {
  const elapsed = (Date.now() - gameStartTime) / 1000;
  const m = Math.floor(elapsed / 60);
  const s = (elapsed % 60).toFixed(2).padStart(5, '0');
  document.getElementById('race-timer').textContent = `${m}:${s}`;

  const st = new Date(simTimeMs);
  document.getElementById('sim-time').textContent =
    st.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

  const startLat  = (START_LINE.aLat + START_LINE.bLat) / 2;
  const finishLat  = (FINISH_LINE.aLat + FINISH_LINE.bLat) / 2;
  const totalDeg  = finishLat - startLat;

  if (gameMode === 'solo') {
    const p = players[0];
    const pct = Math.max(0, Math.min(100,
      ((p.lat - startLat) / totalDeg) * 100)).toFixed(0);
    document.getElementById('p1-progress').textContent =
      p.finished ? `FINISHED (${formatRealTime(p.finishTime)})` : `${pct}%`;
  } else {
    for (let i = 0; i < 2; i++) {
      const p = players[i];
      const pct = Math.max(0, Math.min(100,
        ((p.lat - startLat) / totalDeg) * 100)).toFixed(0);
      document.getElementById(`p${i + 1}-progress`).textContent =
        p.finished ? `FINISHED (${formatRealTime(p.finishTime)})` : `${pct}%`;
    }
  }
}

// ── Tide chart ──────────────────────────────────────────────────────

function drawTideChart() {
  const c = tideCtx, w = tideCanvas.width, h = tideCanvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill();

  const st = TIDE_STATIONS[1];                    // Tacoma
  const d  = st.data;
  if (!d || d.length < 2) return;

  const minV = Math.min(...d);
  const maxV = Math.max(...d);
  const tMin = TIDE_T0;
  const tMax = TIDE_T0 + (d.length - 1) * 3600000;

  c.fillStyle = '#667788'; c.font = '9px sans-serif'; c.textAlign = 'left';
  c.fillText('Tide — Tacoma (NOAA)', 8, 13);

  const pad = { top: 19, bottom: 8, left: 8, right: 8 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top  - pad.bottom;

  c.beginPath(); c.strokeStyle = '#4488bb'; c.lineWidth = 1.5;
  for (let i = 0; i < d.length; i++) {
    const t = TIDE_T0 + i * 3600000;
    const x = pad.left + ((t - tMin) / (tMax - tMin)) * cw;
    const y = pad.top + ch - ((d[i] - minV) / (maxV - minV)) * ch;
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.stroke();

  // Race-start marker
  const rsFrac = (RACE_START.getTime() - tMin) / (tMax - tMin);
  if (rsFrac >= 0 && rsFrac <= 1) {
    const rx = pad.left + rsFrac * cw;
    c.strokeStyle = 'rgba(255,255,100,0.3)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(rx, pad.top); c.lineTo(rx, pad.top + ch); c.stroke();
  }

  // Current sim-time marker
  const nf = (simTimeMs - tMin) / (tMax - tMin);
  if (nf >= 0 && nf <= 1) {
    const nx = pad.left + nf * cw;
    c.strokeStyle = '#ff6ec7'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(nx, pad.top); c.lineTo(nx, pad.top + ch); c.stroke();

    const cv = getTideHeight(st, simTimeMs);
    const ny = pad.top + ch - ((cv - minV) / (maxV - minV)) * ch;
    c.fillStyle = '#ff6ec7';
    c.beginPath(); c.arc(nx, ny, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ccddee'; c.font = '8px sans-serif'; c.textAlign = 'right';
    c.fillText(`${cv.toFixed(1)} ft`, w - 6, pad.top + 10);
  }
}
