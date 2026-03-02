// ====================================================================
// Google Apps Script — Leaderboard backend for Multiplayer Kayak Game
// ====================================================================
//
// SETUP:
//   1. Create a new Google Sheet.
//   2. In row 1, add headers: Name | RealTime | GameTime | Date
//      (or import leaderboard-header.csv)
//   3. Open Extensions → Apps Script, paste this file as Code.gs.
//   4. Deploy → New deployment → Web app:
//        - Execute as: Me
//        - Who has access: Anyone
//   5. Copy the Web App URL and paste it into src/leaderboard.js as
//      LEADERBOARD_URL.
//
// ENDPOINTS:
//   GET  → returns { scores: [...] } sorted by RealTime ascending
//   POST → appends a row; body: { name, realTime, gameTime }
// ====================================================================

function doGet(e) {
  return withCORS(getScores);
}

function doPost(e) {
  return withCORS(function() {
    return postScore(e);
  });
}

// ── GET: read all scores ────────────────────────────────────────────

function getScores() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data  = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return makeJSON({ scores: [] });
  }

  var scores = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    scores.push({
      name:     String(row[0]),
      realTime: parseFloat(row[1]),
      gameTime: String(row[2]),
      date:     String(row[3])
    });
  }

  // Sort by realTime ascending (fastest first)
  scores.sort(function(a, b) { return a.realTime - b.realTime; });

  return makeJSON({ scores: scores });
}

// ── POST: add a new score ───────────────────────────────────────────

function postScore(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return makeJSON({ error: 'Invalid JSON' }, 400);
  }

  var name     = String(body.name || 'Anonymous').substring(0, 40);
  var realTime = parseFloat(body.realTime);
  var gameTime = String(body.gameTime || '');
  var date     = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (isNaN(realTime) || realTime <= 0) {
    return makeJSON({ error: 'Invalid realTime' }, 400);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([name, realTime, gameTime, date]);

  return makeJSON({ ok: true });
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeJSON(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function withCORS(fn) {
  // Apps Script handles CORS for deployed web apps automatically.
  // This wrapper is here for clarity; no manual CORS headers needed.
  return fn();
}
