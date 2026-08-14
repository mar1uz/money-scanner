import React, { useEffect, useState } from 'react';
import { NewsItem, NewsCategory } from '../types.js';
import { fetchNews } from '../services/api.js';
import { Newspaper, ExternalLink, ShieldCheck, Filter } from 'lucide-react';

export const NewsFeedView: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  const categories = ['ALL', 'Regulation', 'Institutional', 'Protocol', 'Macro', 'Security'];

  useEffect(() => {
    setLoading(true);
    fetchNews(30, selectedCat !== 'ALL' ? selectedCat : undefined)
      .then(res => setNews(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCat]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background-card/80 border border-background-border rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2 font-mono">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>CATEGORY:</span>
          </div>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCat(c)}
              className={`px-3 py-1 text-xs font-mono rounded-lg transition-all border ${
                selectedCat === c
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-glow-cyan font-bold'
                  : 'bg-background-surface text-slate-400 border-background-border hover:text-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <span className="text-xs font-mono text-slate-400">
          Showing {news.length} verified stories
        </span>
      </div>

      {/* News List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-mono">Aggregating crypto news feeds...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="cyber-glass rounded-xl p-5 border border-background-border hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-cyan-400">{item.source}</span>
                    <span>•</span>
                    <span>{new Date(item.publishedAt).toLocaleTimeString()}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-bold ${
                    item.sentiment === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {item.sentiment}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors flex items-start justify-between gap-2 mb-2">
                  <span>{item.title}</span>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 flex-shrink-0 mt-0.5" />
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.summary}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-background-border text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  {item.mentionedSymbols.map(s => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                      ${s}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Credibility: {(item.credibilityScore * 100).toFixed(0)}%</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
