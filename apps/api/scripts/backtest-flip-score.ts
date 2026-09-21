// Backtest: does the new flip priority score predict forward returns?
// Rescores historical confirmed 1D MoneyLine flips with the 5-component formula
// and compares forward returns across score buckets.
import { MoneyLineEngine, calculateMoneyLineCloud } from '@money-scanner/money-line';
import { calculateFlipPriorityScore } from '../src/services/flip-priority-score.js';

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','NEARUSDT','LTCUSDT'];
const WEEK_MS = 604_800_000;

async function klines(symbol: string, interval: string, limit = 1000): Promise<any[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${symbol} ${interval}: HTTP ${res.status}`);
  const raw = (await res.json()) as any[];
  const out = raw.map(k => ({
    symbol, timeframe: interval, timestamp: Number(k[0]),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    isClosed: true, source: 'binance'
  }));
  out.pop(); // drop the in-progress candle
  return out;
}

function rankdata(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}
function spearman(a: number[], b: number[]): number {
  const ra = rankdata(a), rb = rankdata(b);
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (x: number) => (x * 100).toFixed(1) + '%';

async function main() {
  const engine = new MoneyLineEngine();
  const events: any[] = [];
  for (const sym of SYMBOLS) {
    const [daily, weekly] = await Promise.all([klines(sym, '1d'), klines(sym, '1w')]);
    let found = 0;
    for (let i = 210; i < daily.length - 30; i++) {
      const window = daily.slice(0, i + 1);
      const cloud = calculateMoneyLineCloud(window as any, '1d' as any);
      const li = window.length - 1;
      const bull = cloud.buySignals[li] === true;
      const bear = cloud.sellSignals[li] === true;
      if (!bull && !bear) continue;
      const signal = engine.calculateLatest(sym, '1d' as any, window as any);
      if (!signal || !(signal.rawIndicators.atr14 > 0)) continue;
      const direction = bull ? 'BULLISH' as const : 'BEARISH' as const;
      const weeklyWindow = weekly.filter(w => w.timestamp + WEEK_MS <= window[li].timestamp);
      const wSignal = weeklyWindow.length >= 30 ? engine.calculateLatest(sym, '1w' as any, weeklyWindow as any) : undefined;
      const rawTrigger = cloud.lineSlow[li - 1];
      const score = calculateFlipPriorityScore({
        direction,
        currentPrice: window[li].close,
        triggerPrice: Number.isFinite(rawTrigger) && rawTrigger > 0 ? rawTrigger : window[li].close,
        atr: signal.rawIndicators.atr14,
        moneyLineScore: signal.score,
        weeklyTier: wSignal?.tier ?? 'Neutral',
        rvol: signal.rawIndicators.rvol,
        sma50: cloud.sma50[li],
        sma200: cloud.sma200[li]
      }).total;
      const entry = window[li].close;
      const sign = bull ? 1 : -1;
      events.push({
        sym, ts: new Date(window[li].timestamp).toISOString().slice(0, 10), direction,
        score: Math.round(score * 10) / 10,
        ret7: sign * (daily[i + 7].close / entry - 1),
        ret14: sign * (daily[i + 14].close / entry - 1),
        ret30: sign * (daily[i + 30].close / entry - 1)
      });
      found++;
    }
    console.log(`${sym}: ${found} flips`);
  }

  console.log(`\n=== ${events.length} confirmed 1D flips (${events.filter(e => e.direction === 'BULLISH').length} bull / ${events.filter(e => e.direction === 'BEARISH').length} bear), direction-adjusted forward returns ===`);
  console.log(`baseline all events: ret7 ${pct(mean(events.map(e => e.ret7)))} | ret14 ${pct(mean(events.map(e => e.ret14)))} | ret30 ${pct(mean(events.map(e => e.ret30)))}\n`);

  const sorted = [...events].sort((a, b) => a.score - b.score);
  const qSize = Math.floor(sorted.length / 5);
  for (let q = 0; q < 5; q++) {
    const bucket = sorted.slice(q * qSize, q === 4 ? sorted.length : (q + 1) * qSize);
    const scores = bucket.map(e => e.score);
    console.log(
      `Q${q + 1} score ${Math.min(...scores).toFixed(0)}-${Math.max(...scores).toFixed(0)} (n=${bucket.length}): ` +
      `ret7 ${pct(mean(bucket.map(e => e.ret7)))} | ret14 ${pct(mean(bucket.map(e => e.ret14)))} | ` +
      `ret30 mean ${pct(mean(bucket.map(e => e.ret30)))} median ${pct(median(bucket.map(e => e.ret30)))} | ` +
      `hit30 ${pct(bucket.filter(e => e.ret30 > 0).length / bucket.length)}`
    );
  }
  console.log(`\nSpearman rho(score, ret7)  = ${spearman(events.map(e => e.score), events.map(e => e.ret7)).toFixed(3)}`);
  console.log(`Spearman rho(score, ret14) = ${spearman(events.map(e => e.score), events.map(e => e.ret14)).toFixed(3)}`);
  console.log(`Spearman rho(score, ret30) = ${spearman(events.map(e => e.score), events.map(e => e.ret30)).toFixed(3)}`);

  console.log('\ntop-5 scored flips:');
  for (const e of sorted.slice(-5).reverse()) console.log(`  ${e.ts} ${e.sym} ${e.direction} score ${e.score} -> ret30 ${pct(e.ret30)}`);
  console.log('bottom-5 scored flips:');
  for (const e of sorted.slice(0, 5)) console.log(`  ${e.ts} ${e.sym} ${e.direction} score ${e.score} -> ret30 ${pct(e.ret30)}`);
}

main().catch(error => { console.error(error); process.exit(1); });
