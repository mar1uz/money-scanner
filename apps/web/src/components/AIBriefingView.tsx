import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AIAnalysisPayload, XPostItem } from '../types.js';
import { fetchAIBriefing, askAIAnalyst, fetchXPosts } from '../services/api.js';
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

/* ─── Quick Inspiration Questions ─── */
const inspirationQuestions = [
  'Cum arată $BTC pe Money Line?',
  'Ce fac balenele pe $ETH?',
  'Top 5 cele mai bullish active acum',
  'Analizează $SOL: sentiment și momentum',
  'Ce spun @lookonchain și @whale_alert?',
  'Care sunt riscurile macro pentru crypto?',
];

/* ─── Main Component ─── */
export const AIBriefingView: React.FC = () => {
  // Chat state
  const [chats, setChats] = useState<SavedChat[]>(() => loadChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [askingAI, setAskingAI] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0); // 0=none, 1=Thought, 2=Searched, 3=Composed
  const [xPostsCache, setXPostsCache] = useState<XPostItem[]>([]);
  const [briefingLoaded, setBriefingLoaded] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load X posts once
  useEffect(() => {
    fetchXPosts().then(setXPostsCache).catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, askingAI, thinkingStep]);

  // Auto-load initial briefing
  useEffect(() => {
    if (briefingLoaded) return;
    setBriefingLoaded(true);

    fetchAIBriefing().then((briefing: AIAnalysisPayload) => {
      const summaryParts = [
        `## 📊 Sinteză de Piață — ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}`,
        '',
        briefing.executiveSummary,
        '',
        '### Factori Structurali Cheie',
        ...briefing.keyDrivers.map((d, i) => `- **0${i + 1}.** ${d}`),
        '',
        '### ✅ Factori Bullish',
        ...briefing.bullishFactors.map(f => `- ${f}`),
        '',
        '### ⚠️ Factori Bearish & Riscuri',
        ...briefing.bearishFactors.map(f => `- ${f}`),
        '',
        '### 🎯 Active de Urmărit',
        ...briefing.assetsToWatch.map(a => `- **$${a.symbol}** (${a.bias}): ${a.thesis}`),
      ];

      const welcomeMsg: ChatMessage = {
        id: 'briefing_auto',
        sender: 'ai',
        text: summaryParts.join('\n'),
        xPosts: xPostsCache.slice(0, 6),
        timestamp: Date.now()
      };

      setMessages([welcomeMsg]);
    }).catch(err => {
      setMessages([{
        id: 'welcome_fallback',
        sender: 'ai',
        text: '## 🧠 Market Scanner AI Analyst\n\nSalut! Sunt analistul tău AI. Întreabă-mă orice despre piața crypto, acțiuni sau commodities — sintetizez semnalele Money Line, postările de pe X și știrile verificate.\n\nÎncearcă una din întrebările de inspirație din stânga sau scrie-mi direct.',
        timestamp: Date.now()
      }]);
    });
  }, [briefingLoaded, xPostsCache]);

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
    setMessages([]);
    setBriefingLoaded(false);
    setTimeout(() => setBriefingLoaded(false), 50); // Force reload briefing
    // Re-trigger briefing load
    fetchAIBriefing().then((briefing) => {
      const summaryParts = [
        `## 📊 Sinteză de Piață — ${new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}`,
        '',
        briefing.executiveSummary,
        '',
        '### Factori Structurali Cheie',
        ...briefing.keyDrivers.map((d: string, i: number) => `- **0${i + 1}.** ${d}`),
      ];
      setMessages([{
        id: 'briefing_auto',
        sender: 'ai',
        text: summaryParts.join('\n'),
        xPosts: xPostsCache.slice(0, 6),
        timestamp: Date.now()
      }]);
    }).catch(() => {
      setMessages([{
        id: 'welcome',
        sender: 'ai',
        text: '## 🧠 Market Scanner AI Analyst\n\nSalut! Întreabă-mă orice despre piața crypto, acțiuni sau commodities.',
        timestamp: Date.now()
      }]);
    });
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
      const res = await askAIAnalyst(question);

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
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
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
