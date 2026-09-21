import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  CryptoCriteriaFilter,
  CryptoCriteriaStatus,
  CryptoFourCriteriaScan,
  CryptoFourCriteriaAsset,
  StockCriteriaFilter,
  StockCriteriaStatus,
  StockBusinessQualityScan,
  MarketIntelligenceReport,
  MarketIntelligenceScope,
  XPostItem
} from '../types.js';
import {
  askAIAnalyst,
  fetchCryptoFourCriteriaScan,
  lookupCryptoFourCriteria,
  fetchStockBusinessQualityScan,
  fetchMarketIntelligence,
  fetchXPosts
} from '../services/api.js';
import { useLanguage } from '../i18n.js';
import { AssetLink, useAssetNavigation, useDelegatedAssetNavigation } from './AssetNavigation.js';
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
  ChevronDown,
  Flame,
  Radar,
  RefreshCw,
  Coins,
  CandlestickChart,
  Gem,
  Globe2,
  ShieldAlert,
  FileText,
  CheckCircle2,
  CircleHelp,
  Activity,
  Network,
  Banknote,
  HandCoins,
  Award,
  Scale,
  PieChart,
  ShieldCheck
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
    // Cash tags use delegated in-app navigation to the Money Line chart.
    .replace(/\$([A-Z][A-Z0-9.]{1,14})\b/g, '<button type="button" data-asset-symbol="$1" class="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 underline-offset-2">$$$1</button>')
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

const looksLikeTokenAddress = (query: string) => {
  const value = query.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
};

const shouldLookupOnDexScreener = (query: string, localMatchCount: number) => {
  const normalized = query.trim();
  if (normalized.length < 2) return false;
  return looksLikeTokenAddress(normalized) || localMatchCount === 0;
};

