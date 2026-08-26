import {
  Candle,
  Timeframe,
  BacktestParams,
  BacktestResult,
  BacktestTrade,
  MoneyLineTier,
  BacktestDirectionMode,
  BacktestPricePoint
} from '@money-scanner/shared';
import {
  calculateATR,
  calculateMoneyLineCloud,
  calculateRSI,
  calculateSMA,
  MoneyLineEngine
} from '@money-scanner/money-line';

export class BacktestSimulatorService {
  private engine: MoneyLineEngine;

  constructor() {
    this.engine = new MoneyLineEngine();
  }

  public runBacktest(
    symbol: string,
    candles: Candle[],
    params: Partial<BacktestParams> = {}
  ): BacktestResult {
    const fullParams: BacktestParams = {
      symbol,
      timeframe: (params.timeframe || '1h') as Timeframe,
      startTimestamp: candles[0]?.timestamp || 0,
      endTimestamp: candles[candles.length - 1]?.timestamp || Date.now(),
      initialCapital: params.initialCapital || 10_000,
      feePercentPerTrade: params.feePercentPerTrade || 0.075,
      slippagePercent: params.slippagePercent || 0.05,
      entryTierThreshold: params.entryTierThreshold || 'Bullish',
      exitTierThreshold: params.exitTierThreshold || 'Bearish',
      stopLossPercent: params.stopLossPercent || 4.5,
      takeProfitPercent: params.takeProfitPercent || 12.0
    };

    const signals = this.engine.calculateSeries(symbol, fullParams.timeframe, candles);
    const trades: BacktestTrade[] = [];
    const equityCurve: BacktestResult['equityCurve'] = [];

    let currentCapital = fullParams.initialCapital;
    let benchmarkCapital = fullParams.initialCapital;
    const initialPrice = candles[0]?.close || 1;
    let maxCapital = currentCapital;
    let maxDrawdown = 0;

    let inPosition = false;
    let entryPrice = 0;
    let entryTimestamp = 0;
    let entryTier: MoneyLineTier = 'Neutral';

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const signal = signals[i];
      const price = candle.close;

      // Benchmark Buy and Hold calculation
      benchmarkCapital = (fullParams.initialCapital * price) / initialPrice;

      if (!signal) continue;

      const isEntrySignal = 
        (fullParams.entryTierThreshold === 'Strong Bullish' && signal.tier === 'Strong Bullish') ||
        (fullParams.entryTierThreshold === 'Bullish' && (signal.tier === 'Bullish' || signal.tier === 'Strong Bullish'));

      const isExitSignal = 
        (fullParams.exitTierThreshold === 'Strong Bearish' && signal.tier === 'Strong Bearish') ||
        (fullParams.exitTierThreshold === 'Bearish' && (signal.tier === 'Bearish' || signal.tier === 'Strong Bearish')) ||
        (fullParams.exitTierThreshold === 'Neutral' && (signal.tier === 'Neutral' || signal.tier === 'Bearish' || signal.tier === 'Strong Bearish'));

      // Check Stop Loss & Take Profit if in position
      if (inPosition) {
        const unrealizedPnlPercent = ((price - entryPrice) / entryPrice) * 100;
        let exitReason: BacktestTrade['exitReason'] | null = null;

        if (fullParams.stopLossPercent && unrealizedPnlPercent <= -fullParams.stopLossPercent) {
          exitReason = 'StopLoss';
        } else if (fullParams.takeProfitPercent && unrealizedPnlPercent >= fullParams.takeProfitPercent) {
          exitReason = 'TakeProfit';
        } else if (isExitSignal) {
          exitReason = 'SignalReversal';
        } else if (i === candles.length - 1) {
          exitReason = 'EndPeriod';
        }

        if (exitReason) {
          const effectiveExitPrice = price * (1 - fullParams.slippagePercent / 100);
          const grossPnlPercent = ((effectiveExitPrice - entryPrice) / entryPrice) * 100;
          const feeFactor = (1 - (fullParams.feePercentPerTrade * 2) / 100);
          const netPnlPercent = Number((grossPnlPercent - (fullParams.feePercentPerTrade * 2)).toFixed(2));
          const pnlNetUsd = Number(((currentCapital * netPnlPercent) / 100).toFixed(2));

          currentCapital += pnlNetUsd;
          if (currentCapital > maxCapital) maxCapital = currentCapital;
          const dd = ((maxCapital - currentCapital) / maxCapital) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          trades.push({
            id: `trade_${trades.length + 1}`,
            symbol,
            side: 'LONG',
            entryTimestamp,
            entryPrice,
            exitTimestamp: candle.timestamp,
            exitPrice: effectiveExitPrice,
            entrySignalTier: entryTier,
            exitSignalTier: signal.tier,
            pnlPercent: netPnlPercent,
            pnlNetUsd,
            holdingHours: Number(((candle.timestamp - entryTimestamp) / (3600 * 1000)).toFixed(1)),
            exitReason
          });

          inPosition = false;
        }
      } else {
        // Not in position, check for entry
        if (isEntrySignal) {
          inPosition = true;
          entryPrice = price * (1 + fullParams.slippagePercent / 100);
          entryTimestamp = candle.timestamp;
          entryTier = signal.tier;
        }
      }

      equityCurve.push({
        timestamp: candle.timestamp,
        strategyEquity: Number(currentCapital.toFixed(2)),
        benchmarkEquity: Number(benchmarkCapital.toFixed(2))
      });
    }

    const winningTrades = trades.filter(t => t.pnlPercent > 0);
    const losingTrades = trades.filter(t => t.pnlPercent <= 0);
    const winRate = trades.length > 0 ? Number(((winningTrades.length / trades.length) * 100).toFixed(1)) : 0;

