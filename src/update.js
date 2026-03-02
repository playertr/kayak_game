// ====================================================================
// UPDATE — Physics, game logic, camera tracking
// ====================================================================

function update(dt) {
  const now = Date.now();
  const elapsed = now - gameStartTime;
  simTimeMs = RACE_START.getTime() + elapsed * TIME_ACCEL;

  if (gameMode === 'solo') {
    // Solo: one kayak responds to WASD, arrows, AND joystick
    updatePlayerSolo(players[0], dt);
  } else {
    updatePlayer(players[0], 'KeyW','KeyS','KeyA','KeyD', dt);
    updatePlayer(players[1], 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight', dt);
  }

  // ── Orcas ──
  for (const o of orcas) {
    o.diveTimer -= dt;
    if (o.diveTimer <= 0) {
      o.visible = !o.visible;
      o.diveTimer = o.visible ? 200 + Math.random() * 400
                              :  80 + Math.random() * 150;
    }
    if (o.visible) {
      const wave = Math.sin(now * 0.001 + o.phase) * 0.12 * PX_TO_DEG;
      const nlat = o.lat + (o.vlat + wave) * dt;
      const nlon = o.lon + o.vlon * dt;

      // Bounce off land and map edges — test before moving
      const hitLand = isLand(nlat, nlon);
      if (hitLand || nlat < MAP.minLat + 0.5 || nlat > MAP.maxLat - 0.5) {
        o.vlat *= -1;
      }
      if (hitLand || nlon < MAP.minLon + 0.5 || nlon > MAP.maxLon - 0.5) {
        o.vlon *= -1;
      }
      // Only move if destination is water
      const newLat = o.lat + o.vlat * dt;
      const newLon = o.lon + o.vlon * dt;
      if (!isLand(newLat, newLon)) {
        o.lat = newLat;
        o.lon = newLon;
      }
    }
  }

  // ── Ferries ──
  for (const f of ferries) {
    f.progress += f.speed * f.dir * dt;
    if (f.progress >= 1) { f.progress = 1; f.dir = -1; }
    if (f.progress <= 0) { f.progress = 0; f.dir =  1; }
  }

  // ── Camera (smooth follow mean of both boats) ──
  updateCamera();

  // ── Win condition ──
  if (gameMode === 'solo') {
    if (players[0].finished) { endGame(); }
  } else {
    const [p1, p2] = players;
    if (p1.finished && p2.finished) { endGame(); }
    else if (p1.finished || p2.finished) {
      const ft = p1.finished ? p1.finishTime : p2.finishTime;
      if ((now - gameStartTime) / 1000 - ft > 20) endGame();
    }
  }
}

// ── Player update ───────────────────────────────────────────────────

// Solo mode: accepts both WASD + arrows + joystick
function updatePlayerSolo(p, dt) {
  if (p.finished) return;
  if (p.stunTimer > 0) { p.stunTimer -= dt; return; }

  let ax = 0, ay = 0;
  if (keys['KeyW'] || keys['ArrowUp'])      ay = -1;
  if (keys['KeyS'] || keys['ArrowDown'])     ay =  0.4;
  if (keys['KeyA'] || keys['ArrowLeft'])     ax = -1;
  if (keys['KeyD'] || keys['ArrowRight'])    ax =  1;

  // Joystick override (if active and magnitude is non-trivial)
  if (joystickInput.active) {
    ax = joystickInput.x;
    ay = joystickInput.y;
  }

  const len = Math.sqrt(ax * ax + ay * ay) || 1;
  ax /= len;  ay /= len;

  const cur = getCurrentAt(p.lat, p.lon, simTimeMs);
  const dlat = -ay * PADDLE_SPEED + cur.dlat;
  const dlon =  ax * PADDLE_SPEED / Math.cos(p.lat * DEG) + cur.dlon;
  const nlat = p.lat + dlat * dt;
  const nlon = p.lon + dlon * dt;

  if      (!isLand(nlat, nlon)) { p.lat = nlat; p.lon = nlon; }
  else if (!isLand(nlat, p.lon)) { p.lat = nlat; }
  else if (!isLand(p.lat, nlon)) { p.lon = nlon; }

  // Emergency land escape — nudge toward spawn point if stuck in land
  if (isLand(p.lat, p.lon)) {
    const eLat = SPAWN_POINT.lat - p.lat;
    const eLon = SPAWN_POINT.lon - p.lon;
    const eDist = Math.sqrt(eLat * eLat + eLon * eLon) || 1;
    p.lat += (eLat / eDist) * 0.002;
    p.lon += (eLon / eDist) * 0.002;
  }

  p.lat = Math.max(MAP.minLat + 0.01, Math.min(MAP.maxLat - 0.01, p.lat));
  p.lon = Math.max(MAP.minLon + 0.01, Math.min(MAP.maxLon - 0.01, p.lon));

  if (frameCount % 3 === 0) {
    p.trail.push({ lat: p.lat, lon: p.lon, age: 0 });
    if (p.trail.length > 80) p.trail.shift();
  }
  for (const t of p.trail) t.age++;
  if (ax !== 0 || ay !== 0) p.paddleAngle += 0.15 * dt;

  // Finish check
  if (!p.finished && p.lon >= FINISH_LINE.aLon && p.lon <= FINISH_LINE.bLon) {
    const t = (p.lon - FINISH_LINE.aLon) / (FINISH_LINE.bLon - FINISH_LINE.aLon);
    const lineLat = FINISH_LINE.aLat + t * (FINISH_LINE.bLat - FINISH_LINE.aLat);
    if (p.lat >= lineLat) {
      p.finished = true;
      p.finishTime = (Date.now() - gameStartTime) / 1000;
    }
  }

  // Collision with orcas (land-safe pushback)
  for (const o of orcas) {
    if (!o.visible) continue;
    const [px, py] = toScreen(p.lat, p.lon);
    const [ox, oy] = toScreen(o.lat, o.lon);
    if (Math.hypot(px - ox, py - oy) < o.size + p.radius + 2) {
      p.stunTimer = 50;
      const bumpLat = p.lat + (p.lat > o.lat ?  0.003 : -0.003);
      const bumpLon = p.lon + 0.002;
      if (!isLand(bumpLat, bumpLon))      { p.lat = bumpLat; p.lon = bumpLon; }
      else if (!isLand(bumpLat, p.lon))   { p.lat = bumpLat; }
      else if (!isLand(p.lat, bumpLon))   { p.lon = bumpLon; }
      // else: stay put — better stuck momentarily than pushed into land
    }
  }

  // Collision with ferries (land-safe pushback)
  for (const f of ferries) {
    const flat = f.fromLat + (f.toLat - f.fromLat) * f.progress;
    const flon = f.fromLon + (f.toLon - f.fromLon) * f.progress;
    const [px, py] = toScreen(p.lat, p.lon);
    const [fx, fy] = toScreen(flat, flon);
    if (Math.abs(px - fx) < f.w / 2 + p.radius &&
        Math.abs(py - fy) < f.h / 2 + p.radius) {
      p.stunTimer = 80;
      const bumpLat = p.lat - 0.005;
      const bumpLon = p.lon + (p.lon > flon ? 0.004 : -0.004);
      if (!isLand(bumpLat, bumpLon))      { p.lat = bumpLat; p.lon = bumpLon; }
      else if (!isLand(bumpLat, p.lon))   { p.lat = bumpLat; }
      else if (!isLand(p.lat, bumpLon))   { p.lon = bumpLon; }
    }
  }
}

function updatePlayer(p, up, down, left, right, dt) {
  if (p.finished) return;
  if (p.stunTimer > 0) { p.stunTimer -= dt; return; }

  // Input direction
  let ax = 0, ay = 0;
  if (keys[up])    ay = -1;
  if (keys[down])  ay =  0.4;
  if (keys[left])  ax = -1;
  if (keys[right]) ax =  1;
  const len = Math.sqrt(ax * ax + ay * ay) || 1;
  ax /= len;  ay /= len;

  // Current contribution (already in deg/tick)
  const cur = getCurrentAt(p.lat, p.lon, simTimeMs);

  // Proposed new position (world degrees)
  const dlat = -ay * PADDLE_SPEED + cur.dlat;      // screen-y up = +lat
  const dlon =  ax * PADDLE_SPEED / Math.cos(p.lat * DEG) + cur.dlon;
  const nlat = p.lat + dlat * dt;
  const nlon = p.lon + dlon * dt;

  // Land collision (slide)
  if      (!isLand(nlat, nlon)) { p.lat = nlat; p.lon = nlon; }
  else if (!isLand(nlat, p.lon)) { p.lat = nlat; }
  else if (!isLand(p.lat, nlon)) { p.lon = nlon; }

  // Emergency land escape — nudge toward spawn point if stuck in land
  if (isLand(p.lat, p.lon)) {
    const eLat = SPAWN_POINT.lat - p.lat;
    const eLon = SPAWN_POINT.lon - p.lon;
    const eDist = Math.sqrt(eLat * eLat + eLon * eLon) || 1;
    p.lat += (eLat / eDist) * 0.002;
    p.lon += (eLon / eDist) * 0.002;
  }

  // Clamp to map
  p.lat = Math.max(MAP.minLat + 0.01, Math.min(MAP.maxLat - 0.01, p.lat));
  p.lon = Math.max(MAP.minLon + 0.01, Math.min(MAP.maxLon - 0.01, p.lon));

  // Trail
  if (frameCount % 3 === 0) {
    p.trail.push({ lat: p.lat, lon: p.lon, age: 0 });
    if (p.trail.length > 80) p.trail.shift();
  }
  for (const t of p.trail) t.age++;

  // Paddle animation
  if (ax !== 0 || ay !== 0) p.paddleAngle += 0.15 * dt;

  // Finish check — must cross the line between Port Townsend and Whidbey
  if (!p.finished && p.lon >= FINISH_LINE.aLon && p.lon <= FINISH_LINE.bLon) {
    const t = (p.lon - FINISH_LINE.aLon) / (FINISH_LINE.bLon - FINISH_LINE.aLon);
    const lineLat = FINISH_LINE.aLat + t * (FINISH_LINE.bLat - FINISH_LINE.aLat);
    if (p.lat >= lineLat) {
      p.finished = true;
      p.finishTime = (Date.now() - gameStartTime) / 1000;
    }
  }

  // ── Collision with orcas (land-safe pushback) ──
  for (const o of orcas) {
    if (!o.visible) continue;
    const [px, py] = toScreen(p.lat, p.lon);
    const [ox, oy] = toScreen(o.lat, o.lon);
    if (Math.hypot(px - ox, py - oy) < o.size + p.radius + 2) {
      p.stunTimer = 50;
      const bumpLat = p.lat + (p.lat > o.lat ?  0.003 : -0.003);
      const bumpLon = p.lon + 0.002;
      if (!isLand(bumpLat, bumpLon))      { p.lat = bumpLat; p.lon = bumpLon; }
      else if (!isLand(bumpLat, p.lon))   { p.lat = bumpLat; }
      else if (!isLand(p.lat, bumpLon))   { p.lon = bumpLon; }
    }
  }

  // ── Collision with ferries (land-safe pushback) ──
  for (const f of ferries) {
    const flat = f.fromLat + (f.toLat - f.fromLat) * f.progress;
    const flon = f.fromLon + (f.toLon - f.fromLon) * f.progress;
    const [px, py] = toScreen(p.lat, p.lon);
    const [fx, fy] = toScreen(flat, flon);
    if (Math.abs(px - fx) < f.w / 2 + p.radius &&
        Math.abs(py - fy) < f.h / 2 + p.radius) {
      p.stunTimer = 80;
      const bumpLat = p.lat - 0.005;
      const bumpLon = p.lon + (p.lon > flon ? 0.004 : -0.004);
      if (!isLand(bumpLat, bumpLon))      { p.lat = bumpLat; p.lon = bumpLon; }
      else if (!isLand(bumpLat, p.lon))   { p.lat = bumpLat; }
      else if (!isLand(p.lat, bumpLon))   { p.lon = bumpLon; }
    }
  }
}

// ── Camera ──────────────────────────────────────────────────────────

function updateCamera() {
  let targetLat, targetLon, targetZoom;

  if (gameMode === 'solo' || players.length === 1) {
    targetLat = players[0].lat;
    targetLon = players[0].lon;
    targetZoom = 24;  // fixed comfortable zoom for solo
  } else {
    targetLat = (players[0].lat + players[1].lat) / 2;
    targetLon = (players[0].lon + players[1].lon) / 2;
    const sep = Math.hypot(players[0].lat - players[1].lat,
                           players[0].lon - players[1].lon);
    targetZoom = Math.max(16, Math.min(36, 0.20 / (sep + 0.001)));
  }

  camera.lat  += (targetLat - camera.lat)  * 0.06;
  camera.lon  += (targetLon - camera.lon)  * 0.06;
  camera.zoom += (targetZoom - camera.zoom) * 0.03;

  recomputeViewport();
}
