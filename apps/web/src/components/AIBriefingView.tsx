import React, { useEffect, useState, useRef } from 'react';
import { AIAnalysisPayload } from '../types.js';
import { fetchAIBriefing, askAIAnalyst } from '../services/api.js';
import {
  BrainCircuit,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Compass,
  Link as LinkIcon,
  RefreshCw,
  Send,
  MessageSquare,
  Bot,
  User,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  evidence?: { sourceType: string; title: string; url: string }[];
  timestamp: number;
}

export const AIBriefingView: React.FC = () => {
  const [briefing, setBriefing] = useState<AIAnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Interactive AI Analyst Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Salut! Sunt analistul tău AI pentru piața crypto. Pot sintetiza în timp real starea indicatorilor Money Line pentru orice activ, știrile de ultimă oră și sentimentul de pe X (Twitter). Ce dorești să analizez?',
      timestamp: Date.now()
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [askingAI, setAskingAI] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    'Cum arată $BTC pe Money Line?',
    'Analizează momentum-ul și sentimentul $SOL',
    'Care sunt cele mai bullish active din Top 50?',
    'Ce impact au ultimele știri despre ETF-uri?'
  ];

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, askingAI]);

  const handleAskQuestion = async (qText?: string) => {
    const question = (qText || inputQuestion).trim();
    if (!question || askingAI) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: question,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setInputQuestion('');
    setAskingAI(true);

    try {
      const res = await askAIAnalyst(question);
      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: res.answer,
        evidence: res.evidenceCitations,
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `ai_err_${Date.now()}`,
        sender: 'ai',
        text: 'A apărut o eroare la procesarea întrebării. Te rog să reîncerci.',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setAskingAI(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono">
        <BrainCircuit className="w-8 h-8 mx-auto mb-3 animate-spin text-purple-400" />
        Sintetizare date reale de piață, știri live și Money Line cu AI Analyst...
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
            <h2 className="text-lg font-bold text-slate-100">AI Market Analyst & Interactive Studio</h2>
          </div>
          <p className="text-xs text-slate-400">
            Sinteză automată în timp real bazată pe indicatorii Money Line, știri reale crypto și sentimentul de pe X (Twitter).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-3 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
            {(briefing.confidenceScore * 100).toFixed(0)}% Încredere Sinteză
          </span>
          <button
            onClick={loadBriefing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizează</span>
          </button>
        </div>
      </div>

      {/* Interactive Ask AI Market Analyst Chat Studio */}
      <div className="cyber-glass rounded-2xl border border-purple-500/30 overflow-hidden shadow-2xl bg-background-card/90">
        <div className="p-4 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-slate-100">Ask AI Market Analyst (Q&amp;A în Timp Real)</span>
          </div>
          <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
            Powered by Money Line &amp; Real News
          </span>
        </div>

        {/* Chat History Messages */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[380px] overflow-y-auto">
          {chatMessages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-2xl rounded-2xl p-4 text-xs font-sans leading-relaxed space-y-2.5 ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 border border-cyan-500/40 text-slate-100 rounded-tr-none'
                  : 'bg-background-surface/90 border border-background-border text-slate-200 rounded-tl-none shadow-lg'
              }`}>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>

                {/* Evidence Citations if present */}
                {msg.evidence && msg.evidence.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 text-[11px] font-mono space-y-1">
                    <span className="text-slate-400 font-bold block">Surse &amp; Dovezi Verificabile:</span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {msg.evidence.map((cite, idx) => (
                        <a
                          key={idx}
                          href={cite.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition-all text-[10px]"
                        >
                          <ExternalLink className="w-2.5 h-2.5 text-cyan-400" />
                          <span className="line-clamp-1">{cite.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {askingAI && (
            <div className="flex gap-3 items-center text-xs font-mono text-purple-300">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-background-surface/90 border border-background-border px-4 py-2.5 rounded-xl flex items-center gap-2">
                <BrainCircuit className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>Analizez datele Money Line și fluxurile de știri reale...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick Question Chips */}
        <div className="px-4 py-2 bg-background-surface/40 border-t border-background-border/60 flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="text-slate-500">Întrebări rapide:</span>
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleAskQuestion(q)}
              disabled={askingAI}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 transition-all flex items-center gap-1"
            >
              <span>{q}</span>
              <ChevronRight className="w-3 h-3 text-slate-500" />
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-background-surface/80 border-t border-background-border flex items-center gap-2">
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAskQuestion();
            }}
            placeholder="Întreabă AI-ul despre orice monedă (ex: $BTC, $SOL), știre sau regim de piață..."
            className="flex-1 bg-background-card border border-background-border rounded-xl px-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all font-mono"
          />
          <button
            onClick={() => handleAskQuestion()}
            disabled={askingAI || !inputQuestion.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all shadow-glow-cyan"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Trimite</span>
          </button>
        </div>
      </div>

      {/* Executive Summary Card */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-slate-400">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Sinteza Executivă a Regimului de Piață</span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed font-sans font-medium">
          {briefing.executiveSummary}
        </p>
      </div>

      {/* Key Drivers */}
      <div className="cyber-glass rounded-xl p-5 border border-background-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-slate-400">
          <Compass className="w-4 h-4 text-emerald-400" />
          <span>Factori Structurali Cheie</span>
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
            <CheckCircle className="w-4 h-4" /> Factori Bullish &amp; Oportunități
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
            <AlertTriangle className="w-4 h-4" /> Factori Bearish &amp; Riscuri
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
        <h3 className="text-xs font-mono uppercase text-slate-400">Active de Urmărit</h3>
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
          <span className="text-[10px] uppercase text-slate-500 block mb-2">Surse Reale &amp; Dovezi Citare</span>
          <div className="flex flex-wrap gap-3">
            {briefing.evidenceCitations.map((cite, idx) => (
              <a
                key={idx}
                href={cite.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-surface hover:bg-background-hover text-slate-300 hover:text-cyan-300 border border-background-border transition-colors"
              >
                <LinkIcon className="w-3 h-3 text-cyan-400" />
                <span>{cite.title}</span>
                <ExternalLink className="w-2.5 h-2.5 text-slate-500" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
