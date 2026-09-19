/**
 * JEV Insight - pure library for the Money Scanner "jev insight" layer.
 *
 * jev (TypeSafe's System-One evaluation model) scores the complexity of the
 * ranking task; threshold arithmetic here (never in the model) maps the score
 * to a model tier. Rules mirror the jev-router project:
 *   score < 1.2 -> cheap, 1.2..2.79 -> mid, >= 2.8 -> frontier
 *   confidence < 0.6 -> escalate one tier (safe direction)
 *   frontier without paid AI Gateway access -> degrade visibly to mid
 *   jev unavailable -> documented local fallback (mid)
 *
 * No I/O and no SDK imports in this file: everything is injectable so the
 * node:test suite can exercise every branch offline.
 */

export const JEV_MODEL = 'typesafe-ai/jev';

export const TIERS = {
  cheap: {
    id: 'cheap', label: 'Cheap', model: 'inclusionai/ling-3.0-flash-sante-free',
    costIn: 0, costOut: 0
  },
  mid: {
    id: 'mid', label: 'Mid', model: 'inception/mercury-2.5',
    costIn: 0.04, costOut: 0.15
  },
  frontier: {
    id: 'frontier', label: 'Frontier', model: 'anthropic/claude-opus-4.6',
    costIn: 5, costOut: 25
  }
};
export const TIER_ORDER = ['cheap', 'mid', 'frontier'];
export const CHEAP_MAX = 1.2;
export const FRONTIER_MIN = 2.8;
export const CONFIDENCE_FLOOR = 0.6;

export const QUESTIONS = {
  complexity: {
    type: 'score',
    instructions:
      'How much model capability does this task require? Judge the work, not the topic. ' +
      'The task: given a deterministic 1D+1W technical packet for a fixed cohort of ' +
      'near-flip assets, rank the best ten for upside, explain conflicts between ' +
      'timeframes, list pro/con evidence, invalidation levels, and label confidence. ' +
      'All numbers are precomputed; the model must reason across assets and be auditable.',
    criteria: [
      'Trivial: echo or reformat the packet',
      'Simple: pick ten by a single supplied field',
      'Moderate: rank with per-asset justification from supplied fields',
      'Complex: weigh cross-timeframe conflicts, extension, liquidity and data gaps across ~20 assets',
      'Expert: high-stakes synthesis where a missed conflict or invented number is costly'
    ]
  },
  tools: {
    type: 'boolean',
    instructions:
      'Will answering well require external tools (web search, fetching URLs, files, shell) rather than pure reasoning over the supplied packet?'
  }
};

export function numberOrNull(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function bumpTier(tier) {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)];
}

/** Pure threshold arithmetic. score null means jev gave no answer. */
export function pickTier(score, confidence) {
  if (score === null || score === undefined) return null;
  let tier = score < CHEAP_MAX ? 'cheap' : score < FRONTIER_MIN ? 'mid' : 'frontier';
  let reason = `complexity ${score.toFixed(2)}/4 -> ${TIERS[tier].label}`;
  let escalated = false;
  if (confidence !== null && confidence !== undefined && confidence < CONFIDENCE_FLOOR) {
    escalated = true;
    tier = bumpTier(tier);
    reason += ` · confidence ${confidence.toFixed(2)} < ${CONFIDENCE_FLOOR} -> escalated to ${TIERS[tier].label}`;
  }
  return { tier, escalated, reason };
}

/** Local fallback when jev cannot answer (rate limit, network, missing key). */
export function fallbackDecision(evalError) {
  return {
    tier: 'mid', escalated: false, fallback: true,
    reason: `jev unavailable${evalError ? ` (${evalError})` : ''} -> local heuristic: structured multi-asset analysis -> Mid tier`
  };
}

/** Scan entries with marketClass 'crypto' get the deterministic engine packet. */
export function isCryptoEntry(scanEntry) {
  return scanEntry?.marketClass === 'crypto';
}

/**
 * Normalize one scan row + its deterministic 1D/1W evaluation into the packet
 * the model sees. missingData lists every gap explicitly; nothing is filled in.
 */
