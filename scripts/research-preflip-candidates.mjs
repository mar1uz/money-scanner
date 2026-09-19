// research-preflip-candidates.mjs
// Two-stage pre-flip research: candidate -> P(confirm within 14d),
// confirmed -> P(+20% before -10% within 21d | confirmed).
// Strict candidate-day feature cutoffs. Chronological 60/20/20 by candidate date.
// Local research only - no orders, no exchange connections, no credentials.

import { atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { calculateMoneyLineCloud } from '../packages/money-line/dist/cloud-supertrend.js';
import { managePosition, round } from './paper-trade-logger.mjs';
import {
  detectCandidateEpisodes, stage1Outcome, stage2Outcome, candidateFeatures,
  trainLogreg, PREFLIP_FEATURES, CHAIN_TVL_MAP, DAY_MS
} from './preflip-core.mjs';
import { CRYPTO_SYMBOLS, fetchBinanceDaily, fetchFunding } from './trend-ranking-core.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchChainTvl(chain) {
  try {
    const res = await fetch(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`);
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.map(r => ({ t: Number(r.date) * 1000, tvl: Number(r.tvl) }));
  } catch { return null; }
}

function supertrendDir(candles, period = 10, multiplier = 3.5) {
  const atrValues = atr(candles, period);
  const dir = new Array(candles.length).fill(1);
  let up = 0, lo = 0, d = 1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const a = Number.isFinite(atrValues[i]) ? atrValues[i] : c.high - c.low;
    const mid = (c.high + c.low) / 2;
    const bu = mid + multiplier * a, bl = mid - multiplier * a;
    if (i === 0) { up = bu; lo = bl; }
    else {
      const pc = candles[i - 1].close;
      lo = bl > lo || pc < lo ? bl : lo;
      up = bu < up || pc > up ? bu : up;
      if (d === 1 && c.close < lo) d = -1;
      else if (d === -1 && c.close > up) d = 1;
    }
    dir[i] = d;
  }
  return dir;
}

function weekStart(ts) {
  const d = new Date(ts);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
function aggregateWeeks(daily) {
  const weeks = [];
  for (const c of daily) {
    const ts = weekStart(c.timestamp);
    const cur = weeks.at(-1);
    if (!cur || cur.timestamp !== ts) weeks.push({ ...c, timestamp: ts });
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  return weeks;
}

function simulate(e, candles, signals, atr14, confirmIndex) {
  const entryIdx = confirmIndex + 1;
  if (entryIdx >= candles.length) return null;
  const entryPrice = candles[entryIdx].open * 1.00125;
  const stop = entryPrice - 1.25 * atr14[confirmIndex];
  const risk = entryPrice - stop;
  if (risk <= 0) return null;
  const { outcome } = managePosition({ entry: entryPrice, stop, risk }, candles, signals, confirmIndex);
  return outcome;
}

function cohortStats(trades) {
  if (!trades.length) return { trades: 0, winRate: null, expectancyR: null, profitFactor: null, maxDrawdownR: 0 };
  const rs = trades.map(t => t.r);
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r <= 0);
  const gw = wins.reduce((a, b) => a + b, 0), gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let peak = 0, cum = 0, dd = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return {
    trades: rs.length, winRate: round(wins.length / rs.length * 100, 1),
    expectancyR: round(rs.reduce((a, b) => a + b, 0) / rs.length, 3),
    profitFactor: gl > 0 ? round(gw / gl, 2) : null, maxDrawdownR: round(dd, 1)
  };
}

const rate = (rows, fn) => rows.length ? round(rows.filter(fn).length / rows.length * 100, 1) : null;

async function run() {
  console.log('Loading data (spot daily + funding + chain TVL)...');
  const engine = new MoneyLineEngine();
  const perAsset = new Map();
  const tvlCache = new Map();

  const btcCandles = await fetchBinanceDaily('BTC');
  btcCandles[btcCandles.length - 1].isClosed = false;
  const btcClosed = btcCandles.filter(c => c.isClosed !== false);
  const btcWeeks = aggregateWeeks(btcClosed);
  const btcWeeklyDir = supertrendDir(btcWeeks, 10, 3.5);
  const btcRegimeByWeek = new Map();
  btcWeeks.forEach((w, idx) => { if (idx > 0) btcRegimeByWeek.set(w.timestamp, btcWeeklyDir[idx - 1] === 1 ? 1 : 0); });

  for (const sym of CRYPTO_SYMBOLS) {
    try {
      const candles = sym === 'BTC' ? btcCandles : await fetchBinanceDaily(sym);
      if (candles.length < 500) continue;
      candles[candles.length - 1].isClosed = false;
      const closed = candles.filter(c => c.isClosed !== false);
      const signals = engine.calculateSeries(sym, '1d', closed);
      const cloud = calculateMoneyLineCloud(closed, '1d');
      const atr14 = atr(closed, 14);
      const funding = await fetchFunding(sym);
      let tvl = null;
      const chain = CHAIN_TVL_MAP[sym];
      if (chain) {
        if (!tvlCache.has(chain)) { tvlCache.set(chain, await fetchChainTvl(chain)); await sleep(150); }
        tvl = tvlCache.get(chain);
      }
      perAsset.set(sym, { candles: closed, signals, cloud, atr14, funding, tvl });
      process.stdout.write(`${sym}${chain ? '+tvl' : ''} `);
    } catch (err) { console.log(`\n skip ${sym}: ${err.message}`); }
  }

  // Build candidate events
  const allEvents = [];
  for (const [sym, a] of perAsset) {
    const episodes = detectCandidateEpisodes(a.candles, a.cloud, a.atr14);
    for (const ep of episodes) {
      if (ep.index < 200) continue;
      if (ep.index + 22 >= a.candles.length) continue; // need forward room for stage2
      const e = candidateFeatures(sym, a.candles, a.signals, a.atr14, a.cloud, ep, a.funding, a.tvl, btcRegimeByWeek);
      const s1 = stage1Outcome(ep, a.cloud);
      e.stage1 = s1;
      if (s1.confirmed) {
        e.stage2 = stage2Outcome(s1.confirmIndex, a.candles);
        e.confirmIndex = s1.confirmIndex;
      }
      allEvents.push(e);
    }
  }
  allEvents.sort((a, b) => a.candidateTime - b.candidateTime);
  console.log(`\nCandidate episodes: ${allEvents.length}`);

  const n = allEvents.length;
  const splits = {
    train: allEvents.slice(0, Math.floor(n * 0.6)),
    val: allEvents.slice(Math.floor(n * 0.6), Math.floor(n * 0.8)),
    test: allEvents.slice(Math.floor(n * 0.8))
  };

  console.log('\n== Stage 1: P(cloud buy flip confirms within 14d) ==');
  for (const s of ['train', 'val', 'test']) {
    const rows = splits[s];
    console.log(`  ${s}: n=${rows.length} base=${rate(rows, e => e.stage1.confirmed === 1)}% window ${rows[0].candidateDate} .. ${rows.at(-1).candidateDate}`);
  }
  console.log('  simple baselines:');
  for (const [label, f] of [
    ['distAtr <= 0.25 (VERY_CLOSE)', e => e.features.distAtr <= 0.25],
    ['distAtr <= 0.50', e => e.features.distAtr <= 0.50],
    ['mlScore rising (delta5 > 0)', e => e.features.mlScoreDelta5 > 0],
    ['RVOL >= 2', e => e.features.rvol >= 2],
    ['compressed (atrPctRank <= 0.3)', e => e.features.atrPctRank1y <= 0.3]
  ]) {
    const line = ['train', 'val', 'test'].map(s => {
      const sub = splits[s].filter(f);
      return `${s} n=${sub.length} ${rate(sub, e => e.stage1.confirmed === 1)}%`;
    }).join(' | ');
    console.log(`    ${label.padEnd(34)} ${line}`);
  }

  const m1 = trainLogreg(splits.train, PREFLIP_FEATURES, e => e.stage1.confirmed);
  const w1 = PREFLIP_FEATURES.map(nm => [nm, m1.w[nm]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  console.log('  stage-1 top weights:', w1.map(([nm, w]) => `${nm}=${round(w, 2)}`).join(' '));
  // stage-1 ranking quality: precision of top-quintile predicted
  for (const s of ['val', 'test']) {
    const rows = [...splits[s]].sort((a, b) => m1.prob(b) - m1.prob(a));
    const top = rows.slice(0, Math.max(5, Math.floor(rows.length * 0.2)));
    console.log(`  stage-1 ${s}: top-20% predicted confirm=${rate(top, e => e.stage1.confirmed === 1)}% vs base ${rate(splits[s], e => e.stage1.confirmed === 1)}%`);
  }

  console.log('\n== Stage 2: P(+20% before -10% within 21d | confirmed) ==');
  for (const s of ['train', 'val', 'test']) {
    const conf = splits[s].filter(e => e.stage1.confirmed === 1 && e.stage2);
    console.log(`  ${s}: n=${conf.length} base=${rate(conf, e => e.stage2.profit === 1)}%`);
  }
  for (const [label, f] of [
    ['RVOL >= 2 at candidate', e => e.features.rvol >= 2],
    ['distAtr <= 0.25 at candidate', e => e.features.distAtr <= 0.25],
    ['close > SMA200 at candidate', e => e.features.distSma200 > 0],
    ['base >= 30 days', e => e.features.baseDays >= 30]
  ]) {
    const line = ['train', 'val', 'test'].map(s => {
      const sub = splits[s].filter(e => e.stage1.confirmed === 1 && e.stage2).filter(f);
      return `${s} n=${sub.length} ${rate(sub, e => e.stage2.profit === 1)}%`;
    }).join(' | ');
    console.log(`    ${label.padEnd(34)} ${line}`);
  }

  const confirmedTrain = splits.train.filter(e => e.stage1.confirmed === 1 && e.stage2);
  let m2 = null;
  if (confirmedTrain.length > 100) {
    m2 = trainLogreg(confirmedTrain, PREFLIP_FEATURES, e => e.stage2.profit);
    const w2 = PREFLIP_FEATURES.map(nm => [nm, m2.w[nm]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
    console.log('  stage-2 top weights:', w2.map(([nm, w]) => `${nm}=${round(w, 2)}`).join(' '));
    for (const s of ['val', 'test']) {
      const conf = splits[s].filter(e => e.stage1.confirmed === 1 && e.stage2);
      const top = [...conf].sort((a, b) => m2.prob(b) - m2.prob(a)).slice(0, Math.max(5, Math.floor(conf.length * 0.2)));
      console.log(`  stage-2 ${s}: top-20% predicted profit=${rate(top, e => e.stage2.profit === 1)}% vs base ${rate(conf, e => e.stage2.profit === 1)}%`);
    }
  } else console.log('  stage-2 model skipped: insufficient confirmed training events');

  // Combined-strategy trade sim on confirmed candidates (entry after confirmation)
  console.log('\n== Trade sim (entry after confirmation, tested rules, costs in) ==');
  for (const s of ['val', 'test']) {
    const conf = splits[s].filter(e => e.stage1.confirmed === 1 && e.stage2);
    const simAll = [], simTop1 = [], simRvol2Flip = [];
    const sortedByP1 = [...conf].sort((a, b) => m1.prob(b) - m1.prob(a));
    const topP1 = new Set(sortedByP1.slice(0, Math.max(5, Math.floor(conf.length * 0.2))));
    for (const e of conf) {
      const a = perAsset.get(e.symbol);
      const t = simulate(e, a.candles, a.signals, a.atr14, e.confirmIndex);
      if (!t) continue;
      simAll.push(t);
      if (topP1.has(e)) simTop1.push(t);
      // validated baseline proxy: RVOL>=2 at the CONFIRMATION candle
      const flipSig = a.signals[e.confirmIndex];
      if (flipSig && flipSig.rawIndicators.rvol >= 2) simRvol2Flip.push(t);
    }
    const sAll = cohortStats(simAll), sTop = cohortStats(simTop1), sR2 = cohortStats(simRvol2Flip);
    console.log(`  ${s}: all-confirmed n=${sAll.trades} exp=${sAll.expectancyR}R PF=${sAll.profitFactor} DD=${sAll.maxDrawdownR}R | top-P1 n=${sTop.trades} exp=${sTop.expectancyR}R PF=${sTop.profitFactor} DD=${sTop.maxDrawdownR}R | RVOL>=2-at-flip n=${sR2.trades} exp=${sR2.expectancyR}R PF=${sR2.profitFactor} DD=${sR2.maxDrawdownR}R`);
  }

  // TVL coverage note
  const withTvl = allEvents.filter(e => e.features.hasTvl === 1);
  console.log(`\nTVL feature coverage: ${withTvl.length}/${allEvents.length} events (${round(withTvl.length / Math.max(1, allEvents.length) * 100, 0)}%)`);
}

run().catch(err => { console.error(err); process.exit(1); });
