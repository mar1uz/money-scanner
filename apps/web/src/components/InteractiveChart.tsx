import React, { useState, useEffect, useRef } from 'react';
import { Candle, Timeframe } from '../types.js';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries
} from 'lightweight-charts';
import {
  Zap,
  TrendingUp,
  Activity,
  Copy,
  Check,
  Code,
  Sparkles,
  ExternalLink,
  Info,
  BarChart2,
  MousePointer,
  Minus,
  Maximize2,
  Trash2,
  Undo2,
  Sliders,
  Layers,
  ArrowUpRight,
  Square,
  Split,
  ArrowUpCircle,
  ArrowDownCircle,
  MoveVertical,
  BellRing
} from 'lucide-react';
import { useLanguage } from '../i18n.js';
import { fetchBullishAlertStatus, setBullishAlert } from '../services/api.js';

interface InteractiveChartProps {
  candles: Candle[];
  symbol: string;
  /** Provider-verified class prevents TradingView ticker collisions (e.g. CAKE). */
  marketClass?: string;
  timeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
  onLoadMoreHistory?: () => void | Promise<void>;
  isLoadingHistory?: boolean;
  hasMoreHistory?: boolean;
}

export type DrawingTool = 
  | 'select' 
  | 'trendline' 
  | 'ray' 
  | 'horizontal' 
  | 'vertical' 
  | 'fibonacci' 
  | 'channel' 
  | 'rectangle' 
  | 'long_position' 
  | 'short_position' 
  | 'ruler';

export interface ChartDrawing {
  id: string;
  type: DrawingTool;
  p1: { timeIndex: number; price: number };
  p2?: { timeIndex: number; price: number };
  color?: string;
}

const formatFlipPrice = (price: number): string => {
  const maximumFractionDigits = price >= 1000 ? 2 : price >= 1 ? 4 : 8;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: price >= 1000 ? 2 : 0,
    maximumFractionDigits
  }).format(price);
};

const getMoneyLineParameters = (timeframe: string) => {
  const tf = timeframe.toLowerCase();
  if (tf === '1h') return { fastFactor: 2.2, slowFactor: 3.0, atrLength: 12 };
  if (tf === '4h' || tf === '8h' || tf === '1d') return { fastFactor: 2.5, slowFactor: 3.5, atrLength: 10 };
  if (tf === '1w' || tf === '1m') return { fastFactor: 2.8, slowFactor: 3.8, atrLength: 10 };
  return { fastFactor: 2.0, slowFactor: 3.0, atrLength: 10 };
};

