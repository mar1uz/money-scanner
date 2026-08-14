import React, { useEffect, useState } from 'react';
import { AIAnalysisPayload } from '../types.js';
import { fetchAIBriefing } from '../services/api.js';
import {
  BrainCircuit,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Compass,
  Link,
  RefreshCw
} from 'lucide-react';

export const AIBriefingView: React.FC = () => {
  const [briefing, setBriefing] = useState<AIAnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBriefing = () => {
    setLoading(true);
    fetchAIBriefing()
      .then(res => setBriefing(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBriefing();
  }, []);

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono">
        <BrainCircuit className="w-8 h-8 mx-auto mb-3 animate-spin text-purple-400" />
        Synthesizing fresh structured market data with Gemini AI analyst...
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="cyber-glass rounded-xl p-6 border border-purple-500/30 bg-purple-500/5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
            <h2 className="text-lg font-bold text-slate-100">AI Market Analyst Executive Briefing</h2>
          </div>
          <p className="text-xs text-slate-400">
            Automated intelligence briefing synthesizing Money Line signals, X trends, breaking news, and macro factors.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-3 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
            {(briefing.confidenceScore * 100).toFixed(0)}% Confidence
          </span>
          <button
            onClick={loadBriefing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Regenerate</span>
          </button>
        </div>
      </div>

      {/* Executive Summary Card */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-slate-400">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Executive Market Regime Summary</span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed font-sans font-medium">
          {briefing.executiveSummary}
        </p>
      </div>

      {/* Key Drivers */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-slate-400">
          <Compass className="w-4 h-4 text-emerald-400" />
          <span>Key Structural Drivers</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
          {briefing.keyDrivers.map((driver, idx) => (
            <div key={idx} className="bg-background-surface/80 p-3.5 rounded-lg border border-background-border text-slate-300">
              <span className="text-cyan-400 font-bold block mb-1">0{idx + 1}.</span>
              <span>{driver}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bullish vs Bearish Factors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bullish */}
        <div className="cyber-glass rounded-xl p-5 border border-emerald-500/20 bg-emerald-500/5 space-y-3">
          <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Bullish Tailwinds
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {briefing.bullishFactors.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bearish / Risks */}
        <div className="cyber-glass rounded-xl p-5 border border-rose-500/20 bg-rose-500/5 space-y-3">
          <h3 className="font-bold text-sm text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Bearish Factors & Systemic Risks
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {briefing.bearishFactors.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Assets To Watch */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-4">
        <h3 className="text-xs font-mono uppercase text-slate-400">Assets To Watch</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {briefing.assetsToWatch.map((item) => (
            <div key={item.symbol} className="p-3.5 rounded-lg bg-background-surface border border-background-border space-y-1.5">
              <div className="flex items-center justify-between font-mono">
                <span className="font-bold text-sm text-cyan-300">${item.symbol}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  item.bias === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.bias}
                </span>
              </div>
              <p className="text-xs text-slate-300">{item.thesis}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Evidence Citations */}
      {briefing.evidenceCitations && briefing.evidenceCitations.length > 0 && (
        <div className="cyber-glass rounded-xl p-4 border border-background-border text-xs font-mono">
          <span className="text-[10px] uppercase text-slate-500 block mb-2">Supporting Evidence & Citations</span>
          <div className="flex flex-wrap gap-3">
            {briefing.evidenceCitations.map((cite, idx) => (
              <a
                key={idx}
                href={cite.url || '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-surface hover:bg-background-hover text-slate-300 hover:text-cyan-300 border border-background-border transition-colors"
              >
                <Link className="w-3 h-3 text-cyan-400" />
                <span>{cite.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
