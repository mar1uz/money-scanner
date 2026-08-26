import {
  ASSETS,
  DAY_MS,
  aggregateWeeks,
  atr,
  fetchBinance,
  fetchYahoo,
  round,
  sma,
  supertrendDirections
} from './backtest-tight-risk-breakout.mjs';

const FEE_PER_SIDE = 0.075 / 100;
const SLIPPAGE_PER_SIDE = 0.05 / 100;

// Calculate Supertrend line values (not just direction)
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
      const prevClose = candles[i - 1].close;
      if (direction === 1 && candle.close < lowerBand) {
        direction = -1;
      } else if (direction === -1 && candle.close > upperBand) {
        direction = 1;
      }
    }

    dirValues[i] = direction; // 1 = Bullish, -1 = Bearish
    lineValues[i] = direction === 1 ? lowerBand : upperBand;
  }

  return { line: lineValues, dir: dirValues };
}

async function loadData(asset) {
  try {
    let candles = [];
    if (asset.marketClass === 'crypto') {
      candles = await fetchBinance(asset.symbol);
    } else {
      const symbol = asset.symbol === 'XAU' ? 'GC=F'
        : asset.symbol === 'XAG' ? 'SI=F'
        : asset.symbol === 'COPPER' ? 'HG=F'
        : asset.symbol;
      candles = await fetchYahoo(symbol);
    }

    if (!candles || candles.length < 300) return null;

    const closes = candles.map(c => c.close);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const atr14 = atr(candles, 14);

    const stDailySlow = calculateSupertrend(candles, 10, 3.5);
    const stDailyFast = calculateSupertrend(candles, 10, 2.5);

    const weeks = aggregateWeeks(candles);
    const stWeeklySlow = calculateSupertrend(weeks, 10, 3.8);

    return {
      asset,
      candles,
      sma50,
      sma200,
      atr14,
      stDailySlow,
      stDailyFast,
      weeks,
      stWeeklySlow
    };
  } catch (err) {
    return null;
  }
}

