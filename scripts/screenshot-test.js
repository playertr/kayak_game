#!/usr/bin/env node
/**
 * Serve multiplayer-kayak.html on a local HTTP server, take screenshots
 * at various stages of the game, and log diagnostics.
 */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8765;
const PROJECT_DIR = path.resolve(__dirname, '..');

// Simple HTTP server so the page loads over http:// (avoids file:// CORS issues)
function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const filePath = path.resolve(PROJECT_DIR, req.url === '/' ? 'multiplayer-kayak.html' : req.url.slice(1));
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath);
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404); res.end('Not found');
      }
    });
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function main() {
  const server = await startServer();
  const errors = [];
  const consoleMessages = [];

  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1400,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('404')) errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  // 1. Load page and screenshot title screen
  console.log('\n--- STEP 1: Loading page ---');
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const ssDir = path.join(PROJECT_DIR, 'screenshots');
  await page.screenshot({ path: path.join(ssDir, 'screenshot-1-title.png'), fullPage: false });
  console.log('Saved: screenshots/screenshot-1-title.png');

  // 2. Click start and wait for game to begin
  console.log('\n--- STEP 2: Starting game ---');
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ssDir, 'screenshot-2-gamestart.png'), fullPage: false });
  console.log('Saved: screenshots/screenshot-2-gamestart.png');

  // 3. Gather game state info
  const info = await page.evaluate(() => {
    return {
      gameState,
      landPolys: LAND_POLYS.length,
      landBBoxes: landBBoxes ? landBBoxes.length : 0,
      orcaCount: orcas.length,
      ferryCount: ferries.length,
      playerCount: players.length,
      canvasW: canvas.width,
      canvasH: canvas.height,
      cameraZoom: camera.zoom.toFixed(2),
      player1: players[0] ? { lat: players[0].lat.toFixed(4), lon: players[0].lon.toFixed(4), color: players[0].color, name: players[0].name } : null,
      player2: players[1] ? { lat: players[1].lat.toFixed(4), lon: players[1].lon.toFixed(4), color: players[1].color, name: players[1].name } : null,
    };
  });
  console.log('Game info:', JSON.stringify(info, null, 2));

  // 5. Simulate some gameplay - press W key to move P1 north for 3 seconds
  console.log('\n--- STEP 3: Simulating gameplay (move north) ---');
  // Use evaluate to directly set key state, since Puppeteer keyboard.down
  // doesn't always map to e.code correctly for letter keys
  await page.evaluate(() => { keys['KeyW'] = true; });
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => { keys['KeyW'] = false; });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ssDir, 'screenshot-3-gameplay.png'), fullPage: false });
  console.log('Saved: screenshots/screenshot-3-gameplay.png');

  // Get updated positions
  const posAfter = await page.evaluate(() => {
    const result = {
      p1: { lat: players[0].lat.toFixed(4), lon: players[0].lon.toFixed(4), finished: players[0].finished },
    };
    if (players[1]) {
      result.p2 = { lat: players[1].lat.toFixed(4), lon: players[1].lon.toFixed(4), finished: players[1].finished };
    }
    return result;
  });
  console.log('Positions after movement:', JSON.stringify(posAfter));

  // 4. Let it run a bit more and take another screenshot
  console.log('\n--- STEP 4: More gameplay ---');
  await page.evaluate(() => { keys['KeyW'] = true; keys['KeyD'] = true; });
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => { keys['KeyW'] = false; keys['KeyD'] = false; });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ssDir, 'screenshot-4-midgame.png'), fullPage: false });
  console.log('Saved: screenshots/screenshot-4-midgame.png');

  // 5. Edge visibility check — force minimum zoom and check all four corners
  console.log('\n--- STEP 5: Map edge check at minimum zoom ---');
  await page.evaluate(() => {
    camera.zoom = 2.5;   // lowest allowed zoom
    recomputeViewport();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(ssDir, 'screenshot-5-minzoom.png'), fullPage: false });
  console.log('Saved: screenshots/screenshot-5-minzoom.png');

  const edgeInfo = await page.evaluate(() => {
    // Check the four corner pixels — if they map to coords outside
    // the coastline data area, we see OOB ocean.  That's fine.
    // But if all four corners are still within the map data region,
    // the map is big enough.
    const corners = [
      { name:'TL', lat: toLat(0),            lon: toLon(0)            },
      { name:'TR', lat: toLat(0),            lon: toLon(canvas.width) },
      { name:'BL', lat: toLat(canvas.height), lon: toLon(0)            },
      { name:'BR', lat: toLat(canvas.height), lon: toLon(canvas.width) },
    ];
    return {
      mapBounds: MAP,
      cameraZoom: camera.zoom.toFixed(2),
      corners: corners.map(c => ({
        name: c.name,
        lat: c.lat.toFixed(3),
        lon: c.lon.toFixed(3),
        insideMap: c.lat >= MAP.minLat && c.lat <= MAP.maxLat &&
                   c.lon >= MAP.minLon && c.lon <= MAP.maxLon,
      })),
    };
  });
  console.log('Edge check:', JSON.stringify(edgeInfo, null, 2));

  // Summary
  console.log('\n=== RESULTS ===');
  console.log('Errors:', errors.length === 0 ? 'None ✅' : errors);
  console.log('Console messages:', consoleMessages.length);
  console.log('Screenshots saved to screenshots/');
  
  if (errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    errors.forEach(e => console.log('  ', e));
  } else {
    console.log('\n✅ No errors detected');
  }

  await browser.close();
  server.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
