import React from 'react';
import { Database, Percent, TrendingDown, TrendingUp, Activity, Landmark } from 'lucide-react';
import { useLanguage } from '../i18n.js';

interface OnchainData {
  source?: string;
  supplyCirculating?: number;
  supplyMax?: number;
  supplyTotal?: number;
  pctUnlocked?: number;
  athPrice?: number;
  athDistancePct?: number;
  atlPrice?: number;
  atlDistancePct?: number;
  volumeMcapPct?: number;
  tvlUsd?: number;
  tvlToMcapPct?: number;
  fees24hUsd?: number;
}

const fmtUsd = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

const fmtSupply = (value?: number): string => {
  if (value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
};

export const OnchainDataCard: React.FC<{ data?: OnchainData }> = ({ data }) => {
  const { language } = useLanguage();
  const isRo = language === 'ro';
  if (!data) return null;

  const items: Array<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = [];
  if (data.supplyCirculating) {
    const base = data.supplyMax || data.supplyTotal;
    items.push({
      icon: <Percent className="w-3.5 h-3.5 text-cyan-400" />,
      label: isRo ? 'Supply deblocat' : 'Supply unlocked',
      value: data.pctUnlocked !== undefined ? `${data.pctUnlocked}%` : '—',
      hint: base ? `${fmtSupply(data.supplyCirculating)} / ${fmtSupply(base)}` : undefined
    });
  }
  if (data.athDistancePct !== undefined) {
    items.push({
      icon: <TrendingDown className="w-3.5 h-3.5 text-rose-400" />,
      label: isRo ? 'Distanță de ATH' : 'Distance from ATH',
      value: `${data.athDistancePct}%`,
      hint: data.athPrice ? `ATH ${fmtUsd(data.athPrice)}` : undefined
    });
  }
  if (data.atlDistancePct !== undefined) {
    items.push({
      icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />,
      label: isRo ? 'Distanță de ATL' : 'Distance from ATL',
      value: `+${data.atlDistancePct}%`,
      hint: data.atlPrice ? `ATL ${fmtUsd(data.atlPrice)}` : undefined
    });
  }
  if (data.volumeMcapPct !== undefined) {
    items.push({
      icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />,
      label: isRo ? 'Volum 24h / MCap' : '24h Volume / MCap',
      value: `${data.volumeMcapPct}%`
    });
  }
  if (data.tvlUsd) {
    items.push({
      icon: <Landmark className="w-3.5 h-3.5 text-emerald-400" />,
      label: 'TVL (DefiLlama)',
      value: fmtUsd(data.tvlUsd),
      hint: data.tvlToMcapPct !== undefined ? `TVL/MCap ${data.tvlToMcapPct}%` : undefined
    });
  }
  if (data.fees24hUsd) {
    items.push({
      icon: <Database className="w-3.5 h-3.5 text-amber-400" />,
      label: isRo ? 'Fees protocol 24h' : 'Protocol fees 24h',
      value: fmtUsd(data.fees24hUsd)
    });
  }
  if (items.length === 0) return null;

  return (
    <div className="p-4 sm:p-5 rounded-[30px] bg-[var(--t-surface)] border border-emerald-500/25 shadow-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 font-sans">{isRo ? 'Date On-Chain' : 'On-Chain Data'}</h3>
            <p className="text-[11px] text-slate-400 font-sans">
              {isRo ? 'Metrici care contează pentru decizie' : 'Decision-relevant metrics'} · {data.source === 'coingecko+defillama' ? 'CoinGecko + DefiLlama' : 'CoinGecko'}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {items.map((item, index) => (
          <div key={index} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 mb-1">
              {item.icon}
              <span>{item.label}</span>
            </div>
            <div className="text-sm font-bold font-mono text-slate-100">{item.value}</div>
            {item.hint && <div className="text-[10px] font-mono text-slate-500 mt-0.5">{item.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
