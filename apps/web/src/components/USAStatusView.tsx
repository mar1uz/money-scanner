import React, { useState, useEffect } from 'react';
import { USAEconomicStatus, YieldPoint } from '@money-scanner/shared';
import { fetchUSAStatus } from '../services/api.js';
import { AssetLink } from './AssetNavigation.js';
import { ViewHeader } from './ui/ViewHeader.js';
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Activity,
  BrainCircuit,
  Sparkles,
  RefreshCw,
  Layers,
  Flame,
  ShieldAlert,
  Coins,
  Award,
  ChevronRight,
  Info,
  Calendar,
  Zap,
  Sliders,
  CheckCircle2
} from 'lucide-react';

export const USAStatusView: React.FC = () => {
  const [data, setData] = useState<USAEconomicStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchUSAStatus();
      setData(res);
    } catch (err) {
      console.error('Failed to load USA status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !data) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-4">
        <Landmark className="w-10 h-10 mx-auto animate-pulse text-cyan-400" />
        <p className="text-sm">Se încarcă datele macroeconomice oficiale ale Statelor Unite (Trezorerie, Fed, CPI, Datorie)...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-rose-400 font-mono">
        Nu s-au putut încărca datele macroeconomice. Te rugăm să reîncerci.
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <ViewHeader
        title={<>USA Economic Status &amp; Macro Intelligence</>}
        badge="Live Macro 360°"
        subtitle="Serii oficiale FRED, U.S. Treasury și calendare Fed/BLS/BEA, cu data fiecărei observații."
        meta={data.dataQuality?.unavailableSeries.length
          ? <p className="ms-view-meta">{data.dataQuality.unavailableSeries.length} serii indisponibile</p>
          : null}
        actions={
          <button onClick={loadData} disabled={loading} className="ms-btn ms-btn--sm ms-btn--secondary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizează Indicatorii</span>
          </button>
        }
      />

      {/* 4 Core Macro Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pillar 1: U.S. National Debt */}
        <div className="cyber-glass rounded-[30px] p-5 border border-rose-500/30 bg-rose-500/5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between font-mono text-xs text-slate-400">
            <span className="uppercase font-bold tracking-wider text-rose-300">Datoria Totală SUA</span>
            <a
              href="https://fred.stlouisfed.org/series/GFDEBTN"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20"
              title="Vezi seria oficială FRED a Băncii Rezervei Federale St. Louis"
            >
              <span>FRED: GFDEBTN</span>
            </a>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black font-mono text-slate-100 tracking-tight">
              {data.fiscal.debtFormatted}
            </div>
            <div className="text-xs text-rose-400 font-mono font-bold">
              {data.fiscal.debtToGdpPercent}% din PIB • U.S. Treasury
            </div>
          </div>
          <div className="space-y-1 text-[11px] font-mono text-slate-400 pt-2 border-t border-rose-500/20">
            <div className="flex justify-between">
              <span>Dobânzi Anuale:</span>
              <strong className="text-slate-200">{data.fiscal.annualInterestExpense !== undefined ? `$${(data.fiscal.annualInterestExpense / 1e12).toFixed(2)}T / an` : '—'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Datorie / Cetățean:</span>
              <strong className="text-slate-300">{data.fiscal.debtPerCitizen !== undefined ? `$${data.fiscal.debtPerCitizen.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</strong>
            </div>
          </div>
        </div>

        {/* Pillar 2: Inflation & CPI vs Fed Target */}
        <div className="cyber-glass rounded-[30px] p-5 border border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-400">
            <span className="uppercase font-bold tracking-wider text-emerald-300">Inflație &amp; CPI YoY</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-100">{data.inflation.cpiYoY}%</span>
              <span className="text-xs text-emerald-400 font-mono font-bold">🟢 În Răcire</span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Core CPI: <strong className="text-slate-200">{data.inflation.coreCpiYoY}%</strong> • Core PCE: <strong className="text-emerald-300">{data.inflation.corePceYoY}%</strong>
            </div>
          </div>
          <div className="space-y-1 text-[11px] font-mono text-slate-400 pt-2 border-t border-emerald-500/20">
            <div className="flex justify-between">
              <span>Ținta Fed de Inflație:</span>
              <strong className="text-emerald-400">{data.inflation.targetInflation}.0%</strong>
            </div>
            <div className="flex justify-between">
              <span>PPI (Producători):</span>
              <strong className="text-slate-300">{data.inflation.ppiYoY}% YoY</strong>
            </div>
          </div>
        </div>

        {/* Pillar 3: Fed Policy & Rate Cut Odds */}
        <div className="cyber-glass rounded-[30px] p-5 border border-cyan-500/30 bg-cyan-500/5 space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-400">
            <span className="uppercase font-bold tracking-wider text-cyan-300">Dobânda Fed &amp; Ciclul FOMC</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black font-mono text-slate-100">
              {data.monetaryPolicy.fedFundsRateRange}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-mono font-bold">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ședință FOMC: <strong className="text-slate-100">{data.monetaryPolicy.nextFomcDate}</strong></span>
            </div>
          </div>
          <div className="space-y-1 text-[11px] font-mono text-slate-400 pt-2 border-t border-cyan-500/20">
            <div className="flex justify-between">
              <span>Șanse Reducere 25 bps:</span>
              <strong className="text-emerald-400">{data.monetaryPolicy.rateCutProb25bps !== undefined ? `${data.monetaryPolicy.rateCutProb25bps}%` : '—'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Rată Neutră Estimată:</span>
              <strong className="text-cyan-300">{data.monetaryPolicy.neutralRateEstimate !== undefined ? `${data.monetaryPolicy.neutralRateEstimate}%` : '—'}</strong>
            </div>
          </div>
        </div>

        {/* Pillar 4: Labor Market & Unemployment */}
        <div className="cyber-glass rounded-[30px] p-5 border border-background-border space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-400">
            <span className="uppercase font-bold tracking-wider text-slate-300">Piața Muncii &amp; Șomaj</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-100">{data.laborMarket.unemploymentRate}%</span>
              <span className="text-xs text-slate-400 font-mono">Șomaj</span>
            </div>
            <div className="text-xs text-emerald-400 font-mono font-bold">
              +{data.laborMarket.nonFarmPayrollsMonthly.toLocaleString()} Joburi Noi (NFP)
            </div>
          </div>
          <div className="space-y-1 text-[11px] font-mono text-slate-400 pt-2 border-t border-background-border">
            <div className="flex justify-between">
              <span>Cereri Inițiale Șomaj:</span>
              <strong className="text-slate-300">{data.laborMarket.initialJoblessClaims.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between">
              <span>Creștere Salarială:</span>
              <strong className="text-emerald-400">+{data.laborMarket.wageGrowthYoY}% YoY</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Yield Curve & Inversion Radar + Major US Indices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive US Treasury Yield Curve */}
        <div className="lg:col-span-2 cyber-glass rounded-[30px] p-6 border border-background-border space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-base text-slate-100 font-mono">
                  Curba Randamentelor Trezoreriei SUA (Yield Curve)
                </h3>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Evoluția dobânzilor pe maturități de la 1 Lună (scurt) până la 30 de Ani (lung).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Spread 10Y - 2Y:</span>
              <span className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                data.yieldCurve.spread10Y2Y >= 0
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-emerald'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-glow-ruby'
              }`}>
                {data.yieldCurve.spread10Y2Y > 0 ? `+${data.yieldCurve.spread10Y2Y}%` : `${data.yieldCurve.spread10Y2Y}%`}
              </span>
            </div>
          </div>

          {/* Yield Curve Visual Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {data.yieldCurve.points.map((pt) => (
              <div
                key={pt.maturity}
                className={`p-3 rounded-xl border text-center font-mono space-y-1 transition-all ${
                  pt.maturity === '10Y' || pt.maturity === '2Y' || pt.maturity === '30Y'
                    ? 'bg-cyan-500/10 border-cyan-500/40 shadow-glow-cyan'
                    : 'bg-background-surface/80 border-background-border'
                }`}
              >
                <div className="text-xs font-bold text-slate-400">{pt.maturity}</div>
                <div className="text-base font-black text-slate-100">{pt.rate}%</div>
                <div className={`text-[10px] ${pt.change < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pt.change > 0 ? `+${pt.change}%` : `${pt.change}%`}
                </div>
              </div>
            ))}
          </div>

          {/* Curve Regime Status Banner */}
          <div className="p-4 rounded-xl bg-background-surface/90 border border-background-border flex items-start gap-3 text-xs font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-200">
                Regim Curbă: <span className="text-cyan-300">{data.yieldCurve.curveRegime}</span>
              </span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Spread-ul este calculat din randamentele oficiale ale aceleiași observații și trebuie interpretat împreună cu inflația, piața muncii și condițiile financiare.
              </p>
            </div>
          </div>
        </div>

        {/* Right Col: Wall Street Indices & Volatility (VIX, DXY, M2) */}
        <div className="cyber-glass rounded-[30px] p-6 border border-background-border space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-slate-300 pb-2 border-b border-background-border">
            <h3 className="font-bold text-sm text-slate-100">Indici Majori &amp; Barometru Macro</h3>
            <span className="text-[10px] text-cyan-400 font-bold">Wall Street 360°</span>
          </div>

          <div className="space-y-2.5">
            {data.indices.map((idx) => (
              <div
                key={idx.symbol}
                className="p-2.5 rounded-xl bg-background-surface/80 border border-background-border flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <AssetLink symbol={idx.symbol} className="font-bold text-slate-200">{idx.symbol}</AssetLink>
                  <div className="text-[10px] text-slate-400">{idx.name}</div>
                </div>

                <div className="text-right space-y-0.5">
                  <div className="font-bold text-slate-100">
                    {idx.category === 'Liquidity' ? `$${idx.value}T` : (idx.category === 'Currency' || idx.category === 'Volatility' ? idx.value.toFixed(2) : idx.value.toLocaleString())}
                  </div>
                  <div className={`text-[10px] font-bold ${idx.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {idx.changePercent >= 0 ? `+${idx.changePercent}%` : `${idx.changePercent}%`}
                  </div>
                  <div className="text-[9px] text-slate-600">{idx.observationDate || '—'}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Consumer Pulse Mini Card */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
            <div className="flex justify-between">
              <span>Sentiment Consumator (U. Mich):</span>
              <strong className="text-slate-200">{data.consumer.michiganSentimentIndex} pct</strong>
            </div>
            <div className="flex justify-between">
              <span>Vânzări cu Amănuntul (Retail):</span>
              <strong className="text-emerald-400">+{data.consumer.retailSalesMoM}% MoM</strong>
            </div>
            <div className="flex justify-between">
              <span>Masa Monetară US M2:</span>
              <strong className="text-cyan-300">${data.consumer.m2MoneySupplyTrillions}T (+{data.consumer.m2GrowthYoY}%)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Extended official series */}
      {data.indicators && (
        <div className="cyber-glass rounded-[30px] p-6 border border-background-border space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-background-border pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-100 font-mono">Indicatori Macro Extinse</h3>
              <p className="mt-1 text-xs text-slate-400 font-mono">Lichiditate, creștere, condiții financiare și risc de recesiune din serii FRED.</p>
            </div>
            <span className="text-[10px] font-mono text-cyan-300">{Object.keys(data.indicators).length} serii disponibile</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {['GDP', 'INDPRO', 'M2SL', 'WALCL', 'RRPONTSYD', 'WTREGEN', 'NFCI', 'T10Y3M', 'DFII10', 'T10YIE', 'JTSJOL', 'CCSA'].map(id => {
              const item = data.indicators?.[id];
              if (!item) return null;
              const display = item.unit.includes('USD billions') ? `$${(item.value / 1000).toFixed(2)}T` : item.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
              return (
                <div key={id} className="rounded-xl border border-background-border bg-background-surface/70 p-3">
                  <div className="font-mono text-[10px] font-bold text-cyan-300">{id}</div>
                  <div className="mt-1 font-mono text-sm font-black text-slate-100">{display}</div>
                  <div className="mt-1 text-[9px] text-slate-500">{item.unit} · {item.observationDate}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] font-mono text-slate-500">Surse: <a className="text-cyan-400 hover:underline" href="https://fred.stlouisfed.org/" target="_blank" rel="noreferrer">FRED</a> și <a className="text-cyan-400 hover:underline" href="https://fiscaldata.treasury.gov/" target="_blank" rel="noreferrer">U.S. Treasury</a>. Valorile au frecvențe diferite și nu sunt sincronizate artificial.</div>
        </div>
      )}

      {data.calendar?.length ? (
        <div className="cyber-glass rounded-[30px] p-6 border border-background-border space-y-3">
          <div className="flex items-center gap-2 border-b border-background-border pb-3">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-base text-slate-100 font-mono">Calendar macro SUA</h3>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.calendar.map(event => (
              <a key={event.title} href={event.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-background-border bg-background-surface/70 p-3 transition hover:border-cyan-500/40">
                <div className="text-xs font-bold text-slate-100">{event.title}</div>
                <div className="mt-1 text-[11px] text-cyan-300">{event.date}</div>
                <div className="mt-1 text-[9px] text-slate-500">Sursă: {event.source}</div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Macro synthesis & multi-asset context */}
      <div className="cyber-glass rounded-[30px] p-6 border border-background-border space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-background-border">
          <div className="flex items-center gap-2.5">
            <BrainCircuit className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-mono">
                Sinteză macro &amp; impact pe piețe
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Sinteză deterministă calculată din datele oficiale și din data reală a fiecărei observații.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>{data.aiGuidance.confidenceScore !== undefined ? `Grad de Încredere Model AI: ${data.aiGuidance.confidenceScore}%` : 'Sinteză pe date oficiale'}</span>
          </div>
        </div>

        {/* Executive Summary Card */}
        <div className="p-5 rounded-[30px] bg-[var(--t-surface)] border border-cyan-500/30 space-y-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-300">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>{data.aiGuidance.regimeTitle}</span>
          </div>
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            {data.aiGuidance.executiveSummary}
          </p>
        </div>

        {/* 3 Pillars of Impact: Stocks, Crypto, Metals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stocks Impact */}
          <div className="p-4 rounded-xl bg-background-surface/80 border border-background-border space-y-2.5">
            <div className="flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span>Acțiuni SUA &amp; Tech</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                {data.aiGuidance.impactOnStocks.stance}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {data.aiGuidance.impactOnStocks.description}
            </p>
          </div>

          {/* Crypto Impact */}
          <div className="p-4 rounded-xl bg-background-surface/80 border border-background-border space-y-2.5">
            <div className="flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="inline-flex items-center gap-1">
                  Crypto (
                  <AssetLink symbol="BTC" marketClass="crypto" className="text-amber-200">$BTC</AssetLink>,
                  <AssetLink symbol="ETH" marketClass="crypto" className="text-amber-200">$ETH</AssetLink>,
                  <AssetLink symbol="SOL" marketClass="crypto" className="text-amber-200">$SOL</AssetLink>)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold shadow-glow-emerald">
                {data.aiGuidance.impactOnCrypto.stance}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {data.aiGuidance.impactOnCrypto.description}
            </p>
          </div>

          {/* Metals & Gold Impact */}
          <div className="p-4 rounded-xl bg-background-surface/80 border border-background-border space-y-2.5">
            <div className="flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Metale &amp; Gold ($XAU)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold shadow-glow-gold">
                {data.aiGuidance.impactOnMetals.stance}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {data.aiGuidance.impactOnMetals.description}
            </p>
          </div>
        </div>

        {/* Risk Radar & Actionable Thesis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Key Risk Factors */}
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Radar de Riscuri Macro de Monitorizat</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
              {data.aiGuidance.keyRiskFactors.map((risk, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actionable Trading Thesis */}
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2 font-bold text-emerald-300">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Teză Acționabilă de Trading (Buy the Dip)</span>
            </div>
            <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
              {data.aiGuidance.actionableTradingThesis}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
