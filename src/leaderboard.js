// ====================================================================
// LEADERBOARD — Fetch scores from Google Sheets, display overlay,
//               prompt for name and submit
// ====================================================================

// ── CONFIGURATION ───────────────────────────────────────────────────
// Replace this URL with your deployed Apps Script web app URL.
// See scripts/apps-script/Code.gs for setup instructions.
const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbwjf8LaP731MSRZpcnb7-C_fFuo8O7nvZdtBvtyPmLnxNVOTUH3-LiPMHJBZM0104YE/exec';   // e.g. 'https://script.google.com/macros/s/XXXX/exec'

// ── Formatting helpers ──────────────────────────────────────────────

function formatRealTime(seconds) {
  // mm:ss.cc
  if (!seconds || seconds <= 0) return 'DNF';
  const m  = Math.floor(seconds / 60);
  const s  = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

function formatGameWorldTime(realSeconds) {
  // Convert real seconds → game-world elapsed, then d/h/m/s
  if (!realSeconds || realSeconds <= 0) return '—';
  const gameSeconds = realSeconds * TIME_ACCEL;
  const d = Math.floor(gameSeconds / 86400);
  const h = Math.floor((gameSeconds % 86400) / 3600);
  const m = Math.floor((gameSeconds % 3600) / 60);
  const s = Math.floor(gameSeconds % 60);
  let parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0 || d > 0) parts.push(h + 'h');
  parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

// ── Leaderboard logic ───────────────────────────────────────────────

async function fetchLeaderboard() {
  if (!LEADERBOARD_URL) return [];
  try {
    const resp = await fetch(LEADERBOARD_URL);
    if (!resp.ok) throw new Error(resp.status);
    const data = await resp.json();
    return data.scores || [];
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
    return [];
  }
}

async function submitScore(name, realTime, gameTime) {
  if (!LEADERBOARD_URL) return false;
  try {
    const resp = await fetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ name, realTime, gameTime }),
    });
    return resp.ok;
  } catch (e) {
    console.warn('Leaderboard submit failed:', e);
    return false;
  }
}

// ── UI helpers ──────────────────────────────────────────────────────

function buildLeaderboardHTML(scores, currentRealTime) {
  const top10 = scores.slice(0, 10);
  let rank = -1;
  if (currentRealTime && currentRealTime > 0) {
    rank = scores.findIndex(s => currentRealTime <= s.realTime);
    if (rank === -1) rank = scores.length; // would be last
  }

  let html = '<table class="lb-table">';
  html += '<tr><th>#</th><th>Name</th><th>Real Time</th><th>Game Time</th><th>Date</th></tr>';

  // If current run would rank in top 10, highlight it
  let inserted = false;
  let shown = 0;
  for (let i = 0; i < top10.length && shown < 10; i++) {
    if (!inserted && rank === i && currentRealTime > 0) {
      html += `<tr class="lb-you"><td>${i + 1}</td><td>➤ YOU</td>`;
      html += `<td>${formatRealTime(currentRealTime)}</td>`;
      html += `<td>${formatGameWorldTime(currentRealTime)}</td>`;
      html += `<td>now</td></tr>`;
      inserted = true;
      shown++;
      if (shown >= 10) break;
    }
    html += `<tr><td>${inserted ? i + 2 : i + 1}</td>`;
    html += `<td>${escHTML(top10[i].name)}</td>`;
    html += `<td>${formatRealTime(top10[i].realTime)}</td>`;
    html += `<td>${top10[i].gameTime}</td>`;
    html += `<td>${top10[i].date}</td></tr>`;
    shown++;
  }
  // If not inserted yet and room remains
  if (!inserted && shown < 10 && currentRealTime > 0) {
    html += `<tr class="lb-you"><td>${shown + 1}</td><td>➤ YOU</td>`;
    html += `<td>${formatRealTime(currentRealTime)}</td>`;
    html += `<td>${formatGameWorldTime(currentRealTime)}</td>`;
    html += `<td>now</td></tr>`;
  }

  html += '</table>';

  if (rank >= 0 && rank < scores.length) {
    html += `<div class="lb-rank">You'd be #${rank + 1} of ${scores.length} runs!</div>`;
  } else if (scores.length > 0 && currentRealTime > 0) {
    html += `<div class="lb-rank">You'd be #${scores.length + 1} of ${scores.length} runs</div>`;
  }

  return html;
}

function escHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Main entry: called from endGame() ───────────────────────────────

async function showLeaderboard(realTime) {
  const lbDiv = document.getElementById('leaderboard');
  const lbPrompt = document.getElementById('lb-prompt');
  if (!LEADERBOARD_URL) {
    lbDiv.innerHTML = '<div style="color:#667;font-size:13px">Leaderboard not configured (no LEADERBOARD_URL set).</div>';
    lbPrompt.style.display = 'none';
    return;
  }

  lbDiv.innerHTML = '<div style="color:#667">Loading leaderboard…</div>';

  const scores = await fetchLeaderboard();
  lbDiv.innerHTML = buildLeaderboardHTML(scores, realTime);

  // Show submit prompt only if player finished
  if (realTime && realTime > 0) {
    lbPrompt.style.display = 'block';
    const btn = document.getElementById('lb-submit-btn');
    const nameInput = document.getElementById('lb-name');
    btn.onclick = async () => {
      const name = nameInput.value.trim() || 'Anonymous';
      const gameTime = formatGameWorldTime(realTime);
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      const ok = await submitScore(name, parseFloat(realTime.toFixed(2)), gameTime);
      if (ok) {
        btn.textContent = '✓ Submitted!';
        // Refresh leaderboard
        const updated = await fetchLeaderboard();
        lbDiv.innerHTML = buildLeaderboardHTML(updated, realTime);
      } else {
        btn.textContent = 'Failed — try again';
        btn.disabled = false;
      }
    };
  } else {
    lbPrompt.style.display = 'none';
  }
}
