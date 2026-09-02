import React from 'react';
import { BookOpen, CheckCircle2, Globe, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import { getAssetProfile } from '@money-scanner/shared';
import { useLanguage } from '../i18n.js';

interface AssetProfileOverviewCardProps {
  symbol: string;
  name?: string;
  category?: string;
  marketClass?: string;
  coinGeckoId?: string;
}

export const AssetProfileOverviewCard: React.FC<AssetProfileOverviewCardProps> = ({
  symbol,
  name,
  category,
  marketClass,
  coinGeckoId
}) => {
  const { language } = useLanguage();
  const isRo = language === 'ro';

  const profile = getAssetProfile(symbol, marketClass, category, name);

  const headline = isRo ? profile.headlineRo : profile.headlineEn;
  const whatItDoes = isRo ? profile.whatItDoesRo : profile.whatItDoesEn;
  const coreUtility = isRo ? profile.coreUtilityRo : profile.coreUtilityEn;
  const origin = isRo ? profile.originRo : profile.originEn;
  const categoryLabel = isRo ? profile.categoryLabelRo : profile.categoryLabelEn;
  const keyPoints = isRo ? profile.keyPointsRo : profile.keyPointsEn;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#0e172e] via-[#090f20] to-[#070b16] border border-cyan-500/35 shadow-2xl space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 shadow-glow-cyan">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white font-sans tracking-tight">
                {isRo ? 'Despre Activ · Profil & Ce Face' : 'Asset Profile & Core Utility'}
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-[10px] font-mono font-bold text-cyan-300 uppercase">
                ${profile.symbol}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-slate-300">
                {categoryLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              {profile.name} · {marketClass === 'crypto' ? (isRo ? 'Activ Criptografic' : 'Crypto Protocol') : marketClass === 'stocks' ? (isRo ? 'Companie Listată Public' : 'Public Equity') : (isRo ? 'Marfă / Metal' : 'Commodity / Metal')}
            </p>
          </div>
        </div>

        {/* Ecosystem badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-slate-300">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate max-w-[200px]">{profile.ecosystem}</span>
          </span>
        </div>
      </div>

      {/* ── Headline Summary ── */}
      <div className="p-3.5 rounded-xl bg-cyan-950/25 border border-cyan-500/20 text-xs sm:text-sm text-cyan-200 leading-relaxed font-sans flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <span className="font-medium">{headline}</span>
      </div>

      {/* ── 3 Main Content Blocks ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
        {/* Block 1: Ce face / What it does */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono mb-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isRo ? 'Cu ce se ocupă' : 'What It Does'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {whatItDoes}
            </p>
          </div>
        </div>

        {/* Block 2: Utilitate & Produs / Core Utility */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isRo ? 'Utilitate & Produs Principal' : 'Core Utility & Products'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {coreUtility}
            </p>
          </div>
        </div>

        {/* Block 3: Origine & Istoric / Origin & Background */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>{isRo ? 'Origine & Lansare' : 'Origin & Background'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {origin}
            </p>
          </div>
        </div>
      </div>

      {/* ── Key Highlights (3 Bullet points) ── */}
      {keyPoints && keyPoints.length > 0 && (
        <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.05] space-y-2">
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
            {isRo ? 'Puncte Cheie de Reținut' : 'Key Highlights'}
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {keyPoints.map((point, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300 font-sans leading-relaxed">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
