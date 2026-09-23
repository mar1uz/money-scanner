#!/usr/bin/env node
/**
 * Publishes Instinct-authored AI content (Capital Rotation analysis and,
 * when delegated, the daily AI takes) to the Money Scanner app.
 *
 * The Instinct generation agent drops JSON files into tmp/ai-content-outbox/
 * through the Mac bridge - it never sees the publish token. This script runs
 * on the Mac as Marius, reads the daily-scan token at runtime from the Cloud
 * Scheduler job (never printed), and POSTs each file to the token-protected
 * /api/ai/publish-content endpoint with source 'instinct-agent'.
 *
 * Outbox file shape:
 *   {"key": "capital-rotation" | "briefing" | "intelligence-brief" | "market-intelligence",
 *    "language": "en" | "ro",
 *    "take": {"headline": string (<=300), "paragraphs": string[1-6] (each <=2000),
 *             "bullets"?: string[<=8] (each <=300), "model": string (<=120),
 *             "generatedAt": number}}
 *
 * Successfully published files move to tmp/ai-content-outbox/sent/.
 * Any failure leaves the file in place and exits non-zero.
 *
 * Usage: node scripts/instinct-content-publisher.mjs
 */
import { mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTBOX = join(ROOT, 'tmp', 'ai-content-outbox');
const SENT = join(OUTBOX, 'sent');
const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
const KEYS = new Set(['capital-rotation', 'briefing', 'intelligence-brief', 'market-intelligence']);
// Per-asset Instinct investment guides: investment-guide-<SYMBOL>.
const KEY_PATTERN = /^(?:investment-guide|asset-profile|business-quality)-[A-Z0-9][A-Z0-9.-]{0,19}$/;

function schedulerToken() {
  const out = execFileSync('gcloud', [
    'scheduler', 'jobs', 'describe', 'money-scanner-regime-tape-scan',
    '--location=europe-west3', "--format=value(httpTarget.headers.X-Daily-Scan-Token)"
  ], { env: { ...process.env, CLOUDSDK_PYTHON: '/opt/homebrew/bin/python3.12' } }).toString().trim();
  return out || null;
}

function validTake(t) {
  return t && typeof t.headline === 'string' && t.headline.length > 0 && t.headline.length <= 300
    && Array.isArray(t.paragraphs) && t.paragraphs.length >= 1 && t.paragraphs.length <= 6
    && t.paragraphs.every(p => typeof p === 'string' && p.length > 0 && p.length <= 2000)
    && (t.bullets === undefined || (Array.isArray(t.bullets) && t.bullets.length <= 8 && t.bullets.every(b => typeof b === 'string' && b.length <= 300)))
    && typeof t.model === 'string' && t.model.length > 0 && t.model.length <= 120
    && Number.isFinite(t.generatedAt);
}

async function publish(token, doc) {
  const res = await fetch(`${BASE_URL}/api/ai/publish-content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-daily-scan-token': token },
    body: JSON.stringify({ key: doc.key, language: doc.language, take: doc.take, source: 'instinct-agent' }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) throw new Error(`publish ${doc.key} (${doc.language}) HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 600)}`);
}

async function main() {
  mkdirSync(OUTBOX, { recursive: true });
  mkdirSync(SENT, { recursive: true });
  const files = readdirSync(OUTBOX).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { console.log('outbox empty'); return; }
  const token = schedulerToken();
  if (!token) { console.error('blocked: no scheduler token'); process.exit(2); }
  let published = 0;
  for (const file of files) {
    const doc = JSON.parse(readFileSync(join(OUTBOX, file), 'utf8'));
    if ((!KEYS.has(doc.key) && !KEY_PATTERN.test(doc.key)) || (doc.language !== 'en' && doc.language !== 'ro') || !validTake(doc.take)) {
      console.error(`invalid outbox file, left in place: ${file}`);
      process.exitCode = 1;
      continue;
    }
    try {
      await publish(token, doc);
    } catch (e) {
      // e.g. 422 from the narrative guard: leave the file in place, keep going.
      console.error(`rejected, left in place: ${file}: ${String(e?.message || e).slice(0, 700)}`);
      process.exitCode = 1;
      continue;
    }
    renameSync(join(OUTBOX, file), join(SENT, `${Date.now()}-${file}`));
    console.log(`published ${doc.key} (${doc.language}) from ${file}`);
    published++;
  }
  console.log(`done: ${published}/${files.length} published`);
}

main().catch(e => { console.error(String(e?.message || e).slice(0, 300)); process.exit(1); });
