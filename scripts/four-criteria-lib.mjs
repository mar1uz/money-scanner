/**
 * Protocol-quality (4x200) integration - consumes the app's exact evaluator
 * output (apps/api/scripts/four-criteria-local.ts, same code as
 * /ai/crypto-four-criteria) and combines it with setup + ATH potential.
 * The app's own scoring semantics are kept: pass=25, watch=12, fail/unknown=0;
 * insufficient data stays visible as a flag, never silently averaged away.
 */
import { readFileSync } from 'node:fs';

export const QC_WEIGHTS = { technicalSetup: 0.35, athPotential: 0.35, protocolQuality: 0.30 };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (v) => Math.round(v * 10) / 10;

export function loadFourCriteriaScan(path) {
  const scan = JSON.parse(readFileSync(path, 'utf8'));
  return scan;
}

export function matchCriteriaAsset(scan, symbol) {
  return (scan.assets ?? []).find(a => a.symbol === symbol.toUpperCase()) ?? null;
}

/** Compact per-asset view for reports/prompts: pass counts, values, reasons. */
export function summarizeCriteria(asset) {
  if (!asset) return { covered: false, score: null, passedCriteria: null, classification: 'not-in-top200', flags: ['qc-not-in-top200'] };
  const c = asset.criteria ?? {};
  const flags = [];
  if (asset.classification === 'insufficient-data') flags.push('qc-insufficient-data');
  const gates = {};
  for (const key of ['growth', 'networkEffect', 'sustainableRevenue', 'holderValue']) {
    const g = c[key];
    if (!g) continue;
    gates[key] = { status: g.status, value: g.value };
  }
  return {
    covered: true,
    score: asset.score,
    passedCriteria: asset.passedCriteria,
    classification: asset.classification,
    gates,
    metrics: asset.metrics ?? {},
    flags
  };
}

/** Final combination: setup + ATH + protocol quality, weights visible. */
export function combineWithQuality({ momentumScore, athScore, qc }) {
  const flags = [...(qc?.flags ?? [])];
  const qcScore = num(qc?.score);
  if (qcScore == null) flags.push('qc-score-missing');
  const parts = {
    technicalSetup: num(momentumScore),
    athPotential: num(athScore),
    protocolQuality: qcScore ?? 0
  };
  const score = round1(
    (parts.technicalSetup ?? 0) * QC_WEIGHTS.technicalSetup +
    (parts.athPotential ?? 0) * QC_WEIGHTS.athPotential +
    parts.protocolQuality * QC_WEIGHTS.protocolQuality
  );
  return { score, parts, weights: QC_WEIGHTS, flags };
}
