// ====================================================================
// GAME — Canvas init, input handling, lifecycle, boot
// ====================================================================

// Canvas elements (must exist in the DOM already via shell.html)
const canvas    = document.getElementById('game');
const ctx       = canvas.getContext('2d');
const tideCanvas = document.getElementById('tide-chart');
const tideCtx   = tideCanvas.getContext('2d');

// Mutable game state
var gameState   = 'title';
let gameStartTime = 0;
let simTimeMs   = RACE_START.getTime();
let players     = [];
let orcas       = [];
let ferries     = [];
let frameCount  = 0;
let lastTS      = 0;

// Joystick state (populated by nipplejs on mobile)
const joystickInput = { active: false, x: 0, y: 0 };
let joystickManager = null;

// ── Mode selection ──────────────────────────────────────────────────

function selectMode(mode) {
  gameMode = mode;
  document.getElementById('mode-solo').classList.toggle('active', mode === 'solo');
  document.getElementById('mode-multi').classList.toggle('active', mode === 'multi');
  document.getElementById('controls-solo').style.display  = mode === 'solo'  ? 'flex' : 'none';
  document.getElementById('controls-multi').style.display = mode === 'multi' ? 'flex' : 'none';
}

// ── Input ───────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (gameState === 'playing') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Touch joystick (nipplejs) ───────────────────────────────────────

function initJoystick() {
  // Only show on touch devices
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouchDevice || typeof nipplejs === 'undefined') return;

  const zone = document.getElementById('joystick-zone');
  zone.style.display = 'block';

  joystickManager = nipplejs.create({
    zone: zone,
    mode: 'static',
    color: 'rgba(0, 229, 255, 0.35)',
    size: 120,
    position: { left: '50%', top: '50%' },
    dynamicPage: true,
  });

  joystickManager.on('move', (evt, data) => {
    if (!data || !data.vector) return;
    joystickInput.active = true;
    joystickInput.x =  data.vector.x;  // -1 left, +1 right
    joystickInput.y = -data.vector.y;   // nipple: up is +y, we want up=-1
  });

  joystickManager.on('end', () => {
    joystickInput.active = false;
    joystickInput.x = 0;
    joystickInput.y = 0;
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────

function startGame() {
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('tide-chart-container').style.display = 'block';

  // Adjust HUD for mode
  if (gameMode === 'solo') {
    document.getElementById('hud-p1').innerHTML =
      '<span class="p1c"><span class="kayak-icon"></span> Tim &amp; Madelyn</span>: <span id="p1-progress">0%</span>';
    document.getElementById('hud-p2').style.display = 'none';
  } else {
    document.getElementById('hud-p2').style.display = '';
  }

  // Snap camera to the start so the first frame isn't at the overview zoom
  camera.lat  = 47.282;
  camera.lon  = -122.455;
  camera.zoom = gameMode === 'solo' ? 24 : 20;

  initPlayers();
  generateObstacles();
  initJoystick();

  gameState     = 'playing';
  gameStartTime = Date.now();
  lastTS        = performance.now();
  requestAnimationFrame(gameLoop);
}

function endGame() {
  if (gameState === 'finished') return;
  gameState = 'finished';
  document.getElementById('finish-screen').style.display = 'flex';
  document.getElementById('hud').style.display = 'none';

  // Hide joystick
  const zone = document.getElementById('joystick-zone');
  zone.style.display = 'none';
  if (joystickManager) { joystickManager.destroy(); joystickManager = null; }

  let bestFinishTime = null;

  if (gameMode === 'solo') {
    const p = players[0];
    const rt = p.finishTime ? formatRealTime(p.finishTime) : 'DNF';
    const gt = p.finishTime ? formatGameWorldTime(p.finishTime) : '—';
    document.getElementById('winner-text').innerHTML =
      '<span class="p1c">🏁 Tim &amp; Madelyn finished!</span>';
    document.getElementById('finish-times').innerHTML =
      `Real time: ${rt}\nGame-world time: ${gt}`;
    bestFinishTime = p.finishTime || null;
  } else {
    const [p1, p2] = players;
    let wh;
    if (p1.finishTime && p2.finishTime) {
      wh = p1.finishTime < p2.finishTime
        ? '<span class="p1c">🏆 Tim wins!</span>'
        : '<span class="p2c">🏆 Madelyn wins!</span>';
    } else if (p1.finishTime) {
      wh = '<span class="p1c">🏆 Tim wins!</span>';
    } else if (p2.finishTime) {
      wh = '<span class="p2c">🏆 Madelyn wins!</span>';
    } else {
      wh = 'Neither player finished!';
    }
    document.getElementById('winner-text').innerHTML = wh;

    const rt1 = p1.finishTime ? formatRealTime(p1.finishTime) : 'DNF';
    const rt2 = p2.finishTime ? formatRealTime(p2.finishTime) : 'DNF';
    const gt1 = p1.finishTime ? formatGameWorldTime(p1.finishTime) : '—';
    const gt2 = p2.finishTime ? formatGameWorldTime(p2.finishTime) : '—';
    document.getElementById('finish-times').innerHTML =
      `Tim: ${rt1} (${gt1})  |  Madelyn: ${rt2} (${gt2})`;
    bestFinishTime = Math.min(
      p1.finishTime || Infinity, p2.finishTime || Infinity
    );
    if (bestFinishTime === Infinity) bestFinishTime = null;
  }

  // Fetch and display leaderboard
  showLeaderboard(bestFinishTime);
}

function gameLoop(ts) {
  if (gameState !== 'playing') return;
  const dt = Math.min((ts - lastTS) / 16.67, 3);
  lastTS = ts;
  frameCount++;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// ── Boot ────────────────────────────────────────────────────────────

resize();
window.addEventListener('resize', resize);
initLandBounds();

// Tides are hard-coded — no fetch needed
document.getElementById('start-btn').disabled = false;
document.getElementById('tide-status').style.display = 'none';