export function buildCohortEntry(scanEntry, deterministic) {
  const missing = [];
  const entry = {
    symbol: scanEntry.symbol,
    name: scanEntry.name ?? null,
    marketClass: scanEntry.marketClass,
    scan: {
      id: scanEntry.id,
      timeframe: scanEntry.timeframe,
      direction: scanEntry.direction,
      status: scanEntry.status,
      priorityScore: scanEntry.priorityScore,
      currentPrice: scanEntry.currentPrice,
      triggerPrice: scanEntry.triggerPrice,
      distancePercent: scanEntry.distancePercent,
      distanceAtr: scanEntry.distanceAtr,
      rvol: scanEntry.rvol,
      moneyLineTier: scanEntry.moneyLineTier,
      moneyLineScore: scanEntry.moneyLineScore,
      weeklyTier: scanEntry.weeklyTier,
      weeklyScore: scanEntry.weeklyScore,
      sma50Aligned: scanEntry.sma50Aligned,
      sma200Aligned: scanEntry.sma200Aligned,
      weeklyAligned: scanEntry.weeklyAligned,
      candleTimestamp: scanEntry.candleTimestamp,
      scannedAt: scanEntry.scannedAt,
      marketCapRank: scanEntry.marketCapRank ?? null,
      ...(scanEntry.reclaim ? { reclaim: scanEntry.reclaim } : {})
    },
    deterministic: deterministic ?? null,
    missingData: missing
  };
  if (!deterministic) {
    missing.push('deterministic 1D/1W engine packet not available for this market class; scan fields only');
  } else {
    for (const tf of ['1d', '1w']) {
      const t = deterministic[tf];
      if (!t) { missing.push(`${tf}: not evaluated`); continue; }
      if (t.error) { missing.push(`${tf}: ${t.error}`); continue; }
      if (t.sma50 == null) missing.push(`${tf}: SMA50 unavailable (short history)`);
      if (t.sma200 == null) missing.push(`${tf}: SMA200 unavailable (short history)`);
      if (t.rvol == null) missing.push(`${tf}: RVOL unavailable`);
    }
  }
  missing.push('fundamentals/on-chain/narrative/mindshare: not provided by the deterministic pipeline');
  return entry;
}


/**
 * Adapt a DAILY_SMA50_200_RECLAIM report (local reproduction shape) to cohort
 * scan rows. Only NEW_SIGNAL results enter the cohort; every reclaim-specific
 * field rides along under scan.reclaim for audit.
 */
export function reclaimToScanEntries(report) {
  return (report.results ?? [])
    .filter(r => r.status === 'NEW_SIGNAL' && r.signal)
    .map(r => {
      const s = r.signal;
      const upperSma = Math.max(s.sma50, s.sma200);
      return {
        id: `reclaim:${r.symbol}:1d:BULLISH`,
        symbol: r.symbol,
        name: r.name ?? r.symbol,
        marketClass: 'crypto',
        timeframe: '1d',
        direction: 'BULLISH',
        status: 'NEW_SIGNAL',
        currentPrice: r.currentPrice ?? s.confirmationPrice,
        triggerPrice: upperSma,
        distancePercent: (s.confirmationPrice / upperSma - 1) * 100,
        distanceAtr: s.distanceToUpperSmaAtr ?? null,
        rvol: s.rvol ?? null,
        moneyLineTier: s.dailyMoneyLine?.tier ?? null,
        moneyLineScore: s.dailyMoneyLine?.score ?? null,
        weeklyTier: s.weeklyMoneyLine?.tier ?? null,
        weeklyScore: s.weeklyMoneyLine?.score ?? null,
        sma50Aligned: s.confirmationPrice > s.sma50,
        sma200Aligned: s.confirmationPrice > s.sma200,
        weeklyAligned: s.weeklyMoneyLine?.bullish ?? false,
        candleTimestamp: r.analyzedDayTimestamp,
        scannedAt: report.reproducedAt ?? null,
        marketCapRank: r.rank ?? null,
        reclaim: {
          ruleId: r.ruleId, eventId: r.eventId ?? null, source: r.source, pair: r.pair, rank: r.rank ?? null,
          confirmationPrice: s.confirmationPrice, previousClose: s.previousClose,
          sma50: s.sma50, sma200: s.sma200,
          sma50Direction: s.sma50Direction, sma200Direction: s.sma200Direction,
          atr14: s.atr14 ?? null, distanceToUpperSmaAtr: s.distanceToUpperSmaAtr ?? null,
          distanceLabel: s.distanceLabel ?? null,
          rvol: s.rvol ?? null, rvolHighlighted: s.rvolHighlighted ?? false,
          dailyMoneyLine: s.dailyMoneyLine ?? null,
          weeklyMoneyLine: s.weeklyMoneyLine ?? null
        }
      };
    });
}