// Exact MoneyLine Overlay Force v1 Mathematical Computation
export function calculateMoneyLineForce(candles: Candle[], timeframe: string) {
  if (!candles || candles.length === 0) {
    return {
      lineFast: [],
      dirFast: [],
      lineSlow: [],
      dirSlow: [],
      sma50: [],
      sma200: [],
      cloudColor: [],
      buySignals: [],
      sellSignals: []
    };
  }

  // --- Parametri Adaptabili (Logică Cloud) ---
  const {
    fastFactor: f_fast,
    slowFactor: f_slow,
    atrLength: atr_len
  } = getMoneyLineParameters(timeframe);

  // Calculate True Range and Wilder's RMA ATR
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
  }

  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < atr_len && i < tr.length; i++) sum += tr[i];
  let prevAtr = sum / Math.max(1, Math.min(atr_len, tr.length));
  for (let i = 0; i < tr.length; i++) {
    if (i < atr_len) {
      atr.push(prevAtr);
    } else {
      const curAtr = (prevAtr * (atr_len - 1) + tr[i]) / atr_len;
      atr.push(curAtr);
      prevAtr = curAtr;
    }
  }

  // Standard Supertrend algorithm (ta.supertrend)
  const calcSupertrend = (multiplier: number) => {
    const line: number[] = [];
    const dir: number[] = []; // -1 = Up (Bullish), +1 = Down (Bearish)

    let upperBand = 0;
    let lowerBand = 0;
    let currentDir = 1;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const curAtr = atr[i] || (c.high - c.low);
      const hl2 = (c.high + c.low) / 2;

      const basicUpper = hl2 + multiplier * curAtr;
      const basicLower = hl2 - multiplier * curAtr;

      if (i === 0) {
        upperBand = basicUpper;
        lowerBand = basicLower;
        currentDir = c.close > basicUpper ? -1 : 1;
      } else {
        const prevClose = candles[i - 1].close;
        const prevLower = lowerBand;
        const prevUpper = upperBand;

        lowerBand = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;
        upperBand = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;

        if (currentDir === 1 && c.close > prevUpper) {
          currentDir = -1; // Bullish flip
        } else if (currentDir === -1 && c.close < prevLower) {
          currentDir = 1; // Bearish flip
        }
      }

      const val = currentDir === -1 ? lowerBand : upperBand;
      // Keep the full computed precision here. Formatting belongs to the UI;
      // rounding the indicator itself would make flip thresholds wrong for
      // low-priced assets.
      line.push(val);
      dir.push(currentDir);
    }

    return { line, dir };
  };

  const fast = calcSupertrend(f_fast);
  const slow = calcSupertrend(f_slow);

  // 50 Simple Moving Average (SMA 50)
  const sma50: number[] = [];
  const sma50Len = 50;
  for (let i = 0; i < candles.length; i++) {
    const windowStart = Math.max(0, i - sma50Len + 1);
    let sumClose = 0;
    for (let j = windowStart; j <= i; j++) {
      sumClose += candles[j].close;
    }
    const count = i - windowStart + 1;
    sma50.push(sumClose / count);
  }

  // 200 Simple Moving Average (SMA 200)
  const sma200: number[] = [];
  const smaLen = 200;
  for (let i = 0; i < candles.length; i++) {
    const windowStart = Math.max(0, i - smaLen + 1);
    let sumClose = 0;
    for (let j = windowStart; j <= i; j++) {
      sumClose += candles[j].close;
    }
    const count = i - windowStart + 1;
    sma200.push(sumClose / count);
  }

  // Buy & Sell signal identification (ta.change(dirSlow))
  const buySignals: boolean[] = [];
  const sellSignals: boolean[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      buySignals.push(false);
      sellSignals.push(false);
    } else {
      const prevDirSlow = slow.dir[i - 1];
      const curDirSlow = slow.dir[i];
      buySignals.push(curDirSlow === -1 && prevDirSlow === 1);
      sellSignals.push(curDirSlow === 1 && prevDirSlow === -1);
    }
  }

  return {
    lineFast: fast.line,
    dirFast: fast.dir,
    lineSlow: slow.line,
    dirSlow: slow.dir,
    sma50,
    sma200,
    buySignals,
    sellSignals
  };
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles,
  symbol,
  marketClass,
  timeframe,
  onTimeframeChange,
  onLoadMoreHistory,
  isLoadingHistory = false,
  hasMoreHistory = true
}) => {
  const { language } = useLanguage();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const svgOverlayRef = useRef<SVGSVGElement>(null);
  const tvWidgetContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const preservedVisibleRangeRef = useRef<any>(null);
  const chartIdentityRef = useRef(`${symbol}:${timeframe}`);
  const userNavigatedChartRef = useRef(false);
  const historyLoadTriggeredRef = useRef(false);
  const loadMoreHistoryRef = useRef(onLoadMoreHistory);
  const isLoadingHistoryRef = useRef(isLoadingHistory);
  const hasMoreHistoryRef = useRef(hasMoreHistory);

  loadMoreHistoryRef.current = onLoadMoreHistory;
  isLoadingHistoryRef.current = isLoadingHistory;
  hasMoreHistoryRef.current = hasMoreHistory;

  const [activeTab, setActiveTab] = useState<'chart' | 'tv_embed' | 'pinescript'>('chart');
  const [activeInterval, setActiveInterval] = useState<string>(timeframe);
  const [showSma50, setShowSma50] = useState<boolean>(true);
  const [showSma200, setShowSma200] = useState<boolean>(true);
  const [copiedPine, setCopiedPine] = useState(false);
  const [bullishAlertActive, setBullishAlertActive] = useState(false);
  const [bullishAlertSaving, setBullishAlertSaving] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [bullishAlertError, setBullishAlertError] = useState('');
  const [latestState, setLatestState] = useState<{
    status: string;
    fastLine: number;
    slowLine: number;
    sma50: number;
    isAboveSma50: boolean;
    sma200: number;
    isAboveSma200: boolean;
    hasGoldenCross: boolean;
    nextFlip: 'BUY' | 'SELL';
  } | null>(null);

  // Technical Analysis Drawing Suite State
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number; timeIndex: number; price: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [, setViewportTick] = useState(0); // Trigger SVG re-renders on pan/zoom

  useEffect(() => {
    setActiveInterval(timeframe);
  }, [timeframe]);

  const currentChartIdentity = `${symbol}:${activeInterval}`;
  if (chartIdentityRef.current !== currentChartIdentity) {
    chartIdentityRef.current = currentChartIdentity;
    preservedVisibleRangeRef.current = null;
    userNavigatedChartRef.current = false;
    historyLoadTriggeredRef.current = false;
  }

  useEffect(() => {
    historyLoadTriggeredRef.current = false;
  }, [candles.length]);

  const intervalOptions: { id: Timeframe; label: string }[] = [
    { id: '1h', label: '1H' },
    { id: '4h', label: '4H' },
    { id: '8h', label: '8H' },
    { id: '1d', label: '1D' },
    { id: '1w', label: '1W' },
    { id: '1m', label: '1M' }
  ];

  // Helper to map symbol to TradingView symbol with exchange prefix
  const getTradingViewSymbol = (sym: string): string => {
    if (!sym) return 'BINANCE:BTCUSDT';
    let s = sym.toUpperCase().trim();

    // If already prefixed with exchange (e.g., BINANCE:BTCUSDT, NASDAQ:AAPL, TVC:DXY)
    if (s.includes(':')) return s;

    // Clean common characters (slashes, dashes, spaces)
    const clean = s.replace(/[\/\-\s]/g, '');

    // TradingView's Binance perpetual notation uses the `.P` suffix.
    if (/^[A-Z0-9]+USDT\.P$/.test(s)) return `BINANCE:${s}`;

    // Crypto Dominance & Market Caps (TradingView CRYPTOCAP)
    if (clean === 'BTCD' || clean === 'BTC.D' || s === 'BTC.D') return 'CRYPTOCAP:BTC.D';
    if (clean === 'ETHD' || clean === 'ETH.D' || s === 'ETH.D') return 'CRYPTOCAP:ETH.D';
    if (clean === 'USDTD' || clean === 'USDT.D' || s === 'USDT.D') return 'CRYPTOCAP:USDT.D';
    if (clean === 'TOTAL') return 'CRYPTOCAP:TOTAL';
    if (clean === 'TOTAL2') return 'CRYPTOCAP:TOTAL2';
    if (clean === 'TOTAL3') return 'CRYPTOCAP:TOTAL3';

    // Macro, Treasury & Currency Indices (TVC / CBOE)
    if (clean === 'DXY' || clean === 'DYXY' || clean === 'USDX' || clean === 'USDINDEX') return 'TVC:DXY';
    if (clean === 'VIX' || clean === 'VOLATILITY') return 'CBOE:VIX';
    if (clean === 'US10Y' || clean === 'TNX' || clean === 'US10') return 'TVC:US10Y';
    if (clean === 'US02Y' || clean === 'US02') return 'TVC:US02Y';
    if (clean === 'US30Y' || clean === 'US30') return 'TVC:US30Y';
    if (clean === 'US05Y' || clean === 'US05') return 'TVC:US05Y';

    // The scanner already verified this is a crypto asset. Resolve it before
    // the stock ticker tables, so a shared ticker can never open an equity.
    if (
      marketClass === 'crypto' &&
      /^[A-Z0-9]+$/.test(clean) &&
      !clean.endsWith('USDT') &&
      !clean.endsWith('BUSD') &&
      !clean.endsWith('USDC')
    ) return `BINANCE:${clean}USDT`;

    // Forex Pairs (FX)
    if (clean === 'EURUSD') return 'FX:EURUSD';
    if (clean === 'GBPUSD') return 'FX:GBPUSD';
    if (clean === 'USDJPY') return 'FX:USDJPY';
    if (clean === 'AUDUSD') return 'FX:AUDUSD';
    if (clean === 'USDCAD') return 'FX:USDCAD';
    if (clean === 'USDCHF') return 'FX:USDCHF';

    // Commodities & Precious Metals (TVC / CapitalCom)
    if (clean === 'XAU' || clean === 'GOLD' || clean === 'XAUUSD' || clean === 'AUR') return 'TVC:GOLD';
    if (clean === 'XAG' || clean === 'SILVER' || clean === 'XAGUSD' || clean === 'ARGINT') return 'TVC:SILVER';
    if (clean === 'OIL' || clean === 'USOIL' || clean === 'WTI' || clean === 'CL' || clean === 'PETROL') return 'TVC:USOIL';
    if (clean === 'BRENT' || clean === 'UKOIL') return 'TVC:UKOIL';
    if (clean === 'NATGAS' || clean === 'NG') return 'TVC:NATGAS';
    if (clean === 'COPPER' || clean === 'HG' || clean === 'CUPRU') return 'CAPITALCOM:COPPER';
    if (clean === 'PLATINUM' || clean === 'PL') return 'TVC:PLATINUM';
    if (clean === 'PALLADIUM' || clean === 'PA') return 'TVC:PALLADIUM';
    if (clean === 'PAXG' || clean === 'PAXGUSDT') return 'BINANCE:PAXGUSDT';

    // Space Tech
    if (clean === 'SPACEX') return 'NASDAQ:ARKX';

    // US Index & Sector ETFs (AMEX)
    const amexTickers = ['SPY', 'DIA', 'IWM', 'VOO', 'IVV', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLP', 'XLU', 'XLY', 'XLB', 'VNQ', 'GLD', 'SLV'];
    if (amexTickers.includes(clean)) return `AMEX:${clean}`;

    const indexTickers: Record<string, string> = {
      'DJI': 'DJ:DJI',
      'SPX': 'INDEX:SPX',
      'NDX': 'INDEX:NDX',
      'RUT': 'INDEX:RUT',
      'DAX': 'INDEX:DAX',
      'FTSE': 'INDEX:FTSE',
      'NIKKEI': 'INDEX:NKY'
    };
    if (indexTickers[clean]) return indexTickers[clean];

    // Major US Equities (NYSE)
    const nyseStocks = [
      'JPM', 'V', 'MA', 'LLY', 'XOM', 'BA', 'DIS', 'WMT', 'KO', 'PEP',
      'NKE', 'GS', 'MS', 'UNH', 'CVX', 'PFE', 'ABBV', 'CAT', 'GE', 'MCD',
      'HD', 'PG', 'JNJ', 'MRK', 'BAC', 'WFC', 'C', 'IBM', 'ORCL', 'CRM',
      'NOW', 'UBER', 'SNOW', 'PLTR', 'SPOT', 'NET', 'DDOG', 'SHOP', 'SQ',
      'NU', 'COIN', 'MSTR', 'RACE', 'NIO', 'BABA', 'TSM', 'SAP', 'LMT', 'RTX', 'DE'
    ];
    if (nyseStocks.includes(clean)) return `NYSE:${clean}`;

    // US Tech Equities (NASDAQ)
    const nasdaqStocks = [
      'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'AMD',
      'ASML', 'QQQ', 'NFLX', 'SMCI', 'ARM', 'AVGO', 'QCOM', 'INTC', 'HOOD', 'CRWD',
      'PANW', 'ZS', 'PYPL', 'ADBE', 'CSCO', 'TXN', 'MU', 'ABNB', 'MELI',
      'PDD', 'BIDU', 'JD', 'GME', 'AMC', 'SOFI', 'RIVN', 'LCID', 'DJT',
      'DKNG', 'CELH', 'ELF', 'APP', 'DUOL', 'ROKU', 'EA', 'TTWO', 'RBLX', 'MRNA'
    ];
    if (nasdaqStocks.includes(clean)) return `NASDAQ:${clean}`;

    // Crypto Pairs with suffix
    if (clean.endsWith('USDT') || clean.endsWith('BUSD') || clean.endsWith('USDC')) {
      return `BINANCE:${clean}`;
    }
    if (clean.endsWith('USD')) {
      return `COINBASE:${clean}`;
    }

    const commonCryptos = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'SUI', 'DOT', 'NEAR', 'APT', 'SEI', 'FTM', 'PEPE', 'SHIB', 'WIF', 'BONK', 'UNI', 'AAVE', 'LINK', 'FET', 'RENDER', 'TAO', 'ICP', 'KAS', 'INJ', 'TIA', 'MATIC', 'POL', 'TON', 'TRX'];
    if (commonCryptos.includes(clean)) {
      return `BINANCE:${clean}USDT`;
    }

    // Default: Return raw symbol which TradingView resolves across global exchanges
    return clean;
  };

  const isDominanceOrRatio = ['BTC.D', 'ETH.D', 'USDT.D', 'US10Y', 'US02Y', 'US30Y', 'US05Y'].includes(symbol.toUpperCase());
  const isStockOrMetal = marketClass === 'stocks' || marketClass === 'metals' || ['SPACEX', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'AMD', 'MSTR', 'COIN', 'SPY', 'QQQ', 'XAU', 'XAG', 'OIL', 'COPPER', 'DXY', 'DYXY', 'VIX', 'EURUSD', 'GBPUSD', 'USDJPY', 'BRENT', 'NATGAS', 'SILVER', 'GOLD', 'PLATINUM', 'PALLADIUM', 'JPM', 'V', 'MA', 'LLY', 'XOM', 'BA'].includes(symbol.toUpperCase());
  const quoteCurrency = isDominanceOrRatio ? '%' : (isStockOrMetal ? 'USD' : 'USDT');
  const tvSymbol = getTradingViewSymbol(symbol);
  const normalizedAlertMarketClass: 'crypto' | 'stocks' | 'metals' =
    marketClass === 'stocks' || marketClass === 'metals' || marketClass === 'crypto'
      ? marketClass
      : ['XAU', 'XAG', 'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM', 'COPPER'].includes(symbol.toUpperCase())
        ? 'metals'
        : isStockOrMetal ? 'stocks' : 'crypto';

  useEffect(() => {
    let cancelled = false;
    const alertTimeframe = activeInterval.toLowerCase() as Timeframe;
    const storageKey = `moneyline-bullish-alert:${symbol.toUpperCase()}:${alertTimeframe}`;
    setBullishAlertSaving(true);
    setBullishAlertError('');

    fetchBullishAlertStatus(symbol, alertTimeframe)
      .then(async status => {
        if (cancelled) return;
        const storedAlert = localStorage.getItem(storageKey);
        let shouldRestore = storedAlert === 'true';
        if (storedAlert?.startsWith('{')) {
          try {
            shouldRestore = JSON.parse(storedAlert)?.enabled === true;
          } catch {}
        }
        const currentStatus = shouldRestore && !status.active
          ? await setBullishAlert(symbol, alertTimeframe, normalizedAlertMarketClass, true)
          : status;
        if (cancelled) return;
        setBullishAlertActive(currentStatus.active);
        setTelegramConfigured(currentStatus.telegramConfigured);
        if (currentStatus.rule?.lastError) setBullishAlertError(currentStatus.rule.lastError);
      })
      .catch(error => {
        if (!cancelled) setBullishAlertError(error instanceof Error ? error.message : 'Alert status unavailable');
      })
      .finally(() => {
        if (!cancelled) setBullishAlertSaving(false);
      });

    return () => { cancelled = true; };
  }, [symbol, activeInterval, normalizedAlertMarketClass]);

  const handleToggleBullishAlert = async () => {
    const alertTimeframe = activeInterval.toLowerCase() as Timeframe;
    const nextActive = !bullishAlertActive;
    const storageKey = `moneyline-bullish-alert:${symbol.toUpperCase()}:${alertTimeframe}`;
    setBullishAlertSaving(true);
    setBullishAlertError('');
    try {
      const status = await setBullishAlert(symbol, alertTimeframe, normalizedAlertMarketClass, nextActive);
      setBullishAlertActive(status.active);
      setTelegramConfigured(status.telegramConfigured);
        if (status.active) localStorage.setItem(storageKey, JSON.stringify({ enabled: true, marketClass: normalizedAlertMarketClass }));
      else localStorage.removeItem(storageKey);
      if (status.rule?.lastError) setBullishAlertError(status.rule.lastError);
    } catch (error) {
      setBullishAlertError(error instanceof Error ? error.message : 'Nu am putut salva alerta.');
    } finally {
      setBullishAlertSaving(false);
    }
  };

  // Keep Money Line telemetry available even when the official TradingView
  // chart is the active/default view.
  useEffect(() => {
    if (!candles || candles.length === 0) {
      setLatestState(null);
      return;
    }

    const moneyLine = calculateMoneyLineForce(candles, activeInterval);
    const lastIdx = candles.length - 1;
    const isBullFast = moneyLine.dirFast[lastIdx] < 0;
    const isBullSlow = moneyLine.dirSlow[lastIdx] < 0;
    const lastSma50 = moneyLine.sma50[lastIdx] || 0;
    const lastSma200 = moneyLine.sma200[lastIdx] || 0;
    const lastClose = candles[lastIdx].close;

    setLatestState({
      status: isBullFast && isBullSlow ? 'BULLISH' : (!isBullFast && !isBullSlow ? 'BEARISH' : 'TRANSITION'),
      fastLine: moneyLine.lineFast[lastIdx] || 0,
      slowLine: moneyLine.lineSlow[lastIdx] || 0,
      sma50: lastSma50,
      isAboveSma50: lastClose >= lastSma50,
      sma200: lastSma200,
      isAboveSma200: lastClose >= lastSma200,
      hasGoldenCross: lastSma50 >= lastSma200 && lastSma200 > 0,
      nextFlip: isBullSlow ? 'SELL' : 'BUY'
    });
  }, [candles, activeInterval]);

  // 1. Primary Lightweight Charts Engine with MoneyLine Overlay Force v1
  useEffect(() => {
    if (activeTab !== 'chart' || !chartContainerRef.current || !candles || candles.length === 0) {
      return;
    }

    const container = chartContainerRef.current;
    container.innerHTML = '';
    const initialHeight = container.clientHeight > 0 ? container.clientHeight : (window.innerWidth < 768 ? 480 : 540);

    const chart = createChart(container, {
      width: container.clientWidth || 360,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#080c14' },
        textColor: '#94a3b8',
        fontSize: 11
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#38bdf8', width: 1, style: 3 },
        horzLine: { color: '#38bdf8', width: 1, style: 3 }
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.1, bottom: 0.2 }
      },
      timeScale: {
        visible: true,
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number, tickMarkType: number, locale: string) => {
          const d = new Date(time * 1000);
          // TickMarkType: 0 = Year, 1 = Month, 2 = DayOfMonth, 3 = Time, 4 = TimeWithSeconds
          if (tickMarkType === 0) return d.toLocaleDateString(locale, { year: 'numeric' });
          if (tickMarkType === 1) return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
          if (tickMarkType === 2) return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
          return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
        },
        rightOffset: 8
      },
      localization: {
        locale: 'ro-RO',
        dateFormat: 'dd MMM yyyy'
      }
    });

    chartApiRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e'
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#06b6d4',
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    // Clean and validate candle timestamps to ensure strict chronological order
    const cleanCandles: Candle[] = [];
    let prevTimeSec = 0;
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    for (const c of sorted) {
      let tSec = Math.floor(c.timestamp / 1000);
      if (!Number.isFinite(tSec) || tSec <= 0) continue;
      if (tSec <= prevTimeSec) {
        tSec = prevTimeSec + 60;
      }
      cleanCandles.push({
        ...c,
        timestamp: tSec * 1000
      });
      prevTimeSec = tSec;
    }

    // Compute MoneyLine Overlay Force v1 mathematically on clean candles
    const moneyLine = calculateMoneyLineForce(cleanCandles, activeInterval);

    const formattedCandles = cleanCandles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));

    const formattedVolume = cleanCandles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as any,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'
    }));

    candleSeries.setData(formattedCandles);
    volumeSeries.setData(formattedVolume);

    // Fast Supertrend Line
    const fastLineSeries = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });

    const formattedFastLine = moneyLine.lineFast.map((val, idx) => ({
      time: Math.floor(cleanCandles[idx].timestamp / 1000) as any,
      value: val,
      color: moneyLine.dirFast[idx] < 0 ? '#10b981' : '#f43f5e'
    }));
    fastLineSeries.setData(formattedFastLine);

    // Slow Supertrend Line (Cloud Edge)
    const slowLineSeries = chart.addSeries(LineSeries, {
      color: '#059669',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });

    const formattedSlowLine = moneyLine.lineSlow.map((val, idx) => ({
      time: Math.floor(cleanCandles[idx].timestamp / 1000) as any,
      value: val,
      color: moneyLine.dirSlow[idx] < 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)'
    }));
    slowLineSeries.setData(formattedSlowLine);

    // SMA 50 Intermediate Baseline (Yellow, Thin 1px)
    if (showSma50) {
      const sma50Series = chart.addSeries(LineSeries, {
        color: '#fbbf24', // Amber/Yellow
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false
      });

      const formattedSma50 = moneyLine.sma50.map((val, idx) => ({
        time: Math.floor(cleanCandles[idx].timestamp / 1000) as any,
        value: val
      }));
      sma50Series.setData(formattedSma50);
    }

    // SMA 200 Macro Baseline (White, Thick 3px)
    if (showSma200) {
      const sma200Series = chart.addSeries(LineSeries, {
        color: '#ffffff', // Pure White
        lineWidth: 3,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false
      });

      const formattedSma200 = moneyLine.sma200.map((val, idx) => ({
        time: Math.floor(cleanCandles[idx].timestamp / 1000) as any,
        value: val
      }));
      sma200Series.setData(formattedSma200);
    }

    // BUY and SELL Signal Triangles
    const markers: any[] = [];
    cleanCandles.forEach((c, idx) => {
      const timeInSec = Math.floor(c.timestamp / 1000);
      if (moneyLine.buySignals[idx]) {
        markers.push({
          time: timeInSec,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          size: 2
        });
      } else if (moneyLine.sellSignals[idx]) {
        markers.push({
          time: timeInSec,
          position: 'aboveBar',
          color: '#f43f5e',
          shape: 'arrowDown',
          size: 2
        });
      }
    });

    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers);
    }

    // Exact Money Line Flip Threshold Price Line (Dashed horizontal level)
    const lastIdx = cleanCandles.length - 1;
    if (lastIdx >= 0) {
      const currentFlipThreshold = moneyLine.lineSlow[lastIdx];
      const isBullSlow = moneyLine.dirSlow[lastIdx] < 0;
      const flipColor = isBullSlow ? '#f43f5e' : '#10b981';

      if (currentFlipThreshold && Number.isFinite(currentFlipThreshold) && currentFlipThreshold > 0) {
        candleSeries.createPriceLine({
          price: currentFlipThreshold,
          color: flipColor,
          lineWidth: 1,
          lineStyle: 2, // LineStyle.Dashed
          // The compact SVG price below is placed in the empty future area.
          // Avoid a second, duplicate badge on the lateral price scale.
          axisLabelVisible: false,
          title: ''
        });
      }
    }

    const preservedVisibleRange = preservedVisibleRangeRef.current;
    if (preservedVisibleRange) {
      chart.timeScale().setVisibleRange(preservedVisibleRange);
    } else {
      chart.timeScale().fitContent();
    }
    chart.timeScale().applyOptions({
      rightOffset: 8,
      // Keep enough empty space after the latest candle for the compact flip
      // value, so it never needs to sit on top of price action on mobile.
      rightOffsetPixels: Math.min(144, Math.max(116, container.clientWidth * 0.24))
    });

    // Subscribe to pan/zoom changes to keep SVG drawings locked to chart coordinates
    const armHistoricalLoading = () => {
      userNavigatedChartRef.current = true;
    };
    container.addEventListener('pointerdown', armHistoricalLoading, { passive: true });
    container.addEventListener('wheel', armHistoricalLoading, { passive: true });

    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      setViewportTick(t => t + 1);
      if (
        logicalRange &&
        logicalRange.from <= 40 &&
        userNavigatedChartRef.current &&
        !historyLoadTriggeredRef.current &&
        !isLoadingHistoryRef.current &&
        hasMoreHistoryRef.current &&
        loadMoreHistoryRef.current
      ) {
        historyLoadTriggeredRef.current = true;
        Promise.resolve(loadMoreHistoryRef.current()).finally(() => {
          historyLoadTriggeredRef.current = false;
        });
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        const w = chartContainerRef.current.clientWidth || 360;
        const h = chartContainerRef.current.clientHeight || (window.innerWidth < 768 ? 480 : 540);
        chart.applyOptions({
          width: w,
          height: h
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (chartIdentityRef.current === currentChartIdentity) {
        preservedVisibleRangeRef.current = chart.timeScale().getVisibleRange();
      }
      container.removeEventListener('pointerdown', armHistoricalLoading);
      container.removeEventListener('wheel', armHistoricalLoading);
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [activeTab, candles, activeInterval, symbol, showSma50, showSma200]);

  // 2. Official TradingView Embed Widget (when tv_embed tab is selected)
  useEffect(() => {
    if (activeTab !== 'tv_embed' || !tvWidgetContainerRef.current) {
      return;
    }

    const container = tvWidgetContainerRef.current;
    const uniqueId = `tv_chart_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    container.innerHTML = `<div id="${uniqueId}" style="height: 620px; width: 100%;"></div>`;

    const tvInterval = activeInterval === '1h' ? '60' : (activeInterval === '4h' ? '240' : (activeInterval === '8h' ? '480' : (activeInterval === '1d' ? 'D' : (activeInterval === '1w' ? 'W' : 'M'))));

    const initWidget = () => {
      if ((window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: language,
          toolbar_bg: '#080c14',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: uniqueId,
          withdateranges: true,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          studies: [
            "STD;Supertrend",
            "MASimple@tv-basicstudies"
          ],
          studies_overrides: {
            "moving average.length": 200,
            "moving average.plot.color": "#fbbf24",
            "moving average.plot.linewidth": 2
          },
          details: true,
          hotlist: true,
          calendar: true,
          show_popup_button: true,
          popup_width: "1000",
          popup_height: "650"
        });
      }
    };

    if (!(window as any).TradingView) {
      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.body.appendChild(script);
    } else {
      initWidget();
    }
  }, [activeTab, symbol, activeInterval, tvSymbol, language]);

  // --- SVG Drawing Coordinate Projection Helpers ---
  const getCoordinatesForPoint = (timeIndex: number, price: number): { x: number; y: number } | null => {
    if (!chartApiRef.current || !candleSeriesRef.current || !candles || candles.length === 0) return null;
    const validIdx = Math.max(0, Math.min(candles.length - 1, timeIndex));
    const c = candles[validIdx];
    const timeInSec = Math.floor(c.timestamp / 1000);

    const x = chartApiRef.current.timeScale().timeToCoordinate(timeInSec as any);
    const y = candleSeriesRef.current.priceToCoordinate(price);

    if (x === null || y === null) return null;
    return { x, y };
  };

  // Helper to compute percentage, price delta, and time in days/hours
  const getRulerStats = (
    p1: { timeIndex: number; price: number },
    p2: { timeIndex: number; price: number }
  ) => {
    const priceDiff = p2.price - p1.price;
    const pct = p1.price !== 0 ? ((p2.price - p1.price) / p1.price) * 100 : 0;
    const isUp = pct >= 0;

    if (!candles || candles.length === 0) {
      return { pct, priceDiff, isUp, barsCount: 1, timeFormatted: '1 zi' };
    }

    const idx1 = Math.max(0, Math.min(candles.length - 1, p1.timeIndex));
    const idx2 = Math.max(0, Math.min(candles.length - 1, p2.timeIndex));
    const startIdx = Math.min(idx1, idx2);
    const endIdx = Math.max(idx1, idx2);

    const cStart = candles[startIdx];
    const cEnd = candles[endIdx];
    const barsCount = Math.max(1, endIdx - startIdx);

    let timeDiffMs = 0;
    if (cStart?.timestamp && cEnd?.timestamp) {
      timeDiffMs = Math.abs(cEnd.timestamp - cStart.timestamp);
    }

    // Fallback based on selected timeframe if timestamps are unpopulated
    if (timeDiffMs === 0) {
      const tfHours: Record<string, number> = {
        '1h': 1,
        '4h': 4,
        '8h': 8,
        '1d': 24,
        '1w': 168,
        '1m': 720
      };
      const hoursPerBar = tfHours[activeInterval.toLowerCase()] || 24;
      timeDiffMs = barsCount * hoursPerBar * 3600000;
    }

    const hours = timeDiffMs / 3600000;
    const days = timeDiffMs / 86400000;

    let timeFormatted = '';
    if (days >= 1) {
      const roundedDays = Math.round(days * 10) / 10;
      timeFormatted = `${roundedDays === Math.floor(roundedDays) ? Math.floor(roundedDays) : roundedDays.toFixed(1)} ${roundedDays === 1 ? 'zi' : 'zile'}`;
    } else if (hours >= 1) {
      const roundedHours = Math.round(hours);
      timeFormatted = `${roundedHours} ${roundedHours === 1 ? 'oră' : 'ore'}`;
    } else {
      const mins = Math.max(1, Math.round(timeDiffMs / 60000));
      timeFormatted = `${mins} min`;
    }

    return {
      pct,
      priceDiff,
      isUp,
      barsCount,
      timeFormatted
    };
  };

  const getPointFromMouse = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number; timeIndex: number; price: number } | null => {
    if (!svgOverlayRef.current || !chartApiRef.current || !candleSeriesRef.current || !candles || candles.length === 0) return null;
    const rect = svgOverlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const price = candleSeriesRef.current.coordinateToPrice(y) || candles[candles.length - 1].close;
    const timeVal = chartApiRef.current.timeScale().coordinateToTime(x) as any;

    let timeIndex = candles.length - 1;
    if (typeof timeVal === 'number') {
      const foundIdx = candles.findIndex((c) => {
        const tSec = Math.floor(c.timestamp / 1000);
        return tSec >= timeVal;
      });
      if (foundIdx !== -1) timeIndex = foundIdx;
    }

    return { x, y, timeIndex, price };
  };

  // Point coordinate resolver from Touch Event
  const getPointFromTouch = (e: React.TouchEvent<SVGSVGElement>): { x: number; y: number; timeIndex: number; price: number } | null => {
    if (!svgOverlayRef.current || !chartApiRef.current || !candleSeriesRef.current || !candles || candles.length === 0) return null;
    if (!e.touches || e.touches.length === 0) return null;
    const touch = e.touches[0];
    const rect = svgOverlayRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const price = candleSeriesRef.current.coordinateToPrice(y) || candles[candles.length - 1].close;
    const timeVal = chartApiRef.current.timeScale().coordinateToTime(x) as any;

    let timeIndex = candles.length - 1;
    if (typeof timeVal === 'number') {
      const foundIdx = candles.findIndex((c) => {
        const tSec = Math.floor(c.timestamp / 1000);
        return tSec >= timeVal;
      });
      if (foundIdx !== -1) timeIndex = foundIdx;
    }

    return { x, y, timeIndex, price };
  };

  // SVG Mouse Event Handlers
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select') return;
    const pt = getPointFromMouse(e);
    if (!pt) return;

    if (activeTool === 'horizontal') {
      const newDrawing: ChartDrawing = {
        id: `h_${Date.now()}`,
        type: 'horizontal',
        p1: { timeIndex: pt.timeIndex, price: pt.price },
        color: '#38bdf8'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'vertical') {
      const newDrawing: ChartDrawing = {
        id: `v_${Date.now()}`,
        type: 'vertical',
        p1: { timeIndex: pt.timeIndex, price: pt.price },
        color: '#a855f7'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('select');
      return;
    }

    // Two-click mode (e.g. click 1 to start, click 2 to finish)
    if (currentStart) {
      const newDrawing: ChartDrawing = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool,
        p1: { timeIndex: currentStart.timeIndex, price: currentStart.price },
        p2: { timeIndex: pt.timeIndex, price: pt.price },
        color: activeTool === 'fibonacci' 
          ? '#fbbf24' 
          : (activeTool === 'ruler' 
            ? '#10b981' 
            : (activeTool === 'long_position' 
              ? '#10b981' 
              : (activeTool === 'short_position' 
                ? '#f43f5e' 
                : (activeTool === 'rectangle' ? '#06b6d4' : (activeTool === 'channel' ? '#06b6d4' : (activeTool === 'ray' ? '#38bdf8' : '#06b6d4'))))))
      };
      setDrawings(prev => [...prev, newDrawing]);
      setCurrentStart(null);
      setActiveTool('select');
    } else {
      setCurrentStart(pt);
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgOverlayRef.current) return;
    const rect = svgOverlayRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!currentStart) return;
    const pt = getPointFromMouse(e);
    if (!pt) return;

    // If user dragged a significant distance (>15px), finish drawing on mouseUp
    const dist = Math.hypot(pt.x - currentStart.x, pt.y - currentStart.y);
    if (dist > 15) {
      const newDrawing: ChartDrawing = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool,
        p1: { timeIndex: currentStart.timeIndex, price: currentStart.price },
        p2: { timeIndex: pt.timeIndex, price: pt.price },
        color: activeTool === 'fibonacci' 
          ? '#fbbf24' 
          : (activeTool === 'ruler' 
            ? '#10b981' 
            : (activeTool === 'long_position' 
              ? '#10b981' 
              : (activeTool === 'short_position' 
                ? '#f43f5e' 
                : (activeTool === 'rectangle' ? '#06b6d4' : (activeTool === 'channel' ? '#06b6d4' : (activeTool === 'ray' ? '#38bdf8' : '#06b6d4'))))))
      };
      setDrawings(prev => [...prev, newDrawing]);
      setCurrentStart(null);
      setActiveTool('select');
    }
  };

  // Mobile Touch Event Handlers
  const handleSvgTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (activeTool === 'select') return;
    e.stopPropagation();
    const pt = getPointFromTouch(e);
    if (!pt) return;

    if (activeTool === 'horizontal') {
      const newDrawing: ChartDrawing = {
        id: `h_${Date.now()}`,
        type: 'horizontal',
        p1: { timeIndex: pt.timeIndex, price: pt.price },
        color: '#38bdf8'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'vertical') {
      const newDrawing: ChartDrawing = {
        id: `v_${Date.now()}`,
        type: 'vertical',
        p1: { timeIndex: pt.timeIndex, price: pt.price },
        color: '#a855f7'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setActiveTool('select');
      return;
    }

    // Touch tap-to-tap or tap-to-start
    if (currentStart) {
      const newDrawing: ChartDrawing = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool,
        p1: { timeIndex: currentStart.timeIndex, price: currentStart.price },
        p2: { timeIndex: pt.timeIndex, price: pt.price },
        color: activeTool === 'ruler' ? '#10b981' : '#06b6d4'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setCurrentStart(null);
      setActiveTool('select');
    } else {
      setCurrentStart(pt);
      setMousePos({ x: pt.x, y: pt.y });
    }
  };

  const handleSvgTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (activeTool === 'select' || !currentStart || !svgOverlayRef.current) return;
    e.stopPropagation();
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = svgOverlayRef.current.getBoundingClientRect();
    setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
  };

  const handleSvgTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    if (activeTool === 'select' || !currentStart || !mousePos) return;
    e.stopPropagation();
    const dist = Math.hypot(mousePos.x - currentStart.x, mousePos.y - currentStart.y);
    if (dist > 25 && chartApiRef.current && candleSeriesRef.current) {
      const price = candleSeriesRef.current.coordinateToPrice(mousePos.y) || candles[candles.length - 1].close;
      const timeVal = chartApiRef.current.timeScale().coordinateToTime(mousePos.x) as any;
      let timeIndex = candles.length - 1;
      if (typeof timeVal === 'number') {
        const foundIdx = candles.findIndex((c) => {
          const tSec = Math.floor(c.timestamp / 1000);
          return tSec >= timeVal;
        });
        if (foundIdx !== -1) timeIndex = foundIdx;
      }

      const newDrawing: ChartDrawing = {
        id: `${activeTool}_${Date.now()}`,
        type: activeTool,
        p1: { timeIndex: currentStart.timeIndex, price: currentStart.price },
        p2: { timeIndex, price },
        color: activeTool === 'ruler' ? '#10b981' : '#06b6d4'
      };
      setDrawings(prev => [...prev, newDrawing]);
      setCurrentStart(null);
      setActiveTool('select');
    }
  };

  const handleUndo = () => {
    setDrawings(prev => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setDrawings([]);
    setCurrentStart(null);
  };

  const handleCopyPineScript = () => {
    navigator.clipboard.writeText(pineScriptCode);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 3000);
  };

  const pineScriptCode = `//@version=5
indicator("MoneyLine Cloud & Baselines v1", overlay=true, precision=2)

// ==========================================
// 1. Parametri Adaptabili Money Line Cloud
// ==========================================
get_cloud_params() =>
    float f_fast = 2.0
    float f_slow = 3.0
    int atr_len = 10
    
    if timeframe.isminutes
        if timeframe.multiplier < 15
            f_fast  := 1.8
            f_slow  := 2.6
            atr_len := 14
        else if timeframe.multiplier < 60
            f_fast  := 2.2
            f_slow  := 3.0
            atr_len := 12
        else
            f_fast  := 2.5
            f_slow  := 3.5
            atr_len := 10
    else if timeframe.isdaily
        f_fast  := 2.5
        f_slow  := 3.5
        atr_len := 10
    else if timeframe.isweekly
        f_fast  := 2.8
        f_slow  := 3.8
        atr_len := 10
        
    [f_fast, f_slow, atr_len]

[fastFactor, slowFactor, atrLen] = get_cloud_params()

useAuto    = input.bool(true, title="Adaptare Automată Timeframe?", group="Money Line Cloud")
manualAtr  = input.int(10, title="Manual: Lungime ATR", minval=1, group="Money Line Cloud")
manualFast = input.float(2.0, title="Manual: Multiplicator Rapid", step=0.1, group="Money Line Cloud")
manualSlow = input.float(3.0, title="Manual: Multiplicator Lent", step=0.1, group="Money Line Cloud")

finalAtr   = useAuto ? atrLen : manualAtr
finalFast  = useAuto ? fastFactor : manualFast
finalSlow  = useAuto ? slowFactor : manualSlow

// Calcul Supertrend
[lineFast, dirFast] = ta.supertrend(finalFast, finalAtr)
[lineSlow, dirSlow] = ta.supertrend(finalSlow, finalAtr)

// Plotare Linii Nor
plotFast = plot(lineFast, color=dirFast < 0 ? color.new(#10b981, 20) : color.new(#f43f5e, 20), linewidth=1, title="Baza Nor (Fast)")
plotSlow = plot(lineSlow, color=dirSlow < 0 ? color.new(#059669, 40) : color.new(#e11d48, 40), linewidth=1, style=plot.style_linebr, title="Margine Nor (Slow)")

// Colorare Nor Dinamic
cloudColor = (dirFast < 0 and dirSlow < 0) ? color.new(#10b981, 80) : 
             (dirFast > 0 and dirSlow > 0) ? color.new(#f43f5e, 80) : color.new(#64748b, 85)

fill(plotFast, plotSlow, color=cloudColor, title="Money Line Cloud Fill")

// Semnale BUY / SELL (Non-repainting pe închidere)
buySignal  = ta.change(dirSlow) < 0
sellSignal = ta.change(dirSlow) > 0

plotshape(buySignal, title="Semnal BUY (Bull Flip)", style=shape.triangleup, location=location.belowbar, color=#10b981, size=size.small, text="BUY", textcolor=#10b981)
plotshape(sellSignal, title="Semnal SELL (Bear Flip)", style=shape.triangledown, location=location.abovebar, color=#f43f5e, size=size.small, text="SELL", textcolor=#f43f5e)

// ==========================================
// 2. Medii Mobile: SMA 50 (Galben) & SMA 200 (Alb)
// ==========================================
showSma50  = input.bool(true, title="Afișează SMA 50 (Galben subțire)", group="Medii Mobile")
lenSma50   = input.int(50, title="Lungime SMA 50", minval=1, group="Medii Mobile")
colSma50   = input.color(#fbbf24, title="Culoare SMA 50", group="Medii Mobile")

showSma200 = input.bool(true, title="Afișează SMA 200 (Alb gros)", group="Medii Mobile")
lenSma200  = input.int(200, title="Lungime SMA 200", minval=1, group="Medii Mobile")
colSma200  = input.color(#ffffff, title="Culoare SMA 200", group="Medii Mobile")

sma50Val   = ta.sma(close, lenSma50)
sma200Val  = ta.sma(close, lenSma200)

plot(showSma50 ? sma50Val : na, color=colSma50, linewidth=1, title="SMA 50 (Galben Subțire)")
plot(showSma200 ? sma200Val : na, color=colSma200, linewidth=3, title="SMA 200 (Alb Gros)")

// ==========================================
// 3. Linie Mică cu Pragul Exact de Flip
// ==========================================
showFlipLine = input.bool(true, title="Afișează Linie Prag Flip", group="Prag Flip")
var line flipLine = na
var label flipLbl = na

if showFlipLine and barstate.islast
    line.delete(flipLine)
    label.delete(flipLbl)
    string flipAction = dirSlow < 0 ? "SELL FLIP" : "BUY FLIP"
    color flipCol = dirSlow < 0 ? #f43f5e : #10b981
    string flipText = "PRAG " + flipAction + ": $" + (lineSlow < 1 ? str.tostring(lineSlow, "#.####") : str.tostring(lineSlow, "#.##"))
    flipLine := line.new(bar_index - 12, lineSlow, bar_index + 6, lineSlow, color=flipCol, width=2, style=line.style_dashed, extend=extend.none)
    flipLbl  := label.new(bar_index + 6, lineSlow, flipText, color=color.new(flipCol, 20), textcolor=color.white, size=size.small, style=label.style_label_left)

// ==========================================
// 4. Alerte TradingView
// ==========================================
alertcondition(buySignal, title="MoneyLine Bullish Flip (BUY)", message="🚀 [MoneyLine] Bullish Flip confirmat pe {{ticker}} ({{interval}})! Preț: {{close}}")
alertcondition(sellSignal, title="MoneyLine Bearish Flip (SELL)", message="⚠️ [MoneyLine] Bearish Flip confirmat pe {{ticker}} ({{interval}})! Preț: {{close}}")
`;

  return (
    <div className="w-full bg-background-surface/90 rounded-2xl p-4 border border-background-border shadow-2xl space-y-4">
      {/* Chart Navigation & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border">
        {/* Navigation Mode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-background-card/90 border border-background-border rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setActiveTab('chart')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'chart'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-glow-emerald'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>MoneyLine Cloud</span>
            </button>

            <button
              onClick={() => setActiveTab('tv_embed')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'tv_embed'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
              <span>TradingView Oficial + MoneyLine</span>
            </button>

            <button
              onClick={() => setActiveTab('pinescript')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === 'pinescript'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5 text-purple-400" />
              <span>Pine Script v6 Code</span>
            </button>
          </div>

          <a
            href={`https://www.tradingview.com/chart/?symbol=${tvSymbol}&interval=${
              activeInterval === '1h' ? '60' : (activeInterval === '4h' ? '240' : (activeInterval === '8h' ? '480' : (activeInterval === '1d' ? 'D' : (activeInterval === '1w' ? 'W' : 'M'))))
            }`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Deschide ${tvSymbol} în TradingView Oficial`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-all shadow-sm"
          >
            <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Deschide Tab TradingView</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>

        {/* Timeframe Interval Controls (1H -> 1M) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-400 mr-1 hidden sm:inline">Interval:</span>
          <div className="flex items-center bg-background-card border border-background-border rounded-xl p-0.5">
            {intervalOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  setActiveInterval(opt.id);
                  if (onTimeframeChange) onTimeframeChange(opt.id);
                }}
                className={`px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                  activeInterval.toLowerCase() === opt.id.toLowerCase()
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shadow-glow-emerald'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Tab 1: MoneyLine TradingView Native Chart with Drawing Toolbar */}
      {activeTab === 'chart' && (
        <div className="space-y-3">
          {/* Real-time Indicator Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/80 rounded-xl border border-background-border text-xs font-mono">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-100 text-sm">${symbol} / {quoteCurrency}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Cloud Status:</span>
                <span className={`px-2.5 py-0.5 rounded font-bold border ${
                  latestState?.status === 'BULLISH'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                    : (latestState?.status === 'BEARISH' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-ruby' : 'bg-slate-800 text-slate-300 border-slate-700')
                }`}>
                  {latestState?.status || 'BULLISH'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
              <span>Baza Nor (Fast): <strong className="text-emerald-400">${latestState?.fastLine ? latestState.fastLine.toFixed(2) : '-'}</strong></span>
              <button
                type="button"
                onClick={handleToggleBullishAlert}
                disabled={bullishAlertSaving}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all disabled:opacity-60 ${
                  bullishAlertActive
                    ? telegramConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                }`}
                title={bullishAlertError || (bullishAlertActive
                  ? (telegramConfigured ? 'Plan Telegram activ: confirmare bullish, entry, stop și ținte R:R adaptate timeframe-ului' : 'Alerta este activă; Telegram necesită configurarea botului și a chatului')
                  : 'Activează planul de alertă bullish pentru acest asset și timeframe')}
              >
                <BellRing className={`w-3.5 h-3.5 ${bullishAlertSaving ? 'animate-pulse' : ''}`} />
                <span>{bullishAlertActive ? (language === 'ro' ? 'Plan activ' : 'Plan on') : (language === 'ro' ? 'Alertă plan' : 'Plan alert')}</span>
              </button>
              <span>Margine Nor (Slow): <strong className="text-slate-300">${latestState?.slowLine ? latestState.slowLine.toFixed(2) : '-'}</strong></span>

              {/* SMA 50 Toggle & Status (Yellow, Thin 1.5px) */}
              <button
                type="button"
                onClick={() => setShowSma50(prev => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-all ${
                  showSma50
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-glow-gold'
                    : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-300'
                }`}
                title={showSma50 ? 'Ascunde linia SMA 50 (Galbenă, subțire)' : 'Afișează linia SMA 50 (Galbenă, subțire)'}
              >
                <span className={`w-2.5 h-0.5 rounded-full ${showSma50 ? 'bg-amber-400' : 'bg-slate-500'}`}></span>
                <span>SMA 50: <strong className={showSma50 ? 'text-amber-300' : 'text-slate-400'}>${latestState?.sma50 ? (latestState.sma50 < 1 ? latestState.sma50.toFixed(4) : latestState.sma50.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '-'}</strong></span>
                {showSma50 && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold border ${
                    latestState?.isAboveSma50
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {latestState?.isAboveSma50 ? '▲ Peste' : '▼ Sub'}
                  </span>
                )}
              </button>

              {/* SMA 200 Toggle & Status (White, Thick 3px) */}
              <button
                type="button"
                onClick={() => setShowSma200(prev => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-all ${
                  showSma200
                    ? 'bg-white/10 text-white border-white/40 shadow-md'
                    : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-300'
                }`}
                title={showSma200 ? 'Ascunde linia SMA 200 (Albă, groasă)' : 'Afișează linia SMA 200 (Albă, groasă)'}
              >
                <span className={`w-3 h-1 rounded-full ${showSma200 ? 'bg-white shadow-[0_0_8px_#ffffff]' : 'bg-slate-500'}`}></span>
                <span>SMA 200: <strong className={showSma200 ? 'text-white font-bold' : 'text-slate-400'}>${latestState?.sma200 ? (latestState.sma200 < 1 ? latestState.sma200.toFixed(4) : latestState.sma200.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '-'}</strong></span>
                {showSma200 && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold border ${
                    latestState?.isAboveSma200
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {latestState?.isAboveSma200 ? '▲ Peste (Bull)' : '▼ Sub (Bear)'}
                  </span>
                )}
              </button>

              {/* Golden Cross Indicator Badge if active */}
              {latestState?.hasGoldenCross && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  ✨ Golden Cross (50 &gt; 200)
                </span>
              )}

              <button
                onClick={handleCopyPineScript}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-all ml-2"
                title="Copiază codul MoneyLine Overlay Force v1 pentru contul tău TradingView"
              >
                {copiedPine ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-400" />}
                <span>{copiedPine ? 'COPIAT!' : 'Copiază Pine Script'}</span>
              </button>
            </div>
          </div>

          {/* Mobile Quick TA & Percentage Measurement Bar (Optimized for touch) */}
          <div className="md:hidden flex flex-col gap-2 p-2.5 bg-[#090e1c] border border-cyan-500/30 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
              {/* 1. Pointer Mode */}
              <button
                onClick={() => { setActiveTool('select'); setCurrentStart(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                  activeTool === 'select'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                }`}
              >
                <MousePointer className="w-4 h-4" />
                <span>Pan</span>
              </button>

              {/* 2. Big Touch-Friendly % Measurement Button (AL DOILEA INSTRUMENT) */}
              <button
                onClick={() => {
                  setActiveTool(activeTool === 'ruler' ? 'select' : 'ruler');
                  setCurrentStart(null);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all shrink-0 ${
                  activeTool === 'ruler'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-[0_0_20px_rgba(16,185,129,0.6)] ring-2 ring-emerald-300 animate-pulse'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25'
                }`}
              >
                <Maximize2 className="w-4 h-4" />
                <span>{activeTool === 'ruler' ? '📏 MĂSURARE % ACTIVĂ' : '📏 Măsoară %'}</span>
              </button>

              {/* 3. Trendline */}
              <button
                onClick={() => { setActiveTool(activeTool === 'trendline' ? 'select' : 'trendline'); setCurrentStart(null); }}
                className={`p-2 rounded-xl text-xs font-mono transition-all shrink-0 ${
                  activeTool === 'trendline' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                }`}
                title="Linie Trend"
              >
                <TrendingUp className="w-4 h-4" />
              </button>

              {/* 4. Horizontal */}
              <button
                onClick={() => { setActiveTool(activeTool === 'horizontal' ? 'select' : 'horizontal'); setCurrentStart(null); }}
                className={`p-2 rounded-xl text-xs font-mono transition-all shrink-0 ${
                  activeTool === 'horizontal' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                }`}
                title="Suport / Rezistență"
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* Undo & Clear */}
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <button
                  onClick={handleUndo}
                  disabled={drawings.length === 0}
                  className="p-2 rounded-xl bg-white/[0.03] text-slate-400 border border-white/[0.06] disabled:opacity-30"
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={drawings.length === 0}
                  className="p-2 rounded-xl bg-white/[0.03] text-slate-400 hover:text-rose-400 border border-white/[0.06] disabled:opacity-30"
                  title="Clear All"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Active Measurement Guidance / Tips Banner for Mobile */}
            {activeTool === 'ruler' && (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300 animate-fade-in">
                <span>👆 Atinge prima lumânare (Start), apoi a 2-a lumânare (Target)</span>
                <button 
                  onClick={() => { setActiveTool('select'); setCurrentStart(null); }}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline ml-2 shrink-0"
                >
                  Anulează
                </button>
              </div>
            )}

            {/* Latest Measurement HUD on Mobile */}
            {(() => {
              const latestRuler = drawings.filter(d => d.type === 'ruler' && d.p2).slice(-1)[0];
              if (!latestRuler || !latestRuler.p2) return null;
              const stats = getRulerStats(latestRuler.p1, latestRuler.p2);
              return (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#091124] border border-cyan-500/40 text-xs font-mono animate-fade-in shadow-md">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="text-cyan-400 font-bold">📏 Rezultat:</span>
                    <span className={`font-black ${stats.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stats.isUp ? `+${stats.pct.toFixed(2)}%` : `${stats.pct.toFixed(2)}%`} ({stats.priceDiff > 0 ? `+${stats.priceDiff.toFixed(2)}` : stats.priceDiff.toFixed(2)})
                    </span>
                    <span className="text-slate-300">
                      • ⏱️ <strong className="text-amber-300">{stats.timeFormatted}</strong> ({stats.barsCount} bare)
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setDrawings(prev => prev.filter(d => d.id !== latestRuler.id));
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-400 bg-white/[0.04] border border-white/[0.06] ml-2 shrink-0"
                    title="Șterge Măsurătoare"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Chart View Container with Floating Drawing Tools & SVG Overlay */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-background-card border border-background-border">
            {isLoadingHistory && (
              <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-cyan-500/30 bg-[#07111f]/95 px-3 py-1.5 text-[10px] font-bold font-mono text-cyan-300 shadow-xl backdrop-blur-xl animate-pulse">
                Se încarcă istoric mai vechi…
              </div>
            )}
            {/* Left Floating Technical Drawing Toolbar (Full TradingView Suite - Visible on mobile & desktop, vertically scrollable) */}
            <div
              onTouchStart={(e) => e.stopPropagation()}
              className="flex absolute left-1.5 sm:left-3 top-2 sm:top-3 z-30 flex-col items-center gap-1 p-1 sm:p-1.5 bg-[#0a0e17]/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl max-h-[calc(100%-1rem)] overflow-y-auto no-scrollbar touch-pan-y overscroll-y-contain"
            >
              {/* 1. Pointer / Cursor Mode */}
              <button
                onClick={() => { setActiveTool('select'); setCurrentStart(null); }}
                title="Mod Cursor (Pan & Zoom normal)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'select'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <MousePointer className="w-4 h-4" />
              </button>

              {/* 2. Measurement Ruler Tool (% Variație & Diferență Preț) - AL DOILEA INSTRUMENT */}
              <button
                onClick={() => { 
                  setActiveTool(activeTool === 'ruler' ? 'select' : 'ruler'); 
                  setCurrentStart(null); 
                }}
                title="Riglă de Măsurat Procente (% Variație & Diferență Preț) - Al 2-lea instrument"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'ruler'
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-glow-emerald'
                    : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                }`}
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <div className="w-4 h-[1px] bg-slate-800 my-0.5" />

              {/* 3. Trendline Tool */}
              <button
                onClick={() => { setActiveTool('trendline'); setCurrentStart(null); }}
                title="Linie de Trend (Click pe start, trage și lasă)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'trendline'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
              </button>

              {/* 4. Extended Ray Tool */}
              <button
                onClick={() => { setActiveTool('ray'); setCurrentStart(null); }}
                title="Rază Extinsă / Ray Line (Trage linia spre infinit la dreapta)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'ray'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>

              {/* 5. Horizontal Support/Resistance Line */}
              <button
                onClick={() => { setActiveTool('horizontal'); setCurrentStart(null); }}
                title="Nivel Orizontal Suport / Rezistență (Click pentru a plasa)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'horizontal'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* 6. Vertical Time Line */}
              <button
                onClick={() => { setActiveTool('vertical'); setCurrentStart(null); }}
                title="Linie Verticală Marcaj Timp / Sesiune (Click pentru a plasa)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'vertical'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <MoveVertical className="w-4 h-4" />
              </button>

              {/* 7. Fibonacci Retracement Tool */}
              <button
                onClick={() => { setActiveTool('fibonacci'); setCurrentStart(null); }}
                title="Fibonacci Retracement (Niveluri 23.6%, 38.2%, 50%, 61.8% Golden Pocket, 78.6%)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'fibonacci'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-glow-gold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>

              {/* 8. Parallel Channel Tool */}
              <button
                onClick={() => { setActiveTool('channel'); setCurrentStart(null); }}
                title="Canal de Trend Paralel (Click & Trage)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'channel'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Split className="w-4 h-4" />
              </button>

              {/* 9. Rectangle / Order Block Box */}
              <button
                onClick={() => { setActiveTool('rectangle'); setCurrentStart(null); }}
                title="Dreptunghi / Zonă de Consolidare & Order Block"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'rectangle'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Square className="w-4 h-4" />
              </button>

              <div className="w-4 h-[1px] bg-slate-800 my-0.5" />

              {/* 10. Long Position Tool (R:R) */}
              <button
                onClick={() => { setActiveTool('long_position'); setCurrentStart(null); }}
                title="Poziție Long (Target Verde, Stop Loss Roșu & Raport Risc:Recompensă)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'long_position'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-glow-emerald'
                    : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
              </button>

              {/* 11. Short Position Tool (R:R) */}
              <button
                onClick={() => { setActiveTool('short_position'); setCurrentStart(null); }}
                title="Poziție Short (Target Verde, Stop Loss Roșu & Raport Risc:Recompensă)"
                className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                  activeTool === 'short_position'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-glow-ruby'
                    : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" />
              </button>

              <div className="w-4 h-[1px] bg-slate-800 my-0.5" />

              {/* Undo Last Drawing */}
              <button
                onClick={handleUndo}
                disabled={drawings.length === 0}
                title="Anulează ultimul desen (Undo)"
                className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <Undo2 className="w-4 h-4" />
              </button>

              {/* Clear All Drawings */}
              <button
                onClick={handleClearAll}
                disabled={drawings.length === 0}
                title="Șterge toate desenele"
                className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* TradingView Lightweight Charts DOM Canvas */}
            <div ref={chartContainerRef} className="w-full h-[460px] md:h-[540px]" />

            {/* Synchronized Vector SVG Drawing Overlay Layer */}
            <svg
              ref={svgOverlayRef}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onTouchStart={handleSvgTouchStart}
              onTouchMove={handleSvgTouchMove}
              onTouchEnd={handleSvgTouchEnd}
              className={`absolute inset-0 w-full h-full z-20 ${
                activeTool === 'select' ? 'pointer-events-none' : 'cursor-crosshair touch-none'
              }`}
            >
              {/* Live flip threshold: horizontal line segment anchored to the
                  exact slow Money Line value. Only the compact price is shown
                  in the reserved future area—no opaque badge over candles and
                  no duplicate lateral price-scale label. */}
              {(() => {
                if (!latestState || !candles.length || !Number.isFinite(latestState.slowLine) || latestState.slowLine <= 0) return null;
                const anchor = getCoordinatesForPoint(candles.length - 1, latestState.slowLine);
                const chartWidth = chartContainerRef.current?.clientWidth || 0;
                if (!anchor || chartWidth <= 0) return null;

                const isBuy = latestState.nextFlip === 'BUY';
                const color = isBuy ? '#34d399' : '#fb7185';
                const priceLabel = `$${formatFlipPrice(latestState.slowLine)}`;
                const estimatedTextWidth = Math.max(38, priceLabel.length * 7.2);
                const priceScaleWidth = 64;
                const labelX = Math.max(
                  anchor.x + 10,
                  Math.min(anchor.x + 18, chartWidth - priceScaleWidth - estimatedTextWidth - 4)
                );
                const labelY = Math.max(14, Math.min(anchor.y - 7, 520));
                const x1 = Math.max(54, anchor.x - 110);
                const x2 = Math.max(anchor.x + 4, labelX - 5);

                return (
                  <g aria-label={`Prag flip ${latestState.nextFlip} ${formatFlipPrice(latestState.slowLine)}`}>
                    <line
                      x1={x1}
                      y1={anchor.y}
                      x2={x2}
                      y2={anchor.y}
                      stroke={color}
                      strokeWidth="2.5"
                      strokeLinecap="square"
                      filter={`drop-shadow(0 0 5px ${color})`}
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      fill={color}
                      stroke="rgba(7, 17, 30, 0.72)"
                      strokeWidth="3"
                      paintOrder="stroke"
                      textAnchor="start"
                      fontFamily="monospace"
                      fontSize="11"
                      fontWeight="800"
                    >
                      {priceLabel}
                    </text>
                  </g>
                );
              })()}

              {/* Render Saved User Drawings */}
              {drawings.map((d) => {
                const c1 = getCoordinatesForPoint(d.p1.timeIndex, d.p1.price);
                const c2 = d.p2 ? getCoordinatesForPoint(d.p2.timeIndex, d.p2.price) : null;
                if (!c1) return null;

                // 1. Trendline
                if (d.type === 'trendline' && c2) {
                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke={d.color || '#06b6d4'}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx={c1.x} cy={c1.y} r="3.5" fill={d.color || '#06b6d4'} />
                      <circle cx={c2.x} cy={c2.y} r="3.5" fill={d.color || '#06b6d4'} />
                    </g>
                  );
                }

                // 2. Extended Ray
                if (d.type === 'ray' && c2) {
                  const dx = c2.x - c1.x;
                  const dy = c2.y - c1.y;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  const extX = c1.x + (dx / len) * 2500;
                  const extY = c1.y + (dy / len) * 2500;
                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={extX}
                        y2={extY}
                        stroke={d.color || '#38bdf8'}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx={c1.x} cy={c1.y} r="3.5" fill={d.color || '#38bdf8'} />
                    </g>
                  );
                }

                // 3. Horizontal Support / Resistance Level Ray
                if (d.type === 'horizontal') {
                  return (
                    <g key={d.id}>
                      <line
                        x1={0}
                        y1={c1.y}
                        x2={2500}
                        y2={c1.y}
                        stroke={d.color || '#38bdf8'}
                        strokeWidth="1.5"
                        strokeDasharray="5 5"
                      />
                      <rect
                        x={10}
                        y={c1.y - 10}
                        width="80"
                        height="20"
                        rx="4"
                        fill="#080c14"
                        stroke={d.color || '#38bdf8'}
                        strokeWidth="1"
                      />
                      <text
                        x={50}
                        y={c1.y + 4}
                        fill="#38bdf8"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        ${d.p1.price < 1 ? d.p1.price.toFixed(4) : d.p1.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </text>
                    </g>
                  );
                }

                // 4. Vertical Time Line
                if (d.type === 'vertical') {
                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={0}
                        x2={c1.x}
                        y2={600}
                        stroke={d.color || '#a855f7'}
                        strokeWidth="1.5"
                        strokeDasharray="5 5"
                      />
                    </g>
                  );
                }

                // 5. Fibonacci Retracement Levels
                if (d.type === 'fibonacci' && c2 && d.p2) {
                  const fibLevels = [
                    { level: 0.0, label: '0.0% (Start)', color: '#94a3b8' },
                    { level: 0.236, label: '23.6%', color: '#38bdf8' },
                    { level: 0.382, label: '38.2%', color: '#34d399' },
                    { level: 0.5, label: '50.0%', color: '#fbbf24' },
                    { level: 0.618, label: '61.8% Golden Pocket', color: '#f59e0b' },
                    { level: 0.786, label: '78.6%', color: '#fb7185' },
                    { level: 1.0, label: '100.0% (End)', color: '#e879f9' }
                  ];

                  const priceDiff = d.p2.price - d.p1.price;
                  const startX = Math.min(c1.x, c2.x);
                  const endX = Math.max(c1.x, c2.x) + 300;

                  return (
                    <g key={d.id}>
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke="#64748b"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      {fibLevels.map((fib) => {
                        const levelPrice = d.p1.price + priceDiff * fib.level;
                        const levelY = candleSeriesRef.current?.priceToCoordinate(levelPrice);
                        if (levelY === null || levelY === undefined) return null;

                        return (
                          <g key={fib.level}>
                            <line
                              x1={startX}
                              y1={levelY}
                              x2={endX}
                              y2={levelY}
                              stroke={fib.color}
                              strokeWidth={fib.level === 0.618 ? 2 : 1}
                              strokeDasharray={fib.level === 0.618 ? undefined : '4 4'}
                              opacity={fib.level === 0.618 ? 1 : 0.8}
                            />
                            <rect
                              x={startX + 5}
                              y={levelY - 9}
                              width="135"
                              height="18"
                              rx="3"
                              fill="#080c14"
                              stroke={fib.color}
                              strokeWidth="0.8"
                            />
                            <text
                              x={startX + 10}
                              y={levelY + 3}
                              fill={fib.color}
                              fontFamily="monospace"
                              fontSize="10"
                              fontWeight="bold"
                            >
                              {fib.label} — ${levelPrice < 1 ? levelPrice.toFixed(4) : levelPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                }

                // 6. Parallel Channel
                if (d.type === 'channel' && c2) {
                  const channelH = 40;
                  return (
                    <g key={d.id}>
                      <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={d.color || '#06b6d4'} strokeWidth="2" />
                      <line x1={c1.x} y1={c1.y + channelH} x2={c2.x} y2={c2.y + channelH} stroke={d.color || '#06b6d4'} strokeWidth="2" />
                      <line x1={c1.x} y1={c1.y + channelH / 2} x2={c2.x} y2={c2.y + channelH / 2} stroke={d.color || '#06b6d4'} strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
                      <polygon points={`${c1.x},${c1.y} ${c2.x},${c2.y} ${c2.x},${c2.y + channelH} ${c1.x},${c1.y + channelH}`} fill="rgba(6, 182, 212, 0.1)" />
                    </g>
                  );
                }

                // 7. Rectangle / Order Block
                if (d.type === 'rectangle' && c2) {
                  const left = Math.min(c1.x, c2.x);
                  const top = Math.min(c1.y, c2.y);
                  const width = Math.abs(c2.x - c1.x);
                  const height = Math.abs(c2.y - c1.y);
                  return (
                    <g key={d.id}>
                      <rect x={left} y={top} width={width} height={height} fill="rgba(6, 182, 212, 0.15)" stroke="#06b6d4" strokeWidth="1.5" rx="3" />
                    </g>
                  );
                }

                // 8. Long Position Tool (R:R)
                if (d.type === 'long_position' && c2 && d.p2) {
                  const targetPrice = Math.max(d.p1.price, d.p2.price);
                  const stopLossPrice = d.p1.price - Math.abs(targetPrice - d.p1.price) / 2;
                  const targetY = candleSeriesRef.current?.priceToCoordinate(targetPrice) || c1.y - 50;
                  const stopY = candleSeriesRef.current?.priceToCoordinate(stopLossPrice) || c1.y + 25;
                  const boxWidth = Math.max(120, Math.abs(c2.x - c1.x));
                  const rr = Math.abs((targetPrice - d.p1.price) / Math.max(0.0001, (d.p1.price - stopLossPrice)));
                  return (
                    <g key={d.id}>
                      <rect x={c1.x} y={targetY} width={boxWidth} height={Math.abs(c1.y - targetY)} fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="1.5" />
                      <rect x={c1.x} y={c1.y} width={boxWidth} height={Math.abs(stopY - c1.y)} fill="rgba(244, 63, 94, 0.25)" stroke="#f43f5e" strokeWidth="1.5" />
                      <line x1={c1.x} y1={c1.y} x2={c1.x + boxWidth} y2={c1.y} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
                      <rect x={c1.x + 5} y={c1.y - 12} width="110" height="24" rx="4" fill="#080c14" stroke="#10b981" strokeWidth="1" />
                      <text x={c1.x + 60} y={c1.y + 4} fill="#34d399" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="bold">
                        LONG • R:R {rr.toFixed(2)}
                      </text>
                    </g>
                  );
                }

                // 9. Short Position Tool (R:R)
                if (d.type === 'short_position' && c2 && d.p2) {
                  const targetPrice = Math.min(d.p1.price, d.p2.price);
                  const stopLossPrice = d.p1.price + Math.abs(d.p1.price - targetPrice) / 2;
                  const targetY = candleSeriesRef.current?.priceToCoordinate(targetPrice) || c1.y + 50;
                  const stopY = candleSeriesRef.current?.priceToCoordinate(stopLossPrice) || c1.y - 25;
                  const boxWidth = Math.max(120, Math.abs(c2.x - c1.x));
                  const rr = Math.abs((d.p1.price - targetPrice) / Math.max(0.0001, (stopLossPrice - d.p1.price)));
                  return (
                    <g key={d.id}>
                      <rect x={c1.x} y={c1.y} width={boxWidth} height={Math.abs(targetY - c1.y)} fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="1.5" />
                      <rect x={c1.x} y={stopY} width={boxWidth} height={Math.abs(c1.y - stopY)} fill="rgba(244, 63, 94, 0.25)" stroke="#f43f5e" strokeWidth="1.5" />
                      <line x1={c1.x} y1={c1.y} x2={c1.x + boxWidth} y2={c1.y} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
                      <rect x={c1.x + 5} y={c1.y - 12} width="110" height="24" rx="4" fill="#080c14" stroke="#f43f5e" strokeWidth="1" />
                      <text x={c1.x + 60} y={c1.y + 4} fill="#fb7185" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="bold">
                        SHORT • R:R {rr.toFixed(2)}
                      </text>
                    </g>
                  );
                }

                // 10. Measurement Ruler
                if (d.type === 'ruler' && c2 && d.p2) {
                  const left = Math.min(c1.x, c2.x);
                  const top = Math.min(c1.y, c2.y);
                  const width = Math.max(10, Math.abs(c2.x - c1.x));
                  const height = Math.max(10, Math.abs(c2.y - c1.y));
                  const stats = getRulerStats(d.p1, d.p2);

                  const badgeWidth = 176;
                  const badgeHeight = 36;
                  const badgeX = Math.max(left, left + width / 2 - badgeWidth / 2);
                  const badgeY = Math.max(8, top + height / 2 - badgeHeight / 2);

                  return (
                    <g key={d.id}>
                      {/* Bounding measurement box */}
                      <rect
                        x={left}
                        y={top}
                        width={width}
                        height={height}
                        fill={stats.isUp ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)'}
                        stroke={stats.isUp ? '#10b981' : '#f43f5e'}
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        rx="4"
                      />
                      {/* Diagonal measurement trajectory line */}
                      <line
                        x1={c1.x}
                        y1={c1.y}
                        x2={c2.x}
                        y2={c2.y}
                        stroke={stats.isUp ? '#34d399' : '#fb7185'}
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      {/* High-contrast solid badge card */}
                      <rect
                        x={badgeX}
                        y={badgeY}
                        width={badgeWidth}
                        height={badgeHeight}
                        rx="8"
                        fill="#070c17"
                        stroke={stats.isUp ? '#10b981' : '#f43f5e'}
                        strokeWidth="1.5"
                        filter="drop-shadow(0 4px 10px rgba(0,0,0,0.85))"
                      />
                      {/* Row 1: Percentage return & Price Difference */}
                      <text
                        x={badgeX + badgeWidth / 2}
                        y={badgeY + 14}
                        fill={stats.isUp ? '#34d399' : '#fb7185'}
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="11"
                        fontWeight="bold"
                      >
                        {stats.isUp ? `+${stats.pct.toFixed(2)}%` : `${stats.pct.toFixed(2)}%`} ({stats.priceDiff > 0 ? `+${stats.priceDiff.toFixed(2)}` : stats.priceDiff.toFixed(2)})
                      </text>
                      {/* Row 2: Elapsed Time in Days & Bars Count */}
                      <text
                        x={badgeX + badgeWidth / 2}
                        y={badgeY + 28}
                        fill="#cbd5e1"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        ⏱️ {stats.timeFormatted} • {stats.barsCount} {stats.barsCount === 1 ? 'bară' : 'bare'}
                      </text>
                    </g>
                  );
                }

                return null;
              })}

              {/* Active Drawing Preview (Rubberband) */}
              {currentStart && mousePos && (
                <g>
                  {(activeTool === 'trendline' || activeTool === 'ray') && (
                    <line
                      x1={currentStart.x}
                      y1={currentStart.y}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="#06b6d4"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                    />
                  )}
                  {activeTool === 'fibonacci' && (
                    <g>
                      <line
                        x1={currentStart.x}
                        y1={currentStart.y}
                        x2={mousePos.x}
                        y2={mousePos.y}
                        stroke="#fbbf24"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={Math.min(currentStart.x, mousePos.x)}
                        y1={mousePos.y}
                        x2={Math.max(currentStart.x, mousePos.x) + 200}
                        y2={mousePos.y}
                        stroke="#fbbf24"
                        strokeWidth="1.5"
                      />
                    </g>
                  )}
                  {(activeTool === 'rectangle' || activeTool === 'channel') && (
                    <rect
                      x={Math.min(currentStart.x, mousePos.x)}
                      y={Math.min(currentStart.y, mousePos.y)}
                      width={Math.abs(mousePos.x - currentStart.x)}
                      height={Math.abs(mousePos.y - currentStart.y)}
                      fill="rgba(6, 182, 212, 0.15)"
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  )}
                  {(activeTool === 'long_position' || activeTool === 'short_position') && (
                    <rect
                      x={Math.min(currentStart.x, mousePos.x)}
                      y={Math.min(currentStart.y, mousePos.y)}
                      width={Math.abs(mousePos.x - currentStart.x)}
                      height={Math.abs(mousePos.y - currentStart.y)}
                      fill={activeTool === 'long_position' ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)"}
                      stroke={activeTool === 'long_position' ? "#10b981" : "#f43f5e"}
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  )}
                  {activeTool === 'ruler' && (
                    <g>
                      <rect
                        x={Math.min(currentStart.x, mousePos.x)}
                        y={Math.min(currentStart.y, mousePos.y)}
                        width={Math.abs(mousePos.x - currentStart.x)}
                        height={Math.abs(mousePos.y - currentStart.y)}
                        fill="rgba(56, 189, 248, 0.18)"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        rx="4"
                      />
                      <line
                        x1={currentStart.x}
                        y1={currentStart.y}
                        x2={mousePos.x}
                        y2={mousePos.y}
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      {candleSeriesRef.current && (
                        (() => {
                          const p1 = currentStart.price;
                          const p2 = candleSeriesRef.current.coordinateToPrice(mousePos.y) || p1;
                          
                          let targetTimeIndex = candles.length - 1;
                          if (chartApiRef.current) {
                            const timeVal = chartApiRef.current.timeScale().coordinateToTime(mousePos.x) as any;
                            if (typeof timeVal === 'number') {
                              const foundIdx = candles.findIndex((c) => {
                                const tSec = Math.floor(c.timestamp / 1000);
                                return tSec >= timeVal;
                              });
                              if (foundIdx !== -1) targetTimeIndex = foundIdx;
                            }
                          }
                          const stats = getRulerStats(currentStart, { timeIndex: targetTimeIndex, price: p2 });

                          const badgeW = 176;
                          const badgeH = 34;
                          const bX = Math.max(8, (currentStart.x + mousePos.x) / 2 - badgeW / 2);
                          const bY = Math.max(10, Math.min(currentStart.y, mousePos.y) - badgeH - 6);

                          return (
                            <g>
                              <rect
                                x={bX}
                                y={bY}
                                width={badgeW}
                                height={badgeH}
                                rx="6"
                                fill="#070c17"
                                stroke="#38bdf8"
                                strokeWidth="1"
                                filter="drop-shadow(0 4px 8px rgba(0,0,0,0.8))"
                              />
                              <text
                                x={bX + badgeW / 2}
                                y={bY + 13}
                                fill="#38bdf8"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontSize="10"
                                fontWeight="bold"
                              >
                                {stats.pct >= 0 ? '+' : ''}{stats.pct.toFixed(2)}% ({stats.priceDiff >= 0 ? '+' : ''}{stats.priceDiff.toFixed(2)})
                              </text>
                              <text
                                x={bX + badgeW / 2}
                                y={bY + 26}
                                fill="#cbd5e1"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontSize="9"
                                fontWeight="bold"
                              >
                                ⏱️ {stats.timeFormatted} • {stats.barsCount} {stats.barsCount === 1 ? 'bară' : 'bare'}
                              </text>
                            </g>
                          );
                        })()
                      )}
                    </g>
                  )}
                </g>
              )}
            </svg>
          </div>

          {/* Money Line Indicator Legend & Tool Guidance */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-background-card/50 rounded-xl border border-background-border text-[11px] font-mono text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-glow-emerald"></span> Baza Nor (Fast Supertrend)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Margine Nor (Slow Supertrend)
              </span>
              <span className="flex items-center gap-1.5 text-amber-300 font-bold">
                <span className="w-3 h-1 rounded-full bg-amber-400 shadow-glow-gold"></span> SMA 200 Macro Baseline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded bg-emerald-500/40 border border-emerald-500/60"></span> MoneyLine Cloud Fill
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                ▲ BUY Signal
              </span>
              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                ▼ SELL Signal
              </span>
            </div>
            <div className="flex items-center gap-2 text-cyan-300">
              <Sliders className="w-3.5 h-3.5" />
              <span>Bara TradingView: Trendline, Rază, Orizontal, Vertical, Fibonacci, Canal, Order Block, Long/Short R:R, Riglă %</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab: Official TradingView Pro Platform */}
      {activeTab === 'tv_embed' && (
        <div className="space-y-3">
          {/* Top Real-Time MoneyLine & Indicators Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-background-card/90 rounded-xl border border-background-border text-xs font-mono">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-slate-100 text-sm">{tvSymbol} ({activeInterval.toUpperCase()})</span>
              <span className="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold shadow-glow-cyan">
                Platforma Oficială TradingView v6
              </span>
              <span className="text-slate-400 text-[11px] hidden md:inline">
                Cotație: <strong className="text-slate-200">${quoteCurrency}</strong>
              </span>
            </div>

            {/* MoneyLine & SMA 200 Telemetry Badges */}
            {latestState && (
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Bază Nor: ${latestState.fastLine.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="flex items-center gap-1 text-emerald-300 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  Margine Nor: ${latestState.slowLine.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`flex items-center gap-2 px-2.5 py-1 rounded-md border font-bold ${
                  latestState.nextFlip === 'BUY'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/35'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/35'
                }`}>
                  <span className={`w-8 h-0.5 ${latestState.nextFlip === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  PRAG ML EXACT · {latestState.nextFlip === 'BUY' ? '>' : '<'} ${formatFlipPrice(latestState.slowLine)} · {latestState.nextFlip} FLIP
                </span>
                <span className="flex items-center gap-1 text-amber-300 font-bold font-mono">
                  <span className="w-2 h-0.5 rounded-full bg-amber-400"></span>
                  SMA 50: ${latestState.sma50.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="flex items-center gap-1 text-white font-bold font-mono">
                  <span className="w-2.5 h-1 rounded-full bg-white shadow-[0_0_6px_#fff]"></span>
                  SMA 200: ${latestState.sma200.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  latestState.isAboveSma200
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {latestState.isAboveSma200 ? '▲ Peste SMA 200' : '▼ Sub SMA 200'}
                </span>
              </div>
            )}

            <button
              onClick={handleCopyPineScript}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                copiedPine
                  ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              {copiedPine ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{copiedPine ? 'COPIAT!' : 'Copiază Pine Script'}</span>
            </button>
          </div>

          {/* Official TradingView Container with Full Native Toolbars */}
          <div className="w-full rounded-2xl overflow-hidden bg-background-card border border-background-border shadow-2xl">
            <div ref={tvWidgetContainerRef} className="w-full h-[620px]" />
          </div>

          {/* Guidance Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-2 text-cyan-300">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>MoneyLine pe TradingView:</strong> SuperTrendul nativ oferă reperul vizual direct în grafic, iar pragul exact MoneyLine pentru {activeInterval.toUpperCase()} este linia colorată <strong>PRAG ML EXACT</strong> de sus. Bara laterală din stânga este panoul oficial TradingView pentru instrumentele de desen.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 3: Pine Script v6 Source Code */}
      {activeTab === 'pinescript' && (
        <div className="p-4 bg-background-card rounded-xl border border-background-border space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">MoneyLine Overlay Force v1 — Pine Script v6</h3>
              </div>
              <p className="text-slate-400 text-[11px]">
                Scriptul exact cu adaptare automată a parametrilor (1H, 4H, 8H, 1D, 1W, 1M) și colorare nor.
              </p>
            </div>

            <button
              onClick={handleCopyPineScript}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                copiedPine
                  ? 'bg-emerald-500 text-slate-950 shadow-glow-emerald'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:opacity-90 shadow-glow-cyan'
              }`}
            >
              {copiedPine ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedPine ? 'COPIED TO CLIPBOARD!' : 'COPY PINE SCRIPT'}</span>
            </button>
          </div>

          <div className="relative bg-slate-950 p-4 rounded-xl border border-slate-800 text-emerald-400/90 max-h-80 overflow-y-auto select-all">
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{pineScriptCode}</pre>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Instrucțiuni:</strong> Deschide TradingView &gt; Click pe <em>Pine Editor</em> &gt; Lipește scriptul &gt; Click <em>Add to chart</em>.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
