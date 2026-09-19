#!/usr/bin/env node
/**
 * JEV Insight - daily insight layer over the deterministic Top-20 near-flip pipeline.
 *
 * Flow: latest scan JSON -> deterministic 1D+1W engine packet per crypto asset
 * (stocks keep scan fields only, flagged) -> jev (TypeSafe evaluator) scores task
 * complexity -> tier arithmetic in code picks the AI Gateway model -> the model
 * returns a strict JSON top-10 ranking -> local validation -> auditable report.
 *
 * Local only: writes tmp/insights/jev-insight-<date>.{json,md} and appends the
 * routing record to tmp/insights/jev-insight-decisions.jsonl. No app/UI changes.
 *
 * Usage: node scripts/jev-insight.mjs [--scan path] [--out-dir tmp/insights]
 *          [--top 20] [--no-llm]
 * Env:   AI_GATEWAY_API_KEY (loaded at runtime from ../jev-router/.env.local if
 *        absent; the value is never printed).
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { MoneyLineEngine } from '../packages/money-line/dist/engine.js';
import { calculateMoneyLineCloud } from '../packages/money-line/dist/cloud-supertrend.js';
import { atr, sma } from './backtest-tight-risk-breakout.mjs';
import { round } from './paper-trade-logger.mjs';
import { buildAthContext } from './ath-context.mjs';
import {
  ATH_WEIGHTS, MOMENTUM_WEIGHTS, COMBINED_WEIGHTS,
  computeAthFeatures, scoreAthPotential, computeMomentumScore, combineRankings
} from './ath-context-lib.mjs';
import { buildFourAxesContext } from './four-axes.mjs';
import { AXES_WEIGHTS, scoreFundamentals, scoreOnchain, scoreNarrative, combineFourAxes } from './four-axes-lib.mjs';
import {
  JEV_MODEL, TIERS, QUESTIONS, pickTier, fallbackDecision, numberOrNull,
  isCryptoEntry, buildCohortEntry, buildPrompt, validateInsight,
  estimateCostUsd, renderMarkdown, CALIBRATION_STATEMENT, reclaimToScanEntries
} from './jev-insight-lib.mjs';

const DAY_MS = 86_400_000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JEV_ROUTER_PKG = join(ROOT, '..', 'jev-router', 'package.json');
const engine = new MoneyLineEngine();

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ── market data (Binance primary, Bybit/MEXC fallbacks for delisted pairs) ──
async function fetchKlines(symbol, interval) {
  const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=1000`);
  if (res.ok) {
    const rows = (await res.json()).map(k => ({
      timestamp: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
      volume: +k[5], quoteVolume: +k[7], isClosed: Date.now() > k[6], _src: 'binance-spot'
    }));
    if (rows.length && Date.now() - rows.at(-1).timestamp < 10 * DAY_MS) return rows; // reject delisted/stale feeds on every timeframe
  }
  try {
    const bres = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=${interval === '1w' ? 'W' : 'D'}&limit=1000`);
    const j = await bres.json();
    if (j.retCode === 0 && j.result?.list?.length) {
      return j.result.list.slice().reverse().map((r, i, arr) => ({
        timestamp: Number(r[0]), open: +r[1], high: +r[2], low: +r[3], close: +r[4],
        volume: +r[5], quoteVolume: +r[6], _src: 'bybit-spot',
        isClosed: i < arr.length - 1 || Date.now() > Number(r[0]) + (interval === '1w' ? 7 : 1) * DAY_MS
      }));
    }
  } catch { /* fall through to MEXC */ }
  const mres = await fetch(`https://api.mexc.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval === '1w' ? '1W' : '1d'}&limit=1000`);
  if (!mres.ok) throw new Error(`no klines for ${symbol} (binance/bybit/mexc all failed)`);
  const mrows = await mres.json();
  if (!Array.isArray(mrows) || !mrows.length) throw new Error(`no klines for ${symbol} (empty)`);
  return mrows.map((k, i, arr) => ({
    timestamp: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
    volume: +k[5], quoteVolume: +k[7] || 0, _src: 'mexc-spot',
    isClosed: i < arr.length - 1 || Date.now() > k[6]
  }));
}

