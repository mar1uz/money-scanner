import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MarketIntelligenceReport, MarketIntelligenceScope, XPostItem } from '../types.js';
import { askAIAnalyst, fetchMarketIntelligence, fetchXPosts } from '../services/api.js';
import { useLanguage } from '../i18n.js';
import {
  BrainCircuit,
  Sparkles,
  Send,
  MessageSquare,
  Bot,
  User,
  ExternalLink,
  Plus,
  Search,
  BadgeCheck,
  Heart,
  Repeat2,
  MessageCircle,
  Trash2,
  Clock,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Flame,
  Radar,
  RefreshCw,
  Coins,
  CandlestickChart,
  Gem,
  Globe2,
  ShieldAlert,
  FileText
} from 'lucide-react';

/* ─── Types ─── */
interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  evidence?: { sourceType: string; title: string; url: string }[];
  xPosts?: XPostItem[];
  timestamp: number;
}

interface SavedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

/* ─── Helpers ─── */
const STORAGE_KEY = 'ms360_ai_chats';

function loadChats(): SavedChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChats(chats: SavedChat[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, 30))); } catch {}
}

function generateChatTitle(firstMsg: string): string {
  const clean = firstMsg.replace(/[\n\r]/g, ' ').trim();
  return clean.length > 40 ? clean.slice(0, 40) + '...' : clean;
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'acum';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}z`;
}

/** Simple markdown-to-HTML: bold, headers, lists, tables, line breaks */
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Tables: detect | separated lines
    .replace(/^(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/gm, (_match, header: string, _sep: string, body: string) => {
      const ths = header.split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map((row: string) => {
        const tds = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    // Bullet lists
    .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `<p>${html}</p>`;
}

/* ─── Main Component ─── */
export const AIBriefingView: React.FC = () => {
  const { language } = useLanguage();
  // Chat state
  const [chats, setChats] = useState<SavedChat[]>(() => loadChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [askingAI, setAskingAI] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0); // 0=none, 1=Thought, 2=Searched, 3=Composed
  const [xPostsCache, setXPostsCache] = useState<XPostItem[]>([]);
  const [scope, setScope] = useState<MarketIntelligenceScope>('crypto');
  const [intelligence, setIntelligence] = useState<MarketIntelligenceReport | null>(null);
  const [loadingIntelligence, setLoadingIntelligence] = useState(true);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const inspirationQuestions = language === 'en'
    ? scope === 'crypto'
      ? ['What are the hottest crypto narratives?', 'Analyze $BTC on Money Line', 'Which new crypto launches matter?', 'What are the main crypto macro risks?']
      : scope === 'stocks'
        ? ['What are the hottest stock sectors?', 'Analyze $NVDA and the AI narrative', 'Which earnings catalysts matter?', 'What are the main equity macro risks?']
        : ['What drives gold right now?', 'Compare gold, silver and copper', 'Which metals narrative is emerging?', 'What are the main metals macro risks?']
    : scope === 'crypto'
      ? ['Care sunt cele mai hot narațiuni crypto?', 'Cum arată $BTC pe Money Line?', 'Ce lansări crypto noi contează?', 'Care sunt riscurile macro pentru crypto?']
      : scope === 'stocks'
        ? ['Care sunt cele mai hot sectoare stocks?', 'Analizează $NVDA și narațiunea AI', 'Ce catalizatori de earnings contează?', 'Care sunt riscurile macro pentru acțiuni?']
        : ['Ce influențează aurul acum?', 'Compară aurul, argintul și cuprul', 'Ce narațiune pe metale este emergentă?', 'Care sunt riscurile macro pentru metale?'];

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load X posts once
  useEffect(() => {
    fetchXPosts().then(setXPostsCache).catch(() => {});
  }, []);

  const loadIntelligence = useCallback(async (forceRefresh = false) => {
    setLoadingIntelligence(true);
    setIntelligenceError(null);
    try {
      const report = await fetchMarketIntelligence(scope, language, forceRefresh);
      setIntelligence(report);
    } catch (error: any) {
      setIntelligenceError(error?.message || (language === 'ro' ? 'Analiza nu a putut fi încărcată.' : 'Analysis could not be loaded.'));
    } finally {
      setLoadingIntelligence(false);
    }
  }, [scope, language]);

  useEffect(() => {
    void loadIntelligence(false);
  }, [loadIntelligence]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 1 || askingAI || thinkingStep > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, askingAI, thinkingStep]);

  // Keep the conversational analyst available below the grounded dashboard.
  useEffect(() => {
    if (messages.length > 0 || activeChatId) return;
    setMessages([{
      id: 'welcome',
      sender: 'ai',
      text: language === 'ro'
        ? '## 🧠 Întreabă AI Analyst\n\nRaportul macro și narațiunile fundamentate în surse sunt afișate mai sus. Aici poți cere o analiză suplimentară pentru un activ, sector sau risc.'
        : '## 🧠 Ask AI Analyst\n\nThe grounded macro and narrative report is shown above. Ask for additional analysis on an asset, sector or risk here.',
      timestamp: Date.now()
    }]);
  }, [messages.length, activeChatId, language]);

  // Persist chats to localStorage
  const persistChat = useCallback((chatId: string, msgs: ChatMessage[]) => {
    setChats(prev => {
      const existing = prev.find(c => c.id === chatId);
      let updated: SavedChat[];
      if (existing) {
        updated = prev.map(c => c.id === chatId ? { ...c, messages: msgs } : c);
      } else {
        const firstUserMsg = msgs.find(m => m.sender === 'user');
        const title = firstUserMsg ? generateChatTitle(firstUserMsg.text) : 'Conversație nouă';
        updated = [{ id: chatId, title, messages: msgs, createdAt: Date.now() }, ...prev];
      }
      saveChats(updated);
      return updated;
    });
  }, []);

  // Create new chat
  const handleNewChat = () => {
    const newId = `chat_${Date.now()}`;
    setActiveChatId(newId);
    setMessages([{
      id: `welcome_${Date.now()}`,
      sender: 'ai',
      text: language === 'ro'
        ? '## 🧠 Conversație nouă\n\nÎntreabă despre un activ, o narațiune sau un risc macro.'
        : '## 🧠 New conversation\n\nAsk about an asset, a narrative or a macro risk.',
      timestamp: Date.now()
    }]);
  };

  // Load saved chat
  const handleLoadChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChatId(chatId);
      setMessages(chat.messages);
    }
  };

  // Delete saved chat
  const handleDeleteChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats(prev => {
      const updated = prev.filter(c => c.id !== chatId);
      saveChats(updated);
      return updated;
    });
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
    }
  };

  // Ask AI
  const handleAskQuestion = async (qText?: string) => {
    const question = (qText || inputQuestion).trim();
    if (!question || askingAI) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: question,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputQuestion('');
    setAskingAI(true);
    setThinkingStep(1);

    // Ensure we have a chat ID
    const chatId = activeChatId || `chat_${Date.now()}`;
    if (!activeChatId) setActiveChatId(chatId);

    // Simulate thinking steps
    const thinkTimer1 = setTimeout(() => setThinkingStep(2), 800);
    const thinkTimer2 = setTimeout(() => setThinkingStep(3), 1800);

    try {
      const res = await askAIAnalyst(question, scope, language);

      clearTimeout(thinkTimer1);
      clearTimeout(thinkTimer2);
      setThinkingStep(0);

      // Find relevant X posts for this answer
      const relatedPosts = xPostsCache.filter(p =>
        res.relatedSymbols?.some((s: string) =>
          p.mentionedSymbols?.includes(s) ||
          p.text?.toUpperCase().includes(`$${s}`)
        )
      ).slice(0, 4);

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: res.answer,
        evidence: res.evidenceCitations,
        xPosts: relatedPosts.length > 0 ? relatedPosts : undefined,
        timestamp: Date.now()
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);
      persistChat(chatId, finalMessages);
    } catch (err: any) {
      clearTimeout(thinkTimer1);
      clearTimeout(thinkTimer2);
      setThinkingStep(0);

      const errMsg: ChatMessage = {
        id: `ai_err_${Date.now()}`,
        sender: 'ai',
        text: `Nu am putut finaliza analiza: ${err.message}. Te rog încearcă din nou.`,
        timestamp: Date.now()
      };

      const finalMessages = [...newMessages, errMsg];
      setMessages(finalMessages);
    } finally {
      setAskingAI(false);
    }
  };

  /* ─── Render: Thinking Indicators ─── */
  const renderThinkingSteps = () => {
    if (thinkingStep === 0) return null;

    const steps = [
      { icon: '🧠', label: 'Thought', active: thinkingStep >= 1 },
      { icon: '🔍', label: `Searched posts (${xPostsCache.length}x)`, active: thinkingStep >= 2 },
      { icon: '📄', label: 'Composed response', active: thinkingStep >= 3 },
    ];

    return (
      <div className="flex flex-col gap-2 py-3 pl-2">
        {steps.map((step, idx) => (
          step.active && (
            <div
              key={idx}
              className="flex items-center gap-2.5 text-sm text-slate-400 animate-think-step"
              style={{ animationDelay: `${idx * 0.15}s` }}
            >
              <span className="text-base">{step.icon}</span>
              <span className="font-mono text-[13px]">{step.label}</span>
              {idx === thinkingStep - 1 && (
                <div className="flex gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          )
        ))}
      </div>
    );
  };

  /* ─── Render: Clickable X Post Card ─── */
  const renderXPostCard = (post: XPostItem) => (
    <div
      key={post.id}
      onClick={() => window.open(post.url, '_blank', 'noopener,noreferrer')}
      className="ai-post-card rounded-xl bg-[#161b22] p-3.5 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1DA1F2]/15 flex items-center justify-center text-[#1DA1F2] text-[11px] font-bold shrink-0">
            𝕏
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[13px] text-slate-200">{post.authorName}</span>
              {post.authorVerified && <BadgeCheck className="w-3.5 h-3.5 text-[#1DA1F2]" />}
            </div>
            <span className="text-[11px] text-slate-500">{post.authorHandle} · {formatTimeAgo(post.timestamp)}</span>
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
      </div>

      <p className="text-[13px] text-slate-300 leading-relaxed line-clamp-3">{post.text}</p>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-white/[0.04]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes?.toLocaleString()}</span>
          <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" /> {post.reposts?.toLocaleString()}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post.replies?.toLocaleString()}</span>
        </div>
        {post.mentionedSymbols && post.mentionedSymbols.length > 0 && (
          <div className="flex gap-1">
            {post.mentionedSymbols.slice(0, 3).map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] font-mono font-semibold">
                ${s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ─── Render: AI Message ─── */
  const renderAIMessage = (msg: ChatMessage) => (
    <div className="space-y-4 animate-fade-slide-up">
      {/* Rich formatted response */}
      <div
        className="ai-chat-prose text-[13.5px] font-sans leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
      />

      {/* Embedded X Post Cards (clickable to tweet source) */}
      {msg.xPosts && msg.xPosts.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
            <span className="text-[#1DA1F2]">𝕏</span>
            <span>Postări relevante de pe X — click pentru sursă</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {msg.xPosts.map(renderXPostCard)}
          </div>
        </div>
      )}

      {/* Evidence citations */}
      {msg.evidence && msg.evidence.length > 0 && (
        <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block">Surse verificate</span>
          <div className="flex flex-wrap gap-1.5">
            {msg.evidence.map((cite, idx) => (
              <a
                key={idx}
                href={cite.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161b22] hover:bg-[#1c2333] text-slate-300 hover:text-purple-300 border border-white/[0.06] hover:border-purple-500/30 text-[11px] transition-all"
              >
                <ExternalLink className="w-2.5 h-2.5 text-purple-400" />
                <span className="line-clamp-1 max-w-[200px]">{cite.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const narrativeTone = (status: MarketIntelligenceReport['narratives'][number]['status']) => {
    if (status === 'HOT') return 'border-orange-500/35 bg-orange-500/[0.08] text-orange-300';
    if (status === 'BULLISH') return 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-300';
    if (status === 'EMERGING') return 'border-purple-500/30 bg-purple-500/[0.07] text-purple-300';
    if (status === 'BEARISH') return 'border-rose-500/30 bg-rose-500/[0.07] text-rose-300';
    if (status === 'COOLING') return 'border-amber-500/30 bg-amber-500/[0.07] text-amber-300';
    return 'border-slate-500/25 bg-slate-500/[0.06] text-slate-300';
  };

  const renderIntelligenceDashboard = () => {
    if (loadingIntelligence && !intelligence) {
      return (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] p-5 space-y-4 animate-pulse">
          <div className="h-5 w-56 rounded bg-white/[0.08]" />
          <div className="h-3 w-full rounded bg-white/[0.05]" />
          <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {[0, 1, 2].map(item => <div key={item} className="h-24 rounded-xl bg-white/[0.04]" />)}
          </div>
          <div className="text-xs font-mono text-purple-300/70 flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5" />
            {language === 'ro' ? 'Gemini caută și verifică sursele curente…' : 'Gemini is searching and verifying current sources…'}
          </div>
        </div>
      );
    }

    if (!intelligence) {
      return (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-5">
          <p className="text-sm text-rose-300">{intelligenceError || (language === 'ro' ? 'Raportul nu este disponibil.' : 'Report unavailable.')}</p>
          <button onClick={() => void loadIntelligence(true)} className="mt-3 inline-flex items-center gap-2 text-xs text-slate-200">
            <RefreshCw className="w-3.5 h-3.5" /> {language === 'ro' ? 'Încearcă din nou' : 'Try again'}
          </button>
        </div>
      );
    }

    return (
      <div className={`space-y-6 transition-opacity ${loadingIntelligence ? 'opacity-60' : 'opacity-100'}`}>
        <section className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.10] via-[#111827] to-cyan-500/[0.05] p-4 sm:p-6">
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="relative space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${intelligence.mode === 'ai-grounded' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : intelligence.mode === 'ai-sources' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                  <BadgeCheck className="w-3 h-3" />
                  {intelligence.mode === 'ai-grounded'
                    ? 'Gemini + Google Search'
                    : intelligence.mode === 'ai-sources'
                      ? (language === 'ro' ? 'Gemini + surse verificate' : 'Gemini + verified sources')
                      : (language === 'ro' ? 'Fallback local' : 'Local fallback')}
                </span>
                <span className="text-slate-500">{intelligence.confidenceScore}% confidence</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {new Date(intelligence.generatedAt).toLocaleString(language === 'ro' ? 'ro-RO' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Globe2 className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-mono text-cyan-300 uppercase tracking-wider">{intelligence.macroRegime}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-50 leading-tight">{intelligence.headline}</h2>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-5xl">{intelligence.executiveSummary}</p>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Radar className="w-4 h-4 text-cyan-300" />
            <h3 className="text-sm font-bold text-slate-100">{language === 'ro' ? 'Motoare macro' : 'Macro drivers'}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {intelligence.macroDrivers.map((driver, index) => {
              const bullish = driver.impact === 'Bullish';
              const bearish = driver.impact === 'Bearish';
              return (
                <article key={`${driver.title}_${index}`} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="text-sm font-semibold text-slate-100">{driver.title}</h4>
                    <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${bullish ? 'bg-emerald-500/10 text-emerald-300' : bearish ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {bullish ? <TrendingUp className="w-3 h-3" /> : bearish ? <TrendingDown className="w-3 h-3" /> : <Radar className="w-3 h-3" />}
                      {driver.impact}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{driver.analysis}</p>
                  <p className="mt-3 text-[10px] font-mono text-slate-600 uppercase">{driver.horizon}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-orange-300" />
            <h3 className="text-sm font-bold text-slate-100">{language === 'ro' ? 'Narațiuni: hot, emergente și bearish' : 'Narratives: hot, emerging and bearish'}</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {intelligence.narratives.map((narrative, index) => (
              <article key={`${narrative.name}_${index}`} className={`rounded-xl border p-4 ${narrativeTone(narrative.status)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-100">{narrative.name}</h4>
                      <span className="text-[9px] font-black tracking-wider">{narrative.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300 leading-relaxed">{narrative.summary}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xl font-mono font-black">{Math.round(narrative.score)}</span>
                    <span className="block text-[9px] opacity-60">/100</span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-400"><strong className="text-slate-300">{language === 'ro' ? 'De ce acum:' : 'Why now:'}</strong> {narrative.whyNow}</p>
                {narrative.assets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {narrative.assets.map(asset => <span key={asset} className="px-2 py-0.5 rounded-md bg-black/20 text-[10px] font-mono text-slate-200">{asset.startsWith('$') ? asset : `$${asset}`}</span>)}
                  </div>
                )}
                {(narrative.catalysts.length > 0 || narrative.risks.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/[0.07]">
                    <div>
                      <span className="text-[9px] font-mono uppercase text-emerald-300/80">Catalysts</span>
                      {narrative.catalysts.slice(0, 2).map(item => <p key={item} className="mt-1 text-[10px] text-slate-400 leading-relaxed">+ {item}</p>)}
                    </div>
                    <div>
                      <span className="text-[9px] font-mono uppercase text-rose-300/80">Risks</span>
                      {narrative.risks.slice(0, 2).map(item => <p key={item} className="mt-1 text-[10px] text-slate-400 leading-relaxed">− {item}</p>)}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-300" />
            <h3 className="text-sm font-bold text-slate-100">Alpha Discovery Radar</h3>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            {language === 'ro' ? 'Lansări, conexiuni cu fondatori/platforme și catalizatori descoperiți prin căutare; nu sunt semnale de cumpărare.' : 'Launches, founder/platform links and catalysts found through search; these are not buy signals.'}
          </p>
          {intelligence.discoveries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {intelligence.discoveries.map((item, index) => (
                <article key={`${item.name}_${index}`} className="rounded-xl border border-purple-500/20 bg-purple-500/[0.045] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">{item.symbol ? `$${item.symbol} · ` : ''}{item.name}</h4>
                      <span className="text-[10px] text-purple-300 font-mono">{item.category}</span>
                    </div>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${item.status === 'Verified' ? 'border-emerald-500/25 text-emerald-300 bg-emerald-500/10' : item.status === 'Unverified' ? 'border-rose-500/25 text-rose-300 bg-rose-500/10' : 'border-amber-500/25 text-amber-300 bg-amber-500/10'}`}>{item.status}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-300 leading-relaxed">{item.whyItMatters}</p>
                  {item.notableConnection && <p className="mt-2 text-[11px] text-cyan-300/90"><strong>Connection:</strong> {item.notableConnection}</p>}
                  <p className="mt-2 text-[11px] text-slate-400"><strong className="text-slate-300">Catalyst:</strong> {item.catalyst}</p>
                  {item.risks[0] && <p className="mt-2 text-[10px] text-rose-300/75">Risk: {item.risks[0]}</p>}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-4 text-xs text-slate-500">
              {language === 'ro' ? 'Nu au fost găsite descoperiri suficient de bine susținute de surse în această rulare.' : 'No sufficiently sourced discoveries were found in this run.'}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-4">
          <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.035] p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-rose-300" />
              <h3 className="text-sm font-bold text-slate-100">Risk Radar</h3>
            </div>
            <div className="space-y-2">
              {intelligence.riskRadar.map((risk, index) => <p key={`${risk}_${index}`} className="text-[11px] text-slate-400 leading-relaxed">• {risk}</p>)}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-300" />
                <h3 className="text-sm font-bold text-slate-100">{language === 'ro' ? 'Surse folosite' : 'Sources used'}</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-600">{intelligence.sources.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {intelligence.sources.map(source => (
                <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-2.5 hover:border-cyan-500/25 transition-all">
                  <ExternalLink className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[11px] text-slate-300 group-hover:text-cyan-200 line-clamp-2">{source.title}</span>
                    <span className="block text-[9px] font-mono text-slate-600 mt-0.5 truncate">{source.domain}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <p className="text-[10px] text-slate-600 leading-relaxed">{intelligence.disclaimer}</p>
      </div>
    );
  };

  const scopeOptions: { id: MarketIntelligenceScope; label: string; icon: typeof Coins }[] = [
    { id: 'crypto', label: 'Crypto', icon: Coins },
    { id: 'stocks', label: language === 'ro' ? 'Acțiuni' : 'Stocks', icon: CandlestickChart },
    { id: 'metals', label: language === 'ro' ? 'Metale' : 'Metals', icon: Gem }
  ];

  return (
    <div className="flex h-[calc(100vh-var(--header-height)-2rem)] rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0d1117]">
      {/* ═══ Left Sidebar ═══ */}
      <aside className="hidden lg:flex flex-col w-[240px] bg-[#161b22] border-r border-white/[0.06] shrink-0">
        {/* Logo Area */}
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-500/30 to-cyan-500/30 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-purple-400" />
            </div>
            <span className="font-semibold text-sm bg-gradient-to-r from-purple-300 to-cyan-300 bg-clip-text text-transparent">
              AI Analyst
            </span>
          </div>

          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] hover:border-purple-500/30 transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>New chat</span>
          </button>
        </div>

        {/* Inspiration */}
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 px-1">
            <Lightbulb className="w-3 h-3 text-amber-400" />
            <span>Inspirație</span>
          </div>
          <div className="space-y-0.5">
            {inspirationQuestions.slice(0, 4).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleAskQuestion(q)}
                disabled={askingAI}
                className="w-full text-left px-2.5 py-1.5 text-[12px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] rounded-lg transition-all truncate disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 px-1">
            <Clock className="w-3 h-3" />
            <span>Chats</span>
          </div>
          {chats.length === 0 ? (
            <p className="text-[11px] text-slate-600 px-1">Nicio conversație salvată</p>
          ) : (
            <div className="space-y-0.5">
              {chats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => handleLoadChat(chat.id)}
                  className={`ai-sidebar-chat-item group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer ${
                    activeChatId === chat.id ? 'active' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="text-[12px] text-slate-400 truncate">{chat.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-rose-400 transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ═══ Main Chat Area ═══ */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="shrink-0 border-b border-white/[0.06] bg-[#0d1117]/95 px-3 sm:px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-300" />
                <h1 className="text-sm font-bold text-slate-100">Market Intelligence Briefing</h1>
              </div>
              <p className="hidden sm:block mt-0.5 text-[10px] text-slate-600">Macro · Narratives · Alpha discoveries · Grounded sources</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
                {scopeOptions.map(option => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setScope(option.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${scope === option.id ? 'bg-purple-500/20 text-purple-200 border border-purple-500/25' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => void loadIntelligence(true)}
                disabled={loadingIntelligence}
                title={language === 'ro' ? 'Reîmprospătează analiza' : 'Refresh analysis'}
                className="w-9 h-9 rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 hover:text-cyan-300 disabled:opacity-40 flex items-center justify-center transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingIntelligence ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
          {renderIntelligenceDashboard()}

          <div className="flex items-center gap-3 pt-2">
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">{language === 'ro' ? 'Întreabă analistul' : 'Ask the analyst'}</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {messages.map(msg => (
            <div key={msg.id}>
              {msg.sender === 'user' ? (
                /* User message — right-aligned purple bubble */
                <div className="flex justify-end">
                  <div className="max-w-[70%] bg-gradient-to-r from-purple-600/30 to-violet-600/25 border border-purple-500/30 rounded-2xl rounded-tr-sm px-5 py-3">
                    <p className="text-[13.5px] text-slate-100 leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ) : (
                /* AI message — full-width, rich content */
                <div className="max-w-4xl">
                  {renderAIMessage(msg)}
                </div>
              )}
            </div>
          ))}

          {/* Thinking indicators */}
          {askingAI && renderThinkingSteps()}

          <div ref={chatEndRef} />
        </div>

        {/* ═══ Bottom Input Bar ═══ */}
        <div className="shrink-0 border-t border-white/[0.06] bg-[#0d1117] px-4 sm:px-8 py-3">
          {/* Mobile quick questions */}
          <div className="lg:hidden flex gap-1.5 mb-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {inspirationQuestions.slice(0, 3).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleAskQuestion(q)}
                disabled={askingAI}
                className="shrink-0 px-2.5 py-1 text-[11px] text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg border border-white/[0.06] transition-all whitespace-nowrap disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 max-w-4xl">
            <input
              ref={inputRef}
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAskQuestion();
                }
              }}
              placeholder='Întreabă despre o monedă... ex: "Ce se întâmplă cu Solana?"'
              className="flex-1 bg-[#161b22] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[13.5px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
              disabled={askingAI}
            />
            <button
              onClick={() => handleAskQuestion()}
              disabled={askingAI || !inputQuestion.trim()}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-500 to-violet-500 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shadow-lg shadow-purple-500/20 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
