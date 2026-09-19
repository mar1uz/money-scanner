// preflip-watchlist.mjs
// Daily pre-flip candidate watchlist. Freezes the FULL current candidate
// universe to disk, ranks a top 5 by stage-1 confirm probability.
// UNVALIDATED PROTOTYPE: probabilities come from a chronological backtest
// that did NOT survive regime change (see docs/backtests/2026-09-19-preflip-candidates.md).
// Entry is only valid AFTER a confirmed daily Money Line cloud buy flip -
// this list is a watchlist, never a buy signal.

import { atr } from './backtest-tight-risk-breakout.mjs';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { calculateMoneyLineCloud } from '../packages/money-line/dist/cloud-supertrend.js';
import { round } from './paper-trade-logger.mjs';
import {
  detectCandidateEpisodes, stage1Outcome, stage2Outcome, candidateFeatures,
  trainLogreg, PREFLIP_FEATURES, CHAIN_TVL_MAP, CANDIDATE_ZONE_ATR, DAY_MS,
  tradeQuality, compositeScore
} from './preflip-core.mjs';
import { CRYPTO_SYMBOLS, fetchBinanceDaily, fetchFunding } from './trend-ranking-core.mjs';
import { mkdirSync, appendFileSync } from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG_PATH = 'tmp/paper-trades/preflip-watchlist.jsonl';
// App-screenshot examples (2026-09-18, 1W): AI #144, STRK #146, MON #148, SYRUP #157, XPL #160.
// Included best-effort on top of the core 25; skipped silently if not on Binance spot.
const EXTRA_SYMBOLS = ['STRK', 'AI', 'SYRUP', 'MON', 'XPL'];

async function fetchChainTvl(chain) {
  try {
    const res = await fetch(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`);
    if (!res.ok) { console.log(`  TVL fetch failed: ${chain} HTTP ${res.status}`); return null; }
    return (await res.json()).map(r => ({ t: Number(r.date) * 1000, tvl: Number(r.tvl) }));
  } catch (err) { console.log(`  TVL fetch failed: ${chain} ${err.message}`); return null; }
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
function aggregateWeeks(daily) {
  const weeks = [];
  for (const c of daily) {
    const d = new Date(c.timestamp);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    d.setUTCHours(0, 0, 0, 0);
    const cur = weeks.at(-1);
    if (!cur || cur.timestamp !== d.getTime()) weeks.push({ ...c, timestamp: d.getTime() });
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  return weeks;
}

async function fetchBybitDaily(sym) {
  const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}USDT&interval=D&limit=1000`);
  if (!res.ok) throw new Error(`bybit ${res.status}`);
  const j = await res.json();
  if (j.retCode !== 0 || !j.result?.list?.length) throw new Error(`bybit ${j.retMsg || 'no data'}`);
  return j.result.list.slice().reverse().map(r => ({
    timestamp: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]),
    close: Number(r[4]), volume: Number(r[5]), quoteVolume: Number(r[6]), isClosed: true
  }));
}
async function fetchSpotDaily(sym) {
  try { return await fetchBinanceDaily(sym); }
  catch { return await fetchBybitDaily(sym); } // e.g. MON: no Binance spot, Bybit yes
}

async function loadUniverse() {
  const engine = new MoneyLineEngine();
  const tvlCache = new Map();
  const perAsset = new Map();
  const symbols = [...new Set([...CRYPTO_SYMBOLS, ...EXTRA_SYMBOLS])];
  const skipped = [];

  const btcCandles = await fetchBinanceDaily('BTC');
  btcCandles[btcCandles.length - 1].isClosed = false;
  const btcClosed = btcCandles.filter(c => c.isClosed !== false);
  const btcWeeks = aggregateWeeks(btcClosed);
  const btcDir = supertrendDir(btcWeeks);
  const btcRegimeByWeek = new Map();
  btcWeeks.forEach((w, idx) => { if (idx > 0) btcRegimeByWeek.set(w.timestamp, btcDir[idx - 1] === 1 ? 1 : 0); });

  for (const sym of symbols) {
    try {
      const candles = sym === 'BTC' ? btcCandles : await fetchSpotDaily(sym);
      if (candles.length < 300) { skipped.push(sym); continue; }
      candles[candles.length - 1].isClosed = false;
      const closed = candles.filter(c => c.isClosed !== false);
      perAsset.set(sym, {
        candles: closed,
        signals: engine.calculateSeries(sym, '1d', closed),
        cloud: calculateMoneyLineCloud(closed, '1d'),
        atr14: atr(closed, 14),
        funding: await fetchFunding(sym).catch(() => null),
        tvl: null
      });
      const chain = CHAIN_TVL_MAP[sym];
      if (chain) {
        if (!tvlCache.has(chain)) { tvlCache.set(chain, await fetchChainTvl(chain)); await sleep(400); }
        perAsset.get(sym).tvl = tvlCache.get(chain);
      }
    } catch { skipped.push(sym); }
  }
  return { perAsset, btcRegimeByWeek, skipped };
}

