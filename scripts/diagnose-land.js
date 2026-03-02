#!/usr/bin/env node
// Quick land-collision diagnostic — runs in headless Chrome
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8769;
const DIR = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  const fp = path.join(DIR, req.url === '/' ? 'multiplayer-kayak.html' : req.url.slice(1));
  if (fs.existsSync(fp)) { res.writeHead(200); fs.createReadStream(fp).pipe(res); }
  else { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    initLandBounds();
    const tests = [
      [47.282, -122.45,  'NEW Start P1'],
      [47.282, -122.46,  'NEW Start P2'],
      [47.275, -122.47,  'OLD Start P1'],
      [47.275, -122.48,  'OLD Start P2'],
      [47.28,  -122.47,  'Slightly N of old'],
      [47.275, -122.45,  'East in bay'],
      [47.30,  -122.48,  'Narrows area'],
      [47.60,  -122.40,  'Seattle waterfront'],
    ];
    return tests.map(([lat, lon, label]) => ({
      label, lat, lon, land: isLand(lat, lon),
    }));
  });

  console.log('\n=== isLand() diagnostics ===');
  for (const r of result) {
    console.log(`  ${r.land ? '🟫 LAND' : '🟦 WATER'}  (${r.lat}, ${r.lon})  ${r.label}`);
  }

  if (errors.length) console.log('\nPage errors:', errors);
  await browser.close();
  server.close();
})();
