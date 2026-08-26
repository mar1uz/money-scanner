import {
  DAY_MS,
  aggregateWeeks,
  atr,
  fetchYahoo,
  round,
  sma,
  supertrendDirections
} from './backtest-tight-risk-breakout.mjs';

const FEE_PER_SIDE = 0.075 / 100;
const SLIPPAGE_PER_SIDE = 0.05 / 100;

// Calculate Supertrend values
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

    dirValues[i] = direction; // 1 = Bull, -1 = Bear
    lineValues[i] = direction === 1 ? lowerBand : upperBand;
  }

  return { line: lineValues, dir: dirValues };
}

// Fetch Binance 4H Candles with Pagination (up to 3000 candles)
async function fetchBinance4h(symbol) {
  let output = [];
  let endTime;
  while (output.length < 3000) {
    const suffix = endTime ? `&endTime=${endTime}` : '';
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=4h&limit=1000${suffix}`);
    if (!res.ok) throw new Error(`Binance 4H HTTP ${res.status}`);
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

// Aggregate 4H candles into Daily bars for higher timeframe context
function aggregate4hToDaily(candles4h) {
  const daily = [];
  for (const c of candles4h) {
    const dayTimestamp = Math.floor(c.timestamp / DAY_MS) * DAY_MS;
    const current = daily.at(-1);
    if (!current || current.timestamp !== dayTimestamp) {
      daily.push({ ...c, timestamp: dayTimestamp });
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      current.volume += c.volume;
    }
  }
  return daily;
}

async function loadCrypto4h(symbol) {
  try {
    const candles4h = await fetchBinance4h(symbol);
    if (!candles4h || candles4h.length < 500) return null;

    const dailyCandles = aggregate4hToDaily(candles4h);
    const weeklyCandles = aggregateWeeks(dailyCandles);

    const st4hSlow = calculateSupertrend(candles4h, 10, 3.5);
    const atr14_4h = atr(candles4h, 14);

    const stDailySlow = calculateSupertrend(dailyCandles, 10, 3.5);
    const dailySma50 = sma(dailyCandles.map(c => c.close), 50);
    const dailySma200 = sma(dailyCandles.map(c => c.close), 200);

    const stWeeklySlow = calculateSupertrend(weeklyCandles, 10, 3.8);

    return {
      symbol,
      marketClass: 'crypto',
      candles4h,
      st4hSlow,
      atr14_4h,
      dailyCandles,
      stDailySlow,
      dailySma50,
      dailySma200,
      weeklyCandles,
      stWeeklySlow
    };
  } catch (err) {
    return null;
  }
}

// --- SIMULATION 1: CRYPTO 4H CONFLUENCE (Sniper Mode) ---
function simulateCrypto4h(data, isHoldoutOnly = false) {
  const { candles4h, st4hSlow, atr14_4h, dailyCandles, stDailySlow, dailySma200, weeklyCandles, stWeeklySlow } = data;
  const trades = [];
  let position = null;

  const totalLen = candles4h.length;
  const splitIdx = Math.floor(totalLen * 0.70);
  const startIdx = isHoldoutOnly ? splitIdx : 200;
  const endIdx = isHoldoutOnly ? totalLen - 1 : splitIdx;

  for (let i = startIdx; i < endIdx; i++) {
    const c4h = candles4h[i];
    const prev4h = candles4h[i - 1];
    const currentAtr = atr14_4h[i];
    if (!Number.isFinite(currentAtr) || currentAtr <= 0) continue;

    // Find corresponding Daily and Weekly indexes
    const dayTimestamp = Math.floor(c4h.timestamp / DAY_MS) * DAY_MS;
    const dailyIdx = dailyCandles.findIndex(d => d.timestamp === dayTimestamp);
    const weekTimestamp = Math.floor(c4h.timestamp / (7 * DAY_MS)) * (7 * DAY_MS);
    const weeklyIdx = weeklyCandles.findIndex(w => Math.abs(w.timestamp - weekTimestamp) < 7 * DAY_MS);

    const isDailyBull = dailyIdx >= 0 && stDailySlow.dir[dailyIdx] === 1;
    const isDailyAbove200 = dailyIdx >= 0 && dailyCandles[dailyIdx].close > (dailySma200[dailyIdx] || 0);
    const isWeeklyBull = weeklyIdx >= 0 && stWeeklySlow.dir[weeklyIdx] === 1;

    // 4H Flip
    const is4hBullFlip = st4hSlow.dir[i] === 1 && st4hSlow.dir[i - 1] === -1;
    const is4hBearFlip = st4hSlow.dir[i] === -1 && st4hSlow.dir[i - 1] === 1;

    // --- Manage Open Position ---
    if (position) {
      const entryPrice = position.entryPrice;
      const initialRisk = position.initialRisk;
      const highR = (c4h.high - entryPrice) / initialRisk;

      // 1. Move to Break-Even at +1.0R
      if (highR >= 1.0 && position.stopLoss < entryPrice) {
        position.stopLoss = entryPrice * 1.002;
        position.isBreakEven = true;
      }

      // 2. Scale-out 50% at +2.0R
      if (highR >= 2.0 && !position.scaledOut) {
        position.scaledOut = true;
        position.lockedGainR = 2.0 * 0.5; // Lock in 1.0R
      }

      let exitPrice = null;
      let exitReason = '';

      if (c4h.low <= position.stopLoss) {
        exitPrice = position.stopLoss;
        exitReason = position.scaledOut ? 'RUNNER_STOP_BE' : (position.isBreakEven ? 'BE_STOP' : 'SL_HIT');
      } else if (is4hBearFlip) {
        exitPrice = candles4h[i + 1] ? candles4h[i + 1].open : c4h.close;
        exitReason = '4H_BEAR_FLIP';
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

    // --- Check New 4H Entry with Multi-Timeframe Confirmation ---
    if (!position && i + 1 < candles4h.length) {
      const nextOpen = candles4h[i + 1].open;

      // Condition: 4H Bull Flip happening during Daily Bull (or Weekly Bull)
      if (is4hBullFlip && (isDailyBull || isWeeklyBull)) {
        const stop = Math.max(st4hSlow.line[i], c4h.close - 2.5 * currentAtr);
        const risk = nextOpen - stop;
        // Accept only trades with risk <= 6.5% of price (tight sniper entries)
        if (risk > 0 && risk / nextOpen <= 0.065) {
          position = {
            entryPrice: nextOpen,
            entryTime: candles4h[i + 1].timestamp,
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
  console.log('🚀 Rulare Backtest pe 4H Confluence (Crypto) & Daily Macro Hybrid (Stocks & Metals)...');

  const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK'];
  const cryptoData = [];

  for (const sym of cryptoSymbols) {
    const d = await loadCrypto4h(sym);
    if (d) {
      cryptoData.push(d);
      process.stdout.write(`✔ ${sym} 4H `);
    }
  }
  console.log(`\n✅ ${cryptoData.length} active crypto 4H încărcate.\n`);

  console.log('='.repeat(105));
  console.log('⚡ REZULTATE CRYPTO 4H CONFLUENCE (Sniper Mode: 4H Flip + 1D/1W Bias + BE la +1R + 50% Scale-Out)');
  console.log('='.repeat(105));
  console.log('| Simbol | Set Date       | Trades | Win Rate | Profit Factor | Exp. (R) | Total Return | Max DD  |');
  console.log('|--------|----------------|--------|----------|---------------|----------|--------------|---------|');

  let inTrades = 0, inWins = 0, inRet = 0, inR = 0, inPF = 0, inDDs = [];
  let outTrades = 0, outWins = 0, outRet = 0, outR = 0, outPF = 0, outDDs = [];

  for (const d of cryptoData) {
    const resIn = simulateCrypto4h(d, false);
    const resOut = simulateCrypto4h(d, true);

    inTrades += resIn.totalTrades;
    inWins += Math.round((resIn.winRate / 100) * resIn.totalTrades);
    inRet += resIn.totalReturn;
    inR += resIn.meanR * resIn.totalTrades;
    if (resIn.profitFactor > 0 && resIn.profitFactor < 50) inPF += resIn.profitFactor;
    inDDs.push(resIn.maxDrawdown);

    outTrades += resOut.totalTrades;
    outWins += Math.round((resOut.winRate / 100) * resOut.totalTrades);
    outRet += resOut.totalReturn;
    outR += resOut.meanR * resOut.totalTrades;
    if (resOut.profitFactor > 0 && resOut.profitFactor < 50) outPF += resOut.profitFactor;
    outDDs.push(resOut.maxDrawdown);

    console.log(
      `| ${d.symbol.padEnd(6)} | IN-SAMPLE (70%)| ${String(resIn.totalTrades).padStart(6)} | ${resIn.winRate.toFixed(1).padStart(7)}% | ${resIn.profitFactor.toFixed(2).padStart(13)} | ${resIn.meanR.toFixed(2).padStart(7)}R | ${resIn.totalReturn.toFixed(1).padStart(11)}% | ${resIn.maxDrawdown.toFixed(1).padStart(6)}% |`
    );
    console.log(
      `| ${d.symbol.padEnd(6)} | OUT-OF-SAMPLE  | ${String(resOut.totalTrades).padStart(6)} | ${resOut.winRate.toFixed(1).padStart(7)}% | ${resOut.profitFactor.toFixed(2).padStart(13)} | ${resOut.meanR.toFixed(2).padStart(7)}R | ${resOut.totalReturn.toFixed(1).padStart(11)}% | ${resOut.maxDrawdown.toFixed(1).padStart(6)}% |`
    );
    console.log('|--------|----------------|--------|----------|---------------|----------|--------------|---------|');
  }

  const avgOutWR = outTrades > 0 ? (outWins / outTrades) * 100 : 0;
  const avgOutR = outTrades > 0 ? outR / outTrades : 0;
  const avgOutRet = cryptoData.length > 0 ? outRet / cryptoData.length : 0;
  const avgOutPF = cryptoData.length > 0 ? outPF / cryptoData.length : 0;
  const avgOutDD = outDDs.length > 0 ? outDDs.reduce((a, b) => a + b, 0) / outDDs.length : 0;

  console.log('='.repeat(105));
  console.log(`🏆 TOTAL CRYPTO 4H (OUT-OF-SAMPLE HOLDOUT):`);
  console.log(`   Trades: ${outTrades} | Win Rate: ${avgOutWR.toFixed(1)}% | Profit Factor: ${avgOutPF.toFixed(2)} | Exp: +${avgOutR.toFixed(2)}R | Return Mediu: +${avgOutRet.toFixed(1)}% | Max Drawdown: ${avgOutDD.toFixed(1)}%`);
  console.log('='.repeat(105));
}

run().catch(console.error);