function currentCandidates(perAsset, btcRegimeByWeek) {
  const out = [];
  for (const [sym, a] of perAsset) {
    const i = a.candles.length - 1; // latest closed daily candle
    const line = a.cloud.lineSlow[i];
    const atrNow = a.atr14[i];
    if (a.cloud.dirSlow[i] !== 1 || !Number.isFinite(line) || !Number.isFinite(atrNow) || atrNow <= 0) continue;
    const dist = line - a.candles[i].close;
    if (dist <= 0 || dist / atrNow > CANDIDATE_ZONE_ATR) continue;
    let baseDays = 0;
    for (let j = i; j >= 0 && a.cloud.dirSlow[j] === 1; j--) baseDays++;
    const cand = {
      index: i, candidateTime: a.candles[i].timestamp,
      distAtr: dist / atrNow, distPct: dist / a.candles[i].close * 100,
      baseDays, triggerPrice: line
    };
    out.push(candidateFeatures(sym, a.candles, a.signals, a.atr14, a.cloud, cand, a.funding, a.tvl, btcRegimeByWeek));
  }
  return out;
}

function trainModels(perAsset, btcRegimeByWeek) {
  const events = [];
  for (const [sym, a] of perAsset) {
    for (const ep of detectCandidateEpisodes(a.candles, a.cloud, a.atr14)) {
      if (ep.index < 200 || ep.index + 22 >= a.candles.length) continue;
      const e = candidateFeatures(sym, a.candles, a.signals, a.atr14, a.cloud, ep, a.funding, a.tvl, btcRegimeByWeek);
      e.stage1 = stage1Outcome(ep, a.cloud);
      if (e.stage1.confirmed) e.stage2 = stage2Outcome(e.stage1.confirmIndex, a.candles);
      events.push(e);
    }
  }
  events.sort((x, y) => x.candidateTime - y.candidateTime);
  const m1 = trainLogreg(events, PREFLIP_FEATURES, e => e.stage1.confirmed);
  const conf = events.filter(e => e.stage1.confirmed === 1 && e.stage2);
  const m2 = conf.length > 100 ? trainLogreg(conf, PREFLIP_FEATURES, e => e.stage2.profit) : null;
  return { m1, m2, events };
}

function evidenceLine(e) {
  const f = e.features;
  const bits = [
    `base ${f.baseDays}d`,
    `RVOL ${round(f.rvol, 2)}`,
    f.atrPctRank1y <= 0.3 ? `compressed (rank ${round(f.atrPctRank1y, 2)})` : `not compressed (rank ${round(f.atrPctRank1y, 2)})`,
    `ML score ${round(f.mlScore, 0)} (${f.mlScoreDelta5 >= 0 ? '+' : ''}${round(f.mlScoreDelta5, 0)}/5d)`,
    f.smaGolden ? 'SMA50>SMA200' : 'SMA50<SMA200',
    f.hasTvl ? `TVL 30d ${f.tvlChg30 >= 0 ? '+' : ''}${round(f.tvlChg30 * 100, 1)}%` : 'no TVL data',
    f.btcWeeklyBull ? 'BTC weekly bullish' : 'BTC weekly bearish'
  ];
  return bits.join('; ');
}
function riskLine(e) {
  const f = e.features;
  const risks = [];
  if (f.distAtr > 0.5) risks.push('trigger still far (early candidate)');
  if (!f.btcWeeklyBull) risks.push('weak BTC regime');
  if (f.fundingPct90 > 0.9) risks.push('crowded longs (funding high)');
  if (f.rvol < 0.7) risks.push('no volume interest');
  if (f.atrPctRank1y > 0.8) risks.push('volatility expanding against position');
  if (f.hasTvl && f.tvlChg30 < -0.1) risks.push('TVL outflows');
  return risks.length ? risks.join('; ') : 'none beyond normal market risk';
}