// ── deterministic 1D+1W packet (same math as scripts/tape-packet.mjs) ──
async function evaluateSymbol(sym) {
  const rec = {};
  for (const [tf, interval, win, retA, retB] of [['1d', '1d', 90, 7, 30], ['1w', '1w', 26, 4, 12]]) {
    try {
      const candles = (await fetchKlines(sym, interval)).filter(c => c.isClosed);
      const i = candles.length - 1;
      if (i < 20) { rec[tf] = { error: `insufficient closed candles (${candles.length})` }; continue; }
      const close = candles[i].close;
      const signals = engine.calculateSeries(sym, tf, candles);
      const cloud = calculateMoneyLineCloud(candles, tf);
      const a14 = atr(candles, 14);
      const closes = candles.map(c => c.close);
      const sma50 = sma(closes, 50), sma200 = sma(closes, 200);
      const line = cloud.lineSlow[i];
      const dist = line - close;
      let flipIdx = -1;
      for (let j = i; j >= Math.max(0, i - 120); j--) if (cloud.buySignals[j]) { flipIdx = j; break; }
      const q = candles.slice(Math.max(0, i - 20), i + 1).map(c => c.quoteVolume).sort((x, y) => x - y);
      const raw2 = signals[i]?.rawIndicators || {};
      rec[tf] = {
        asOf: new Date(candles[i].timestamp).toISOString().slice(0, 10),
        src: candles[i]._src || 'unknown',
        candles: candles.length, close,
        tier: signals[i]?.tier, score: signals[i]?.score,
        trigger: round(line, 8), distToTriggerPct: round(dist / close * 100, 2),
        distToTriggerAtr: round(dist / (a14[i] || 1), 2),
        status: cloud.dirSlow[i] !== 1 || dist <= 0 ? 'confirmed/above' : (dist / a14[i] <= 1 ? 'candidate' : 'early'),
        lastFlipDate: flipIdx >= 0 ? new Date(candles[flipIdx].timestamp).toISOString().slice(0, 10) : null,
        flipAgeBars: flipIdx >= 0 ? i - flipIdx : null,
        rvol: raw2.rvol ?? null, rsi14: raw2.rsi14 ?? null,
        atrPercent: a14[i] ? round(a14[i] / close * 100, 1) : null,
        sma50: sma50[i] ?? null, sma200: sma200[i] ?? null,
        distSma50Pct: sma50[i] ? round((close / sma50[i] - 1) * 100, 1) : null,
        distSma200Pct: sma200[i] ? round((close / sma200[i] - 1) * 100, 1) : null,
        golden: (sma50[i] && sma200[i]) ? sma50[i] > sma200[i] : null,
        [`ret${retA}`]: i >= retA ? round((close / closes[i - retA] - 1) * 100, 1) : null,
        [`ret${retB}`]: i >= retB ? round((close / closes[i - retB] - 1) * 100, 1) : null,
        [`high${win}`]: Math.max(...candles.slice(Math.max(0, i - win), i + 1).map(c => c.high)),
        [`low${win}`]: Math.min(...candles.slice(Math.max(0, i - win), i + 1).map(c => c.low)),
        medianQuoteVol20USD: q.length ? round(q[Math.floor(q.length / 2)], 0) : null
      };
    } catch (e) { rec[tf] = { error: String(e.message || e).slice(0, 200) }; }
  }
  return rec;
}

// ── AI SDK from the sibling jev-router install (no new Money Scanner deps) ──
async function loadAiSdk() {
  const require = createRequire(JEV_ROUTER_PKG);
  return import(pathToFileURL(require.resolve('ai')).href);
}