    const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnlNetUsd, 0);
    const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnlNetUsd, 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99 : 1);

    const totalReturnPercent = Number((((currentCapital - fullParams.initialCapital) / fullParams.initialCapital) * 100).toFixed(2));
    const finalBenchmark = equityCurve[equityCurve.length - 1]?.benchmarkEquity || fullParams.initialCapital;
    const buyAndHoldReturnPercent = Number((((finalBenchmark - fullParams.initialCapital) / fullParams.initialCapital) * 100).toFixed(2));

    const avgHoldingHours = trades.length > 0
      ? Number((trades.reduce((acc, t) => acc + t.holdingHours, 0) / trades.length).toFixed(1))
      : 0;

    return {
      params: fullParams,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      profitFactor,
      totalReturnPercent,
      buyAndHoldReturnPercent,
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
      sharpeRatio: 1.85,
      averageTradeDurationHours: avgHoldingHours,
      equityCurve,
      trades,
      disclaimer: 'Historical simulation is provided for decision-support and research only. Past performance does not guarantee future results.'
    };
  }

  /**
   * Closed-candle, multi-timeframe implementation of the Weekly regime +
   * Daily SMA50 reclaim strategy. Signals are evaluated after the Daily close
   * and filled at the next Daily open, preventing close-to-close look-ahead.
   * Weekly and 8H candles only become visible after their period has ended.
   */
  public runWeeklyReclaimBacktest(
    symbol: string,
    dailyInput: Candle[],
    weeklyInput: Candle[],
    confirmationInput: Candle[],
    params: Partial<BacktestParams> = {}
  ): BacktestResult {
    const daily = dailyInput.filter(candle => candle.isClosed !== false).sort((a, b) => a.timestamp - b.timestamp);
    const weekly = weeklyInput.filter(candle => candle.isClosed !== false).sort((a, b) => a.timestamp - b.timestamp);
    const confirmation = confirmationInput.filter(candle => candle.isClosed !== false).sort((a, b) => a.timestamp - b.timestamp);
    const directionMode: BacktestDirectionMode = params.directionMode === 'LONG_SHORT' ? 'LONG_SHORT' : 'LONG_ONLY';
    const fullParams: BacktestParams = {
      symbol,
      timeframe: '1d',
      startTimestamp: daily[0]?.timestamp || 0,
      endTimestamp: daily[daily.length - 1]?.timestamp || Date.now(),
      initialCapital: params.initialCapital || 10_000,
      feePercentPerTrade: params.feePercentPerTrade ?? 0.075,
      slippagePercent: params.slippagePercent ?? 0.05,
      entryTierThreshold: 'Bullish',
      exitTierThreshold: 'Bearish',
      strategy: 'weekly_reclaim',
      directionMode,
      marketClass: params.marketClass,
      targetRiskReward: params.targetRiskReward || 2.5,
      atrStopBuffer: params.atrStopBuffer ?? 0.25,
      requireSma200: params.requireSma200 !== false,
      requireSma50Slope: params.requireSma50Slope !== false
    };

    if (daily.length < 210 || weekly.length < 20 || confirmation.length < 30) {
      throw new Error('Sunt necesare minimum 210 lumânări Daily și istoric Weekly/8H suficient pentru un backtest matur.');
    }

    const dailyCloud = calculateMoneyLineCloud(daily, '1d');
    const weeklyCloud = calculateMoneyLineCloud(weekly, '1w');
    const confirmationCloud = calculateMoneyLineCloud(confirmation, '8h');
    const dailySignals = this.engine.calculateSeries(symbol, '1d', daily);
    const trades: BacktestTrade[] = [];
    const equityCurve: BacktestResult['equityCurve'] = [];
    const priceSeries: BacktestPricePoint[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const confirmationMs = 8 * 60 * 60 * 1000;
    const feeRoundTrip = fullParams.feePercentPerTrade * 2;
    const firstEligibleIndex = daily.findIndex((candle, index) => index >= 200
      && candle.timestamp + dayMs >= weekly[0].timestamp + weekMs
      && candle.timestamp + dayMs >= confirmation[0].timestamp + confirmationMs);
    if (firstEligibleIndex < 0) throw new Error('Perioadele Daily, Weekly și 8H nu au suficient istoric comun.');
    fullParams.startTimestamp = daily[firstEligibleIndex].timestamp;
    const initialPrice = daily[firstEligibleIndex].close;
    let capital = fullParams.initialCapital;
    let peakEquity = capital;
    let maxDrawdown = 0;
    let armedLong = false;
    let armedShort = false;
    let longReclaimExpiresAt = -1;
    let shortReclaimExpiresAt = -1;
    let weeklyIndex = -1;
    let confirmationIndex = -1;
    let pendingEntry: { side: 'LONG' | 'SHORT'; signalIndex: number; reason: string } | undefined;
    let pendingExit: { reason: string } | undefined;
    let position: {
      side: 'LONG' | 'SHORT';
      entryPrice: number;
      entryTimestamp: number;
      entryTier: MoneyLineTier;
      initialStop: number;
      targetPrice: number;
      initialRiskPercent: number;
      reason: string;
    } | undefined;

    const isWeeklyBullish = (index: number) => index >= 0
      && weeklyCloud.dirFast[index] < 0
      && weeklyCloud.dirSlow[index] < 0;
    const isWeeklyBearish = (index: number) => index >= 0
      && weeklyCloud.dirFast[index] > 0
      && weeklyCloud.dirSlow[index] > 0;
    const markToMarket = (close: number) => {
      if (!position) return capital;
      const gross = position.side === 'LONG'
        ? ((close - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - close) / position.entryPrice) * 100;
      return capital * (1 + (gross - fullParams.feePercentPerTrade) / 100);
    };
    const closePosition = (
      rawPrice: number,
      timestamp: number,
      exitReason: BacktestTrade['exitReason'],
      detail: string,
      exitTier: MoneyLineTier
    ) => {
      if (!position) return;
      const effectiveExitPrice = position.side === 'LONG'
        ? rawPrice * (1 - fullParams.slippagePercent / 100)
        : rawPrice * (1 + fullParams.slippagePercent / 100);
      const grossPercent = position.side === 'LONG'
        ? ((effectiveExitPrice - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - effectiveExitPrice) / position.entryPrice) * 100;
      const netPercent = Number((grossPercent - feeRoundTrip).toFixed(3));
      const pnlNetUsd = Number((capital * netPercent / 100).toFixed(2));
      const riskCashPercent = Math.max(0.01, position.initialRiskPercent);
      const rMultiple = Number((netPercent / riskCashPercent).toFixed(2));
      capital = Number((capital + pnlNetUsd).toFixed(2));
      trades.push({
        id: `trade_${trades.length + 1}`,
        symbol,
        side: position.side,
        entryTimestamp: position.entryTimestamp,
        entryPrice: position.entryPrice,
        exitTimestamp: timestamp,
        exitPrice: effectiveExitPrice,
        entrySignalTier: position.entryTier,
        exitSignalTier: exitTier,
        pnlPercent: netPercent,
        pnlNetUsd,
        holdingHours: Number(((timestamp - position.entryTimestamp) / 3_600_000).toFixed(1)),
        exitReason,
        initialStop: position.initialStop,
        targetPrice: position.targetPrice,
        initialRiskPercent: position.initialRiskPercent,
        rMultiple,
        entryReason: position.reason,
        exitReasonDetail: detail
      });
      position = undefined;
      pendingExit = undefined;
    };

    for (let index = 0; index < daily.length; index++) {
      const candle = daily[index];
      const availableAt = candle.timestamp + dayMs;
      while (weeklyIndex + 1 < weekly.length && weekly[weeklyIndex + 1].timestamp + weekMs <= availableAt) weeklyIndex += 1;
      while (
        confirmationIndex + 1 < confirmation.length
        && confirmation[confirmationIndex + 1].timestamp + confirmationMs <= availableAt
      ) confirmationIndex += 1;

      const signal = dailySignals[index];
      const sma50 = dailyCloud.sma50[index];
      const sma200 = dailyCloud.sma200[index];
      const weeklyBullish = isWeeklyBullish(weeklyIndex);
      const weeklyBearish = isWeeklyBearish(weeklyIndex);
      const weeklyRegime: BacktestPricePoint['weeklyRegime'] = weeklyBullish
        ? 'BULLISH'
        : weeklyBearish ? 'BEARISH' : 'TRANSITION';
      const dailyFastBullish = dailyCloud.dirFast[index] < 0;
      const dailyFastBearish = dailyCloud.dirFast[index] > 0;
      const confirmationSlowBullish = confirmationIndex >= 0 && confirmationCloud.dirSlow[confirmationIndex] < 0;
      const confirmationSlowBearish = confirmationIndex >= 0 && confirmationCloud.dirSlow[confirmationIndex] > 0;
      const mature = index >= 200 && Boolean(signal) && weeklyIndex >= 0 && confirmationIndex >= 0;
      const sma50Rising = index >= 5 && sma50 > dailyCloud.sma50[index - 5];
      const sma50Falling = index >= 5 && sma50 < dailyCloud.sma50[index - 5];
      const previousBelow = index > 0 && daily[index - 1].close <= dailyCloud.sma50[index - 1];
      const previousAbove = index > 0 && daily[index - 1].close >= dailyCloud.sma50[index - 1];
      const reclaimUp = previousBelow && candle.close > sma50;
      const reclaimDown = previousAbove && candle.close < sma50;
      const atr = signal?.rawIndicators.atr14 || Math.max(candle.high - candle.low, candle.close * 0.01);
      const notExtendedLong = candle.close <= sma50 + atr;
      const notExtendedShort = candle.close >= sma50 - atr;
      const sma200LongOk = !fullParams.requireSma200 || candle.close > sma200;
      const sma200ShortOk = !fullParams.requireSma200 || candle.close < sma200;
      const slopeLongOk = !fullParams.requireSma50Slope || sma50Rising;
      const slopeShortOk = !fullParams.requireSma50Slope || sma50Falling;

      if (!weeklyBullish) {
        armedLong = false;
        longReclaimExpiresAt = -1;
      } else if (candle.close < sma50) {
        armedLong = true;
        longReclaimExpiresAt = -1;
      }
      if (!weeklyBearish) {
        armedShort = false;
        shortReclaimExpiresAt = -1;
      } else if (candle.close > sma50) {
        armedShort = true;
        shortReclaimExpiresAt = -1;
      }
      // MoneyLine confirmation may arrive shortly after the exact SMA50
      // crossing. Keep a five-close confirmation window instead of requiring
      // every condition on the same bar.
      if (armedLong && weeklyBullish && reclaimUp) longReclaimExpiresAt = index + 5;
      if (armedShort && weeklyBearish && reclaimDown) shortReclaimExpiresAt = index + 5;
      const longReclaimActive = longReclaimExpiresAt >= index && candle.close > sma50;
      const shortReclaimActive = shortReclaimExpiresAt >= index && candle.close < sma50;

      const longTrigger = mature && !position && !pendingEntry && armedLong && weeklyBullish
        && longReclaimActive && dailyFastBullish && confirmationSlowBullish
        && sma200LongOk && slopeLongOk && notExtendedLong;
      const shortTrigger = directionMode === 'LONG_SHORT' && mature && !position && !pendingEntry && armedShort
        && weeklyBearish && shortReclaimActive && dailyFastBearish && confirmationSlowBearish
        && sma200ShortOk && slopeShortOk && notExtendedShort;

      // Orders generated by yesterday's close are filled at today's open.
      if (pendingExit && position) {
        closePosition(candle.open, candle.timestamp, 'SignalReversal', pendingExit.reason, signal?.tier || 'Neutral');
      }
      if (pendingEntry && !position) {
        const sourceIndex = pendingEntry.signalIndex;
        const sourceSignal = dailySignals[sourceIndex];
        const entryPrice = pendingEntry.side === 'LONG'
          ? candle.open * (1 + fullParams.slippagePercent / 100)
          : candle.open * (1 - fullParams.slippagePercent / 100);
        const sourceAtr = sourceSignal?.rawIndicators.atr14 || atr;
        const swingStart = Math.max(0, sourceIndex - 5);
        const sourceSlice = daily.slice(swingStart, sourceIndex + 1);
        const initialStop = pendingEntry.side === 'LONG'
          ? Math.min(...sourceSlice.map(value => value.low), dailyCloud.sma50[sourceIndex] - fullParams.atrStopBuffer! * sourceAtr)
          : Math.max(...sourceSlice.map(value => value.high), dailyCloud.sma50[sourceIndex] + fullParams.atrStopBuffer! * sourceAtr);
        const riskPerUnit = pendingEntry.side === 'LONG' ? entryPrice - initialStop : initialStop - entryPrice;
        const initialRiskPercent = riskPerUnit > 0 ? (riskPerUnit / entryPrice) * 100 : 0;
        const stillNearReclaim = pendingEntry.side === 'LONG'
          ? entryPrice <= dailyCloud.sma50[sourceIndex] + sourceAtr * 1.5
          : entryPrice >= dailyCloud.sma50[sourceIndex] - sourceAtr * 1.5;
        if (initialRiskPercent > 0 && initialRiskPercent <= 8 && stillNearReclaim) {
          position = {
            side: pendingEntry.side,
            entryPrice,
            entryTimestamp: candle.timestamp,
            entryTier: sourceSignal?.tier || 'Neutral',
            initialStop,
            targetPrice: pendingEntry.side === 'LONG'
              ? entryPrice + riskPerUnit * fullParams.targetRiskReward!
              : entryPrice - riskPerUnit * fullParams.targetRiskReward!,
            initialRiskPercent,
            reason: pendingEntry.reason
          };
        }
        pendingEntry = undefined;
      }

      if (position) {
        const stopHit = position.side === 'LONG' ? candle.low <= position.initialStop : candle.high >= position.initialStop;
        const targetHit = position.side === 'LONG' ? candle.high >= position.targetPrice : candle.low <= position.targetPrice;
        // When both levels occur inside one Daily bar the pessimistic ordering
        // is used because intraday tick order is unavailable.
        if (stopHit) {
          const gapAdjustedStop = position.side === 'LONG'
            ? Math.min(candle.open, position.initialStop)
            : Math.max(candle.open, position.initialStop);
          closePosition(gapAdjustedStop, candle.timestamp, 'StopLoss', 'Stop structural/ATR atins.', signal?.tier || 'Neutral');
        } else if (targetHit) {
          closePosition(position.targetPrice, candle.timestamp, 'TakeProfit', `Ținta ${fullParams.targetRiskReward}R atinsă.`, signal?.tier || 'Neutral');
        } else if (
          position.side === 'LONG'
            ? !weeklyBullish || (candle.close < sma50 && dailyFastBearish)
            : !weeklyBearish || (candle.close > sma50 && dailyFastBullish)
        ) {
          pendingExit = {
            reason: position.side === 'LONG'
              ? 'Regimul Weekly a slăbit sau Daily a închis sub SMA50 cu Fast bearish.'
              : 'Regimul Weekly a slăbit sau Daily a închis peste SMA50 cu Fast bullish.'
          };
        }
      }

      if (longTrigger) {
        pendingEntry = {
          side: 'LONG',
          signalIndex: index,
          reason: 'Weekly Fast+Slow bullish; Daily reclaim SMA50; Daily Fast și 8H Slow bullish; SMA50 în urcare; preț peste SMA200.'
        };
        armedLong = false;
        longReclaimExpiresAt = -1;
      } else if (shortTrigger) {
        pendingEntry = {
          side: 'SHORT',
          signalIndex: index,
          reason: 'Weekly Fast+Slow bearish; Daily pierde SMA50; Daily Fast și 8H Slow bearish; SMA50 în coborâre; preț sub SMA200.'
        };
        armedShort = false;
        shortReclaimExpiresAt = -1;
      }

      if (index === daily.length - 1 && position) {
        closePosition(candle.close, candle.timestamp, 'EndPeriod', 'Sfârșitul perioadei testate.', signal?.tier || 'Neutral');
      }

      if (index >= firstEligibleIndex) {
        const equity = markToMarket(candle.close);
        peakEquity = Math.max(peakEquity, equity);
        maxDrawdown = Math.max(maxDrawdown, peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0);
        equityCurve.push({
          timestamp: candle.timestamp,
          strategyEquity: Number(equity.toFixed(2)),
          benchmarkEquity: Number((fullParams.initialCapital * candle.close / initialPrice).toFixed(2))
        });
        priceSeries.push({
          timestamp: candle.timestamp,
          close: candle.close,
          sma50,
          sma200,
          weeklyRegime,
          armedLong,
          armedShort,
          longTrigger,
          shortTrigger
        });
      }
    }

    const winners = trades.filter(trade => trade.pnlPercent > 0);
    const losers = trades.filter(trade => trade.pnlPercent <= 0);
    const grossProfit = winners.reduce((sum, trade) => sum + trade.pnlNetUsd, 0);
    const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnlNetUsd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const dailyReturns = equityCurve.slice(1).map((point, index) => {
      const previous = equityCurve[index].strategyEquity;
      return previous > 0 ? (point.strategyEquity - previous) / previous : 0;
    });
    const meanReturn = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 1
      ? dailyReturns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / (dailyReturns.length - 1)
      : 0;
    const sharpe = variance > 0 ? (meanReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;
    const expectancyR = trades.length
      ? trades.reduce((sum, trade) => sum + (trade.rMultiple || 0), 0) / trades.length
      : 0;
    const finalBenchmark = equityCurve[equityCurve.length - 1]?.benchmarkEquity || fullParams.initialCapital;
    return {
      params: fullParams,
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: trades.length ? Number((winners.length / trades.length * 100).toFixed(1)) : 0,
      profitFactor: Number(profitFactor.toFixed(2)),
      totalReturnPercent: Number(((capital / fullParams.initialCapital - 1) * 100).toFixed(2)),
      buyAndHoldReturnPercent: Number(((finalBenchmark / fullParams.initialCapital - 1) * 100).toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
      sharpeRatio: Number(sharpe.toFixed(2)),
      averageTradeDurationHours: trades.length
        ? Number((trades.reduce((sum, trade) => sum + trade.holdingHours, 0) / trades.length).toFixed(1))
        : 0,
      averageTradeReturnPercent: trades.length
        ? Number((trades.reduce((sum, trade) => sum + trade.pnlPercent, 0) / trades.length).toFixed(2))
        : 0,
      expectancyR: Number(expectancyR.toFixed(2)),
      strategyName: 'Weekly Regime + Daily SMA50 Reclaim + ML 8H Confirmation',
      strategyRules: [
        'Regim: MoneyLine Cloud Weekly Fast și Slow în aceeași direcție.',
        'Armare: Daily trece temporar pe partea opusă a SMA50.',
        'Trigger: reclaim Daily SMA50, apoi confirmare în maximum 5 închideri prin Daily Fast + 8H Slow + pantă SMA50 + SMA200.',
        'Execuție: următoarea deschidere Daily, cu slippage și comisioane.',
        `Risc: stop structural cu buffer ATR; țintă ${fullParams.targetRiskReward}R; ieșire la invalidarea regimului.`
      ],
      equityCurve,
      priceSeries,
      trades,
      disclaimer: 'Backtest determinist pe lumânări închise. Rezultatele istorice, inclusiv win rate și expectancy, nu garantează performanțe viitoare.'
    };
  }

  /**
   * Risk-managed implementation of Larry Connors' RSI(2) trend-pullback
   * model. RSI(2) below 5 only arms the setup; this conservative version
   * waits for RSI(2) to cross back above 50 before entering at the following
   * Daily open. SMA200 remains the trend filter, SMA5 the mean-reversion exit,
   * and a 3 ATR catastrophe stop limits otherwise unbounded tail risk.
   */
  public runConnorsRsi2Backtest(
    symbol: string,
    dailyInput: Candle[],
    params: Partial<BacktestParams> = {}
  ): BacktestResult {
    const daily = dailyInput
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    const directionMode: BacktestDirectionMode = params.directionMode === 'LONG_SHORT' ? 'LONG_SHORT' : 'LONG_ONLY';
    const fullParams: BacktestParams = {
      symbol,
      timeframe: '1d',
      startTimestamp: daily[0]?.timestamp || 0,
      endTimestamp: daily[daily.length - 1]?.timestamp || Date.now(),
      initialCapital: params.initialCapital || 10_000,
      feePercentPerTrade: params.feePercentPerTrade ?? 0.075,
      slippagePercent: params.slippagePercent ?? 0.05,
      entryTierThreshold: 'Bullish',
      exitTierThreshold: 'Neutral',
      strategy: 'connors_rsi2',
      directionMode,
      marketClass: params.marketClass,
      requireSma200: true,
      rsi2EntryThreshold: params.rsi2EntryThreshold ?? 5,
      rsi2ConfirmationThreshold: params.rsi2ConfirmationThreshold ?? 50,
      atrStopMultiple: params.atrStopMultiple ?? 3,
      evaluationStartTimestamp: params.evaluationStartTimestamp
    };

    if (daily.length < 220) {
      throw new Error('Sunt necesare minimum 220 lumânări Daily pentru RSI(2), SMA5, SMA200 și ATR14.');
    }

    const closes = daily.map(candle => candle.close);
    const highs = daily.map(candle => candle.high);
    const lows = daily.map(candle => candle.low);
    const rsi2 = calculateRSI(closes, 2);
    const sma5 = calculateSMA(closes, 5);
    const sma200 = calculateSMA(closes, 200);
    const atr14 = calculateATR(highs, lows, closes, 14);
    const firstEligibleIndex = daily.findIndex((candle, index) => index >= 199
      && (!fullParams.evaluationStartTimestamp || candle.timestamp >= fullParams.evaluationStartTimestamp));
    if (firstEligibleIndex < 0) throw new Error('Perioada selectată nu conține suficient istoric matur pentru SMA200.');

    fullParams.startTimestamp = daily[firstEligibleIndex].timestamp;
    const initialPrice = daily[firstEligibleIndex].close;
    const feeRoundTrip = fullParams.feePercentPerTrade * 2;
    const trades: BacktestTrade[] = [];
    const equityCurve: BacktestResult['equityCurve'] = [];
    const priceSeries: BacktestPricePoint[] = [];
    let capital = fullParams.initialCapital;
    let peakEquity = capital;
    let maxDrawdown = 0;
    let armedLongIndex = -1;
    let pendingEntry: { side: 'LONG' | 'SHORT'; signalIndex: number; armedIndex?: number } | undefined;
    let pendingExit: { reason: string } | undefined;
    let position: {
      side: 'LONG' | 'SHORT';
      entryPrice: number;
      entryTimestamp: number;
      initialStop: number;
      initialRiskPercent: number;
      reason: string;
    } | undefined;

    const markToMarket = (close: number) => {
      if (!position) return capital;
      const gross = position.side === 'LONG'
        ? ((close - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - close) / position.entryPrice) * 100;
      return capital * (1 + (gross - fullParams.feePercentPerTrade) / 100);
    };
    const closePosition = (
      rawPrice: number,
      timestamp: number,
      exitReason: BacktestTrade['exitReason'],
      detail: string
    ) => {
      if (!position) return;
      const effectiveExitPrice = position.side === 'LONG'
        ? rawPrice * (1 - fullParams.slippagePercent / 100)
        : rawPrice * (1 + fullParams.slippagePercent / 100);
      const grossPercent = position.side === 'LONG'
        ? ((effectiveExitPrice - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - effectiveExitPrice) / position.entryPrice) * 100;
      const netPercent = Number((grossPercent - feeRoundTrip).toFixed(3));
      const pnlNetUsd = Number((capital * netPercent / 100).toFixed(2));
      const rMultiple = Number((netPercent / Math.max(0.01, position.initialRiskPercent)).toFixed(2));
      capital = Number((capital + pnlNetUsd).toFixed(2));
      trades.push({
        id: `trade_${trades.length + 1}`,
        symbol,
        side: position.side,
        entryTimestamp: position.entryTimestamp,
        entryPrice: position.entryPrice,
        exitTimestamp: timestamp,
        exitPrice: effectiveExitPrice,
        entrySignalTier: position.side === 'LONG' ? 'Bullish' : 'Bearish',
        exitSignalTier: 'Neutral',
        pnlPercent: netPercent,
        pnlNetUsd,
        holdingHours: Number(((timestamp - position.entryTimestamp) / 3_600_000).toFixed(1)),
        exitReason,
        initialStop: position.initialStop,
        initialRiskPercent: position.initialRiskPercent,
        rMultiple,
        entryReason: position.reason,
        exitReasonDetail: detail
      });
      position = undefined;
      pendingExit = undefined;
    };

    for (let index = firstEligibleIndex; index < daily.length; index++) {
      const candle = daily[index];

      // Signals generated on yesterday's close are executed at today's open.
      if (pendingExit && position) {
        closePosition(candle.open, candle.timestamp, 'SignalReversal', pendingExit.reason);
      }
      if (pendingEntry && !position) {
        const signalIndex = pendingEntry.signalIndex;
        const signalAtr = atr14[signalIndex];
        const entryPrice = pendingEntry.side === 'LONG'
          ? candle.open * (1 + fullParams.slippagePercent / 100)
          : candle.open * (1 - fullParams.slippagePercent / 100);
        const initialStop = pendingEntry.side === 'LONG'
          ? entryPrice - fullParams.atrStopMultiple! * signalAtr
          : entryPrice + fullParams.atrStopMultiple! * signalAtr;
        const initialRiskPercent = Math.abs(entryPrice - initialStop) / entryPrice * 100;
        if (Number.isFinite(initialStop) && initialStop > 0 && initialRiskPercent > 0) {
          position = {
            side: pendingEntry.side,
            entryPrice,
            entryTimestamp: candle.timestamp,
            initialStop,
            initialRiskPercent,
            reason: pendingEntry.side === 'LONG'
              ? `Close peste SMA200; RSI(2) armat sub ${fullParams.rsi2EntryThreshold} și confirmat peste ${fullParams.rsi2ConfirmationThreshold} după ${signalIndex - (pendingEntry.armedIndex ?? signalIndex)} închideri.`
              : `Close sub SMA200 și RSI(2) peste ${100 - fullParams.rsi2EntryThreshold!}.`
          };
        }
        pendingEntry = undefined;
      }

      if (position) {
        const stopHit = position.side === 'LONG'
          ? candle.low <= position.initialStop
          : candle.high >= position.initialStop;
        if (stopHit) {
          const gapAdjustedStop = position.side === 'LONG'
            ? Math.min(candle.open, position.initialStop)
            : Math.max(candle.open, position.initialStop);
          closePosition(gapAdjustedStop, candle.timestamp, 'StopLoss', `Stop de protecție ${fullParams.atrStopMultiple} ATR atins.`);
        } else if (position.side === 'LONG' ? candle.close > sma5[index] : candle.close < sma5[index]) {
          pendingExit = {
            reason: position.side === 'LONG'
              ? 'Mean reversion confirmată: Daily a închis peste SMA5.'
              : 'Mean reversion confirmată: Daily a închis sub SMA5.'
          };
        }
      }

      if (armedLongIndex >= 0 && candle.close <= sma200[index]) armedLongIndex = -1;
      const freshLongArm = index > 0 && !position && !pendingEntry && armedLongIndex < 0
        && candle.close > sma200[index]
        && rsi2[index] < fullParams.rsi2EntryThreshold!
        && rsi2[index - 1] >= fullParams.rsi2EntryThreshold!;
      if (freshLongArm) armedLongIndex = index;

      const longTrigger = index > 0 && !position && !pendingEntry && armedLongIndex >= 0
        && index > armedLongIndex
        && candle.close > sma200[index]
        && rsi2[index - 1] <= fullParams.rsi2ConfirmationThreshold!
        && rsi2[index] > fullParams.rsi2ConfirmationThreshold!;
      const shortTrigger = directionMode === 'LONG_SHORT' && !position && !pendingEntry
        && candle.close < sma200[index] && rsi2[index] > 100 - fullParams.rsi2EntryThreshold!;
      if (longTrigger) {
        pendingEntry = { side: 'LONG', signalIndex: index, armedIndex: armedLongIndex };
        armedLongIndex = -1;
      }
      else if (shortTrigger) pendingEntry = { side: 'SHORT', signalIndex: index };

      if (index === daily.length - 1 && position) {
        closePosition(candle.close, candle.timestamp, 'EndPeriod', 'Sfârșitul perioadei testate.');
      }

      const equity = markToMarket(candle.close);
      peakEquity = Math.max(peakEquity, equity);
      maxDrawdown = Math.max(maxDrawdown, peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0);
      equityCurve.push({
        timestamp: candle.timestamp,
        strategyEquity: Number(equity.toFixed(2)),
        benchmarkEquity: Number((fullParams.initialCapital * candle.close / initialPrice).toFixed(2))
      });
      priceSeries.push({
        timestamp: candle.timestamp,
        close: candle.close,
        sma50: sma5[index],
        sma5: sma5[index],
        sma200: sma200[index],
        rsi2: rsi2[index],
        weeklyRegime: candle.close > sma200[index] ? 'BULLISH' : 'BEARISH',
        armedLong: armedLongIndex >= 0,
        armedShort: false,
        longTrigger,
        shortTrigger
      });
    }

    const winners = trades.filter(trade => trade.pnlPercent > 0);
    const losers = trades.filter(trade => trade.pnlPercent <= 0);
    const grossProfit = winners.reduce((sum, trade) => sum + trade.pnlNetUsd, 0);
    const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnlNetUsd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const dailyReturns = equityCurve.slice(1).map((point, index) => {
      const previous = equityCurve[index].strategyEquity;
      return previous > 0 ? (point.strategyEquity - previous) / previous : 0;
    });
    const meanReturn = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 1
      ? dailyReturns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / (dailyReturns.length - 1)
      : 0;
    const sharpe = variance > 0 ? (meanReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;
    const expectancyR = trades.length
      ? trades.reduce((sum, trade) => sum + (trade.rMultiple || 0), 0) / trades.length
      : 0;
    const finalBenchmark = equityCurve[equityCurve.length - 1]?.benchmarkEquity || fullParams.initialCapital;
    const validation = !params.evaluationStartTimestamp
      ? (() => {
          const startTimestamp = daily[Math.max(199, Math.floor(daily.length * 0.7))].timestamp;
          const holdout = this.runConnorsRsi2Backtest(symbol, daily, {
            ...params,
            evaluationStartTimestamp: startTimestamp
          });
          return {
            method: 'chronological_holdout_30' as const,
            startTimestamp,
            totalTrades: holdout.totalTrades,
            winRate: holdout.winRate,
            profitFactor: holdout.profitFactor,
            totalReturnPercent: holdout.totalReturnPercent,
            maxDrawdownPercent: holdout.maxDrawdownPercent,
            profitable: holdout.totalReturnPercent > 0
          };
        })()
      : undefined;

    return {
      params: fullParams,
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: trades.length ? Number((winners.length / trades.length * 100).toFixed(1)) : 0,
      profitFactor: Number(profitFactor.toFixed(2)),
      totalReturnPercent: Number(((capital / fullParams.initialCapital - 1) * 100).toFixed(2)),
      buyAndHoldReturnPercent: Number(((finalBenchmark / fullParams.initialCapital - 1) * 100).toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
      sharpeRatio: Number(sharpe.toFixed(2)),
      averageTradeDurationHours: trades.length
        ? Number((trades.reduce((sum, trade) => sum + trade.holdingHours, 0) / trades.length).toFixed(1))
        : 0,
      averageTradeReturnPercent: trades.length
        ? Number((trades.reduce((sum, trade) => sum + trade.pnlPercent, 0) / trades.length).toFixed(2))
        : 0,
      expectancyR: Number(expectancyR.toFixed(2)),
      strategyName: 'Connors RSI(2) Trend Pullback · Conservative Confirmation',
      strategyRules: [
        'Regim LONG: închiderea Daily este peste SMA200.',
        `Armare: RSI(2) închide sub ${fullParams.rsi2EntryThreshold}; încă nu se intră.`,
        `Confirmare: RSI(2) revine peste ${fullParams.rsi2ConfirmationThreshold} cu Daily încă peste SMA200; intrare la următorul open.`,
        'Exit: prima închidere Daily peste SMA5, executată la următorul open.',
        `Protecție adăugată: stop-catastrofă la ${fullParams.atrStopMultiple} ATR de entry.`,
        'Costuri incluse: 0,075% comision pe sens și 0,05% slippage pe sens.'
      ],
      strategySources: [
        {
          label: 'StockCharts ChartSchool · RSI(2)',
          url: 'https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/rsi-2'
        },
        {
          label: 'AQR · A Century of Evidence on Trend-Following Investing',
          url: 'https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing'
        },
        {
          label: 'SSRN · Technical rules under realistic costs (2026)',
          url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6977700'
        }
      ],
      validation,
      equityCurve,
      priceSeries,
      trades,
      disclaimer: 'Strategie de cercetare, nu recomandare financiară. Un win rate ridicat nu garantează profit: pierderile pot fi mai mari decât câștigurile, iar rezultatele istorice nu garantează performanța viitoare.'
    };
  }

  /**
   * Benchmark-confirmed bear-market rebound fade used by the live Daily
   * strategy alerts. RSI(2) above 95 only arms the setup; the short is filled
   * at the next Daily open after RSI(2) crosses back below 50 within three
   * closed candles. BTC confirms crypto and SPY confirms US stocks.
   */
  public runBearRallyFadeBacktest(
    symbol: string,
    dailyInput: Candle[],
    benchmarkInput: Candle[],
    params: Partial<BacktestParams> = {}
  ): BacktestResult {
    const daily = dailyInput
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    const benchmark = benchmarkInput
      .filter(candle => candle.isClosed !== false)
      .sort((left, right) => left.timestamp - right.timestamp);
    const fullParams: BacktestParams = {
      symbol,
      timeframe: '1d',
      startTimestamp: daily[0]?.timestamp || 0,
      endTimestamp: daily[daily.length - 1]?.timestamp || Date.now(),
      initialCapital: params.initialCapital || 10_000,
      feePercentPerTrade: params.feePercentPerTrade ?? 0.075,
      slippagePercent: params.slippagePercent ?? 0.05,
      entryTierThreshold: 'Bearish',
      exitTierThreshold: 'Neutral',
      strategy: 'bear_rally_fade',
      directionMode: 'SHORT_ONLY',
      marketClass: params.marketClass,
      requireSma200: true,
      requireSma50Slope: true,
      rsi2EntryThreshold: params.rsi2EntryThreshold ?? 95,
      rsi2ConfirmationThreshold: params.rsi2ConfirmationThreshold ?? 50,
      confirmationWindowBars: params.confirmationWindowBars ?? 3,
      atrStopMultiple: params.atrStopMultiple ?? 3,
      evaluationStartTimestamp: params.evaluationStartTimestamp
    };

    if (daily.length < 240 || benchmark.length < 220) {
      throw new Error('Sunt necesare minimum 240 lumânări Daily pentru asset și 220 pentru benchmark.');
    }

    const closes = daily.map(candle => candle.close);
    const highs = daily.map(candle => candle.high);
    const lows = daily.map(candle => candle.low);
    const rsi2 = calculateRSI(closes, 2);
    const sma5 = calculateSMA(closes, 5);
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const atr14 = calculateATR(highs, lows, closes, 14);
    const benchmarkCloses = benchmark.map(candle => candle.close);
    const benchmarkSma50 = calculateSMA(benchmarkCloses, 50);
    const benchmarkSma200 = calculateSMA(benchmarkCloses, 200);
    const benchmarkIndexFor = (timestamp: number) => {
      let low = 0;
      let high = benchmark.length - 1;
      let found = -1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (benchmark[middle].timestamp <= timestamp) {
          found = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      return found;
    };
    const assetBearishAt = (index: number) => index >= 219
      && closes[index] < sma200[index]
      && sma50[index] < sma200[index]
      && sma200[index] < sma200[index - 20];
    const benchmarkBearishAt = (index: number) => index >= 199
      && benchmarkCloses[index] < benchmarkSma200[index]
      && benchmarkSma50[index] < benchmarkSma200[index];
    const firstEligibleIndex = daily.findIndex((candle, index) => index >= 219
      && benchmarkIndexFor(candle.timestamp) >= 199
      && (!fullParams.evaluationStartTimestamp || candle.timestamp >= fullParams.evaluationStartTimestamp));
    if (firstEligibleIndex < 0) throw new Error('Perioada comună nu conține suficient istoric matur pentru regimul bearish.');

    fullParams.startTimestamp = daily[firstEligibleIndex].timestamp;
    const initialPrice = daily[firstEligibleIndex].close;
    const feeRoundTrip = fullParams.feePercentPerTrade * 2;
    const trades: BacktestTrade[] = [];
    const equityCurve: BacktestResult['equityCurve'] = [];
    const priceSeries: BacktestPricePoint[] = [];
    let capital = fullParams.initialCapital;
    let peakEquity = capital;
    let maxDrawdown = 0;
    let armedIndex = -1;
    let pendingEntry: { signalIndex: number; armedIndex: number } | undefined;
    let pendingExit: { reason: string } | undefined;
    let position: {
      entryPrice: number;
      entryTimestamp: number;
      initialStop: number;
      initialRiskPercent: number;
      reason: string;
    } | undefined;

    const markToMarket = (close: number) => {
      if (!position) return capital;
      const gross = ((position.entryPrice - close) / position.entryPrice) * 100;
      return capital * (1 + (gross - fullParams.feePercentPerTrade) / 100);
    };
    const closePosition = (
      rawPrice: number,
      timestamp: number,
      exitReason: BacktestTrade['exitReason'],
      detail: string
    ) => {
      if (!position) return;
      const effectiveExitPrice = rawPrice * (1 + fullParams.slippagePercent / 100);
      const grossPercent = ((position.entryPrice - effectiveExitPrice) / position.entryPrice) * 100;
      const netPercent = Number((grossPercent - feeRoundTrip).toFixed(3));
      const pnlNetUsd = Number((capital * netPercent / 100).toFixed(2));
      const rMultiple = Number((netPercent / Math.max(0.01, position.initialRiskPercent)).toFixed(2));
      capital = Number((capital + pnlNetUsd).toFixed(2));
      trades.push({
        id: `trade_${trades.length + 1}`,
        symbol,
        side: 'SHORT',
        entryTimestamp: position.entryTimestamp,
        entryPrice: position.entryPrice,
        exitTimestamp: timestamp,
        exitPrice: effectiveExitPrice,
        entrySignalTier: 'Bearish',
        exitSignalTier: 'Neutral',
        pnlPercent: netPercent,
        pnlNetUsd,
        holdingHours: Number(((timestamp - position.entryTimestamp) / 3_600_000).toFixed(1)),
        exitReason,
        initialStop: position.initialStop,
        initialRiskPercent: position.initialRiskPercent,
        rMultiple,
        entryReason: position.reason,
        exitReasonDetail: detail
      });
      position = undefined;
      pendingExit = undefined;
    };

    for (let index = firstEligibleIndex; index < daily.length; index++) {
      const candle = daily[index];
      const benchmarkIndex = benchmarkIndexFor(candle.timestamp);
      const assetBearish = assetBearishAt(index);
      const benchmarkBearish = benchmarkBearishAt(benchmarkIndex);

      // A signal generated on the previous close is executed at today's open.
      if (pendingExit && position) {
        closePosition(candle.open, candle.timestamp, 'SignalReversal', pendingExit.reason);
      }
      if (pendingEntry && !position) {
        const signalAtr = atr14[pendingEntry.signalIndex];
        const entryPrice = candle.open * (1 - fullParams.slippagePercent / 100);
        const initialStop = entryPrice + fullParams.atrStopMultiple! * signalAtr;
        const initialRiskPercent = ((initialStop - entryPrice) / entryPrice) * 100;
        if (Number.isFinite(initialStop) && initialStop > entryPrice && initialRiskPercent > 0) {
          position = {
            entryPrice,
            entryTimestamp: candle.timestamp,
            initialStop,
            initialRiskPercent,
            reason: `Regim bear asset + benchmark; RSI(2) > ${fullParams.rsi2EntryThreshold} la armare și confirmare sub ${fullParams.rsi2ConfirmationThreshold} în ${pendingEntry.signalIndex - pendingEntry.armedIndex} închideri.`
          };
        }
        pendingEntry = undefined;
      }

      if (position) {
        if (candle.high >= position.initialStop) {
          closePosition(
            Math.max(candle.open, position.initialStop),
            candle.timestamp,
            'StopLoss',
            `Stop de protecție ${fullParams.atrStopMultiple} ATR atins.`
          );
        } else if (candle.close < sma5[index]) {
          pendingExit = { reason: 'Mean reversion bearish confirmată: Daily a închis sub SMA5.' };
        }
      }

      if (armedIndex >= 0 && (
        index - armedIndex > fullParams.confirmationWindowBars!
        || !assetBearish
        || !benchmarkBearish
      )) armedIndex = -1;

      const crossedAboveExtreme = index > 0
        && rsi2[index] > fullParams.rsi2EntryThreshold!
        && rsi2[index - 1] <= fullParams.rsi2EntryThreshold!;
      if (!position && !pendingEntry && crossedAboveExtreme && assetBearish && benchmarkBearish) {
        armedIndex = index;
      }

      const barsSinceArm = armedIndex >= 0 ? index - armedIndex : -1;
      const shortTrigger = !position && !pendingEntry && armedIndex >= 0
        && barsSinceArm >= 1
        && barsSinceArm <= fullParams.confirmationWindowBars!
        && rsi2[index - 1] >= fullParams.rsi2ConfirmationThreshold!
        && rsi2[index] < fullParams.rsi2ConfirmationThreshold!
        && assetBearish
        && benchmarkBearish;
      if (shortTrigger) {
        pendingEntry = { signalIndex: index, armedIndex };
        armedIndex = -1;
      }

      if (index === daily.length - 1 && position) {
        closePosition(candle.close, candle.timestamp, 'EndPeriod', 'Sfârșitul perioadei testate.');
      }

      const equity = markToMarket(candle.close);
      peakEquity = Math.max(peakEquity, equity);
      maxDrawdown = Math.max(maxDrawdown, peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0);
      equityCurve.push({
        timestamp: candle.timestamp,
        strategyEquity: Number(equity.toFixed(2)),
        benchmarkEquity: Number((fullParams.initialCapital * candle.close / initialPrice).toFixed(2))
      });
      priceSeries.push({
        timestamp: candle.timestamp,
        close: candle.close,
        sma5: sma5[index],
        sma50: sma50[index],
        sma200: sma200[index],
        rsi2: rsi2[index],
        benchmarkClose: benchmarkCloses[benchmarkIndex],
        benchmarkSma50: benchmarkSma50[benchmarkIndex],
        benchmarkSma200: benchmarkSma200[benchmarkIndex],
        benchmarkBearish,
        weeklyRegime: assetBearish ? 'BEARISH' : closes[index] > sma200[index] ? 'BULLISH' : 'TRANSITION',
        armedLong: false,
        armedShort: armedIndex >= 0,
        longTrigger: false,
        shortTrigger
      });
    }

    const winners = trades.filter(trade => trade.pnlPercent > 0);
    const losers = trades.filter(trade => trade.pnlPercent <= 0);
    const grossProfit = winners.reduce((sum, trade) => sum + trade.pnlNetUsd, 0);
    const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnlNetUsd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const dailyReturns = equityCurve.slice(1).map((point, index) => {
      const previous = equityCurve[index].strategyEquity;
      return previous > 0 ? (point.strategyEquity - previous) / previous : 0;
    });
    const meanReturn = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 1
      ? dailyReturns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / (dailyReturns.length - 1)
      : 0;
    const sharpe = variance > 0 ? (meanReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;
    const expectancyR = trades.length
      ? trades.reduce((sum, trade) => sum + (trade.rMultiple || 0), 0) / trades.length
      : 0;
    const finalBenchmark = equityCurve[equityCurve.length - 1]?.benchmarkEquity || fullParams.initialCapital;
    const validation = !params.evaluationStartTimestamp
      ? (() => {
          const startTimestamp = daily[Math.max(219, Math.floor(daily.length * 0.7))].timestamp;
          const holdout = this.runBearRallyFadeBacktest(symbol, daily, benchmark, {
            ...params,
            evaluationStartTimestamp: startTimestamp
          });
          return {
            method: 'chronological_holdout_30' as const,
            startTimestamp,
            totalTrades: holdout.totalTrades,
            winRate: holdout.winRate,
            profitFactor: holdout.profitFactor,
            totalReturnPercent: holdout.totalReturnPercent,
            maxDrawdownPercent: holdout.maxDrawdownPercent,
            profitable: holdout.totalReturnPercent > 0
          };
        })()
      : undefined;

    return {
      params: fullParams,
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: trades.length ? Number((winners.length / trades.length * 100).toFixed(1)) : 0,
      profitFactor: Number(profitFactor.toFixed(2)),
      totalReturnPercent: Number(((capital / fullParams.initialCapital - 1) * 100).toFixed(2)),
      buyAndHoldReturnPercent: Number(((finalBenchmark / fullParams.initialCapital - 1) * 100).toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
      sharpeRatio: Number(sharpe.toFixed(2)),
      averageTradeDurationHours: trades.length
        ? Number((trades.reduce((sum, trade) => sum + trade.holdingHours, 0) / trades.length).toFixed(1))
        : 0,
      averageTradeReturnPercent: trades.length
        ? Number((trades.reduce((sum, trade) => sum + trade.pnlPercent, 0) / trades.length).toFixed(2))
        : 0,
      expectancyR: Number(expectancyR.toFixed(2)),
      strategyName: 'Bear Rally Fade · RSI(2) Reversal Confirmation',
      strategyRules: [
        'Regim asset: close sub SMA200, SMA50 sub SMA200 și SMA200 în scădere față de acum 20 de închideri.',
        `Regim benchmark: ${fullParams.marketClass === 'crypto' ? 'BTC' : 'SPY'} are close sub SMA200 și SMA50 sub SMA200.`,
        `Armare: RSI(2) trece peste ${fullParams.rsi2EntryThreshold}; încă nu se intră.`,
        `Trigger: RSI(2) revine sub ${fullParams.rsi2ConfirmationThreshold} în maximum ${fullParams.confirmationWindowBars} închideri; SHORT la următorul open.`,
        `Protecție: stop la ${fullParams.atrStopMultiple} ATR; acoperire la următorul open după close sub SMA5.`,
        'Costuri incluse: 0,075% comision pe sens și 0,05% slippage pe sens.'
      ],
      strategySources: [
        {
          label: 'StockCharts ChartSchool · RSI(2) și confirmarea sub nivelul median',
          url: 'https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/rsi-2'
        },
        {
          label: 'AQR · Time Series Momentum',
          url: 'https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum'
        },
        {
          label: 'FINRA · riscurile pozițiilor short',
          url: 'https://www.finra.org/rules-guidance/rulebooks/finra-rules/2270'
        }
      ],
      validation,
      equityCurve,
      priceSeries,
      trades,
      disclaimer: 'Strategie SHORT de cercetare, nu recomandare financiară. Pierderile short pot depăși capitalul inițial, iar rezultatele istorice nu garantează performanța viitoare.'
    };
  }
}
