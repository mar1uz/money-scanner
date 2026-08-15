import React, { useEffect, useState, useMemo } from 'react';
import { XTrendTopic, XPostItem, MarketSectorCategory, ImpactLevel } from '../types.js';
import { fetchXTrends, fetchXPosts } from '../services/api.js';
import {
  Flame,
  ExternalLink,
  ShieldCheck,
  MessageCircle,
  Heart,
  Repeat,
  Sparkles,
  Search,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Globe,
  Building2,
  Cpu,
  Coins,
  Gem,
  Filter,
  ArrowUpDown,
  Share2,
  Clock,
  Radio
} from 'lucide-react';

interface XTrendsViewProps {
  onSelectAsset?: (symbol: string) => void;
}

export const XTrendsView: React.FC<XTrendsViewProps> = ({ onSelectAsset }) => {
  const [trends, setTrends] = useState<XTrendTopic[]>([]);
  const [posts, setPosts] = useState<XPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSector, setActiveSector] = useState<MarketSectorCategory>('all');
  const [activeImpactFilter, setActiveImpactFilter] = useState<'all' | 'breaking' | 'bullish' | 'bearish'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'impact' | 'recent' | 'viral' | 'credibility'>('impact');

  useEffect(() => {
    Promise.all([
      fetchXTrends().catch(() => []),
      fetchXPosts().catch(() => [])
    ]).then(([trendsRes, postsRes]) => {
      setTrends(trendsRes || []);
      setPosts(postsRes || []);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  // Curated authoritative channels directory
  const topChannels = [
    { handle: 'KobeissiLetter', name: 'The Kobeissi Letter', sector: 'Macro & Stocks', url: 'https://x.com/KobeissiLetter', desc: 'Global macroeconomic commentary & Fed analysis', followers: '1.1M' },
    { handle: 'unusual_whales', name: 'Unusual Whales', sector: 'Stocks & Options', url: 'https://x.com/unusual_whales', desc: 'Institutional options flow & market anomalies', followers: '1.8M' },
    { handle: 'WatcherGuru', name: 'Watcher.Guru', sector: 'Crypto & Macro', url: 'https://x.com/WatcherGuru', desc: 'Breaking news, ETF flows & finance flash', followers: '2.6M' },
    { handle: 'GoldTelegraph_', name: 'Gold Telegraph', sector: 'Gold & Metals', url: 'https://x.com/GoldTelegraph_', desc: 'Central bank gold reserves & sovereign debt', followers: '380K' },
    { handle: 'lookonchain', name: 'Lookonchain', sector: 'Crypto Smart Money', url: 'https://x.com/lookonchain', desc: 'On-chain whale accumulation & fund tracking', followers: '495K' },
    { handle: 'StockMKTNewz', name: 'Stock Market News', sector: 'US Equities & Tech', url: 'https://x.com/StockMKTNewz', desc: 'Earnings, AI hardware CapEx & tech news', followers: '680K' }
  ];

  // Helper for relative time formatting
  const getRelativeTime = (timestamp: number) => {
    const diffMin = Math.floor((Date.now() - timestamp) / 60000);
    if (diffMin < 1) return 'Chiar acum';
    if (diffMin < 60) return `acum ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `acum ${diffHours} ore`;
    return `acum ${Math.floor(diffHours / 24)} zile`;
  };

  // Combine and enrich all raw posts from verified stream and sample posts in trends
  const allEnrichedPosts: XPostItem[] = useMemo(() => {
    const map = new Map<string, XPostItem>();
    
    // Add standalone verified posts
    posts.forEach(p => map.set(p.id, p));

    // Add sample posts from trend topics
    trends.forEach(t => {
      (t.samplePosts || []).forEach(p => {
        if (!map.has(p.id)) {
          map.set(p.id, {
            ...p,
            sector: p.sector || t.sector || 'crypto',
            aiSummaryRo: p.aiSummaryRo || t.aiSummaryRo
          });
        }
      });
    });

    return Array.from(map.values());
  }, [posts, trends]);

  // Filtered and Sorted News Posts
  const filteredPosts = useMemo(() => {
    return allEnrichedPosts.filter(post => {
      // Sector filter
      if (activeSector !== 'all' && post.sector !== activeSector) {
        return false;
      }

      // Impact / Sentiment filter
      if (activeImpactFilter === 'breaking' && post.impactLevel !== 'BREAKING') {
        return false;
      }
      if (activeImpactFilter === 'bullish' && post.marketImpact !== 'Bullish') {
        return false;
      }
      if (activeImpactFilter === 'bearish' && post.marketImpact !== 'Bearish') {
        return false;
      }

      // Keyword search filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const textMatch = post.text.toLowerCase().includes(q);
        const authorMatch = post.authorName.toLowerCase().includes(q) || post.authorHandle.toLowerCase().includes(q);
        const aiMatch = (post.aiSummaryRo || '').toLowerCase().includes(q);
        const symbolMatch = post.mentionedSymbols.some(s => s.toLowerCase().includes(q));
        if (!textMatch && !authorMatch && !aiMatch && !symbolMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'recent') {
        return b.timestamp - a.timestamp;
      }
      if (sortBy === 'viral') {
        return (b.likes + b.reposts * 2) - (a.likes + a.reposts * 2);
      }
      if (sortBy === 'credibility') {
        return b.authorCredibilityScore - a.authorCredibilityScore;
      }
      // Default: AI Impact & Virality hybrid
      const scoreA = (a.impactLevel === 'BREAKING' ? 5000 : (a.impactLevel === 'HIGH' ? 3000 : 1000)) + a.likes + a.reposts * 3;
      const scoreB = (b.impactLevel === 'BREAKING' ? 5000 : (b.impactLevel === 'HIGH' ? 3000 : 1000)) + b.likes + b.reposts * 3;
      return scoreB - scoreA;
    });
  }, [allEnrichedPosts, activeSector, activeImpactFilter, searchFilter, sortBy]);

  // Top Breaking story for hero ticker
  const breakingStory = useMemo(() => {
    return allEnrichedPosts.find(p => p.impactLevel === 'BREAKING') || allEnrichedPosts[0];
  }, [allEnrichedPosts]);

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono space-y-4">
        <div className="relative w-12 h-12 mx-auto">
          <Zap className="w-12 h-12 text-cyan-400 animate-pulse" />
        </div>
        <p className="text-base text-slate-200 font-bold">
          Agregatorul AI colectează și analizează cele mai relevante știri și postări de pe X...
        </p>
        <p className="text-xs text-slate-500">
          Clasificare pe 4 sectoare: Macro &amp; Fed, Acțiuni SUA &amp; AI, Metale &amp; Energie, Crypto &amp; Web3
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Hero: AI Intelligence Radar Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-background-card to-blue-950/40 p-6 shadow-2xl backdrop-blur-xl">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-glow-cyan">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              </div>
              <span className="text-xs font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
                AI Social Intelligence • X Market Stream
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">
              Top Știri &amp; Alpha de pe X (Twitter) • Economie, Stocks, Metale &amp; Crypto
            </h1>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Agregatorul AI analizează fluxul de pe X în timp real, elimină spamul și sintetizează contextul economic crucial. Dă click pe orice știre pentru a deschide direct postarea originală pe X.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-background-surface/80 border border-background-border font-mono space-y-0.5 text-center">
              <span className="text-[10px] text-slate-400 uppercase block">Știri Agregate</span>
              <span className="text-base font-bold text-cyan-300">{allEnrichedPosts.length} Surse Verificate</span>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 font-mono space-y-0.5 text-center">
              <span className="text-[10px] text-emerald-400 uppercase block">Sentiment Piață</span>
              <span className="text-base font-bold text-emerald-300 flex items-center justify-center gap-1">
                <TrendingUp className="w-4 h-4" /> 78% Bullish
              </span>
            </div>
          </div>
        </div>

        {/* Breaking News Live Marquee Bar */}
        {breakingStory && (
          <div className="mt-5 pt-4 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1 shrink-0 animate-pulse">
                <Zap className="w-3 h-3 text-rose-400" /> BREAKING X
              </span>
              <span className="text-slate-300 truncate">
                <strong className="text-cyan-300">{breakingStory.authorHandle}:</strong> {breakingStory.text}
              </span>
            </div>

            <a
              href={breakingStory.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all shadow-sm shrink-0"
            >
              <span>Deschide pe X</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Verified Top Intelligence Feeds Strip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Surse Oficiale &amp; Canale Financiare de Top pe X
          </span>
          <span className="text-[10px] font-mono text-slate-500">Link-uri directe verificate</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {topChannels.map((ch) => (
            <a
              key={ch.handle}
              href={ch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-background-card/90 border border-background-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group block space-y-1 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs text-slate-200 group-hover:text-cyan-300 font-mono">
                    @{ch.handle}
                  </span>
                  <CheckCircle className="w-3 h-3 text-cyan-400 fill-cyan-400/20 shrink-0" />
                </div>
                <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </div>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-400 font-mono inline-block">
                {ch.sector}
              </span>
              <p className="text-[10px] text-slate-400 line-clamp-1">{ch.desc}</p>
            </a>
          ))}
        </div>
      </div>

      {/* Control Bar: Sector Tabs, Impact Filters, Search & Sort */}
      <div className="cyber-glass rounded-2xl p-4 border border-background-border space-y-4">
        {/* Sector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all' as const, label: 'Toate Sectoarele (360°)', icon: Globe },
              { id: 'macro' as const, label: 'Macro & Fed', icon: Building2 },
              { id: 'stocks' as const, label: 'Acțiuni SUA & AI', icon: Cpu },
              { id: 'metals' as const, label: 'Metale & Petrol', icon: Gem },
              { id: 'crypto' as const, label: 'Crypto & Web3', icon: Coins }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSector === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSector(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-glow-cyan'
                      : 'bg-background-surface/80 hover:bg-background-hover text-slate-400 hover:text-slate-200 border border-background-border'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Impact Quick Filters */}
          <div className="flex items-center gap-1.5 bg-background-surface/90 border border-background-border p-1 rounded-xl text-xs font-mono">
            <button
              onClick={() => setActiveImpactFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                activeImpactFilter === 'all' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Toate
            </button>
            <button
              onClick={() => setActiveImpactFilter('breaking')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                activeImpactFilter === 'breaking' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold' : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              ⚡ Breaking
            </button>
            <button
              onClick={() => setActiveImpactFilter('bullish')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                activeImpactFilter === 'bullish' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              🟢 Bullish
            </button>
          </div>
        </div>

        {/* Search & Sort Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-background-border/60">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrează după: Powell, Nvidia, Aur, Bitcoin, Rate cut, TSLA..."
              className="w-full bg-background-surface border border-background-border rounded-xl pl-8 pr-4 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sortează:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-background-surface border border-background-border rounded-lg px-2.5 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              <option value="impact">Impact AI &amp; Relevanță</option>
              <option value="recent">Cele Mai Noi (Live)</option>
              <option value="viral">Virale (Aprecieri / Retweet-uri)</option>
              <option value="credibility">Credibilitate Sursă</option>
            </select>
          </div>
        </div>
      </div>

      {/* News Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPosts.map((post) => {
          const isBreaking = post.impactLevel === 'BREAKING';
          const isBull = post.marketImpact === 'Bullish';
          const isBear = post.marketImpact === 'Bearish';

          return (
            <div
              key={post.id}
              onClick={() => {
                window.open(post.url, '_blank', 'noopener,noreferrer');
              }}
              className={`cyber-glass rounded-2xl p-5 border transition-all cursor-pointer flex flex-col justify-between space-y-4 group hover:-translate-y-1 hover:shadow-2xl ${
                isBreaking
                  ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/20 via-background-card to-background-card hover:border-rose-500/70 shadow-glow-ruby'
                  : 'border-background-border hover:border-cyan-500/50 hover:shadow-glow-cyan'
              }`}
            >
              <div className="space-y-3.5">
                {/* Card Top: Sector Badge, Impact & Direct X Link */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-bold">
                      {post.sector === 'macro' ? '🏛️ Macro & Fed' :
                       post.sector === 'stocks' ? '📈 Acțiuni SUA' :
                       post.sector === 'metals' ? '🥇 Metale & Mărfuri' : '🪙 Crypto & Web3'}
                    </span>

                    {isBreaking && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1 animate-pulse">
                        <Zap className="w-3 h-3 text-rose-400" /> BREAKING
                      </span>
                    )}

                    {isBull && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3 text-emerald-400" /> Bullish
                      </span>
                    )}
                  </div>

                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 group-hover:text-cyan-300 bg-cyan-500/10 group-hover:bg-cyan-500/20 px-2 py-0.5 rounded-lg border border-cyan-500/30 transition-all shrink-0"
                  >
                    <span>Vezi pe X</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                </div>

                {/* Author Info Bar */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center font-bold text-xs text-cyan-300 font-mono shrink-0">
                      {post.authorHandle.replace('@', '').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-slate-100 group-hover:text-cyan-200 transition-colors">
                          {post.authorName}
                        </span>
                        <CheckCircle className="w-3 h-3 text-cyan-400 fill-cyan-400/20 shrink-0" />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 block">
                        {post.authorHandle} • {(post.authorFollowers / 1000).toFixed(0)}K urmăritori
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {getRelativeTime(post.timestamp)}
                  </span>
                </div>

                {/* AI Romanian Quick Context / TL;DR Box */}
                {post.aiSummaryRo && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-950/50 via-slate-900/80 to-blue-950/40 border border-cyan-500/30 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-cyan-300">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Context &amp; Implicație Piață (AI)</span>
                    </div>
                    <p className="text-xs text-slate-200 font-sans leading-relaxed">
                      {post.aiSummaryRo}
                    </p>
                  </div>
                )}

                {/* Original Post Text */}
                <div className="text-xs text-slate-300 leading-relaxed font-sans bg-background-surface/60 p-3 rounded-xl border border-background-border/50">
                  <p className="line-clamp-4 italic">
                    "{post.text}"
                  </p>
                </div>

                {/* Mentioned Symbols / Cashtags with 1-click Deep Dive Navigation */}
                {post.mentionedSymbols && post.mentionedSymbols.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-slate-500">Active vizate:</span>
                    {post.mentionedSymbols.map((sym) => (
                      <button
                        key={sym}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectAsset) onSelectAsset(sym);
                        }}
                        title={`Deschide analiza Money Line pentru ${sym}`}
                        className="px-2 py-0.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 hover:text-cyan-100 border border-cyan-500/30 text-[10px] font-mono font-bold transition-all flex items-center gap-0.5"
                      >
                        <span>${sym}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Footer: Engagement Stats & Credibility */}
              <div className="pt-3 border-t border-background-border/70 flex items-center justify-between text-xs font-mono text-slate-400">
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-rose-400/90 font-medium">
                    <Heart className="w-3.5 h-3.5 fill-rose-400/20" />
                    {post.likes.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400/90 font-medium">
                    <Repeat className="w-3.5 h-3.5" />
                    {post.reposts.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400 font-medium hidden sm:flex">
                    <MessageCircle className="w-3.5 h-3.5" />
                    {post.replies.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{(post.authorCredibilityScore * 100).toFixed(0)}% Încredere</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPosts.length === 0 && (
        <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-2 cyber-glass rounded-2xl border border-background-border">
          <p>Nicio știre găsită pentru criteriile selectate.</p>
          <button
            onClick={() => {
              setActiveSector('all');
              setActiveImpactFilter('all');
              setSearchFilter('');
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold"
          >
            Resetează Filtrele
          </button>
        </div>
      )}
    </div>
  );
};