/** Load AI_GATEWAY_API_KEY into the process env; returns the source, never the value. */
function ensureGatewayKey() {
  if (process.env.AI_GATEWAY_API_KEY) return 'process.env';
  try {
    process.loadEnvFile(join(ROOT, '..', 'jev-router', '.env.local'));
    return process.env.AI_GATEWAY_API_KEY ? 'jev-router/.env.local' : null;
  } catch { return null; }
}

async function hasPaidAccess() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: TIERS.frontier.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(20_000)
    });
    return res.ok;
  } catch { return false; }
}

async function routeWithJev(evaluateFn, taskDescription) {
  const t0 = Date.now();
  let score = null, confidence = null, evalError = null;
  try {
    const result = await evaluateFn({
      state: { latest_user_message: taskDescription, recent_conversation: [] },
      questions: QUESTIONS, maxRetries: 1, abortSignal: AbortSignal.timeout(25_000)
    });
    score = numberOrNull(result?.answers?.complexity?.score);
    confidence = numberOrNull(result?.providerMetadata?.typesafe?.confidence?.complexity);
  } catch (e) {
    const msg = String(e?.message || e);
    evalError = /429|rate ?limit/i.test(msg) ? 'free-tier rate limit' : msg.slice(0, 160);
  }
  const evalMs = Date.now() - t0;
  let decision = score === null
    ? { ...fallbackDecision(evalError), score: null, confidence: null }
    : { ...pickTier(score, confidence), fallback: false, score, confidence };

  let wantedTier = null, wantedModel = null, degradedReason = null;
  if (decision.tier === 'frontier' && !(await hasPaidAccess())) {
    wantedTier = 'frontier'; wantedModel = TIERS.frontier.model;
    degradedReason = `frontier (${TIERS.frontier.model}) needs paid AI Gateway credits; running on ${TIERS.mid.model}`;
    decision.tier = 'mid';
  }
  return {
    jevModel: JEV_MODEL, complexity: decision.score, confidence,
    tier: decision.tier, model: TIERS[decision.tier].model,
    escalated: decision.escalated ?? false, fallback: decision.fallback ?? false,
    wantedTier, wantedModel, degradedReason, reason: decision.reason,
    evalError, evalMs
  };
}

function parseModelJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function main() {
  const outDir = arg('--out-dir', join('tmp', 'insights'));
  const top = Number(arg('--top', 20));
  const noLlm = process.argv.includes('--no-llm');
  let scanPath = arg('--scan', null);
  if (!scanPath) {
    const dir = join('tmp', 'paper-trades');
    scanPath = join(dir, readdirSync(dir).filter(f => /^scan-.*\.json$/.test(f)).sort().at(-1));
  }
  const scan = JSON.parse(readFileSync(scanPath, 'utf8'));
  const isReclaim = scan.ruleId === 'DAILY_SMA50_200_RECLAIM';
  const rows = isReclaim
    ? reclaimToScanEntries(scan).slice(0, Number(arg('--top', 1000)))
    : (scan.upcomingCandidates ?? []).slice(0, top);
  console.log(`scan ${scanPath} (${scan.generatedAt}), cohort ${rows.length}`);

  const cohort = [];
  for (const row of rows) {
    let det = null;
    if (isCryptoEntry(row)) {
      det = await evaluateSymbol(row.symbol);
      console.log(`eval ${row.symbol}: 1d ${det['1d']?.tier ?? det['1d']?.error} / 1w ${det['1w']?.tier ?? det['1w']?.error}`);
    } else {
      console.log(`eval ${row.symbol}: ${row.marketClass} (scan fields only)`);
    }
    cohort.push(buildCohortEntry(row, det));
  }
  // ATH-potential layer (reclaim cohorts or --ath): deterministic features +
  // scores per asset, visible weights, two rankings + combined.
  let rankings = null;
  let athLayer = null;
  let fourAxes = null;
  if (isReclaim || process.argv.includes('--ath')) {
    const ctx = await buildAthContext(cohort);
    athLayer = { sources: ctx.sources, fetchErrors: ctx.errors, weights: { ath: ATH_WEIGHTS, momentum: MOMENTUM_WEIGHTS, combined: COMBINED_WEIGHTS } };
    for (const entry of cohort) {
      if (entry.marketClass !== 'crypto') continue;
      const det1d = entry.deterministic?.['1d'];
      const det1w = entry.deterministic?.['1w'];
      const c = ctx.perSymbol[entry.symbol] ?? {};
      const features = computeAthFeatures({
        coingecko: c.coingecko, det1d, det1w, btcRet30: c.btcRet30, llama: c.llama
      });
      entry.ath = { features, potential: scoreAthPotential(features), momentum: computeMomentumScore(det1d, det1w) };
      console.log(`ath ${entry.symbol}: potential ${entry.ath.potential.score} momentum ${entry.ath.momentum.score}${entry.ath.potential.flags.length ? ` flags=${entry.ath.potential.flags.join(',')}` : ''}`);
    }
    rankings = combineRankings(
      cohort.map(c => c.symbol),
      Object.fromEntries(cohort.map(c => [c.symbol, c.ath?.momentum])),
      Object.fromEntries(cohort.map(c => [c.symbol, c.ath?.potential]))
    );
    // Four-axis classification: setup + ATH + fundamentals + on-chain + narrative.
    const axCtx = await buildFourAxesContext(cohort.filter(c => c.marketClass === 'crypto').map(c => c.symbol));
    fourAxes = { weights: AXES_WEIGHTS, sources: axCtx.sources, fetchedAt: axCtx.fetchedAt, fetchErrors: [...ctx.errors, ...axCtx.errors] };
    for (const entry of cohort) {
      if (entry.marketClass !== 'crypto') continue;
      const a = axCtx.perSymbol[entry.symbol] ?? {};
      const llama = ctx.perSymbol[entry.symbol]?.llama ?? null;
      const fundamentals = scoreFundamentals(a);
      const onchain = scoreOnchain({
        symbol: entry.symbol,
        tvl: a.chainTvl ?? llama?.tvl ?? null,
        tvlChange30dPct: a.chainTvl != null ? a.chainTvlChange30dPct : (llama?.change_1m != null ? llama.change_1m * 100 : null)
      });
      const narrative = scoreNarrative(a);
      entry.axes = { fundamentals, onchain, narrative, fees: { fees30d: a.fees30d ?? null, feesPrev30d: a.feesPrev30d ?? null, matched: a.matchedName ?? null }, trendingRank: a.trendingRank ?? null };
      entry.final = combineFourAxes({
        momentumScore: entry.ath?.momentum?.score, athScore: entry.ath?.potential?.score,
        fundamentals, onchain, narrative
      });
      console.log(`axes ${entry.symbol}: final ${entry.final.score} (setup ${entry.ath?.momentum?.score} / ath ${entry.ath?.potential?.score} / fund ${fundamentals.score} / onchain ${onchain.score} / narrative ${narrative.score})`);
    }
    fourAxes.ranking = cohort
      .filter(c => c.final)
      .map(c => ({ symbol: c.symbol, score: c.final.score, parts: c.final.parts, flags: [...(c.final.flags ?? []), ...(c.axes?.fundamentals?.flags ?? []), ...(c.axes?.onchain?.flags ?? []), ...(c.axes?.narrative?.flags ?? [])] }))
      .sort((a, b) => b.score - a.score);
  }
  const lastClosedDaily = cohort.map(c => c.deterministic?.['1d']?.asOf).filter(Boolean).sort().at(-1) ?? null;
  const lastClosedWeekly = cohort.map(c => c.deterministic?.['1w']?.asOf).filter(Boolean).sort().at(-1) ?? null;

  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'ok',
    pipeline: {
      scanFile: scanPath, scanGeneratedAt: (isReclaim ? scan.reproducedAt : scan.generatedAt) ?? null,
      scanMethod: scan.method ?? null,
      ...(isReclaim ? { ruleId: scan.ruleId, analyzedDay: scan.analyzedDay, cohortRule: 'NEW_SIGNAL' } : {}),
      universeCount: scan.universeCount ?? null, scannedCount: scan.scannedCount ?? null,
      cohortSize: rows.length, topRequested: 10,
      timeframes: ['1d', '1w'], lastClosedDaily, lastClosedWeekly
    },
    routing: null, cohort,
    insight: null, validation: null, usage: null,
    ...(athLayer ? { athLayer } : {}), ...(rankings ? { rankings } : {}), ...(fourAxes ? { fourAxes } : {}),
    calibration: { probabilityFieldsPresent: false, statement: CALIBRATION_STATEMENT }
  };

  if (!noLlm) {
    const keySource = ensureGatewayKey();
    if (!keySource) {
      report.status = 'blocked:no-ai-gateway-key';
      report.blockedReason = 'AI_GATEWAY_API_KEY not in env and jev-router/.env.local not readable';
    } else {
      try {
        const { createGateway, experimental_evaluate, generateText } = await loadAiSdk();
        const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
        const taskDescription = buildPrompt({ scanMeta: report.pipeline, cohort }).user.slice(0, 4000);
        report.routing = await routeWithJev(
          opts => experimental_evaluate({ model: gateway.evaluationModel(JEV_MODEL), ...opts }),
          taskDescription
        );
        console.log(`routing: ${report.routing.reason} -> ${report.routing.model}`);
        const { system, user } = buildPrompt({ scanMeta: report.pipeline, cohort });
        try {
          const result = await generateText({
            model: gateway.languageModel(report.routing.model),
            system, prompt: user, maxOutputTokens: 6000, temperature: 0.2,
            abortSignal: AbortSignal.timeout(180_000)
          });
          const insight = parseModelJson(result.text);
          report.validation = validateInsight(insight, cohort.map(c => c.symbol));
          report.usage = {
            model: report.routing.model,
            inputTokens: numberOrNull(result.usage?.inputTokens ?? result.usage?.promptTokens),
            outputTokens: numberOrNull(result.usage?.outputTokens ?? result.usage?.completionTokens),
            estimatedCostUsd: estimateCostUsd(report.routing.tier, result.usage)
          };
          if (report.validation.ok) {
            report.insight = insight;
          } else {
            report.status = 'blocked:invalid-insight';
            report.blockedReason = report.validation.errors.join(' | ');
            writeFileSync(join(outDir, 'jev-insight-last-raw.txt'), result.text, 'utf8');
          }
        } catch (e) {
          const msg = String(e?.message || e);
          report.status = /429|rate ?limit/i.test(msg) ? 'blocked:model-rate-limited' : 'blocked:model-call';
          report.blockedReason = msg.slice(0, 300);
        }
      } catch (e) {
        report.status = 'blocked:sdk-load';
        report.blockedReason = String(e?.message || e).slice(0, 300);
      }
    }
  } else {
    report.status = 'ok:no-llm';
  }

  mkdirSync(outDir, { recursive: true });
  const day = new Date().toLocaleDateString('en-CA'); // local calendar day (Europe/Oslo on this machine)
  const base = isReclaim ? `jev-insight-reclaim-${scan.analyzedDay}` : `jev-insight-${day}`;
  const jsonPath = join(outDir, `${base}.json`);
  const mdPath = join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  if (report.routing) {
    appendFileSync(join(outDir, 'jev-insight-decisions.jsonl'), `${JSON.stringify({ ts: report.generatedAt, ...report.routing })}\n`, 'utf8');
  }
  console.log(`status ${report.status}`);
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
