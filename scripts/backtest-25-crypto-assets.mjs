import {
  DAY_MS,
  aggregateWeeks,
  atr,
  round,
  sma
} from './backtest-tight-risk-breakout.mjs';

const FEE_PER_SIDE = 0.075 / 100;
const SLIPPAGE_PER_SIDE = 0.05 / 100;

// RSI calculation
function calculateRsi(candles, period = 2) {
  const output = new Array(candles.length).fill(Number.NaN);
  if (candles.length <= period) return output;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  output[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    output[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return output;
}

// Supertrend calculation
function calculateSupertrend(candles, period = 10, multiplier = 3.5) {
  const atrValues = atr(candles, period);
  const lineValues = new Array(candles.length).fill(Number.NaN);
  const dirValues = new Array(candles.length).fill(1);
  let upperBand = 0;
  let lowerBand = 0;
  let direction = 1;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const currentAtr = atrValues[i];
    if (!Number.isFinite(currentAtr)) continue;

    const basicUpper = (candle.high + candle.low) / 2 + multiplier * currentAtr;
    const basicLower = (candle.high + candle.low) / 2 - multiplier * currentAtr;

    if (i === 0) {
      upperBand = basicUpper;
      lowerBand = basicLower;
    } else {
      const prevClose = candles[i - 1].close;
      lowerBand = basicLower > lowerBand || prevClose < lowerBand ? basicLower : lowerBand;
      upperBand = basicUpper < upperBand || prevClose > upperBand ? basicUpper : upperBand;
    }

    if (i > 0) {
      if (direction === 1 && candle.close < lowerBand) {
        direction = -1;
      } else if (direction === -1 && candle.close > upperBand) {
        direction = 1;
      }
    }

    dirValues[i] = direction;
    lineValues[i] = direction === 1 ? lowerBand : upperBand;
  }

  return { line: lineValues, dir: dirValues };
}

// Fetch Binance Daily Candles with Pagination (up to 3000 candles)
async function fetchBinanceDaily(symbol) {
  let output = [];
  let endTime;
  while (output.length < 3000) {
    const suffix = endTime ? `&endTime=${endTime}` : '';
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=1000${suffix}`);
    if (!res.ok) throw new Error(`Binance Daily HTTP ${res.status}`);
    const rows = await res.json();
    if (!rows.length) break;
    const page = rows.map(r => ({
      timestamp: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      isClosed: true
    }));
    output = page.concat(output);
    endTime = rows[0][0] - 1;
    if (rows.length < 1000) break;
  }
  return output;
}

async function loadCrypto(symbol) {
  try {
    const candles = await fetchBinanceDaily(symbol);
    if (!candles || candles.length < 300) return null;

    const closes = candles.map(c => c.close);
    const sma5 = sma(closes, 5);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const atr14 = atr(candles, 14);
    const rsi2 = calculateRsi(candles, 2);

    const stDailySlow = calculateSupertrend(candles, 10, 3.5);
    const weeks = aggregateWeeks(candles);
    const stWeeklySlow = calculateSupertrend(weeks, 10, 3.8);

    return {
      symbol,
      candles,
      sma5,
      sma50,
      sma200,
      atr14,
      rsi2,
      stDailySlow,
      weeks,
      stWeeklySlow
    };
  } catch (err) {
    return null;
  }
}

// --- STRATEGY 1: CONNORS RSI(2) TREND PULLBACK LONG ---
function simulateConnorsRsi2(data, isHoldoutOnly = false) {
  const { candles, sma5, sma200, atr14, rsi2 } = data;
  const trades = [];
  let position = null;
  let isArmed = false;

  const totalLen = candles.length;
  const splitIdx = Math.floor(totalLen * 0.70);
  const startIdx = isHoldoutOnly ? splitIdx : 200;
  const endIdx = isHoldoutOnly ? totalLen - 1 : splitIdx;

  for (let i = startIdx; i < endIdx; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];
    const currentAtr = atr14[i];
    if (!Number.isFinite(currentAtr) || currentAtr <= 0) continue;

    const isAboveSma200 = candle.close > (sma200[i] || 0);

    // --- Manage Position ---
    if (position) {
      const entryPrice = position.entryPrice;
      const initialRisk = position.initialRisk;
      let exitPrice = null;
      let exitReason = '';

      // 1. Check Catastrophe Stop (3 ATR)
      if (candle.low <= position.stopLoss) {
        exitPrice = position.stopLoss;
        exitReason = 'CATASTROPHE_SL';
      }
      // 2. Check Primary Exit: Next open after Daily close > SMA 5
      else if (prevCandle.close > (sma5[i - 1] || 0)) {
        exitPrice = candle.open;
        exitReason = 'SMA5_CROSS_EXIT';
      }

      if (exitPrice !== null) {
        const netEntry = entryPrice * (1 + FEE_PER_SIDE + SLIPPAGE_PER_SIDE);
        const netExit = exitPrice * (1 - FEE_PER_SIDE - SLIPPAGE_PER_SIDE);
        const pctReturn = ((netExit - netEntry) / netEntry) * 100;
        const realizedR = (netExit - netEntry) / initialRisk;

        trades.push({
          entryPrice,
          exitPrice,
          realizedR,
          pctReturn,
          exitReason,
          isWin: realizedR > 0
        });

        position = null;
        isArmed = false;
      }
    }

    // --- Check Entry Setup ---
    if (!position && i + 1 < candles.length) {
      // Arm condition: Close > SMA200 and RSI(2) < 5
      if (isAboveSma200 && rsi2[i] < 5) {
        isArmed = true;
      }

      // Confirmation: Close > SMA200 and RSI(2) crosses above 50
      if (isArmed && isAboveSma200 && rsi2[i] >= 50) {
        const nextOpen = candles[i + 1].open;
        const stop = nextOpen - 3.0 * currentAtr;
        const risk = nextOpen - stop;

        if (risk > 0) {
          position = {
            entryPrice: nextOpen,
            entryTime: candles[i + 1].timestamp,
            stopLoss: stop,
            initialRisk: risk
          };
          isArmed = false;
        }
      }

      // Invalidation: Price falls below SMA200 while armed
      if (isArmed && !isAboveSma200) {
        isArmed = false;
      }
    }
  }

  return computeMetrics(trades);
}

// --- STRATEGY 2: MONEYLINE MACRO CONFLUENCE (Weekly Bull + Daily Bull Flip + SMA200) ---
function simulateMoneyLineMacro(data, isHoldoutOnly = false) {
  const { candles, sma200, atr14, stDailySlow, weeks, stWeeklySlow } = data;
  const trades = [];
  let position = null;

  const totalLen = candles.length;
  const splitIdx = Math.floor(totalLen * 0.70);
  const startIdx = isHoldoutOnly ? splitIdx : 200;
  const endIdx = isHoldoutOnly ? totalLen - 1 : splitIdx;

  for (let i = startIdx; i < endIdx; i++) {
    const candle = candles[i];
    const currentAtr = atr14[i];
    if (!Number.isFinite(currentAtr) || currentAtr <= 0) continue;

    const weekTimestamp = Math.floor(candle.timestamp / (7 * DAY_MS)) * (7 * DAY_MS);
    const weeklyIdx = weeks.findIndex(w => Math.abs(w.timestamp - weekTimestamp) < 7 * DAY_MS);
    const isWeeklyBull = weeklyIdx >= 0 && stWeeklySlow.dir[weeklyIdx] === 1;

    const isDailyBullFlip = stDailySlow.dir[i] === 1 && stDailySlow.dir[i - 1] === -1;
    const isDailyBearFlip = stDailySlow.dir[i] === -1 && stDailySlow.dir[i - 1] === 1;
    const isAboveSma200 = candle.close > (sma200[i] || 0);

    // --- Manage Position ---
    if (position) {
      const entryPrice = position.entryPrice;
      const initialRisk = position.initialRisk;
      const highR = (candle.high - entryPrice) / initialRisk;

      // Break-Even at +1R
      if (highR >= 1.0 && position.stopLoss < entryPrice) {
        position.stopLoss = entryPrice * 1.002;
        position.isBreakEven = true;
      }

      // Scale-out 50% at +2R
      if (highR >= 2.0 && !position.scaledOut) {
        position.scaledOut = true;
        position.lockedGainR = 2.0 * 0.5;
      }

      let exitPrice = null;
      let exitReason = '';

      if (candle.low <= position.stopLoss) {
        exitPrice = position.stopLoss;
        exitReason = position.scaledOut ? 'RUNNER_BE_STOP' : 'SL_HIT';
      } else if (isDailyBearFlip) {
        exitPrice = candles[i + 1] ? candles[i + 1].open : candle.close;
        exitReason = 'BEAR_FLIP';
      }

      if (exitPrice !== null) {
        const netEntry = entryPrice * (1 + FEE_PER_SIDE + SLIPPAGE_PER_SIDE);
        const netExit = exitPrice * (1 - FEE_PER_SIDE - SLIPPAGE_PER_SIDE);
        let pctReturn = ((netExit - netEntry) / netEntry) * 100;
        let realizedR = (netExit - netEntry) / initialRisk;

        if (position.scaledOut) {
          const runnerR = realizedR * 0.5;
          realizedR = position.lockedGainR + runnerR;
          pctReturn = (pctReturn * 0.5) + (initialRisk / entryPrice * 2.0 * 100 * 0.5);
        }

        trades.push({
          entryPrice,
          exitPrice,
          realizedR,
          pctReturn,
          exitReason,
          isWin: realizedR > 0
        });

        position = null;
      }
    }

    // --- Entry Check ---
    if (!position && i + 1 < candles.length) {
      const nextOpen = candles[i + 1].open;
      if (isDailyBullFlip && isWeeklyBull && isAboveSma200) {
        const stop = Math.max(stDailySlow.line[i], candle.close - 2.5 * currentAtr);
        const risk = nextOpen - stop;
        if (risk > 0 && risk / nextOpen <= 0.12) {
          position = {
            entryPrice: nextOpen,
            entryTime: candles[i + 1].timestamp,
            stopLoss: stop,
            initialRisk: risk,
            isBreakEven: false,
            scaledOut: false,
            lockedGainR: 0
          };
        }
      }
    }
  }

  return computeMetrics(trades);
}

function computeMetrics(trades) {
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.isWin).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const grossGains = trades.filter(t => t.pctReturn > 0).reduce((sum, t) => sum + t.pctReturn, 0);
  const grossLosses = Math.abs(trades.filter(t => t.pctReturn < 0).reduce((sum, t) => sum + t.pctReturn, 0));
  const profitFactor = grossLosses > 0 ? grossGains / grossLosses : (grossGains > 0 ? 99 : 0);

  const meanR = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.realizedR, 0) / totalTrades : 0;
  const totalReturn = trades.reduce((acc, t) => acc * (1 + t.pctReturn / 100), 1) * 100 - 100;

  let peak = 100;
  let equity = 100;
  let maxDD = 0;
  for (const t of trades) {
    equity *= (1 + t.pctReturn / 100);
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades,
    winRate: round(winRate, 1),
    profitFactor: round(profitFactor, 2),
    meanR: round(meanR, 2),
    totalReturn: round(totalReturn, 1),
    maxDrawdown: round(maxDD, 1),
    trades
  };
}

async function run() {
  console.log('🚀 Încărcare date reale Binance pentru 25 de monede Crypto majore...');

  const cryptoSymbols = [
    'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK',
    'SUI', 'NEAR', 'APT', 'DOT', 'LTC', 'BCH', 'SHIB', 'PEPE', 'UNI',
    'ATOM', 'FIL', 'ARB', 'OP', 'TIA', 'RENDER', 'INJ'
  ];

  const loadedCoins = [];
  for (const sym of cryptoSymbols) {
    const d = await loadCrypto(sym);
    if (d) {
      loadedCoins.push(d);
      process.stdout.write(`✔ ${sym} `);
    }
  }
  console.log(`\n✅ ${loadedCoins.length} monede încărcate cu succes!\n`);

  console.log('='.repeat(105));
  console.log('📊 REZULTATE COMPARATIVE PE CELE 25 DE MONEDE CRYPTO (OUT-OF-SAMPLE - TESTUL SUPREM)');
  console.log('='.repeat(105));
  console.log('| Monedă | Connors RSI(2) (Trades/WR%/PF/Return)          | MoneyLine Macro (Trades/WR%/PF/Return)         |');
  console.log('|--------|------------------------------------------------|------------------------------------------------|');

  let rsi2Trades = 0, rsi2Wins = 0, rsi2Ret = 0, rsi2R = 0, rsi2PF = 0, rsi2DDs = [];
  let mlTrades = 0, mlWins = 0, mlRet = 0, mlR = 0, mlPF = 0, mlDDs = [];

  for (const d of loadedCoins) {
    const resRsi2 = simulateConnorsRsi2(d, true); // Out-of-Sample 30%
    const resMl = simulateMoneyLineMacro(d, true); // Out-of-Sample 30%

    rsi2Trades += resRsi2.totalTrades;
    rsi2Wins += Math.round((resRsi2.winRate / 100) * resRsi2.totalTrades);
    rsi2Ret += resRsi2.totalReturn;
    rsi2R += resRsi2.meanR * resRsi2.totalTrades;
    if (resRsi2.profitFactor > 0 && resRsi2.profitFactor < 50) rsi2PF += resRsi2.profitFactor;
    rsi2DDs.push(resRsi2.maxDrawdown);

    mlTrades += resMl.totalTrades;
    mlWins += Math.round((resMl.winRate / 100) * resMl.totalTrades);
    mlRet += resMl.totalReturn;
    mlR += resMl.meanR * resMl.totalTrades;
    if (resMl.profitFactor > 0 && resMl.profitFactor < 50) mlPF += resMl.profitFactor;
    mlDDs.push(resMl.maxDrawdown);

    const rsi2Summary = `${String(resRsi2.totalTrades).padStart(2)} tr | WR: ${resRsi2.winRate.toFixed(1).padStart(5)}% | PF: ${resRsi2.profitFactor.toFixed(2).padStart(5)} | Ret: ${resRsi2.totalReturn.toFixed(1).padStart(6)}%`;
    const mlSummary = `${String(resMl.totalTrades).padStart(2)} tr | WR: ${resMl.winRate.toFixed(1).padStart(5)}% | PF: ${resMl.profitFactor.toFixed(2).padStart(5)} | Ret: ${resMl.totalReturn.toFixed(1).padStart(6)}%`;

    console.log(`| ${d.symbol.padEnd(6)} | ${rsi2Summary.padEnd(46)} | ${mlSummary.padEnd(46)} |`);
  }

  const avgRsi2WR = rsi2Trades > 0 ? (rsi2Wins / rsi2Trades) * 100 : 0;
  const avgRsi2R = rsi2Trades > 0 ? rsi2R / rsi2Trades : 0;
  const avgRsi2Ret = loadedCoins.length > 0 ? rsi2Ret / loadedCoins.length : 0;
  const avgRsi2PF = loadedCoins.length > 0 ? rsi2PF / loadedCoins.length : 0;
  const avgRsi2DD = rsi2DDs.length > 0 ? rsi2DDs.reduce((a, b) => a + b, 0) / rsi2DDs.length : 0;

  const avgMlWR = mlTrades > 0 ? (mlWins / mlTrades) * 100 : 0;
  const avgMlR = mlTrades > 0 ? mlR / mlTrades : 0;
  const avgMlRet = loadedCoins.length > 0 ? mlRet / loadedCoins.length : 0;
  const avgMlPF = loadedCoins.length > 0 ? mlPF / loadedCoins.length : 0;
  const avgMlDD = mlDDs.length > 0 ? mlDDs.reduce((a, b) => a + b, 0) / mlDDs.length : 0;

  console.log('='.repeat(105));
  console.log(`🏆 SUMAR FINAL PENTRU CELE ${loadedCoins.length} MONEDE CRYPTO (OUT-OF-SAMPLE HOLDOUT):`);
  console.log(`   🔹 Connors RSI(2) Pullback : Trades: ${rsi2Trades} | Win Rate: ${avgRsi2WR.toFixed(1)}% | Profit Factor: ${avgRsi2PF.toFixed(2)} | Exp: +${avgRsi2R.toFixed(2)}R | Return Mediu: +${avgRsi2Ret.toFixed(1)}% | Max DD: ${avgRsi2DD.toFixed(1)}%`);
  console.log(`   🔹 MoneyLine Macro Trend   : Trades: ${mlTrades} | Win Rate: ${avgMlWR.toFixed(1)}% | Profit Factor: ${avgMlPF.toFixed(2)} | Exp: +${avgMlR.toFixed(2)}R | Return Mediu: +${avgMlRet.toFixed(1)}% | Max DD: ${avgMlDD.toFixed(1)}%`);
  console.log('='.repeat(105));
}

run().catch(console.error);
