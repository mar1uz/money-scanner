// forward-test-score-bands.mjs
// Daily forward-validation logger for the redesigned flip setup score.
// Reads the latest daily-regime-scan run from Firestore (confirmed-* segments),
// appends new flip-time entries + due horizon exits to an append-only log:
//   tmp/paper-trades/score-bands-forward.jsonl
// --report writes tmp/paper-trades/score-bands-forward-report.json and prints
// the band x horizon table (net of costs). Protocol: see core header.
// Research only - no orders, no exchange connections, no stored credentials
// (Firestore read uses a fresh `gcloud auth print-access-token`, never printed).

import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  LOG_VERSION, LOG_START_UTC, REVIEW_ENTRY_TARGET, REVIEW_DATE, HORIZONS_DAYS,
  BANDS, parseLog, serializeRecords, updateLog, aggregate
} from './forward-test-score-bands-core.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = path.join(REPO_ROOT, 'tmp', 'paper-trades');
const LOG_PATH = path.join(LOG_DIR, 'score-bands-forward.jsonl');
const REPORT_PATH = path.join(LOG_DIR, 'score-bands-forward-report.json');
const REPORT_MODE = process.argv.includes('--report');

const PROJECT = 'gen-lang-client-0610749770';
const DATABASE = 'money-scanner-360';
const STATE_DOC = 'operations/daily-regime-scan';

const accessToken = () => execSync(
  'gcloud auth print-access-token',
  { env: { ...process.env, CLOUDSDK_PYTHON: '/opt/homebrew/bin/python3.12' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
).trim();

const api = async (token, urlPath) => {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/${urlPath}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`firestore ${urlPath} HTTP ${res.status}`);
  return res.json();
};

const num = v => v?.doubleValue ?? (v?.integerValue !== undefined ? Number(v.integerValue) : undefined);
const str = v => v?.stringValue;

/** Latest run id (run names are <epochMs>-<rand>, so max name = latest). */
async function latestRunPath(token) {
  const data = await api(token, `${STATE_DOC}/runs?pageSize=300&mask.fieldPaths=updatedAt`);
  const names = (data.documents || []).map(d => d.name);
  if (!names.length) throw new Error('no scan runs found');
  return names.sort().at(-1).split(`documents/`)[1];
}

/** All confirmed flips from one run, keyed by flip id. */
async function confirmedFlips(token, runPath) {
  const data = await api(token, `${runPath}/segments?pageSize=300`);
  const flips = new Map();
  for (const doc of data.documents || []) {
    const docName = doc.name.split('/').at(-1);
    if (!docName.startsWith('confirmed-')) continue;
    for (const item of doc.fields?.items?.arrayValue?.values || []) {
      const f = item.mapValue?.fields || {};
      const id = str(f.id);
      if (!id) continue;
      flips.set(id, {
        id,
        status: str(f.status),
        symbol: str(f.symbol),
        marketClass: str(f.marketClass),
        timeframe: str(f.timeframe),
        direction: str(f.direction),
        confirmedAt: num(f.confirmedAt),
        candleTimestamp: num(f.candleTimestamp),
        confirmationPrice: num(f.confirmationPrice),
        currentPrice: num(f.currentPrice),
        priorityScore: num(f.priorityScore)
      });
    }
  }
  return flips;
}

async function run() {
  await mkdir(LOG_DIR, { recursive: true });
  let records = [];
  try { records = parseLog(await readFile(LOG_PATH, 'utf8')); } catch { /* first run */ }

  const token = accessToken();
  const runPath = await latestRunPath(token);
  const flips = await confirmedFlips(token, runPath);
  // The scan this run reads was keyed to a closed candle; the logger's "run
  // date" is today's UTC date - horizon targets compare against it.
  const runDate = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  if (REPORT_MODE) {
    const report = {
      generatedAt: now,
      protocol: {
        logVersion: LOG_VERSION,
        logStartUtc: new Date(LOG_START_UTC).toISOString().slice(0, 10),
        bands: BANDS.map(b => b.id),
        horizonsDays: HORIZONS_DAYS,
        costPerSide: '0.075% fee + 0.05% slippage',
        entryRule: 'confirmationPrice (close of confirming candle), direction-adjusted',
        exitRule: 'scanner currentPrice at first logger run on/after +7d/+14d/+30d',
        review: { entryTarget: REVIEW_ENTRY_TARGET, date: REVIEW_DATE }
      },
      ...aggregate(records)
    };
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const fresh = updateLog(records, flips, runDate, now);
  if (fresh.length) {
    await appendFile(LOG_PATH, serializeRecords(fresh));
  }
  const entries = fresh.filter(r => r.kind === 'entry').length;
  const exits = fresh.filter(r => r.kind === 'exit').length;
  console.log(`score-bands forward log: +${entries} entries, +${exits} exits (read ${flips.size} confirmed flips from ${runPath.split('/').at(-1)})`);
}

run().catch(err => { console.error(err.message); process.exit(1); });
