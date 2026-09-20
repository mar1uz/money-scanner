// backtest-pullback-local.ts - PAPER backtest of the daily stage-2 pullback
// retest setup (bullish alignment, dip to SMA50, hold) on AI-sector stocks
// during bull-market windows. Public data only, no Firestore, no Telegram.
// Run: cd apps/api && ../../node_modules/.bin/tsx scripts/backtest-pullback-local.ts
import { AppState } from '../src/services/app-state.js';
import { evaluateMaCross } from '../src/services/ma-cross-alert-service.js';

const SYMBOLS = ['NVDA', 'MSFT', 'AVGO', 'AMD', 'PLTR'];
const FORWARD_DAYS = 40;

interface Trade {
  symbol: string;
  entryDay: string;
  entry: number;
  stop: number;
  exit: number;
  exitDay: string;
  outcome: 'STOPPED' | 'OPEN_END';
  rMultiple: number;
  maxGainPct: number;
  days: number;
}

const dayStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const dayLabel = (t: number) => new Date(t).toISOString().slice(0, 10);

async function main() {
  const appState = AppState.getInstance();
  const marketData = appState.marketData;
  const trades: Trade[] = [];
  for (const symbol of SYMBOLS) {
    const candles = await marketData.getCandles(symbol, '1d', 900, 'stocks').catch(() => null);
    const closed = (candles || []).filter(c => c.isClosed !== false).map(c => ({ ...c, timestamp: dayStart(c.timestamp) }));
    if (closed.length < 260) { console.log(`${symbol}: insufficient history (${closed.length})`); continue; }
    // Walk forward: at each day, evaluate the stage-2 condition on the window ending that day.
    for (let end = 210; end < closed.length - 1; end += 1) {
      const window = closed.slice(0, end + 1);
      const evaluation = evaluateMaCross(symbol, window, [], { expectedDayTimestamp: window.at(-1)!.timestamp, minDailyCandles: 210 });
      const stage2 = evaluation.dailyEvents.find(event => event.stage === 'daily_stage2');
      if (!stage2?.setup) continue;
      const entry = stage2.close;                 // entry at the retest close
      const stop = stage2.setup.stop;
      const risk = entry - stop;
      if (risk <= 0) continue;
      let exit = closed.at(-1)!.close;
      let exitDay = dayLabel(closed.at(-1)!.timestamp);
      let outcome: Trade['outcome'] = 'OPEN_END';
      let days = closed.length - 1 - end;
      let maxGain = 0;
      for (let f = end + 1; f < Math.min(end + 1 + FORWARD_DAYS, closed.length); f += 1) {
        maxGain = Math.max(maxGain, (closed[f].high / entry - 1) * 100);
        if (closed[f].low <= stop) {           // stop touched intraday
          exit = stop;
          exitDay = dayLabel(closed[f].timestamp);
          outcome = 'STOPPED';
          days = f - end;
          break;
        }
        if (f === Math.min(end + FORWARD_DAYS, closed.length - 1)) {
          exit = closed[f].close;
          exitDay = dayLabel(closed[f].timestamp);
          days = f - end;
        }
      }
      trades.push({
        symbol, entryDay: dayLabel(stage2.candleTimestamp), entry, stop, exit, exitDay,
        outcome, rMultiple: (exit - entry) / risk, maxGainPct: maxGain, days
      });
      end += 5; // skip a week to avoid clustered duplicate entries on the same pullback
    }
    console.log(`${symbol}: ${trades.filter(t => t.symbol === symbol).length} setups`);
  }
  const wins = trades.filter(t => t.rMultiple > 0);
  console.log('\n=== PULLBACK RETEST BACKTEST (daily stage-2 definition) ===');
  for (const t of trades) {
    console.log(`${t.symbol} ${t.entryDay} entry $${t.entry.toFixed(2)} stop $${t.stop.toFixed(2)} -> ${t.outcome} ${t.exitDay} R=${t.rMultiple.toFixed(2)} maxGain=${t.maxGainPct.toFixed(1)}% days=${t.days}`);
  }
  console.log(`\nTrades: ${trades.length} | Win rate: ${trades.length ? ((wins.length / trades.length) * 100).toFixed(0) : 0}% | Avg R: ${trades.length ? (trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length).toFixed(2) : 0} | Avg max gain: ${trades.length ? (trades.reduce((s, t) => s + t.maxGainPct, 0) / trades.length).toFixed(1) : 0}%`);
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
