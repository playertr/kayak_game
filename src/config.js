// ====================================================================
// CONFIGURATION — Game constants and map bounds
// ====================================================================

const MAP = { minLat: 45.50, maxLat: 49.50, minLon: -125.50, maxLon: -121.00 };

// Game mode: 'solo' (one double kayak) or 'multi' (two single kayaks)
var gameMode = 'solo';

const RACE_START  = new Date('2026-05-29T19:00:00');
const TIME_ACCEL  = 1200;  // 1 real-second ≈ 20 game-minutes

// Start line: Tacoma waterfront
const START_LINE = {
  aLat: 47.282, aLon: -122.50,
  bLat: 47.282, bLon: -122.42,
};

// Finish line: Port Townsend ↔ Whidbey Island (Keystone/Ft Casey)
const FINISH_LINE = {
  aLat: 48.115, aLon: -122.76,   // Port Townsend
  bLat: 48.165, bLon: -122.675,  // Whidbey Island (Keystone)
};

// Movement calibration -----------------------------------------------
// Speeds are in degrees-per-tick (1 tick ≈ 16.67 ms at 60 fps).
// PX_TO_DEG converts a legacy "pixels at 800 px viewport" value.
const PX_TO_DEG = (MAP.maxLat - MAP.minLat) / 800;

const PADDLE_SPEED   = 0.14 * PX_TO_DEG;            // deg / tick
const MAX_CURRENT    = 0.99 * PADDLE_SPEED;          // tidal-current cap
const ORCA_SPEED_MIN = 0.025 * PX_TO_DEG;
const ORCA_SPEED_MAX = 0.06 * PX_TO_DEG;
const NUM_ORCAS      = 80;
const FERRY_SPEED_MIN = 0.0006;
const FERRY_SPEED_MAX = 0.0012;
