import React, { useEffect, useState } from 'react';
import { XTrendTopic } from '../types.js';
import { fetchXTrends } from '../services/api.js';
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
  TrendingUp
} from 'lucide-react';

export const XTrendsView: React.FC = () => {
  const [trends, setTrends] = useState<XTrendTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchXTrends()
      .then(res => setTrends(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const topChannels = [
    { handle: 'lookonchain', name: 'Lookonchain (Whale Alpha)', url: 'https://x.com/lookonchain', desc: 'On-chain smart money & whale tracking' },
    { handle: 'WuBlockchain', name: 'Colin Wu (Wu Blockchain)', url: 'https://x.com/WuBlockchain', desc: 'Breaking Asian & Global crypto intelligence' },
    { handle: 'tier10k', name: 'tier10k (DB News)', url: 'https://x.com/tier10k', desc: 'Fast institutional news & filings' },
    { handle: 'WatcherGuru', name: 'Watcher.Guru', url: 'https://x.com/WatcherGuru', desc: 'ETF flows & real-time market updates' },
    { handle: 'whale_alert', name: 'Whale Alert', url: 'https://x.com/whale_alert', desc: 'Large exchange deposits & withdrawals' },
    { handle: 'MessariCrypto', name: 'Messari', url: 'https://x.com/MessariCrypto', desc: 'Sector research & fundamental metrics' }
  ];

  if (loading) {
    return <div className="p-12 text-center text-slate-400 font-mono">Scanning X social stream & clustering real narratives...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="cyber-glass rounded-xl p-5 border border-amber-500/30 bg-amber-500/5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">X (Twitter) Crypto Trend Intelligence</h2>
          </div>
          <p className="text-xs text-slate-400">
            Real-time tracking of authentic crypto narratives, high-velocity cashtags, and verified alpha sources on X.
          </p>
        </div>
        <span className="text-xs font-mono px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
          {trends.length} Active Real Clusters
        </span>
      </div>

      {/* Verified Top Alpha Channels Strip */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          Verified Top Crypto X Intelligence Sources
        </span>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {topChannels.map(ch => (
            <a
              key={ch.handle}
              href={ch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-background-card/80 border border-background-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group block space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200 group-hover:text-cyan-300 font-mono flex items-center gap-1">
                  @{ch.handle}
                </span>
                <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-1">{ch.desc}</p>
            </a>
          ))}
        </div>
      </div>

      {/* Topics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trends.map((topic) => {
          const cleanSymbol = topic.cashtag.replace('$', '');
          const liveSearchUrl = `https://x.com/search?q=%24${cleanSymbol}%20min_faves%3A20&f=live`;

          return (
            <div
              key={topic.id}
              className="cyber-glass rounded-xl p-4 border border-background-border hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                {/* Category & Velocity */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {topic.category}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    Velocity: {topic.velocityScore}
                  </span>
                </div>

                {/* Cashtag & Title */}
                <h3 className="font-bold text-sm text-slate-100 flex items-center justify-between gap-2 mb-1">
                  <span className="text-cyan-300 font-mono">{topic.cashtag}</span>
                  <a
                    href={liveSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open live search for ${topic.cashtag} on X`}
                    className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30 transition-all"
                  >
                    <span>Search on X</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </h3>

                <p className="text-xs text-slate-300 font-mono mt-1">{topic.topic}</p>

                {/* Quality Metrics */}
                <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400 my-2 pt-2 border-t border-background-border/50">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Credibility: {(topic.credibilityScore * 100).toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Sentiment: {topic.sentimentScore > 0 ? `+${topic.sentimentScore}` : topic.sentimentScore}
                  </span>
                </div>
              </div>

              {/* Verified High-Authority Posts */}
              {topic.samplePosts && topic.samplePosts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-background-border">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">Verified Post Stream</span>
                  {topic.samplePosts.slice(0, 1).map((post) => (
                    <div key={post.id} className="p-3 rounded-lg bg-background-surface/90 text-xs space-y-2 border border-background-border/60">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <a
                          href={post.url || `https://x.com/${post.authorHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-slate-100 hover:text-cyan-300 flex items-center gap-1"
                        >
                          <span>@{post.authorHandle}</span>
                          <CheckCircle className="w-3 h-3 text-cyan-400 fill-cyan-400/20" />
                        </a>
                        <a
                          href={post.url || `https://x.com/${post.authorHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline flex items-center gap-0.5 text-[10px]"
                        >
                          <span>Open X Profile</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed font-sans">
                        "{post.text}"
                      </p>
                      <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                        <span className="flex items-center gap-1 text-rose-400"><Heart className="w-3 h-3" /> {post.likes.toLocaleString()}</span>
                        <span className="flex items-center gap-1 text-emerald-400"><Repeat className="w-3 h-3" /> {post.reposts.toLocaleString()}</span>
                        <span className="text-slate-500">Verified Alpha</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