async function run() {
  const scanDate = new Date().toISOString();
  console.log('Building pre-flip watchlist...');
  const { perAsset, btcRegimeByWeek, skipped } = await loadUniverse();
  if (skipped.length) console.log(`skipped (no Binance spot data): ${skipped.join(', ')}`);
  const { m1, m2, events } = trainModels(perAsset, btcRegimeByWeek);
  console.log(`models trained on ${events.length} historical candidate episodes`);

  const cands = currentCandidates(perAsset, btcRegimeByWeek);
  for (const e of cands) {
    e.p1 = round(m1.prob(e), 3);
    e.p2 = m2 ? round(m2.prob(e), 3) : null;
    e.joint = e.p2 == null ? null : round(e.p1 * e.p2, 3);
    e.plan = tradeQuality(perAsset.get(e.symbol).candles, perAsset.get(e.symbol).atr14, perAsset.get(e.symbol).cloud, e.index);
    e.composite = round(compositeScore(e.p1, e.plan), 3);
  }
  cands.sort((a, b) => (b.composite - a.composite) || (b.p1 - a.p1));
  const top5 = cands.slice(0, 5);

  // User-grounded screenshot examples (2026-09-18/19, app 1W candidate list +
  // MONUSDT daily chart): freeze current threshold state regardless of zone so
  // candidate->confirm discrimination can be scored forward, without hindsight.
  const trackedExamples = [];
  for (const sym of EXTRA_SYMBOLS) {
    const a = perAsset.get(sym);
    if (!a) { trackedExamples.push({ symbol: sym, status: 'no market data' }); continue; }
    const i = a.candles.length - 1;
    const line = a.cloud.lineSlow[i], atrNow = a.atr14[i], close = a.candles[i].close;
    const dist = line - close;
    const dir = a.cloud.dirSlow[i];
    trackedExamples.push({
      symbol: sym, source: 'user screenshot 2026-09-18/19 (app 1W candidates / MONUSDT daily)',
      date: new Date(a.candles[i].timestamp).toISOString().slice(0, 10),
      close, triggerPrice: round(line, 6),
      trendDir: dir === 1 ? 'bearish' : 'bullish',
      confirmedAlready: a.cloud.buySignals[i] || dir !== 1 || dist <= 0,
      distPct: round(dist / close * 100, 2),
      distAtr: Number.isFinite(atrNow) && atrNow > 0 ? round(dist / atrNow, 2) : null,
      inZone: dir === 1 && dist > 0 && Number.isFinite(atrNow) && dist / atrNow <= CANDIDATE_ZONE_ATR
    });
  }

  const record = {
    scanDate,
    universeCount: perAsset.size,
    skipped,
    candidateCount: cands.length,
    candidates: cands.map(e => ({
      symbol: e.symbol, candidateDate: e.candidateDate, close: e.close,
      triggerPrice: round(e.triggerPrice, 6), distPct: round(e.features.distPct, 2),
      distAtr: round(e.features.distAtr, 2), baseDays: e.features.baseDays,
      pConfirm: e.p1, pProfitGivenConfirm: e.p2, joint: e.joint,
      composite: e.composite,
      plan: e.plan ? {
        entryProxy: round(e.plan.entry, 6), stop: round(e.plan.stop, 6),
        stopBasis: e.plan.stopBasis, stopDistPct: round(e.plan.stopDistPct, 2),
        resistance: round(e.plan.resistance, 6), resDistPct: round(e.plan.resDistPct, 2),
        rr: round(e.plan.rr, 2)
      } : null
    })),
    top5: top5.map(e => e.symbol),
    trackedExamples
  };
  mkdirSync('tmp/paper-trades', { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify(record) + '\n');
  console.log(`frozen ${cands.length} candidates -> ${LOG_PATH}`);

  console.log('\n=== PRE-FLIP WATCHLIST (UNVALIDATED PROTOTYPE) ===');
  console.log(`scan ${scanDate} | universe ${perAsset.size} | candidates ${cands.length}`);
  if (!top5.length) console.log('No candidates in the pre-flip zone today.');
  top5.forEach((e, idx) => {
    const f = e.features;
    console.log(`\n#${idx + 1} ${e.symbol}  P(confirm 14d)=${e.p1}  P(+20% before -10% | confirm)=${e.p2 ?? 'n/a'}  joint=${e.joint ?? 'n/a'}`);
    console.log(`   trigger: daily close above ${round(e.triggerPrice, 6)} (${round(f.distPct, 2)}% / ${round(f.distAtr, 2)} ATR away)  composite=${e.composite}`);
    if (e.plan) console.log(`   hypothetical plan: entry ~${round(e.plan.entry, 6)}, stop ${round(e.plan.stop, 6)} (below ${e.plan.stopBasis}, ${round(e.plan.stopDistPct, 2)}%), resistance ${round(e.plan.resistance, 6)} (${round(e.plan.resDistPct, 2)}%), RR ${round(e.plan.rr, 2)}`);
    else console.log('   hypothetical plan: none (no defensible stop below entry)');
    console.log(`   evidence: ${evidenceLine(e)}`);
    console.log(`   risks: ${riskLine(e)}`);
  });
  console.log('\nTracked screenshot examples (forward discrimination freeze):');
  for (const t of trackedExamples) {
    if (t.status) { console.log(`  ${t.symbol}: ${t.status}`); continue; }
    console.log(`  ${t.symbol}: ${t.trendDir}, close ${t.close}, trigger ${t.triggerPrice} (${t.distPct}% / ${t.distAtr} ATR ${t.confirmedAlready ? '- already confirmed/above' : t.inZone ? '- IN ZONE' : '- outside zone, early'})`);
  }
  console.log('\nEntry discipline: only AFTER a confirmed daily cloud buy flip (daily close above the trigger). This list is research output, not a signal.');
}

run().catch(err => { console.error(err); process.exit(1); });