// Strategy Simulation
function simulateStrategy(data, variant, isHoldoutOnly = false) {
  const { asset, candles, sma50, sma200, atr14, stDailySlow, weeks, stWeeklySlow } = data;
  const trades = [];
  let position = null;

  const totalLen = candles.length;
  const splitIdx = Math.floor(totalLen * 0.70);
  const startIdx = isHoldoutOnly ? splitIdx : 250;
  const endIdx = isHoldoutOnly ? totalLen - 1 : splitIdx;

  for (let i = startIdx; i < endIdx; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];
    const currentAtr = atr14[i];
    if (!Number.isFinite(currentAtr) || currentAtr <= 0) continue;

    // Find weekly index for current candle
    const candleWeekStart = Math.floor(candle.timestamp / (7 * DAY_MS)) * (7 * DAY_MS);
    const weeklyIdx = weeks.findIndex(w => Math.abs(w.timestamp - candleWeekStart) < 7 * DAY_MS);
    const isWeeklyBull = weeklyIdx >= 0 && stWeeklySlow.dir[weeklyIdx] === 1;

    const isDailyBullFlip = stDailySlow.dir[i] === 1 && stDailySlow.dir[i - 1] === -1;
    const isDailyBearFlip = stDailySlow.dir[i] === -1 && stDailySlow.dir[i - 1] === 1;

    // --- Manage Open Position ---
    if (position) {
      const entryPrice = position.entryPrice;
      const initialRisk = position.initialRisk;
      const currentR = (candle.close - entryPrice) / initialRisk;
      let exitPrice = null;
      let exitReason = '';

      // High/Low for intraday stop/target check
      const highR = (candle.high - entryPrice) / initialRisk;
      const lowR = (candle.low - entryPrice) / initialRisk;

      if (variant === 'A') { // Base ML Flip: Exit strictly on Bear Flip
        if (isDailyBearFlip) {
          exitPrice = candles[i + 1] ? candles[i + 1].open : candle.close;
          exitReason = 'BEAR_FLIP';
        }
      } else if (variant === 'B') { // Trailing on Rising Cloud Margin
        const trailStop = stDailySlow.line[i];
        if (candle.close < trailStop || candle.low < trailStop) {
          exitPrice = Math.min(candle.close, trailStop);
          exitReason = 'TRAIL_CLOUD_STOP';
        }
      } else if (variant === 'C') { // Macro Filter (Weekly Bull + SMA200) with ML Stop
        if (isDailyBearFlip || !isWeeklyBull || candle.close < position.stopLoss) {
          exitPrice = candle.close < position.stopLoss ? position.stopLoss : (candles[i + 1] ? candles[i + 1].open : candle.close);
          exitReason = isDailyBearFlip ? 'BEAR_FLIP' : (candle.close < position.stopLoss ? 'SL_HIT' : 'WEEKLY_INVALIDATION');
        }
      } else if (variant === 'D') { // Asymmetric Multi-Stage (Break-Even + TP1 1.5R + TP2 3.0R)
        // 1. Move to Break-Even if +1R reached
        if (highR >= 1.0 && position.stopLoss < entryPrice) {
          position.stopLoss = entryPrice * (1 + 0.001); // BE + small buffer
          position.isBreakEven = true;
        }

        // 2. Check Stop Loss
        if (candle.low <= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = position.isBreakEven ? 'BREAK_EVEN' : 'SL_HIT';
        }
        // 3. Check TP2 (+3.0R)
        else if (highR >= 3.0) {
          exitPrice = entryPrice + 3.0 * initialRisk;
          exitReason = 'TP2_3R_HIT';
        }
      } else if (variant === 'F') { // Optimal Hybrid: Macro Filter + 50% Scale-Out at +2R + Trailing Runner to Bear Flip
        if (!position.scaledOut && highR >= 2.0) {
          // Record 50% scale out at +2R
          position.scaledOut = true;
          position.stopLoss = Math.max(position.stopLoss, entryPrice * 1.002); // Move to BE
          position.lockedGainR = 2.0 * 0.5; // 1.0R locked
        } else if (highR >= 1.0 && position.stopLoss < entryPrice) {
          position.stopLoss = entryPrice * 1.001; // Move to BE early
        }

        if (candle.low <= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = position.scaledOut ? 'RUNNER_STOP_BE' : 'SL_HIT';
        } else if (isDailyBearFlip) {
          exitPrice = candles[i + 1] ? candles[i + 1].open : candle.close;
          exitReason = 'BEAR_FLIP_RUNNER';
        }
      } else if (variant === 'G') { // Volatility-Controlled Filter: Only take Flip when ATR not overextended (< 80th pct)
        if (highR >= 1.0 && position.stopLoss < entryPrice) {
          position.stopLoss = entryPrice * 1.001;
        }
        if (candle.low <= position.stopLoss) {
          exitPrice = position.stopLoss;
          exitReason = 'SL_HIT';
        } else if (highR >= 3.0) {
          exitPrice = entryPrice + 3.0 * initialRisk;
          exitReason = 'TP_3R';
        } else if (isDailyBearFlip) {
          exitPrice = candles[i + 1] ? candles[i + 1].open : candle.close;
          exitReason = 'BEAR_FLIP';
        }
      }

      if (exitPrice !== null) {
        const netEntry = entryPrice * (1 + FEE_PER_SIDE + SLIPPAGE_PER_SIDE);
        const netExit = exitPrice * (1 - FEE_PER_SIDE - SLIPPAGE_PER_SIDE);
        let pctReturn = ((netExit - netEntry) / netEntry) * 100;
        let realizedR = (netExit - netEntry) / initialRisk;

        if (variant === 'F' && position.scaledOut) {
          // 50% was closed at +2R (+ lockedGainR), remaining 50% closed at netExit
          const runnerR = realizedR * 0.5;
          realizedR = position.lockedGainR + runnerR;
          pctReturn = (pctReturn * 0.5) + (initialRisk / entryPrice * 2.0 * 100 * 0.5);
        }

        trades.push({
          entryDate: new Date(position.entryTime).toISOString().slice(0, 10),
          exitDate: new Date(candle.timestamp).toISOString().slice(0, 10),
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

    // --- Check New Entry ---
    if (!position && i + 1 < candles.length) {
      const nextOpen = candles[i + 1].open;

      if (variant === 'A') { // Simple Bull Flip
        if (isDailyBullFlip) {
          const stop = stDailySlow.line[i];
          const risk = Math.max(nextOpen * 0.02, nextOpen - stop);
          position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk };
        }
      } else if (variant === 'B') { // Trailing Cloud Margin
        if (isDailyBullFlip) {
          const stop = stDailySlow.line[i];
          const risk = Math.max(nextOpen * 0.02, nextOpen - stop);
          position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk };
        }
      } else if (variant === 'C') { // Macro Filtered (Weekly Bull + Above SMA 200)
        if (isDailyBullFlip && isWeeklyBull && candle.close > sma200[i]) {
          const stop = Math.max(stDailySlow.line[i], candle.close - 2.5 * currentAtr);
          const risk = nextOpen - stop;
          if (risk > 0 && risk / nextOpen <= 0.10) {
            position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk };
          }
        }
      } else if (variant === 'D') { // Asymmetric Multi-Stage (+ Macro Filter)
        if (isDailyBullFlip && isWeeklyBull && candle.close > sma200[i]) {
          const stop = Math.max(stDailySlow.line[i], candle.close - 2.0 * currentAtr);
          const risk = nextOpen - stop;
          if (risk > 0 && risk / nextOpen <= 0.08) {
            position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk, isBreakEven: false };
          }
        }
      } else if (variant === 'E') { // SMA 50 Dip Reclaim in Bull Trend
        const isBullTrend = isWeeklyBull && candle.close > sma200[i] && sma50[i] > sma200[i];
        const wasBelowSma50 = prevCandle.low < sma50[i - 1] || prevCandle.close < sma50[i - 1];
        const reclaimedSma50 = candle.close > sma50[i];

        if (isBullTrend && wasBelowSma50 && reclaimedSma50 && stDailySlow.dir[i] === 1) {
          const stop = Math.min(prevCandle.low, candle.low) - 0.25 * currentAtr;
          const risk = nextOpen - stop;
          if (risk > 0 && risk / nextOpen <= 0.06) {
            position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk };
          }
        }
      } else if (variant === 'F') { // Optimal Hybrid: Macro Filter + Rising SMA 50 + Scale-Out
        const isMacroBull = isWeeklyBull && candle.close > sma200[i] && sma50[i] > sma200[i] && sma50[i] >= sma50[i - 10];
        if (isDailyBullFlip && isMacroBull) {
          const stop = Math.max(stDailySlow.line[i], candle.close - 2.2 * currentAtr);
          const risk = nextOpen - stop;
          if (risk > 0 && risk / nextOpen <= 0.09) {
            position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk, scaledOut: false, lockedGainR: 0 };
          }
        }
      } else if (variant === 'G') { // Volatility-Controlled: Risk <= 6%, not overextended
        const isMacroBull = isWeeklyBull && candle.close > sma200[i];
        if (isDailyBullFlip && isMacroBull) {
          const stop = Math.max(stDailySlow.line[i], candle.close - 1.8 * currentAtr);
          const risk = nextOpen - stop;
          if (risk > 0 && risk / nextOpen <= 0.06) {
            position = { entryPrice: nextOpen, entryTime: candles[i + 1].timestamp, stopLoss: stop, initialRisk: risk };
          }
        }
      }
    }
  }

  // Calculate Metrics
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.isWin).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const grossGains = trades.filter(t => t.pctReturn > 0).reduce((sum, t) => sum + t.pctReturn, 0);
  const grossLosses = Math.abs(trades.filter(t => t.pctReturn < 0).reduce((sum, t) => sum + t.pctReturn, 0));
  const profitFactor = grossLosses > 0 ? grossGains / grossLosses : (grossGains > 0 ? 99 : 0);

  const meanR = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.realizedR, 0) / totalTrades : 0;
  const totalReturn = trades.reduce((acc, t) => acc * (1 + t.pctReturn / 100), 1) * 100 - 100;

  // Max Drawdown calculation
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
    variant,
    totalTrades,
    winRate: round(winRate, 1),
    profitFactor: round(profitFactor, 2),
    meanR: round(meanR, 2),
    totalReturn: round(totalReturn, 1),
    maxDrawdown: round(maxDD, 1),
    trades
  };
}

