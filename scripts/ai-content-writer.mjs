#!/usr/bin/env node
/**
 * AI content writer for the AI Briefing + Intelligence pages.
 *
 * Runs LOCALLY on the Mac (launchd). Reads public market inputs, calls the
 * Vercel AI Gateway with the local AI_GATEWAY_API_KEY (loaded from
 * ../jev-router/.env.local, never printed), and publishes short Romanian
 * "AI take" blocks to the app via POST /api/ai/publish-content (daily-scan
 * token, read at runtime from the Cloud Scheduler job, never printed).
 * The API stores them in Firestore; the pages render them on top.
 *
 * Usage: node scripts/ai-content-writer.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

async function loadAiSdk() {
  const require = createRequire(JEV_ROUTER_PKG);
  const [ai, gateway] = await Promise.all([
    import(pathToFileURL(require.resolve('ai')).href),
    import(pathToFileURL(require.resolve('@ai-sdk/gateway')).href)
  ]);
  return { generateText: ai.generateText, createGateway: gateway.createGateway };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JEV_ROUTER_PKG = join(ROOT, '..', 'jev-router', 'package.json');
const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://market-scanner-360-384051756749.europe-west3.run.app';
const MODEL_PAID = 'anthropic/claude-opus-4.6';
const MODEL_FREE = 'inception/mercury-2.5';

function ensureGatewayKey() {
  if (process.env.AI_GATEWAY_API_KEY) return true;
  try {
    process.loadEnvFile(join(ROOT, '..', 'jev-router', '.env.local'));
    return Boolean(process.env.AI_GATEWAY_API_KEY);
  } catch { return false; }
}

function schedulerToken() {
  const out = execFileSync('gcloud', [
    'scheduler', 'jobs', 'describe', 'money-scanner-regime-tape-scan',
    '--location=europe-west3', "--format=value(httpTarget.headers.X-Daily-Scan-Token)"
  ], { env: { ...process.env, CLOUDSDK_PYTHON: '/opt/homebrew/bin/python3.12' } }).toString().trim();
  return out || null;
}

async function fetchJson(url, timeoutMs = 20_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function marketInputs() {
  const [global, markets, trending] = await Promise.all([
    fetchJson('https://api.coingecko.com/api/v3/global'),
    fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&page=1&price_change_percentage=24h,7d'),
    fetchJson('https://api.coingecko.com/api/v3/search/trending').catch(() => null)
  ]);
  const top = markets.map(c => `${c.symbol.toUpperCase()} $${c.current_price} 24h ${c.price_change_percentage_24h?.toFixed(1)}% 7d ${c.price_change_percentage_7d_in_currency?.toFixed(1)}% mcap $${(c.market_cap / 1e9).toFixed(1)}B`).join('\n');
  const trend = trending?.coins?.slice(0, 7).map(c => c.item.symbol).join(', ') || 'n/a';
  return [
    `Cap total piață: $${(global.data.total_market_cap.usd / 1e12).toFixed(2)}T (24h ${global.data.market_cap_change_percentage_24h_usd?.toFixed(1)}%), volum 24h $${(global.data.total_volume.usd / 1e9).toFixed(0)}B, dominanță BTC ${global.data.market_cap_percentage.btc?.toFixed(1)}%.`,
    `Top 15 după market cap:\n${top}`,
    `Trending CoinGecko: ${trend}`
  ].join('\n\n');
}

function latestJevInsight() {
  try {
    const dir = join(ROOT, 'tmp', 'insights');
    const md = readdirSync(dir).filter(f => /^jev-insight-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().at(-1);
    if (!md) return null;
    const text = readFileSync(join(dir, md), 'utf8');
    return text.slice(0, 2500);
  } catch { return null; }
}

async function hasPaidAccess() {
  try {
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL_PAID, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(20_000)
    });
    return res.ok;
  } catch { return false; }
}

async function generateTake(gateway, model, pageInstruction, inputs) {
  const system = 'Ești analyst-ul de piață al aplicației Money Scanner. Scrii în română, concis, factual, fără recomandări de cumpărare/vânzare și fără probabilități inventate. Răspunzi NUMAI cu JSON valid: {"headline": string (max 200 chars), "paragraphs": string[1-4] (fiecare max 600 chars), "bullets": string[0-5] (fiecare max 200 chars)}.';
  const result = await callGateway(gateway, model, system, `${pageInstruction}\n\nDate de piață curente:\n${inputs}`);
  const match = result.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`modelul nu a returnat JSON [${model}]: ${result.slice(0, 200)}`);
  return { ...JSON.parse(match[0]), model, generatedAt: Date.now() };
}

async function callGateway(gateway, model, system, prompt) {
  const { generateText } = await loadAiSdk();
  const result = await generateText({
    model: gateway.languageModel(model),
    system, prompt, maxOutputTokens: 6000, temperature: 0.2,
    abortSignal: AbortSignal.timeout(180_000),
    abortSignal: AbortSignal.timeout(180_000)
  });
  return result.text || '';
}

async function publish(token, key, take) {
  const res = await fetch(`${BASE_URL}/api/ai/publish-content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-daily-scan-token': token },
    body: JSON.stringify({ key, take }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) throw new Error(`publish ${key} HTTP ${res.status}`);
}

async function main() {
  if (!ensureGatewayKey()) { console.error('blocked: no AI gateway key'); process.exit(2); }
  const token = schedulerToken();
  if (!token) { console.error('blocked: no scheduler token'); process.exit(2); }
  const inputs = await marketInputs();
  const jev = latestJevInsight();
  const fullInputs = jev ? `${inputs}\n\nCel mai recent raport JEV Insight (top selecții zilnice):\n${jev}` : inputs;
  const paid = await hasPaidAccess();
  const model = paid ? MODEL_PAID : MODEL_FREE;
  const { createGateway } = await loadAiSdk();
  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });

  const briefTake = await generateTake(gateway, model,
    'Scrie blocul "AI take" pentru pagina AI Briefing (raport de inteligență de piață): titlu + 2-3 paragrafe de context macro/cripto pentru astăzi + 3-5 bullets cu ce merită urmărit. Ton: clar, la obiect.',
    fullInputs);
  await publish(token, 'market-intelligence', briefTake);
  console.log(`published market-intelligence via ${model}`);

  const intelTake = await generateTake(gateway, model,
    'Scrie blocul "AI take" pentru pagina Intelligence (rezumat de știri și social): titlu + 1-2 paragrafe cu temele zilei + 3-5 bullets cu narațiunile active. Ton: clar, la obiect.',
    inputs);
  await publish(token, 'intelligence-brief', intelTake);
  console.log(`published intelligence-brief via ${model}`);

  const pageBriefTake = await generateTake(gateway, model,
    'Scrie blocul "AI take" pentru pagina AI Briefing (briefing zilnic de piață): titlu + 2-3 paragrafe despre regimul actual al pieței, driverii principali și riscurile zilei + 3-5 bullets cu activele și temele de urmărit astăzi. Ton: clar, la obiect.',
    fullInputs);
  await publish(token, 'briefing', pageBriefTake);
  console.log(`published briefing via ${model}`);
}

main().catch(e => { console.error(String(e?.message || e).slice(0, 300)); process.exit(1); });
