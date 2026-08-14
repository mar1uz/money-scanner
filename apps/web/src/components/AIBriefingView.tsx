import React, { useEffect, useState, useRef } from 'react';
import { AIAnalysisPayload } from '../types.js';
import { fetchAIBriefing, askAIAnalyst, fetchXPosts } from '../services/api.js';
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
  ChevronRight,
  Twitter,
  BadgeCheck,
  Flame,
  Layers
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
  const [xPosts, setXPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive AI Analyst Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Salut! Sunt analistul tău AI pentru piața crypto. Sintetizez în timp real semnalele Money Line pentru cele 50 de active, tranzacțiile balenelor de pe X (ex: @lookonchain, @whale_alert) și știrile verificate. Ce dorești să analizăm?',
      timestamp: Date.now()
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [askingAI, setAskingAI] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    'Cum arată $BTC pe Money Line și ce fac balenele?',
    'Analizează $SOL: momentum tehnic și sentiment pe X',
    'Care sunt cele mai bullish active din Top 50 acum?',
    'Ce spun @lookonchain și @WuBlockchain despre piață?'
  ];

  const loadBriefing = () => {
    setLoading(true);
    Promise.all([
      fetchAIBriefing(),
      fetchXPosts().catch(() => [])
    ])
      .then(([briefingRes, postsRes]) => {
        setBriefing(briefingRes);
        setXPosts(postsRes);
      })
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
      setChatMessages(prev => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          sender: 'ai',
          text: `Nu am putut finaliza analiza în acest moment: ${err.message}. Te rog încearcă din nou.`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setAskingAI(false);
    }
  };

  if (loading && !briefing) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-3">
        <BrainCircuit className="w-8 h-8 mx-auto animate-pulse text-purple-400" />
        <p className="text-sm">Generare sinteză AI Market Analyst &amp; Agregare X Intelligence...</p>
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h1 className="text-xl font-bold font-mono text-slate-100">AI Market Analyst &amp; X Intelligence</h1>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Sinteză automată multi-timeframe • Agregare Alpha de la top conturi Crypto X • Q&amp;A Interactiv
          </p>
        </div>

        <button
          onClick={loadBriefing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-surface hover:bg-background-hover text-slate-300 border border-background-border transition-colors text-xs font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Regenerează Sinteza</span>
        </button>
      </div>

      {/* Interactive AI Analyst Studio & Chat */}
      <div className="cyber-glass rounded-2xl border border-purple-500/30 bg-purple-500/5 shadow-2xl overflow-hidden">
        <div className="p-4 bg-background-surface/80 border-b border-background-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-mono">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-slate-100">Ask AI Market Analyst (Q&amp;A Live cu Citări de pe X)</span>
          </div>
          <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
            Money Line + Top Conturi X + Știri Reale
          </span>
        </div>

        {/* Chat History Messages */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[400px] overflow-y-auto">
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
                    <span className="text-slate-400 font-bold block">Surse &amp; Linkuri Verificabile de pe X / Știri:</span>
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
                <span>Analizez datele Money Line, postările top conturilor de pe X și fluxurile de știri...</span>
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
            placeholder="Întreabă AI-ul despre orice monedă (ex: $BTC, $SOL), tweet-uri balene sau regim de piață..."
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

      {/* Top Crypto Twitter (X) Alpha Feeds */}
      <div className="cyber-glass rounded-2xl p-6 border border-background-border space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono">
            <Twitter className="w-5 h-5 text-[#1DA1F2]" />
            <h2 className="font-bold text-base text-slate-100">Top Postări &amp; Alpha de la Conturi Crypto Verificate</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Surse: @lookonchain, @WuBlockchain, @whale_alert, @tier10k, @WatcherGuru, @Ali_charts
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {xPosts.map((post: any) => (
            <div
              key={post.id}
              className="p-4 rounded-xl bg-background-surface/90 border border-background-border hover:border-[#1DA1F2]/40 transition-all space-y-2.5 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-[#1DA1F2]/20 flex items-center justify-center text-[#1DA1F2] text-[10px] font-bold">
                      𝕏
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-slate-200 font-mono">{post.authorName}</span>
                        <BadgeCheck className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{post.authorHandle}</span>
                    </div>
                  </div>

                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/30 text-[10px] font-mono font-bold transition-all"
                  >
                    <span>Citește Tweet</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {post.text}
                </p>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <span>❤️ {post.likeCount?.toLocaleString()}</span>
                  <span>🔁 {post.repostCount?.toLocaleString()}</span>
                </div>
                <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-semibold">
                  {post.symbols?.join(', ') || 'Macro'}
                </span>
              </div>
            </div>
          ))}
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
    </div>
  );
};