/** Keys the insight JSON must never contain: no invented probabilities. */
export const FORBIDDEN_KEY_RE = /probab|chance|likelihood|winrate|win_rate|p_win|pwin|expectedvalue|expected_value/i;
export const CONFIDENCE_LABELS = ['low', 'medium', 'high'];
export const TIMEFRAME_RELATIONS = ['confirm', 'conflict', 'mixed', 'unknown'];

export function findForbiddenKeys(value, path = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, hits));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY_RE.test(k)) hits.push(`${path}.${k}`);
      findForbiddenKeys(v, `${path}.${k}`, hits);
    }
  }
  return hits;
}

/**
 * Validate the model's insight JSON against the cohort. Complete coverage:
 * every unique cohort symbol must appear exactly once across top10 + eliminated.
 */
export function validateInsight(insight, cohortSymbols) {
  const errors = [];
  if (!insight || typeof insight !== 'object') return { ok: false, errors: ['insight is not an object'] };
  const unique = [...new Set(cohortSymbols)];

  const top10 = insight.top10;
  if (!Array.isArray(top10) || top10.length !== 10) {
    errors.push('top10 must be an array of exactly 10 entries');
  } else {
    const ranks = top10.map(e => e?.rank).sort((a, b) => a - b);
    if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) errors.push(`top10 ranks must be 1..10, got ${JSON.stringify(ranks)}`);
    top10.forEach((e, i) => {
      if (!e || typeof e !== 'object') { errors.push(`top10[${i}] not an object`); return; }
      if (!unique.includes(e.symbol)) errors.push(`top10[${i}] symbol ${JSON.stringify(e.symbol)} not in cohort`);
      if (typeof e.why !== 'string' || !e.why.trim()) errors.push(`top10[${i}].why missing`);
      if (!Array.isArray(e.pro) || e.pro.length === 0) errors.push(`top10[${i}].pro must be a non-empty array`);
      if (!Array.isArray(e.con) || e.con.length === 0) errors.push(`top10[${i}].con must be a non-empty array`);
      if (typeof e.invalidation !== 'string' || !e.invalidation.trim()) errors.push(`top10[${i}].invalidation missing`);
      if (!CONFIDENCE_LABELS.includes(e.confidence)) errors.push(`top10[${i}].confidence must be one of ${CONFIDENCE_LABELS.join('/')}`);
      if (!TIMEFRAME_RELATIONS.includes(e.timeframes1d1w)) errors.push(`top10[${i}].timeframes1d1w must be one of ${TIMEFRAME_RELATIONS.join('/')}`);
    });
  }

  const eliminated = insight.eliminated;
  if (!Array.isArray(eliminated)) {
    errors.push('eliminated must be an array');
  } else {
    eliminated.forEach((e, i) => {
      if (!unique.includes(e?.symbol)) errors.push(`eliminated[${i}] symbol ${JSON.stringify(e?.symbol)} not in cohort`);
      if (typeof e?.reason !== 'string' || !e.reason.trim()) errors.push(`eliminated[${i}].reason missing`);
    });
    const covered = new Set([...(Array.isArray(top10) ? top10.map(e => e?.symbol) : []), ...eliminated.map(e => e?.symbol)]);
    const missingCov = unique.filter(s => !covered.has(s));
    if (missingCov.length) errors.push(`coverage incomplete, unaccounted symbols: ${missingCov.join(', ')}`);
  }

  for (const hit of findForbiddenKeys(insight)) {
    errors.push(`forbidden probability-like key: ${hit}`);
  }
  return { ok: errors.length === 0, errors };
}