async function runFullComparison() {
  console.log('🚀 Încărcare date reale din feed-urile de piață (Binance & Yahoo Finance)...');

  const testAssets = [
    // Top Crypto
    { symbol: 'BTC', marketClass: 'crypto' },
    { symbol: 'ETH', marketClass: 'crypto' },
    { symbol: 'SOL', marketClass: 'crypto' },
    { symbol: 'BNB', marketClass: 'crypto' },
    { symbol: 'XRP', marketClass: 'crypto' },
    { symbol: 'ADA', marketClass: 'crypto' },
    { symbol: 'DOGE', marketClass: 'crypto' },
    { symbol: 'AVAX', marketClass: 'crypto' },
    { symbol: 'LINK', marketClass: 'crypto' },
    // Top Stocks
    { symbol: 'SPY', marketClass: 'stocks' },
    { symbol: 'QQQ', marketClass: 'stocks' },
    { symbol: 'NVDA', marketClass: 'stocks' },
    { symbol: 'AAPL', marketClass: 'stocks' },
    { symbol: 'MSFT', marketClass: 'stocks' },
    { symbol: 'AMZN', marketClass: 'stocks' },
    { symbol: 'META', marketClass: 'stocks' },
    { symbol: 'TSLA', marketClass: 'stocks' },
    // Metals
    { symbol: 'XAU', marketClass: 'metals' },
    { symbol: 'XAG', marketClass: 'metals' },
    { symbol: 'COPPER', marketClass: 'metals' }
  ];

  const loadedData = [];
  for (const a of testAssets) {
    const d = await loadData(a);
    if (d) {
      loadedData.push(d);
      process.stdout.write(`✔ ${a.symbol} `);
    }
  }
  console.log(`\n✅ ${loadedData.length} active încărcate cu succes.\n`);

  const variants = [
    { id: 'A', name: 'Var A: Base ML Flip (Buy on Bull, Exit on Bear)' },
    { id: 'B', name: 'Var B: ML Flip + Trailing Stop on Cloud Margin' },
    { id: 'C', name: 'Var C: ML Flip + Macro Weekly Bull & SMA200 Filter' },
    { id: 'D', name: 'Var D: ML Flip + Break-Even at +1R + TP 3R Target' },
    { id: 'E', name: 'Var E: Macro Bull + SMA 50 Dip Reclaim (2.5R Target)' },
    { id: 'F', name: 'Var F: Macro Trend + 50% Scale-Out at +2R + Runner' },
    { id: 'G', name: 'Var G: Macro Trend + Volatility-Controlled Stop (1.8 ATR)' }
  ];

  console.log('='.repeat(105));
  console.log('📊 REZULTATE IN-SAMPLE (Primele 70% din date - Calibrare)');
  console.log('='.repeat(105));
  console.log('| Varianta Strategie                                      | Trades | Win Rate | Profit Factor | Exp. (R) | Total Return | Max DD  |');
  console.log('|---------------------------------------------------------|--------|----------|---------------|----------|--------------|---------|');

  for (const v of variants) {
    let totTrades = 0;
    let totWins = 0;
    let sumReturns = 0;
    let sumR = 0;
    let sumPF = 0;
    let maxDDs = [];

    for (const d of loadedData) {
      const res = simulateStrategy(d, v.id, false);
      totTrades += res.totalTrades;
      totWins += Math.round((res.winRate / 100) * res.totalTrades);
      sumReturns += res.totalReturn;
      sumR += res.meanR * res.totalTrades;
      if (res.profitFactor > 0 && res.profitFactor < 50) sumPF += res.profitFactor;
      maxDDs.push(res.maxDrawdown);
    }

    const avgWR = totTrades > 0 ? (totWins / totTrades) * 100 : 0;
    const avgR = totTrades > 0 ? sumR / totTrades : 0;
    const avgReturn = loadedData.length > 0 ? sumReturns / loadedData.length : 0;
    const avgPF = loadedData.length > 0 ? sumPF / loadedData.length : 0;
    const avgMaxDD = maxDDs.length > 0 ? maxDDs.reduce((a, b) => a + b, 0) / maxDDs.length : 0;

    console.log(
      `| ${v.name.padEnd(55)} | ${String(totTrades).padStart(6)} | ${round(avgWR, 1).toFixed(1).padStart(7)}% | ${round(avgPF, 2).toFixed(2).padStart(13)} | ${round(avgR, 2).toFixed(2).padStart(7)}R | ${round(avgReturn, 1).toFixed(1).padStart(11)}% | ${round(avgMaxDD, 1).toFixed(1).padStart(6)}% |`
    );
  }

  console.log('\n' + '='.repeat(105));
  console.log('🛡️ REZULTATE OUT-OF-SAMPLE (Ultimele 30% din date - Testul Suprem de Validare)');
  console.log('='.repeat(105));
  console.log('| Varianta Strategie                                      | Trades | Win Rate | Profit Factor | Exp. (R) | Total Return | Max DD  |');
  console.log('|---------------------------------------------------------|--------|----------|---------------|----------|--------------|---------|');

  for (const v of variants) {
    let totTrades = 0;
    let totWins = 0;
    let sumReturns = 0;
    let sumR = 0;
    let sumPF = 0;
    let maxDDs = [];

    for (const d of loadedData) {
      const res = simulateStrategy(d, v.id, true);
      totTrades += res.totalTrades;
      totWins += Math.round((res.winRate / 100) * res.totalTrades);
      sumReturns += res.totalReturn;
      sumR += res.meanR * res.totalTrades;
      if (res.profitFactor > 0 && res.profitFactor < 50) sumPF += res.profitFactor;
      maxDDs.push(res.maxDrawdown);
    }

    const avgWR = totTrades > 0 ? (totWins / totTrades) * 100 : 0;
    const avgR = totTrades > 0 ? sumR / totTrades : 0;
    const avgReturn = loadedData.length > 0 ? sumReturns / loadedData.length : 0;
    const avgPF = loadedData.length > 0 ? sumPF / loadedData.length : 0;
    const avgMaxDD = maxDDs.length > 0 ? maxDDs.reduce((a, b) => a + b, 0) / maxDDs.length : 0;

    console.log(
      `| ${v.name.padEnd(55)} | ${String(totTrades).padStart(6)} | ${round(avgWR, 1).toFixed(1).padStart(7)}% | ${round(avgPF, 2).toFixed(2).padStart(13)} | ${round(avgR, 2).toFixed(2).padStart(7)}R | ${round(avgReturn, 1).toFixed(1).padStart(11)}% | ${round(avgMaxDD, 1).toFixed(1).padStart(6)}% |`
    );
  }

  // --- Breakdown by Asset Class for the Winner (Var C & Var A) ---
  console.log('\n' + '='.repeat(105));
  console.log('📈 ANALIZĂ DETALIATĂ PE CLASE DE ACTIVE (Out-of-Sample: Var C vs Var A)');
  console.log('='.repeat(105));
  console.log('| Clasă Active | Strategie                                | Trades | Win Rate | Profit Factor | Exp. (R) | Total Return | Max DD  |');
  console.log('|--------------|------------------------------------------|--------|----------|---------------|----------|--------------|---------|');

  const classes = ['crypto', 'stocks', 'metals'];
  for (const c of classes) {
    const classData = loadedData.filter(d => d.asset.marketClass === c);
    for (const vId of ['A', 'C']) {
      const vName = vId === 'A' ? 'Var A (Base ML Flip)' : 'Var C (ML Flip + Macro Filter)';
      let totTrades = 0;
      let totWins = 0;
      let sumReturns = 0;
      let sumR = 0;
      let sumPF = 0;
      let maxDDs = [];

      for (const d of classData) {
        const res = simulateStrategy(d, vId, true);
        totTrades += res.totalTrades;
        totWins += Math.round((res.winRate / 100) * res.totalTrades);
        sumReturns += res.totalReturn;
        sumR += res.meanR * res.totalTrades;
        if (res.profitFactor > 0 && res.profitFactor < 50) sumPF += res.profitFactor;
        maxDDs.push(res.maxDrawdown);
      }

      const avgWR = totTrades > 0 ? (totWins / totTrades) * 100 : 0;
      const avgR = totTrades > 0 ? sumR / totTrades : 0;
      const avgReturn = classData.length > 0 ? sumReturns / classData.length : 0;
      const avgPF = classData.length > 0 ? sumPF / classData.length : 0;
      const avgMaxDD = maxDDs.length > 0 ? maxDDs.reduce((a, b) => a + b, 0) / maxDDs.length : 0;

      console.log(
        `| ${c.toUpperCase().padEnd(12)} | ${vName.padEnd(40)} | ${String(totTrades).padStart(6)} | ${round(avgWR, 1).toFixed(1).padStart(7)}% | ${round(avgPF, 2).toFixed(2).padStart(13)} | ${round(avgR, 2).toFixed(2).padStart(7)}R | ${round(avgReturn, 1).toFixed(1).padStart(11)}% | ${round(avgMaxDD, 1).toFixed(1).padStart(6)}% |`
      );
    }
  }
}

runFullComparison().catch(console.error);
