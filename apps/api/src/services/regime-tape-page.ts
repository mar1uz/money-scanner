/** Self-contained public Regime Tape page. No session, no build step. */
export const REGIME_TAPE_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Money Scanner Performance Tape</title>
<meta name="description" content="Selected, verified Money Scanner performance evidence after the signal.">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Quicksand:wght@500;600;700&display=swap');
  :root {
    color-scheme: dark;
    --bg: #0B0D10; --surface: #12151A; --surface-2: #171B21; --surface-3: #1C2129;
    --line: #232A35; --line-strong: #323B49; --text: #F2F5F7; --muted: #84909F;
    --lime: #C8F169; --lime-soft: rgba(200,241,105,.11); --red: #FF6B8A;
    --red-soft: rgba(255,107,138,.11); --blue: #6FC7FF; --radius: 16px;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 500 15px/1.55 Quicksand, sans-serif; }
  body:before { content: ''; position: fixed; inset: 0; pointer-events: none; background: radial-gradient(circle at 78% 0%, rgba(200,241,105,.07), transparent 28%), linear-gradient(rgba(255,255,255,.014) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.014) 1px, transparent 1px); background-size: auto, 48px 48px, 48px 48px; mask-image: linear-gradient(to bottom, black, transparent 55%); }
  .shell { position: relative; width: min(1180px, 100%); margin: 0 auto; padding: 0 24px 80px; }
  .topbar { height: 72px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 11px; color: var(--text); text-decoration: none; font-weight: 700; letter-spacing: .03em; }
  .mark { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid rgba(200,241,105,.35); border-radius: 9px; background: var(--lime-soft); color: var(--lime); font: 700 14px/1 'JetBrains Mono'; }
  .brand small { color: var(--muted); font: 500 10px/1 'JetBrains Mono'; letter-spacing: .15em; display: block; margin-top: 3px; }
  .live { display: flex; align-items: center; gap: 8px; color: var(--muted); font: 600 11px/1 'JetBrains Mono'; text-transform: uppercase; letter-spacing: .1em; }
  .proof-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .proof-card { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 22px; min-height: 230px; }
  .proof-card:before { content:''; position:absolute; inset:0 0 auto; height:3px; background:var(--lime); }
  .proof-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .proof-symbol { font:700 22px 'JetBrains Mono'; }
  .proof-name,.proof-meta { color:var(--muted); font-size:11px; }
  .proof-return { color:var(--lime); font:700 38px/1 'JetBrains Mono'; margin:32px 0 8px; letter-spacing:-.05em; }
  .proof-label { color:var(--muted); font:600 10px 'JetBrains Mono'; text-transform:uppercase; letter-spacing:.08em; }
  .proof-facts { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding-top:18px; margin-top:18px; border-top:1px solid var(--line); }
  .proof-facts label { display:block; color:var(--muted); font:600 9px 'JetBrains Mono'; text-transform:uppercase; margin-bottom:4px; }
  .proof-facts span { font:600 11px 'JetBrains Mono'; }
  .boundary { margin:14px 0 0; color:var(--muted); font-size:12px; }
  .boundary strong { color:var(--text); }
  .live:before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 0 5px rgba(200,241,105,.08), 0 0 14px rgba(200,241,105,.45); }
  .hero { padding: 76px 0 44px; display: grid; grid-template-columns: minmax(0,1fr) 360px; gap: 56px; align-items: end; }
  .hero-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
  .cta { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 18px; border-radius:10px; border:1px solid var(--lime); background:var(--lime); color:#071006; font:700 11px 'JetBrains Mono'; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; }
  .cta.secondary { background:transparent; color:var(--text); border-color:var(--line); }
  .trust-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
  .trust-pill { padding:7px 10px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font:600 9px 'JetBrains Mono'; letter-spacing:.06em; text-transform:uppercase; }
  .eyebrow { color: var(--lime); font: 600 11px/1 'JetBrains Mono'; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 18px; }
  h1 { font-size: clamp(40px, 6vw, 72px); line-height: .98; letter-spacing: -.045em; margin: 0; max-width: 750px; }
  h1 span { color: var(--lime); }
  .sub { color: var(--muted); margin: 22px 0 0; max-width: 670px; font-size: 17px; line-height: 1.65; }
  .hero-note { border-left: 1px solid var(--line-strong); padding-left: 24px; color: var(--muted); font-size: 13px; }
  .hero-note strong { color: var(--text); display: block; font: 600 13px/1.4 'JetBrains Mono'; margin-bottom: 8px; }
  .stats { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: rgba(18,21,26,.8); margin-bottom: 64px; }
  .stat { padding: 22px; border-right: 1px solid var(--line); min-height: 112px; }
  .stat:last-child { border: 0; }
  .stat-label { color: var(--muted); font: 600 10px/1 'JetBrains Mono'; text-transform: uppercase; letter-spacing: .12em; }
  .stat-value { margin-top: 13px; font: 600 24px/1 'JetBrains Mono'; }
  .stat-meta { color: var(--muted); font-size: 11px; margin-top: 9px; }
  .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
  h2 { font-size: 26px; letter-spacing: -.025em; margin: 0; }
  .section-kicker { color: var(--muted); font: 500 11px/1.4 'JetBrains Mono'; }
  .filters { position: sticky; top: 10px; z-index: 4; display: grid; grid-template-columns: 1fr 180px auto; gap: 10px; padding: 10px; margin-bottom: 14px; border: 1px solid var(--line); border-radius: 14px; background: rgba(18,21,26,.94); backdrop-filter: blur(16px); }
  input, select, button { min-height: 44px; font: 600 13px Quicksand, sans-serif; border-radius: 9px; border: 1px solid var(--line-strong); background: var(--bg); color: var(--text); padding: 0 14px; outline: none; }
  input:focus, select:focus { border-color: var(--lime); box-shadow: 0 0 0 3px rgba(200,241,105,.08); }
  button { background: var(--lime); color: #10130C; border-color: var(--lime); cursor: pointer; font-weight: 700; padding-inline: 22px; }
  button:hover { filter: brightness(1.06); }
  .table-shell { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { color: var(--muted); font: 600 10px/1 'JetBrains Mono'; text-transform: uppercase; letter-spacing: .08em; background: var(--surface-2); }
  th, td { text-align: left; padding: 15px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: rgba(255,255,255,.018); }
  .asset { min-width: 190px; }
  .asset strong { font: 700 14px 'JetBrains Mono'; }
  .asset-name { display: block; color: var(--muted); font-size: 11px; overflow: hidden; max-width: 190px; text-overflow: ellipsis; }
  .tf { color: var(--blue); font: 600 11px 'JetBrains Mono'; text-transform: uppercase; }
  .transition { display: flex; align-items: center; gap: 8px; }
  .arrow { color: var(--muted); }
  .tier { display: inline-flex; align-items: center; min-height: 24px; padding: 0 8px; border-radius: 6px; font: 600 10px 'JetBrains Mono'; }
  .tier-StrongBullish,.tier-Bullish { color: var(--lime); background: var(--lime-soft); }
  .tier-StrongBearish,.tier-Bearish { color: var(--red); background: var(--red-soft); }
  .tier-Neutral { color: #B2BAC5; background: rgba(178,186,197,.09); }
  .mono { font-family: 'JetBrains Mono'; font-size: 12px; }
  .pos { color: var(--lime); } .neg { color: var(--red); } .muted { color: var(--muted); }
  .mobile-list { display: none; }
  .result-count { color: var(--muted); font: 500 11px 'JetBrains Mono'; padding: 13px 2px 0; }
  .lower-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 64px; }
  .panel { border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); padding: 24px; }
  .panel h3 { margin: 0 0 9px; font-size: 19px; }
  .panel p { color: var(--muted); margin: 0 0 18px; font-size: 13px; }
  .digest-form { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  #wlprice { grid-column: 1/-1; }
  #wlmsg { min-height: 20px; margin: 10px 0 0; }
  details { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 18px; }
  summary { cursor: pointer; color: var(--muted); font: 600 11px 'JetBrains Mono'; text-transform: uppercase; letter-spacing: .08em; }
  pre { white-space: pre-wrap; color: var(--muted); margin: 14px 0; font: 500 11px/1.65 'JetBrains Mono'; }
  .method { margin-top: 18px; }
  .method p { color: var(--muted); font-size: 12px; }
  .method strong { color: var(--text); }
  code { color: var(--lime); font: 500 11px 'JetBrains Mono'; }
  .footer { border-top: 1px solid var(--line); margin-top: 64px; padding-top: 22px; color: var(--muted); display: flex; justify-content: space-between; gap: 20px; font-size: 11px; }
  @media (max-width: 780px) {
    .shell { padding: 0 16px calc(48px + env(safe-area-inset-bottom)); }
    .topbar { height: 62px; }
    .hero { padding: 48px 0 30px; display: block; }
    h1 { font-size: clamp(39px, 12vw, 52px); }
    .sub { font-size: 15px; margin-top: 18px; }
    .hero-note { display: none; }
    .stats { grid-template-columns: repeat(2,1fr); margin-bottom: 50px; }
    .stat { min-height: 96px; padding: 17px; }
    .stat:nth-child(2) { border-right: 0; }
    .stat:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .stat-value { font-size: 20px; }
    .section-head { align-items: baseline; }
    .filters { top: 8px; grid-template-columns: 1fr 1fr; padding: 8px; }
    .filters button { grid-column: 1/-1; }
    .proof-grid { grid-template-columns: 1fr; }
    .table-shell { display: none; }
    .mobile-list { display: grid; gap: 10px; }
    .event-card { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 16px; }
    .event-card:before { content:''; position:absolute; inset:0 auto 0 0; width:3px; background:var(--tone,var(--muted)); }
    .event-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .event-symbol { font: 700 18px 'JetBrains Mono'; }
    .event-name { color: var(--muted); font-size: 11px; max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .event-date { color: var(--muted); font: 500 10px 'JetBrains Mono'; margin-top: 4px; }
    .event-move { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin: 15px 0; }
    .event-score { color: var(--muted); font: 500 10px 'JetBrains Mono'; margin-left: auto; }
    .event-grid { display: grid; grid-template-columns: repeat(4,1fr); border-top: 1px solid var(--line); padding-top: 13px; }
    .metric { min-width: 0; }
    .metric label { display: block; color: var(--muted); font: 600 9px 'JetBrains Mono'; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .metric span { font: 600 11px 'JetBrains Mono'; }
    .lower-grid { grid-template-columns: 1fr; margin-top: 50px; }
    .panel { padding: 20px; }
    .footer { display: block; }
    .footer span { display: block; margin-top: 8px; }
  }
  @media (max-width: 390px) { .brand small { display:none; } .event-grid { grid-template-columns: repeat(2,1fr); gap: 13px; } }
</style>
</head>
<body>
<main class="shell">
  <header class="topbar">
    <a class="brand" href="/"><span class="mark">M</span><span>MONEY SCANNER<small>MARKET INTELLIGENCE</small></span></a>
    <div class="live">Public tape</div>
  </header>

  <section class="hero">
    <div>
      <div class="eyebrow">Verified performance / public proof</div>
      <h1>The signal came first.<br><span>The result came after.</span></h1>
      <p class="sub">Selected Money Scanner calls, published with the original flip date and close so the performance can be checked after the fact.</p><div class="hero-actions"><a class="cta" href="/">Open Money Scanner</a><a class="cta secondary" href="https://x.com/marketscan_360" target="_blank" rel="noopener">Follow live proof on X</a></div><div class="trust-row"><span class="trust-pill">5 curated winners</span><span class="trust-pill">20%+ verified</span><span class="trust-pill">No cherry-picked live entries</span></div>
    </div>
    <div class="hero-note"><strong>Proof without giving away the product.</strong>This page shows selected completed outcomes. Live signals, the full active regime list, scores and operational scanner data stay inside Money Scanner.</div>
  </section>

  <section class="stats" id="scan"><div class="stat"><div class="stat-label">Evidence status</div><div class="stat-value muted">Loading</div></div></section>

  <section>
    <div class="section-head"><div><div class="eyebrow" style="margin-bottom:10px">Selected evidence</div><h2>Performance Tape</h2></div><div class="section-kicker">CLOSED CANDLES · UTC</div></div>
    <div class="proof-grid" id="proofCards"><div class="proof-card muted">Loading verified outcomes...</div></div>
    <p class="boundary"><strong>What is not shown:</strong> live entries, the complete active watchlist, current scores, exhaustive regimes or data that substitutes for the paid product.</p>
  </section>

  <section class="lower-grid">
    <div class="panel">
      <div class="eyebrow" style="margin-bottom:10px">Daily signal</div><h3>Get the regime digest</h3>
      <p>Product updates and selected verified performance recaps. Live scanner intelligence stays private. No payment is collected today.</p><p><a class="cta" href="/">Launch the scanner</a></p>
      <div class="digest-form"><input id="wlemail" type="email" placeholder="you@example.com"><button onclick="joinWaitlist()">Join</button><select id="wlprice"><option value="">Just notify me</option><option value="19">I'd consider 19 EUR/mo for Pro</option><option value="39">I'd consider 39 EUR/mo for Pro</option></select></div>
      <p id="wlmsg"></p>
    </div>
    <div class="panel">
      <div class="eyebrow" style="margin-bottom:10px">How to verify it</div><h3>Signal, then outcome.</h3>
      <p>Each proof keeps the asset, timeframe, original flip date, flip close and a completed forward return together. Selected results are evidence, not a live feed.</p>
    </div>
  </section>

  <details class="panel method">
    <summary>Disclosure</summary>
    <p>The operator may hold or trade assets shown here. These are selected historical outcomes, not investment advice or a profit forecast. Past performance does not guarantee future results.</p>
  </details>

  <footer class="footer">Money Scanner · Selected performance evidence <span>Money Line · AI Briefing · 4×200</span></footer>
</main>
<script>
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtPrice = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: Number(v) < 1 ? 6 : 2 });
const completed = e => [['30D','d30'],['7D','d7'],['1D','d1']].map(([label,key])=>({label,key,value:e.outcomes&&e.outcomes[key]&&e.outcomes[key].returnPct})).find(x=>Number.isFinite(Number(x.value)));
async function loadProof() {
  const d = await (await fetch('/api/tape/proof')).json();
  const selected = (d.evidence || []).map(e=>({e,o:{label:e.window,value:e.returnPct}}));
  document.getElementById('scan').innerHTML = [
    ['Evidence','Selected','after-the-fact outcomes'],
    ['Source','Closed candles','original flip preserved'],
    ['Access','Public proof','live intelligence withheld'],
    ['Updated',d.updatedAt?new Date(d.updatedAt).toLocaleDateString('en-GB',{dateStyle:'medium',timeZone:'UTC'}):'—','UTC']
  ].map(x=>'<div class="stat"><div class="stat-label">'+x[0]+'</div><div class="stat-value">'+x[1]+'</div><div class="stat-meta">'+x[2]+'</div></div>').join('');
  document.getElementById('proofCards').innerHTML = selected.length ? selected.map(({e,o})=>'<article class="proof-card"><div class="proof-top"><div><div class="proof-symbol">'+esc(e.asset)+'</div><div class="proof-name">'+esc(e.name||'')+'</div></div><span class="tf">'+esc(e.timeframe).toUpperCase()+'</span></div><div class="proof-return">+'+Number(o.value).toFixed(2)+'%</div><div class="proof-label">verified '+o.label.toLowerCase()+' return from flip close</div><div class="proof-facts"><div><label>Flip date</label><span>'+new Date(e.flipDate).toISOString().slice(0,10)+'</span></div><div><label>Flip close</label><span>'+fmtPrice(e.flipClose)+'</span></div></div></article>').join('') : '<div class="proof-card muted">Verified performance evidence will appear here after an outcome window closes and is selected for publication.</div>';
}
async function joinWaitlist() { const email=document.getElementById('wlemail').value.trim(), pricePointEur=parseInt(document.getElementById('wlprice').value,10), msg=document.getElementById('wlmsg'); try { const r=await fetch('/api/tape/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,source:'tape-page',pricePointEur:Number.isFinite(pricePointEur)?pricePointEur:undefined})}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'failed'); msg.textContent=(d.added?'You are on the list.':'Already registered.')+' Total signups: '+d.total; } catch(e) { msg.textContent='Could not save that email: '+e.message; } }
loadProof();
</script>
</body>
</html>`;

