/** Self-contained public Regime Tape page. No session, no build step. */
export const REGIME_TAPE_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Money Line Regime Tape - Money Scanner</title>
<meta name="description" content="Public, durable ledger of every Money Line market-regime transition, with forward outcomes. Market-regime analytics, not investment advice.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b1120; color: #e2e8f0; font: 15px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 32px 0 10px; color: #93c5fd; }
  .sub { color: #94a3b8; margin: 0 0 20px; }
  .card { background: #111a2e; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #1e293b; white-space: nowrap; }
  th { color: #94a3b8; font-weight: 600; }
  .tier-StrongBullish { color: #10b981; font-weight: 600; }
  .tier-Bullish { color: #34d399; }
  .tier-Neutral { color: #94a3b8; }
  .tier-Bearish { color: #f87171; }
  .tier-StrongBearish { color: #ef4444; font-weight: 600; }
  .pos { color: #34d399; } .neg { color: #f87171; } .muted { color: #64748b; }
  .scroll { overflow-x: auto; }
  input, select, button { font: inherit; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; padding: 9px 12px; }
  button { background: #2563eb; border: none; cursor: pointer; font-weight: 600; }
  button:hover { background: #1d4ed8; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .warn { background: #1c1530; border: 1px solid #4c1d95; border-radius: 10px; padding: 14px 16px; color: #c4b5fd; font-size: 13.5px; }
  code { background: #0f172a; padding: 1px 6px; border-radius: 6px; font-size: 12.5px; }
  pre { white-space: pre-wrap; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; font-size: 12.5px; }
  #wlmsg { font-size: 13.5px; }
</style>
</head>
<body>
<main>
  <h1>Money Line Regime Tape</h1>
  <p class="sub">Every regime transition the Money Line engine records on closed daily and weekly candles - kept permanently, including the ones that lose. With 1d / 7d / 30d forward outcomes.</p>

  <div class="warn"><strong>Risk warning.</strong> This page is market-regime analytics computed from public market data. It is not investment advice and not a recommendation to buy or sell any asset. A "Bullish" regime reading describes indicator state on a closed candle; it does not predict that the price will rise. Past transitions do not guarantee future results.</div>

  <h2>Latest scan</h2>
  <div class="card" id="scan">Loading...</div>

  <h2>Tape</h2>
  <div class="row" style="margin-bottom:8px">
    <select id="ftf"><option value="">All timeframes</option><option value="1d">Daily</option><option value="1w">Weekly</option></select>
    <input id="fsym" placeholder="Symbol (e.g. BTC)" style="width:160px">
    <button onclick="loadEvents()">Filter</button>
  </div>
  <div class="card scroll"><table>
    <thead><tr><th>Asset</th><th>TF</th><th>Transition</th><th>Score</th><th>Close (UTC)</th><th>Price at flip</th><th>1d</th><th>7d</th><th>30d</th></tr></thead>
    <tbody id="events"><tr><td colspan="9" class="muted">Loading...</td></tr></tbody>
  </table></div>

  <h2>Daily X preview (manual review)</h2>
  <div class="card"><pre id="xpreview">Loading...</pre><button onclick="copyPreview()">Copy</button></div>

  <h2>Get the digest</h2>
  <div class="card">
    <p class="sub" style="margin:0 0 10px">Free daily regime digest and launch updates. No payments are being collected today. Optionally tell us what you would consider paying for Pro alerts - this only shapes pricing research.</p>
    <div class="row">
      <input id="wlemail" type="email" placeholder="you@example.com" style="flex:1;min-width:220px">
      <select id="wlprice"><option value="">Just notify me</option><option value="19">I'd consider 19 EUR/mo</option><option value="39">I'd consider 39 EUR/mo</option></select>
      <button onclick="joinWaitlist()">Join waitlist</button>
    </div>
    <p id="wlmsg" class="muted"></p>
  </div>

  <h2>Methodology</h2>
  <div class="card" style="font-size:13.5px">
    <p><strong>Money Line</strong> is a deterministic, non-repainting composite score from -100 to +100 computed only on closed candles: EMA alignment 25%, EMA20 slope 15%, ROC(9/21) 15%, MACD(12/26/9) 15%, RSI(14) 15%, RVOL(20) 10%, ATR(14) volatility regime 5%. Tiers: Strong Bullish >= +60, Bullish >= +20, Neutral -20..+20, Bearish <= -20, Strong Bearish <= -60.</p>
    <p>A tape event is recorded when the tier on the latest closed candle differs from the previous closed candle. Universe: top liquid crypto assets by market cap plus the tracked stock/ETF and metals list. Sources: Binance / Hyperliquid public candles (crypto), Yahoo Finance public chart API (stocks, ETFs, metals). Method version <code id="mver"></code>, tape version <code id="tver"></code>.</p>
    <p>Coverage and scan errors are published in "Latest scan" so gaps in the record are visible. Outcomes measure the simple price return from the transition close price after 1, 7 and 30 days; they are statistics, not trade results.</p>
    <p class="muted">Operator: Money Scanner (scanner.relayhub.no). The operator may hold or trade assets shown on this tape. Contact via the dashboard.</p>
  </div>
</main>
<script>
const fmtPct = v => v == null ? '<span class="muted">-</span>' : '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</span>';
const tierCls = t => 'tier-' + t.replace(/ /g, '');
async function loadSummary() {
  const s = await (await fetch('/api/tape/summary')).json();
  document.getElementById('mver').textContent = (s.latestScan && s.latestScan.methodVersion) || '-';
  document.getElementById('tver').textContent = s.tapeVersion;
  const sc = s.latestScan;
  document.getElementById('scan').innerHTML = sc
    ? 'Scan <code>' + sc.id + '</code> - status <strong>' + sc.status + '</strong> - universe ' + sc.universeSize + ' assets, scanned ' + sc.scanned + ', errors ' + sc.errors + ', new transitions ' + sc.newEvents + ', outcomes updated ' + sc.outcomesUpdated + '<br><span class="muted">Completed ' + (sc.completedAt ? new Date(sc.completedAt).toISOString() : 'in progress') + '</span>'
    : 'No scan recorded yet. The first tape scan populates this panel.';
}
async function loadEvents() {
  const tf = document.getElementById('ftf').value;
  const sym = document.getElementById('fsym').value.trim();
  let url = '/api/tape/events?limit=200';
  if (tf) url += '&timeframe=' + encodeURIComponent(tf);
  if (sym) url += '&symbol=' + encodeURIComponent(sym);
  const d = await (await fetch(url)).json();
  const rows = d.events.map(e => '<tr><td><strong>' + e.symbol + '</strong> <span class="muted">' + (e.name || '') + '</span></td><td>' + e.timeframe + '</td><td><span class="' + tierCls(e.previousTier) + '">' + e.previousTier + '</span> &rarr; <span class="' + tierCls(e.tier) + '">' + e.tier + '</span></td><td>' + e.previousScore + ' &rarr; ' + e.score + '</td><td>' + new Date(e.candleCloseTime).toISOString().slice(0, 10) + '</td><td>' + (e.transitionPrice || '-') + '</td><td>' + fmtPct(e.outcomes && e.outcomes.d1 && e.outcomes.d1.returnPct) + '</td><td>' + fmtPct(e.outcomes && e.outcomes.d7 && e.outcomes.d7.returnPct) + '</td><td>' + fmtPct(e.outcomes && e.outcomes.d30 && e.outcomes.d30.returnPct) + '</td></tr>');
  document.getElementById('events').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="9" class="muted">No transitions recorded yet. New regime flips appear here after the next daily scan.</td></tr>';
}
async function loadPreview() {
  const d = await (await fetch('/api/tape/x-preview')).json();
  document.getElementById('xpreview').textContent = d.text || 'No preview yet - the first scan has not run.';
}
function copyPreview() {
  navigator.clipboard.writeText(document.getElementById('xpreview').textContent).then(() => { event.target.textContent = 'Copied'; setTimeout(() => event.target.textContent = 'Copy', 1500); });
}
async function joinWaitlist() {
  const email = document.getElementById('wlemail').value.trim();
  const pricePointEur = parseInt(document.getElementById('wlprice').value, 10);
  const msg = document.getElementById('wlmsg');
  try {
    const r = await fetch('/api/tape/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, source: 'tape-page', pricePointEur: Number.isFinite(pricePointEur) ? pricePointEur : undefined }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    msg.textContent = (d.added ? 'You are on the list.' : 'Already registered.') + ' Total signups: ' + d.total;
  } catch (e) { msg.textContent = 'Could not save that email: ' + e.message; }
}
loadSummary(); loadEvents(); loadPreview();
</script>
</body>
</html>`;
