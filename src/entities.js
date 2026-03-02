// ====================================================================
// ENTITIES — Players, orcas, ferries
// ====================================================================

const FERRY_ROUTES = [
  { name:'Pt Defiance–Tahlequah', from:[47.306,-122.530], to:[47.338,-122.507] },
  { name:'Fauntleroy–Vashon',     from:[47.523,-122.397], to:[47.508,-122.462] },
  { name:'Southworth–Vashon',     from:[47.513,-122.530], to:[47.508,-122.462] },
  { name:'Seattle–Bainbridge',    from:[47.603,-122.338], to:[47.623,-122.498] },
  { name:'Edmonds–Kingston',      from:[47.814,-122.388], to:[47.798,-122.498] },
  { name:'Mukilteo–Clinton',      from:[47.850,-122.365], to:[47.978,-122.358] },
  { name:'PT–Coupeville',         from:[48.115,-122.758], to:[48.160,-122.698] },
];

// ── Players ─────────────────────────────────────────────────────────

function createPlayer(lat, lon, color, name, isDouble) {
  return {
    lat, lon,
    color, name,
    isDouble:    !!isDouble,     // true = double kayak (solo mode)
    radius:      7,              // screen pixels (fixed regardless of zoom)
    finished:    false,
    finishTime:  null,
    stunTimer:   0,
    trail:       [],             // [{lat, lon, age}]
    paddleAngle: 0,
  };
}

// Deterministic spawn point — open water just north of Commencement Bay.
// Verified against the full OSM coastline dataset.  No randomness, no spiral.
const SPAWN_POINT = { lat: 47.290, lon: -122.460 };

function initPlayers() {
  if (gameMode === 'solo') {
    players = [
      createPlayer(SPAWN_POINT.lat, SPAWN_POINT.lon, '#00e5ff', 'Tim & Madelyn', true),
    ];
  } else {
    // Offset the two kayaks slightly east/west (≈ 0.006° ≈ 500 m)
    players = [
      createPlayer(SPAWN_POINT.lat, SPAWN_POINT.lon - 0.003, '#00e5ff', 'Tim', false),
      createPlayer(SPAWN_POINT.lat, SPAWN_POINT.lon + 0.003, '#ff8c00', 'Madelyn', false),
    ];
  }
}

// ── Obstacles ───────────────────────────────────────────────────────

function generateObstacles() {
  // Ferries — one per WSF route
  ferries = [];
  for (const r of FERRY_ROUTES) {
    ferries.push({
      fromLat: r.from[0], fromLon: r.from[1],
      toLat:   r.to[0],   toLon:   r.to[1],
      progress: Math.random(),
      speed:    FERRY_SPEED_MIN + Math.random() * (FERRY_SPEED_MAX - FERRY_SPEED_MIN),
      dir:      Math.random() < 0.5 ? 1 : -1,
      w: 32 + Math.random() * 18,
      h: 10 + Math.random() * 5,
      route: r.name,
    });
  }

  // Orcas — scatter in water along the race corridor
  orcas = [];
  let placed = 0, tries = 0;
  while (placed < NUM_ORCAS && tries < NUM_ORCAS * 600) {
    tries++;
    const lat = 47.20 + Math.random() * 1.00;  // Tacoma → Port Townsend corridor
    const lon = -122.80 + Math.random() * 0.55;
    if (!isLand(lat, lon)) {
      const spd = ORCA_SPEED_MIN + Math.random() * (ORCA_SPEED_MAX - ORCA_SPEED_MIN);
      orcas.push({
        lat, lon,
        vlat: (Math.random() - 0.5) * spd,
        vlon: (Math.random() < 0.5 ? -1 : 1) * spd,
        size:      7 + Math.random() * 5,
        phase:     Math.random() * Math.PI * 2,
        diveTimer: Math.random() * 300,
        visible:   true,
      });
      placed++;
    }
  }
}