/* ─── Main Component ─── */
export const AIBriefingView: React.FC = () => {
  const { language } = useLanguage();
  const navigateAsset = useAssetNavigation();
  const handleDelegatedAssetClick = useDelegatedAssetNavigation();
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
  const [criteriaScan, setCriteriaScan] = useState<CryptoFourCriteriaScan | null>(null);
  const [loadingCriteriaScan, setLoadingCriteriaScan] = useState(false);
  const [criteriaScanError, setCriteriaScanError] = useState<string | null>(null);
  const [criteriaFilter, setCriteriaFilter] = useState<CryptoCriteriaFilter>('leaders');
  const [criteriaSearch, setCriteriaSearch] = useState('');
  const [dexLookupAssets, setDexLookupAssets] = useState<CryptoFourCriteriaAsset[]>([]);
  const [loadingDexLookup, setLoadingDexLookup] = useState(false);
  const [dexLookupError, setDexLookupError] = useState<string | null>(null);

  const [stockCriteriaScan, setStockCriteriaScan] = useState<StockBusinessQualityScan | null>(null);
  const [loadingStockCriteriaScan, setLoadingStockCriteriaScan] = useState(false);
  const [stockCriteriaScanError, setStockCriteriaScanError] = useState<string | null>(null);
  const [stockCriteriaFilter, setStockCriteriaFilter] = useState<StockCriteriaFilter>('top-pick');
  const [stockCriteriaSearch, setStockCriteriaSearch] = useState('');
  const [isBriefingCollapsed, setIsBriefingCollapsed] = useState(false);
  const [isCryptoQualityCollapsed, setIsCryptoQualityCollapsed] = useState(false);
  const [isStockQualityCollapsed, setIsStockQualityCollapsed] = useState(false);
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

  const loadCriteriaScan = useCallback(async (forceRefresh = false) => {
    if (loadingCriteriaScan) return;
    setLoadingCriteriaScan(true);
    setCriteriaScanError(null);
    try {
      setCriteriaScan(await fetchCryptoFourCriteriaScan(forceRefresh));
    } catch (error: any) {
      setCriteriaScanError(error?.message || (language === 'ro' ? 'Scanarea nu a putut fi finalizată.' : 'The scan could not be completed.'));
    } finally {
      setLoadingCriteriaScan(false);
    }
  }, [language, loadingCriteriaScan]);

  useEffect(() => {
    const query = criteriaSearch.trim();
    const localMatchCount = (criteriaScan?.assets || []).filter(asset => {
      const haystack = `${asset.symbol} ${asset.name}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    }).length;
    if (!shouldLookupOnDexScreener(query, localMatchCount)) {
      setDexLookupAssets([]);
      setDexLookupError(null);
      setLoadingDexLookup(false);
      return;
    }
    let cancelled = false;
    setLoadingDexLookup(true);
    setDexLookupError(null);
    const timer = window.setTimeout(() => {
      void lookupCryptoFourCriteria(query)
        .then(assets => {
          if (!cancelled) setDexLookupAssets(assets);
        })
        .catch(error => {
          if (!cancelled) {
            setDexLookupAssets([]);
            setDexLookupError(error instanceof Error ? error.message : 'DexScreener lookup failed');
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingDexLookup(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [criteriaSearch, criteriaScan]);

  const loadStockCriteriaScan = useCallback(async (forceRefresh = false) => {
    if (loadingStockCriteriaScan) return;
    setLoadingStockCriteriaScan(true);
    setStockCriteriaScanError(null);
    try {
      setStockCriteriaScan(await fetchStockBusinessQualityScan(forceRefresh));
    } catch (error: any) {
      setStockCriteriaScanError(error?.message || (language === 'ro' ? 'Scanarea calității acțiunilor nu a putut fi finalizată.' : 'The stock quality scan could not be completed.'));
    } finally {
      setLoadingStockCriteriaScan(false);
    }
  }, [language, loadingStockCriteriaScan]);

  useEffect(() => {
    if (scope === 'stocks' && !stockCriteriaScan && !loadingStockCriteriaScan) {
      void loadStockCriteriaScan(false);
    }
  }, [scope, stockCriteriaScan, loadingStockCriteriaScan, loadStockCriteriaScan]);

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
        ? '## 🧠 Întreabă AI Briefing\n\nRaportul macro și narațiunile fundamentate în surse sunt afișate mai sus. Aici poți cere o analiză suplimentară pentru un activ, sector sau risc.'
        : '## 🧠 Ask AI Briefing\n\nThe grounded macro and narrative report is shown above. Ask for additional analysis on an asset, sector or risk here.',
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
      className="ai-post-card rounded-xl bg-[var(--t-surface-raised)] p-3.5 space-y-2"
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
              <AssetLink key={s} symbol={s} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] font-mono font-semibold">
                ${s}
              </AssetLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ─── Render: AI Message ─── */
  const renderAIMessage = (msg: ChatMessage) => (
    <div className="space-y-4 animate-fade-slide-up" onClick={handleDelegatedAssetClick}>
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--t-surface-raised)] hover:bg-[var(--t-surface-raised)] text-slate-300 hover:text-purple-300 border border-white/[0.06] hover:border-purple-500/30 text-[11px] transition-all"
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

  const criteriaTone = (status: CryptoCriteriaStatus) => {
    if (status === 'pass') return 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300';
    if (status === 'watch') return 'border-amber-500/25 bg-amber-500/[0.08] text-amber-300';
    if (status === 'fail') return 'border-rose-500/25 bg-rose-500/[0.07] text-rose-300';
    return 'border-slate-500/20 bg-slate-500/[0.05] text-slate-500';
  };

  const renderCryptoCriteriaScanner = () => {
    if (scope !== 'crypto' || (!criteriaScan && !loadingCriteriaScan && !criteriaScanError)) return null;
    if (loadingCriteriaScan && !criteriaScan) {
      return (
        <section className="rounded-[30px] border border-cyan-500/20 bg-cyan-500/[0.04] p-5 animate-pulse">
          <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold">
            <Activity className="w-4 h-4 animate-spin" />
            {language === 'ro' ? 'Verific top 200 și corelez datele fundamentale…' : 'Scanning the top 200 and matching fundamental data…'}
          </div>
          <p className="mt-2 text-xs text-slate-500">CoinGecko/CoinPaprika market cap · DefiLlama TVL, fees, revenue, holders revenue</p>
        </section>
      );
    }
    if (!criteriaScan) {
      return (
        <section className="rounded-[30px] border border-rose-500/20 bg-rose-500/[0.05] p-4">
          <p className="text-sm text-rose-300">{criteriaScanError}</p>
          <button onClick={() => void loadCriteriaScan(true)} className="mt-3 inline-flex items-center gap-2 text-xs text-slate-200">
            <RefreshCw className="w-3.5 h-3.5" /> {language === 'ro' ? 'Reîncearcă scanarea' : 'Retry scan'}
          </button>
        </section>
      );
    }

    const normalizedSearch = criteriaSearch.trim().toLowerCase();
    const localMatches = (criteriaScan.assets || []).filter(asset => {
      if (!normalizedSearch) {
        if (criteriaFilter === 'all-four' && asset.classification !== 'all-four') return false;
        if (criteriaFilter === 'first-three' && !['all-four', 'first-three'].includes(asset.classification)) return false;
      }
      return !normalizedSearch || asset.symbol.toLowerCase().includes(normalizedSearch) || asset.name.toLowerCase().includes(normalizedSearch);
    });
    // Selection semantics: only coins that actually generate observable
    // fees/revenue are listed; unmeasured coins never show a misleading 0.
    const isMeasured = (asset: CryptoFourCriteriaAsset) =>
      (asset.metrics.fees30d || 0) > 0 || (asset.metrics.revenue30d || 0) > 0 || (asset.metrics.holdersRevenue30d || 0) > 0;
    const measuredMatches = localMatches.filter(isMeasured);
    const unmeasuredSearchMatches = normalizedSearch ? localMatches.filter(asset => !isMeasured(asset)) : [];
    const remoteMatches = dexLookupAssets.filter(asset =>
      !localMatches.some(local => local.symbol === asset.symbol && local.name.toLowerCase() === asset.name.toLowerCase())
    );
    const matchingAssets = normalizedSearch ? [...remoteMatches, ...measuredMatches] : measuredMatches;
    const visibleAssets = matchingAssets.slice(0, 50);
    const measuredCount = (criteriaScan.assets || []).filter(isMeasured).length;
    const statusIcon = (status: CryptoCriteriaStatus) => status === 'pass'
      ? <CheckCircle2 className="w-3 h-3" />
      : status === 'unknown'
        ? <CircleHelp className="w-3 h-3" />
        : <Activity className="w-3 h-3" />;
    const criterionIcons = [Activity, Network, Banknote, HandCoins];
    const criterionLabels = language === 'ro'
      ? ['Creștere', 'Efect de rețea', 'Venit sustenabil', 'Valoare către holderi']
      : ['Growth', 'Network effect', 'Sustainable revenue', 'Holder value'];
    const englishExplanations: Record<CryptoCriteriaStatus, string[]> = {
      pass: [
        'TVL or annualized fee run-rate is accelerating by at least 5%.',
        'Relevant economic activity plus TVL or multi-chain reach; this is a proxy, not an exact user count.',
        'Revenue is material and present across the 24h, 7d and 30d windows.',
        'DefiLlama reports buyback/burn, direct distribution or revenue-funded staking.'
      ],
      watch: [
        'Activity is stable or growing slowly and needs monitoring.',
        'Usage is measurable, but the network-effect proxy threshold is not yet met.',
        'Revenue exists but is too small, irregular or recent for confirmation.',
        'The mechanism exists, but observed value is still small or irregular.'
      ],
      fail: [
        'The activity proxy is contracting versus the comparable period.',
        'The network-effect proxy is not met.',
        'Tracked activity produces no retained protocol revenue in this window.',
        'Revenue exists, but no value transfer to token holders is reported.'
      ],
      unknown: [
        'No comparable free user/activity series is available.',
        'The free source has no comparable usage evidence for this token.',
        'No comparable DefiLlama observation exists for this token.',
        'Without observed revenue, fee sharing or distribution cannot be confirmed.'
      ]
    };
    const localizedValue = (value: string) => language === 'ro' ? value : value
      .replace('Date insuficiente', 'Insufficient data')
      .replace('$0 observat', '$0 observed')
      .replace(/\/ 30z/g, '/ 30d');
    const methodology = language === 'ro' ? criteriaScan.methodology : [
      'Growth: 7-day TVL change or fee acceleration (7d run-rate versus 30d).',
      'Network effect: fees >= $1M/30d plus TVL or multi-chain reach; a proxy, not exact active users.',
      'Sustainable revenue: revenue >= $1M/30d present across 24h, 7d and 30d windows; for L1s (BTC, ETH, SOL) chain fees to validators/miners are used.',
      'Holder value: buyback/burn, distributions or revenue-funded staking >= $100K/30d reported by DefiLlama.',
      'Selection: only coins with observable fees/revenue or reported buyback/burn are listed; sorted by criteria passed, then revenue run-rate (7d vs 30d), then rank - not absolute size.'
    ];

    return (
      <section className="rounded-[30px] border border-cyan-500/20 bg-[var(--t-surface)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsCryptoQualityCollapsed(prev => !prev)}
            className="flex items-start gap-2.5 text-left group focus:outline-none transition cursor-pointer"
          >
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 group-hover:border-cyan-500/40 group-hover:bg-cyan-500/20 transition">
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isCryptoQualityCollapsed ? '-rotate-90' : ''}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Radar className="w-4 h-4 text-cyan-300" />
                <h3 className="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-300 transition">
                  {language === 'ro' ? 'Crypto Business Quality · 4 Criterii de Selecție' : 'Crypto Business Quality · 4 Selection Criteria'}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                  Top 200
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 max-w-3xl font-sans">
                {language === 'ro'
                  ? (isCryptoQualityCollapsed ? 'Apasă pentru a extinde analiza celor 4 criterii de selecție' : 'Scannerul transpune criteriile fundamentale (Creștere, Efect de rețea, Venit sustenabil, Valoare către holderi) în praguri verificabile.')
                  : (isCryptoQualityCollapsed ? 'Click to expand 4-criteria selection analysis' : 'Scanner evaluates the 4 fundamental criteria: Growth, Network Effect, Sustainable Revenue, and Holder Value.')}
              </p>
            </div>
          </button>

          <button
            onClick={() => void loadCriteriaScan(true)}
            disabled={loadingCriteriaScan}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCriteriaScan ? 'animate-spin' : ''}`} />
            <span>{language === 'ro' ? 'Scanează din nou' : 'Scan again'}</span>
          </button>
        </div>

        {!isCryptoQualityCollapsed && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                [language === 'ro' ? 'Evaluate' : 'Measured', measuredCount, 'text-cyan-300'],
                ['4 / 4', criteriaScan.allFourCount, 'text-emerald-300'],
                [language === 'ro' ? 'Primele 3' : 'First 3', criteriaScan.firstThreeCount, 'text-amber-300'],
                [language === 'ro' ? 'Fără date' : 'No data', criteriaScan.scannedCount - measuredCount, 'text-slate-500']
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3">
                  <span className="block text-[9px] font-mono uppercase text-slate-600">{label}</span>
                  <span className={`block mt-1 text-xl font-mono font-black ${tone}`}>{value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-1 overflow-x-auto">
                {([
                  ['leaders', language === 'ro' ? 'Top scor' : 'Top score'],
                  ['all-four', '4 / 4'],
                  ['first-three', language === 'ro' ? 'Primele 3' : 'First 3']
                ] as [CryptoCriteriaFilter, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setCriteriaFilter(id)} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold ${criteriaFilter === id ? 'bg-purple-500/20 text-purple-200' : 'text-slate-500'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] px-3">
                <Search className={`w-3.5 h-3.5 ${loadingDexLookup ? 'animate-pulse text-cyan-300' : 'text-slate-600'}`} />
                <input value={criteriaSearch} onChange={event => setCriteriaSearch(event.target.value)} placeholder={language === 'ro' ? 'Ticker sau adresă (DexScreener)…' : 'Ticker or contract (DexScreener)…'} className="w-full bg-transparent py-2 text-xs text-slate-200 placeholder-slate-600 outline-none" />
              </div>
            </div>

            <div className="space-y-2.5">
              {visibleAssets.map(asset => {
                const criteria = Object.values(asset.criteria);
                return (
                  <article
                    key={asset.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateAsset({ symbol: asset.symbol, marketClass: 'crypto', coinGeckoId: asset.coinGeckoId })}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigateAsset({ symbol: asset.symbol, marketClass: 'crypto', coinGeckoId: asset.coinGeckoId });
                      }
                    }}
                    className="cursor-pointer rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3 sm:p-4 transition-colors hover:border-cyan-500/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {asset.image ? <img src={asset.image} alt="" className="w-8 h-8 rounded-full bg-white/[0.04]" loading="lazy" /> : <Coins className="w-8 h-8 text-slate-600" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-100">${asset.symbol}</span>
                            <span className="text-[10px] font-mono text-slate-600">{asset.marketCapRank > 0 ? `#${asset.marketCapRank}` : asset.id.startsWith('dex:') ? 'DexScreener' : ''}</span>
                          </div>
                          <span className="block text-[10px] text-slate-500 truncate">{asset.name}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-lg font-mono font-black ${asset.passedCriteria >= 3 ? 'text-emerald-300' : asset.score >= 50 ? 'text-amber-300' : 'text-slate-400'}`}>{asset.score}</span>
                        <span className="text-[9px] text-slate-600"> / 100 · {asset.passedCriteria}/4 pass</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
                      {criteria.map((item, index) => {
                        const Icon = criterionIcons[index];
                        return (
                          <div key={item.label} title={language === 'ro' ? item.explanation : englishExplanations[item.status][index]} className={`rounded-lg border p-2.5 ${criteriaTone(item.status)}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide"><Icon className="w-3 h-3" />{criterionLabels[index]}</span>
                              {statusIcon(item.status)}
                            </div>
                            <span className="block mt-1.5 text-[11px] font-mono text-slate-200">{localizedValue(item.value)}</span>
                            <p className="mt-1 text-[9px] leading-relaxed text-slate-500">{language === 'ro' || asset.id.startsWith('dex:') ? item.explanation : englishExplanations[item.status][index]}</p>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
              {loadingDexLookup && <p className="py-3 text-center text-xs text-cyan-300">{language === 'ro' ? 'Caut pe DexScreener și evaluez cele 4 criterii…' : 'Searching DexScreener and scoring the 4 criteria…'}</p>}
              {dexLookupError && !loadingDexLookup && <p className="py-3 text-center text-xs text-rose-300">{dexLookupError}</p>}
              {visibleAssets.length === 0 && !loadingDexLookup && <p className="py-5 text-center text-xs text-slate-500">{normalizedSearch ? (language === 'ro' ? 'Nicio monedă găsită în top 200 sau pe DexScreener.' : 'No coin found in the top 200 or on DexScreener.') : (language === 'ro' ? 'Nicio monedă nu îndeplinește filtrul în datele curente.' : 'No coin matches this filter in current data.')}</p>}
              {unmeasuredSearchMatches.length > 0 && (
                <p className="py-2 text-center text-[10px] text-slate-500">
                  {language === 'ro'
                    ? `Fără fees/revenue sau buyback raportat, nu pot fi evaluate: ${unmeasuredSearchMatches.slice(0, 5).map(asset => asset.symbol).join(', ')}${unmeasuredSearchMatches.length > 5 ? ` +${unmeasuredSearchMatches.length - 5}` : ''}`
                    : `No observable fees/revenue or buyback, not scorable: ${unmeasuredSearchMatches.slice(0, 5).map(asset => asset.symbol).join(', ')}${unmeasuredSearchMatches.length > 5 ? ` +${unmeasuredSearchMatches.length - 5}` : ''}`}
                </p>
              )}
              {matchingAssets.length > visibleAssets.length && (
                <p className="py-1 text-center text-[10px] text-slate-600">
                  {language === 'ro' ? `Afișate ${visibleAssets.length} din ${matchingAssets.length} monede evaluate` : `Showing ${visibleAssets.length} of ${matchingAssets.length} measured coins`}
                </p>
              )}
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <div className="space-y-1">
                {methodology.map(item => <p key={item} className="text-[9px] text-slate-600 leading-relaxed">• {item}</p>)}
              </div>
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                {criteriaScan.sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-2 py-1 text-[9px] text-slate-500 hover:text-cyan-300"><ExternalLink className="w-2.5 h-2.5" />{source.domain}</a>)}
              </div>
            </div>
            <p className="text-[9px] text-slate-600">{language === 'ro' ? criteriaScan.disclaimer : 'Fundamental research scanner, not a buy signal. A pass means the current proxy threshold is met; it does not mean the investment will be profitable.'}</p>
          </>
        )}
      </section>
    );
  };

  const renderStockCriteriaScanner = () => {
    if (loadingStockCriteriaScan && !stockCriteriaScan) {
      return (
        <section className="rounded-[30px] border border-purple-500/20 bg-purple-500/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-purple-300">
            <Award className="w-4 h-4 animate-spin" />
            {language === 'ro' ? 'Evaluez calitatea și profitabilitatea acțiunilor…' : 'Analyzing stock business quality and profitability…'}
          </div>
          <p className="mt-2 text-xs text-slate-500">Rapoarte 10-K/10-Q · Marje, ROE, FCF, Bilanț, Evaluare & Moat</p>
        </section>
      );
    }
    if (!stockCriteriaScan) {
      if (stockCriteriaScanError) {
        return (
          <section className="rounded-[30px] border border-rose-500/20 bg-rose-500/[0.05] p-4">
            <p className="text-sm text-rose-300">{stockCriteriaScanError}</p>
            <button onClick={() => void loadStockCriteriaScan(true)} className="mt-3 inline-flex items-center gap-2 text-xs text-slate-200">
              <RefreshCw className="w-3.5 h-3.5" /> {language === 'ro' ? 'Reîncearcă scanarea' : 'Retry scan'}
            </button>
          </section>
        );
      }
      return null;
    }

    const normalizedSearch = stockCriteriaSearch.trim().toLowerCase();
    const matchingAssets = stockCriteriaScan.assets.filter(asset => {
      if (stockCriteriaFilter === 'top-pick' && asset.score < 80 && asset.classification !== 'top-pick') return false;
      if (stockCriteriaFilter === 'all-passed' && asset.passedCriteria !== 6 && asset.classification !== 'all-passed') return false;
      if (stockCriteriaFilter === 'high-profitability' && ((asset.metrics.netMargin || 0) < 20 || (asset.metrics.roe || 0) < 15)) return false;
      if (stockCriteriaFilter === 'growth-fcf' && ((asset.metrics.revenueGrowthYoY || 0) < 10 || (asset.metrics.freeCashFlow || 0) <= 0)) return false;
      if (stockCriteriaFilter === 'dividend-value' && (asset.metrics.dividendYield || 0) < 1.5) return false;
      return !normalizedSearch || asset.symbol.toLowerCase().includes(normalizedSearch) || asset.name.toLowerCase().includes(normalizedSearch);
    });
    const visibleAssets = matchingAssets.slice(0, normalizedSearch ? 50 : 30);

    const statusIcon = (status: StockCriteriaStatus) => status === 'pass'
      ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
      : status === 'watch'
        ? <Activity className="w-3 h-3 text-amber-400" />
        : status === 'fail'
          ? <ShieldAlert className="w-3 h-3 text-rose-400" />
          : <CircleHelp className="w-3 h-3 text-slate-500" />;

    const stockCriterionKeys = ['profitability', 'capitalEfficiency', 'growth', 'solvency', 'freeCashFlow', 'valuation'] as const;
    const stockCriterionLabels = language === 'ro'
      ? ['Profitabilitate', 'Eficiență Capital', 'Creștere', 'Sănătate Financiară', 'Free Cash Flow', 'Evaluare & Moat']
      : ['Profitability', 'Capital Efficiency', 'Growth', 'Financial Health', 'Free Cash Flow', 'Valuation & Moat'];

    const criteriaTone = (status: StockCriteriaStatus) => status === 'pass'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : status === 'watch'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : status === 'fail'
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          : 'border-white/[0.08] bg-white/[0.02] text-slate-400';

    return (
      <section className="rounded-[30px] border border-purple-500/25 bg-[var(--t-surface)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsStockQualityCollapsed(prev => !prev)}
            className="flex items-start gap-2.5 text-left group focus:outline-none transition cursor-pointer"
          >
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-purple-500/25 bg-purple-500/10 text-purple-300 group-hover:border-purple-500/40 group-hover:bg-purple-500/20 transition">
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isStockQualityCollapsed ? '-rotate-90' : ''}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Award className="w-4 h-4 text-purple-300" />
                <h3 className="text-sm sm:text-base font-bold text-slate-100 group-hover:text-purple-300 transition">
                  {language === 'ro' ? 'Stock Business Quality · 6 Criterii & Indicatori Profitabilitate' : 'Stock Business Quality · 6 Criteria & Profitability Indicators'}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
                  Top Picks & Fundamentals
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 max-w-3xl font-sans">
                {language === 'ro'
                  ? (isStockQualityCollapsed ? 'Apasă pentru a extinde analiza calității fundamentale a acțiunilor' : 'Analiză fundamentală detaliată a profitabilității, marjelor nete/operaționale, eficienței capitalului (ROE), creșterii veniturilor/EPS, generării de Free Cash Flow și evaluării PEG.')
                  : (isStockQualityCollapsed ? 'Click to expand stock fundamental quality analysis' : 'In-depth fundamental analysis of operating/net margins, capital efficiency (ROE), revenue/EPS growth, Free Cash Flow generation and PEG valuation.')}
              </p>
            </div>
          </button>

          <button
            onClick={() => void loadStockCriteriaScan(true)}
            disabled={loadingStockCriteriaScan}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-purple-500/25 bg-purple-500/10 text-xs font-semibold text-purple-200 hover:bg-purple-500/20 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStockCriteriaScan ? 'animate-spin' : ''}`} />
            <span>{language === 'ro' ? 'Scanează din nou' : 'Scan again'}</span>
          </button>
        </div>

        {!isStockQualityCollapsed && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                [language === 'ro' ? 'Scanate' : 'Scanned', stockCriteriaScan.scannedCount, 'text-purple-300'],
                [language === 'ro' ? 'Top Recomandate AI' : 'Top AI Picks', stockCriteriaScan.topPicksCount, 'text-emerald-300'],
                [language === 'ro' ? 'Marje & ROE Ridicat' : 'High Margins & ROE', stockCriteriaScan.highProfitabilityCount, 'text-cyan-300'],
                [language === 'ro' ? 'Creștere & FCF' : 'Growth & FCF', stockCriteriaScan.growthFcfCount, 'text-amber-300']
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3">
                  <span className="block text-[9px] font-mono uppercase text-slate-500">{label}</span>
                  <span className={`block mt-1 text-xl font-mono font-black ${tone}`}>{value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-1 overflow-x-auto">
                {([
                  ['top-pick', language === 'ro' ? '🟢 Top Recomandate AI' : '🟢 Top AI Picks'],
                  ['all-passed', language === 'ro' ? '🌟 Toate (6/6)' : '🌟 All 6/6'],
                  ['high-profitability', language === 'ro' ? '💰 Marje Mari & ROE' : '💰 High Margins & ROE'],
                  ['growth-fcf', language === 'ro' ? '🚀 Creștere & FCF' : '🚀 Growth & FCF'],
                  ['dividend-value', language === 'ro' ? '🛡️ Valoare & Dividende' : '🛡️ Value & Dividends']
                ] as [StockCriteriaFilter, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setStockCriteriaFilter(id)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      stockCriteriaFilter === id
                        ? 'bg-purple-500/25 text-purple-200 border border-purple-500/30'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] px-3">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  value={stockCriteriaSearch}
                  onChange={event => setStockCriteriaSearch(event.target.value)}
                  placeholder={language === 'ro' ? 'Caută după simbol sau companie (ex: NVDA, AAPL)…' : 'Search by symbol or company (e.g. NVDA, AAPL)…'}
                  className="w-full bg-transparent py-2 text-xs text-slate-200 placeholder-slate-600 outline-none font-mono"
                />
              </div>
            </div>

            <div className="space-y-3">
              {visibleAssets.map(asset => {
                const criteriaList = stockCriterionKeys.map(k => asset.criteria[k]);
                const verdictTone = asset.score >= 80 ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : asset.score >= 65 ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10';

                return (
                  <article
                    key={asset.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateAsset({ symbol: asset.symbol, marketClass: 'stocks' })}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigateAsset({ symbol: asset.symbol, marketClass: 'stocks' });
                      }
                    }}
                    className="cursor-pointer rounded-xl border border-white/[0.07] bg-[var(--t-surface-raised)] p-3 sm:p-4 transition-all hover:border-purple-500/40 hover:bg-white/[0.02]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 shrink-0">
                          <Award className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-100">${asset.symbol}</span>
                            {asset.sector && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-white/[0.04] border border-white/[0.08] text-slate-400">
                                {asset.sector}
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-500">#{asset.marketCapRank}</span>
                          </div>
                          <span className="block text-[11px] text-slate-400 truncate mt-0.5">{asset.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <div className="hidden sm:block">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${verdictTone}`}>
                            {language === 'ro' ? asset.aiVerdictLabelRo : asset.aiVerdict}
                          </span>
                        </div>
                        <div>
                          <span className={`text-lg font-mono font-black ${asset.score >= 80 ? 'text-emerald-300' : asset.score >= 60 ? 'text-cyan-300' : 'text-amber-300'}`}>
                            {asset.score}
                          </span>
                          <span className="text-[9px] text-slate-500"> / 100 · {asset.passedCriteria}/6 pass</span>
                        </div>
                      </div>
                    </div>

                    {/* AI Thesis snippet */}
                    {asset.aiThesis && (
                      <p className="mt-2.5 text-xs text-slate-300 leading-relaxed bg-purple-500/[0.04] p-2.5 rounded-lg border border-purple-500/15">
                        <strong className="text-purple-300 font-mono">AI Thesis: </strong>
                        {asset.aiThesis}
                      </p>
                    )}

                    {/* Financial Indicators Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 mt-2.5 pt-2.5 border-t border-white/[0.05]">
                      {[
                        { label: language === 'ro' ? 'Marjă Netă' : 'Net Margin', val: asset.metrics.netMargin !== undefined ? `${asset.metrics.netMargin.toFixed(1)}%` : 'N/A' },
                        { label: language === 'ro' ? 'Marjă Op' : 'Op Margin', val: asset.metrics.operatingMargin !== undefined ? `${asset.metrics.operatingMargin.toFixed(1)}%` : 'N/A' },
                        { label: 'ROE', val: asset.metrics.roe !== undefined ? `${asset.metrics.roe.toFixed(1)}%` : 'N/A' },
                        { label: language === 'ro' ? 'Creșt. YoY' : 'Rev YoY', val: asset.metrics.revenueGrowthYoY !== undefined ? `${asset.metrics.revenueGrowthYoY >= 0 ? '+' : ''}${asset.metrics.revenueGrowthYoY.toFixed(1)}%` : 'N/A' },
                        { label: 'FCF', val: asset.metrics.freeCashFlow ? `$${(asset.metrics.freeCashFlow / 1e9).toFixed(1)}B` : 'N/A' },
                        { label: 'Debt/Eq', val: asset.metrics.debtToEquity !== undefined ? asset.metrics.debtToEquity.toFixed(2) : 'N/A' },
                        { label: 'Fwd P/E', val: asset.metrics.forwardPE !== undefined ? `${asset.metrics.forwardPE.toFixed(1)}x` : 'N/A' },
                        { label: 'PEG', val: asset.metrics.pegRatio !== undefined ? asset.metrics.pegRatio.toFixed(2) : 'N/A' }
                      ].map((m, i) => (
                        <div key={i} className="p-1.5 rounded-md bg-[var(--t-surface-raised)] border border-white/[0.04]">
                          <span className="block text-[8px] font-mono text-slate-500 uppercase truncate">{m.label}</span>
                          <span className="block text-[10px] font-mono font-bold text-slate-200">{m.val}</span>
                        </div>
                      ))}
                    </div>

                    {/* 6 Criteria Pills */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mt-2.5">
                      {criteriaList.map((item, index) => (
                        <div key={item.label} className={`rounded-lg border p-2 ${criteriaTone(item.status)}`}>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-tight truncate">
                              {stockCriterionLabels[index]}
                            </span>
                            {statusIcon(item.status)}
                          </div>
                          <span className="block mt-1 text-[10px] font-mono text-slate-200 truncate">{item.value}</span>
                          <p className="mt-0.5 text-[8.5px] leading-tight text-slate-400 line-clamp-2">{item.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
              {visibleAssets.length === 0 && (
                <p className="py-5 text-center text-xs text-slate-500 font-mono">
                  {language === 'ro' ? 'Nicio acțiune nu îndeplinește criteriile filtrului curent.' : 'No stock matches this filter in current data.'}
                </p>
              )}
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <div className="space-y-1">
                {stockCriteriaScan.methodology.map(item => (
                  <p key={item} className="text-[9px] text-slate-600 leading-relaxed">• {item}</p>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                {stockCriteriaScan.sources.map(source => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-2 py-1 text-[9px] text-slate-500 hover:text-purple-300"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {source.domain}
                  </a>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-slate-600">{stockCriteriaScan.disclaimer}</p>
          </>
        )}
      </section>
    );
  };

  const renderIntelligenceDashboard = () => {
    if (loadingIntelligence && !intelligence) {
      return (
        <div className="rounded-[30px] border border-purple-500/20 bg-purple-500/[0.04] p-5 space-y-4 animate-pulse">
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
        <div className="rounded-[30px] border border-rose-500/25 bg-rose-500/[0.06] p-5">
          <p className="text-sm text-rose-300">{intelligenceError || (language === 'ro' ? 'Raportul nu este disponibil.' : 'Report unavailable.')}</p>
          <button onClick={() => void loadIntelligence(true)} className="mt-3 inline-flex items-center gap-2 text-xs text-slate-200">
            <RefreshCw className="w-3.5 h-3.5" /> {language === 'ro' ? 'Încearcă din nou' : 'Try again'}
          </button>
        </div>
      );
    }

    return (
      <div className={`space-y-6 transition-opacity ${loadingIntelligence ? 'opacity-60' : 'opacity-100'}`}>
        <section className="rounded-[30px] border border-purple-500/20 bg-[var(--t-surface)] p-4 sm:p-6">
          <div className="space-y-4">
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
            {intelligence.aiTake && (
              <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 max-w-5xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span className="text-xs font-mono text-cyan-300 uppercase tracking-wider">{intelligence.aiTake.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {intelligence.aiTake.model}</span>
                </div>
                <h3 className="text-base font-bold text-slate-50">{intelligence.aiTake.headline}</h3>
                {intelligence.aiTake.paragraphs.map((paragraph, index) => (
                  <p key={index} className="mt-2 text-sm text-slate-300 leading-relaxed">{paragraph}</p>
                ))}
                {intelligence.aiTake.bullets && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1">
                    {intelligence.aiTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                  </ul>
                )}
              </div>
            )}
            {intelligence.capitalRotation && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 max-w-5xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-mono text-amber-300 uppercase tracking-wider">
                    {language === 'ro' ? 'Rotație de Capital' : 'Capital Rotation'} · {intelligence.capitalRotation.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {intelligence.capitalRotation.model}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-50">{intelligence.capitalRotation.headline}</h3>
                {intelligence.capitalRotation.paragraphs.map((paragraph, index) => (
                  <p key={index} className="mt-2 text-sm text-slate-300 leading-relaxed">{paragraph}</p>
                ))}
                {intelligence.capitalRotation.bullets && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1">
                    {intelligence.capitalRotation.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                  </ul>
                )}
              </div>
            )}

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
                    {narrative.assets.map((asset, assetIdx) => {
                      const assetSymbol = asset.replace(/^[$#]/, '').trim();
                      const lookupKey = assetSymbol.toUpperCase();
                      const change24h = intelligence.assetChanges?.[lookupKey];
                      const hasChange = typeof change24h === 'number' && Number.isFinite(change24h);
                      const isUp = (change24h ?? 0) >= 0;
                      return (
                        <AssetLink key={`${asset}_${assetIdx}`} symbol={assetSymbol} marketClass={scope} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--t-surface-raised)] text-[10px] font-mono text-slate-200">
                          <span>{asset.startsWith('$') || asset.startsWith('#') ? asset : `$${asset}`}</span>
                          {hasChange && (
                            <span className={`font-bold ${isUp ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {isUp ? `+${change24h!.toFixed(2)}%` : `${change24h!.toFixed(2)}%`}
                            </span>
                          )}
                        </AssetLink>
                      );
                    })}
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
                      {item.symbol ? (
                        <AssetLink symbol={item.symbol} marketClass={scope} className="text-left text-sm font-bold text-slate-100">
                          ${item.symbol} · {item.name}
                        </AssetLink>
                      ) : <h4 className="text-sm font-bold text-slate-100">{item.name}</h4>}
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
                <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-lg border border-white/[0.06] bg-[var(--t-surface-raised)] p-2.5 hover:border-cyan-500/25 transition-all">
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
    <div className="flex h-[calc(100vh-var(--header-height)-2rem)] rounded-[30px] overflow-hidden border border-white/[0.06] bg-[var(--t-surface-raised)]">
      {/* ═══ Left Sidebar ═══ */}
      <aside className="hidden lg:flex flex-col w-[240px] bg-[var(--t-surface-raised)] border-r border-white/[0.06] shrink-0">
        {/* Logo Area */}
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-purple-400" />
            </div>
            <span className="font-semibold text-sm text-purple-300">
              AI Briefing
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
        <div className="shrink-0 border-b border-white/[0.06] bg-[rgb(var(--t-surface-raised-rgb)/0.95)] px-3 sm:px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsBriefingCollapsed(prev => !prev)}
              className="flex items-start gap-2.5 text-left group focus:outline-none transition cursor-pointer"
            >
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-purple-500/25 bg-purple-500/10 text-purple-300 group-hover:border-purple-500/40 group-hover:bg-purple-500/20 transition">
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isBriefingCollapsed ? '-rotate-90' : ''}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                  <h1 className="text-sm font-bold text-slate-100 group-hover:text-purple-300 transition">Market Intelligence Briefing</h1>
                  {intelligence && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
                      {intelligence.macroRegime}
                    </span>
                  )}
                </div>
                <p className="hidden sm:block mt-0.5 text-[10px] text-slate-400 font-sans">
                  {language === 'ro'
                    ? (isBriefingCollapsed ? 'Apasă pentru a extinde raportul complet' : 'Macro · Narațiuni · Descoperiri Alpha · Surse verificate')
                    : (isBriefingCollapsed ? 'Click to expand full intelligence report' : 'Macro · Narratives · Alpha discoveries · Grounded sources')}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-1.5">
              {scope === 'crypto' && (
                <button
                  onClick={() => void loadCriteriaScan(Boolean(criteriaScan))}
                  disabled={loadingCriteriaScan}
                  title={language === 'ro' ? 'Verifică top 200 după cele 4 criterii din clip' : 'Check the top 200 against the four video criteria'}
                  className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] text-[10px] sm:text-[11px] font-semibold text-cyan-200 disabled:opacity-45"
                >
                  <Radar className={`w-3.5 h-3.5 ${loadingCriteriaScan ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{language === 'ro' ? '4 criterii · Top 200' : '4 criteria · Top 200'}</span>
                  <span className="sm:hidden">4×200</span>
                </button>
              )}
              {scope === 'stocks' && (
                <button
                  onClick={() => void loadStockCriteriaScan(Boolean(stockCriteriaScan))}
                  disabled={loadingStockCriteriaScan}
                  title={language === 'ro' ? 'Verifică calitatea și profitabilitatea acțiunilor' : 'Check stock business quality and profitability'}
                  className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl border border-purple-500/25 bg-purple-500/[0.08] text-[10px] sm:text-[11px] font-semibold text-purple-200 disabled:opacity-45"
                >
                  <Award className={`w-3.5 h-3.5 ${loadingStockCriteriaScan ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{language === 'ro' ? 'Calitate & Profitabilitate' : 'Quality & Profitability'}</span>
                  <span className="sm:hidden">{language === 'ro' ? 'Calitate' : 'Quality'}</span>
                </button>
              )}
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
          {!isBriefingCollapsed && renderIntelligenceDashboard()}
          {scope === 'crypto' && renderCryptoCriteriaScanner()}
          {scope === 'stocks' && renderStockCriteriaScanner()}

          <div className="flex items-center gap-3 pt-2">
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{language === 'ro' ? 'Întreabă AI Briefing' : 'Ask AI Briefing'}</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {messages.map(msg => (
            <div key={msg.id}>
              {msg.sender === 'user' ? (
                /* User message — right-aligned purple bubble */
                <div className="flex justify-end">
                  <div className="max-w-[70%] bg-purple-500/20 border border-purple-500/30 rounded-[30px] rounded-tr-sm px-5 py-3">
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
        <div className="shrink-0 border-t border-white/[0.06] bg-[var(--t-surface-raised)] px-4 sm:px-8 py-3">
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
              className="flex-1 bg-[var(--t-surface-raised)] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[13.5px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
              disabled={askingAI}
            />
            <button
              onClick={() => handleAskQuestion()}
              disabled={askingAI || !inputQuestion.trim()}
              className="w-10 h-10 min-h-0 rounded-xl bg-purple-500 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