export function buildPrompt({ scanMeta, cohort }) {
  const system = [
    'You are the insight layer of a deterministic market scanner. You receive a precomputed',
    '1D+1W technical packet for a fixed cohort of near-flip assets and rank the best ten',
    'for upside from here. Rules, in order of importance:',
    '1. Use ONLY the supplied data. If a kind of evidence is not in the packet (fundamentals,',
    '   on-chain, narrative, mindshare), say "not_provided" instead of inventing it.',
    '2. NEVER output probabilities, percentages of success, chance, likelihood, win rates,',
    '   or expected values. Confidence is a discrete label: low | medium | high. It is an',
    '   analyst confidence label, not a calibrated probability, and you must say so in notes.',
    '3. Every rank must combine BOTH timeframes: state per asset whether 1D and 1W confirm,',
    '   conflict, or are mixed/unknown, using the supplied fields.',
    '4. Every unique cohort symbol appears exactly once across top10 and eliminated.',
    '5. Respect missingData flags; a missing field is a fact about data quality, not a zero.',
    '6. Respond with STRICT JSON only, no markdown fences, no commentary, in English.',
    'Schema: {"top10":[{"rank":1,"symbol":"AAA","why":"...","pro":["..."],"con":["..."],',
    '"invalidation":"...","resistance":"...","confidence":"medium","timeframes1d1w":"confirm"}],',
    '"eliminated":[{"symbol":"BBB","reason":"..."}],"notes":"..."}'
  ].join('\n');
  // Compact ATH summary for the prompt: keeps the decision inputs, drops the verbose
  // component breakdown so small models keep symbol coverage straight.
  const compactAth = (entry) => {
    if (!entry?.ath) return entry;
    const f = entry.ath.features ?? {};
    return {
      ...entry,
      ath: {
        distToAthPct: f.distToAthPct ?? null,
        daysSinceAth: f.daysSinceAth ?? null,
        mcapMultipleToAth: f.mcapMultipleToAth ?? null,
        rsVsBtc30Pct: f.rsVsBtc30Pct ?? null,
        fdvToMcap: f.fdvToMcap ?? null,
        circulatingPct: f.circulatingPct ?? null,
        tvlChange30dPct: f.tvlChange30dPct ?? null,
        missingData: f.missingData ?? [],
        potentialScore: entry.ath.potential?.score ?? null,
        potentialFlags: entry.ath.potential?.flags ?? [],
        momentumScore: entry.ath.momentum?.score ?? null
      }
    };
  };
  const promptCohort = cohort.map(compactAth);
  const symbols = cohort.map(c => c.symbol);
  const user = JSON.stringify({
    task: 'Rank the top 10 of this near-flip cohort for upside, combining 1D and 1W.',
    scan: scanMeta,
    cohort: promptCohort,
    symbolLedger: {
      count: symbols.length,
      symbols,
      rule: 'top10 (10 symbols) + eliminated must partition this exact list: every symbol exactly once, no symbol outside it, none missing. Copy symbols verbatim.'
    }
  });
  return { system, user };
}

export function estimateCostUsd(tierId, usage) {
  const tier = TIERS[tierId];
  if (!tier || !usage) return null;
  const inTok = numberOrNull(usage.inputTokens ?? usage.promptTokens) ?? 0;
  const outTok = numberOrNull(usage.outputTokens ?? usage.completionTokens) ?? 0;
  return (inTok / 1_000_000) * tier.costIn + (outTok / 1_000_000) * tier.costOut;
}

export const CALIBRATION_STATEMENT =
  'No probability in this report is calibrated. Engine scores are deterministic indicators, ' +
  'jev routes model choice, and the LLM confidence labels are qualitative. Numeric ' +
  'probability fields stay absent until forward calibration supports them. ' +
  'Historical reference only (held-out 2026-09-19 study): bull-flip +20%-before--10% in 21d ' +
  'base rate 29.9% overall, 18.7% in the test window, 38.5% in the unvalidated RVOL>=2 subset.';

export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# JEV Insight - ${report.generatedAt}`);
  lines.push('');
  lines.push(`Status: ${report.status}`);
  lines.push(`Scan: ${report.pipeline.scanGeneratedAt} (${report.pipeline.scanMethod}), universe ${report.pipeline.universeCount}, cohort ${report.pipeline.cohortSize}, last closed 1D ${report.pipeline.lastClosedDaily ?? 'n/a'}, 1W ${report.pipeline.lastClosedWeekly ?? 'n/a'}`);
  const r = report.routing;
  if (r) {
    lines.push(`Routing: ${r.reason} | model ${r.model}${r.degradedReason ? ` | degraded: ${r.degradedReason}` : ''}${r.fallback ? ' | FALLBACK' : ''}`);
  }
  lines.push('');
  if (report.status !== 'ok') {
    lines.push(`> BLOCKED: ${report.blockedReason ?? report.status}. Deterministic packet and routing record are intact in the JSON twin of this file.`);
    lines.push('');
  }
  if (report.rankings?.combined) {
    const w = report.rankings.weights;
    lines.push(`## Rankings (deterministic, weights: momentum ${w.momentum} / ATH potential ${w.athPotential})`);
    lines.push('');
    lines.push('Combined top 10: ' + report.rankings.combined.slice(0, 10).map(r => `${r.symbol} ${r.combined} (m ${r.momentumScore ?? 'n/a'} / ath ${r.athScore ?? 'n/a'})`).join(' | '));
    lines.push('ATH potential: ' + report.rankings.athPotential.slice(0, 10).map(r => `${r.symbol} ${r.athScore}`).join(' | '));
    lines.push('Momentum: ' + report.rankings.momentum.slice(0, 10).map(r => `${r.symbol} ${r.momentumScore}`).join(' | '));
    lines.push('');
    const flagged = (report.cohort ?? []).filter(c => c.ath?.potential?.flags?.length);
    if (flagged.length) {
      lines.push('Flags: ' + flagged.map(c => `${c.symbol} [${c.ath.potential.flags.join(', ')}]`).join('; '));
      lines.push('');
    }
  }
  if (report.protocolQuality?.ranking) {
    const w = report.protocolQuality.weights;
    lines.push(`## Protocol-quality final (setup ${w.technicalSetup} / ATH ${w.athPotential} / 4x200 ${w.protocolQuality})`);
    lines.push(`4x200 evaluator: app crypto-four-criteria-scanner, local run. ${report.protocolQuality.source ?? ''} Generated ${report.protocolQuality.generatedAt ?? 'n/a'}.`);
    lines.push('');
    lines.push('Final top 10: ' + report.protocolQuality.ranking.slice(0, 10).map(r => `${r.symbol} ${r.score}`).join(' | '));
    for (const r of report.protocolQuality.ranking.slice(0, 10)) {
      const qcText = r.qc.score != null ? `qc ${r.qc.score} (${r.qc.passedCriteria}/4 pass, ${r.qc.classification})` : 'qc not covered';
      lines.push(`- ${r.symbol}: setup ${r.parts.technicalSetup ?? 'n/a'} / ath ${r.parts.athPotential ?? 'n/a'} / ${qcText}${r.flags.length ? ` [${[...new Set(r.flags)].join(', ')}]` : ''}`);
    }
    lines.push('');
  }
  if (report.fourAxes?.ranking) {
    const w = report.fourAxes.weights;
    lines.push(`## Four-axis final (setup ${w.technicalSetup} / ATH ${w.athPotential} / fundamentals ${w.fundamentals} / on-chain ${w.onchain} / narrative ${w.narrative})`);
    lines.push(`Sources: DefiLlama fees overview + v2/chains + historicalChainTvl, CoinGecko trending. Fetched ${report.fourAxes.fetchedAt}.`);
    lines.push('');
    lines.push('Final top 10: ' + report.fourAxes.ranking.slice(0, 10).map(r => `${r.symbol} ${r.score}`).join(' | '));
    for (const r of report.fourAxes.ranking.slice(0, 10)) {
      lines.push(`- ${r.symbol}: setup ${r.parts.technicalSetup ?? 'n/a'} / ath ${r.parts.athPotential ?? 'n/a'} / fund ${r.parts.fundamentals ?? 'n/a'} / onchain ${r.parts.onchain ?? 'n/a'} / narrative ${r.parts.narrative ?? 'n/a'}${r.flags.length ? ` [${[...new Set(r.flags)].join(', ')}]` : ''}`);
    }
    lines.push('');
  }
  if (report.insight?.top10) {
    lines.push('## Top 10 (1D x 1W combined)');
    lines.push('');
    for (const e of report.insight.top10) {
      lines.push(`### ${e.rank}. ${e.symbol} - confidence ${e.confidence}, timeframes ${e.timeframes1d1w}`);
      lines.push(e.why);
      lines.push('');
      lines.push(`Pro: ${e.pro.join('; ')}`);
      lines.push(`Con: ${e.con.join('; ')}`);
      lines.push(`Invalidation: ${e.invalidation}`);
      if (e.resistance) lines.push(`Resistance: ${e.resistance}`);
      lines.push('');
    }
    lines.push('## Eliminated');
    lines.push('');
    for (const e of report.insight.eliminated ?? []) lines.push(`- ${e.symbol}: ${e.reason}`);
    lines.push('');
    if (report.insight.notes) { lines.push(`Notes: ${report.insight.notes}`); lines.push(''); }
  }
  if (report.validation && !report.validation.ok) {
    lines.push(`Validation errors: ${report.validation.errors.join(' | ')}`);
    lines.push('');
  }
  if (report.usage) {
    lines.push(`Usage: ${JSON.stringify(report.usage)} | estimated cost USD ${report.usage.estimatedCostUsd ?? 'n/a'}`);
    lines.push('');
  }
  lines.push(`Calibration: ${CALIBRATION_STATEMENT}`);
  lines.push('');
  lines.push('Not trading advice.');
  return lines.join('\n');
}
