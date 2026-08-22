import React, { useEffect, useState } from 'react';
import { NewsItem, NewsCategory, NewsSynthesisPayload } from '../types.js';
import { fetchNews, fetchNewsSynthesis } from '../services/api.js';
import { useLanguage } from '../i18n.js';
import { Newspaper, ExternalLink, ShieldCheck, Filter, Sparkles, Link2, RefreshCw } from 'lucide-react';

export const NewsFeedView: React.FC = () => {
  const { language } = useLanguage();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [synthesis, setSynthesis] = useState<NewsSynthesisPayload | null>(null);
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [synthesisLoading, setSynthesisLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [synthesisError, setSynthesisError] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);

  const categories = ['ALL', 'Regulation', 'Institutional', 'Protocol', 'Macro', 'Security'];

  useEffect(() => {
    setLoading(true);
    setNewsError(false);
    fetchNews(30, selectedCat !== 'ALL' ? selectedCat : undefined)
      .then(res => setNews(res))
      .catch(() => {
        setNews([]);
        setNewsError(true);
      })
      .finally(() => setLoading(false));
  }, [selectedCat, refreshAttempt]);

  useEffect(() => {
    setSynthesisLoading(true);
    setSynthesisError(false);
    fetchNewsSynthesis(language, selectedCat !== 'ALL' ? selectedCat : undefined)
      .then(setSynthesis)
      .catch(() => {
        setSynthesis(null);
        setSynthesisError(true);
      })
      .finally(() => setSynthesisLoading(false));
  }, [selectedCat, language, refreshAttempt]);

  const sourceById = new Map(synthesis?.sources.map(source => [source.id, source]) || []);

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

      {/* Grounded synthesis: every clickable statement maps to a server-verified source URL. */}
      <section className="relative overflow-hidden rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-950/35 via-background-card to-cyan-950/25 p-5 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/70 to-transparent" />
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-400/20">
              <Sparkles className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {language === 'en' ? 'Grounded AI News Synthesis' : 'Sinteză AI News & Social cu surse'}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1">
                {language === 'en'
                  ? 'Click a statement to open the exact article or social post supporting it.'
                  : 'Apasă pe o afirmație pentru articolul sau postarea socială exactă care o susține.'}
              </p>
            </div>
          </div>
          {synthesis && (
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono border ${
              synthesis.mode === 'ai'
                ? 'text-purple-300 bg-purple-500/10 border-purple-400/30'
                : 'text-cyan-300 bg-cyan-500/10 border-cyan-400/30'
            }`}>
              {synthesis.mode === 'ai' ? `AI · ${synthesis.model || 'Gemini'}` : (language === 'en' ? 'VERIFIED FALLBACK' : 'REZUMAT VERIFICAT')}
            </span>
          )}
          {synthesisError && (
            <button
              type="button"
              onClick={() => setRefreshAttempt(attempt => attempt + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/35 bg-purple-500/10 px-2.5 py-1 text-[10px] font-mono text-purple-200 hover:bg-purple-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              {language === 'en' ? 'RETRY' : 'REÎNCEARCĂ'}
            </button>
          )}
        </div>

        {synthesisLoading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-slate-400 font-mono">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
            {language === 'en' ? 'Reading verified sources...' : 'Citesc sursele verificate...'}
          </div>
        ) : synthesis?.segments.length ? (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-slate-100">{synthesis.headline}</h3>
            <div className="space-y-2.5">
              {synthesis.segments.map((segment, index) => {
                const citedSources = segment.sourceIds.map(id => sourceById.get(id)).filter(Boolean);
                if (!citedSources.length) return null;
                return (
                  <div
                    key={`${citedSources[0]!.id}_${index}`}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-700/70 bg-slate-950/35 px-3.5 py-3 text-xs leading-relaxed text-slate-300 transition-all hover:border-purple-400/45 hover:bg-purple-500/5 hover:text-slate-100"
                  >
                    <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-purple-400" />
                    <p className="min-w-0 flex-1">
                      {segment.text}{' '}
                      {citedSources.map((source, sourceIndex) => (
                        <React.Fragment key={source!.id}>
                          {sourceIndex > 0 ? ' ' : ''}
                          <a
                            href={source!.url}
                            target="_blank"
                            rel="noreferrer"
                            title={`${source!.sourceType}: ${source!.title}`}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] text-purple-300 underline decoration-purple-400/60 underline-offset-2 hover:bg-purple-500/15 hover:text-purple-100"
                          >
                            [{source!.author || source!.sourceType}]
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </React.Fragment>
                      ))}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {synthesis.sources.map(source => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded-md bg-slate-900/70 border border-slate-700 text-[10px] font-mono text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30"
                >
                  {source.sourceType} · {source.author || source.title.slice(0, 28)}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-5 text-xs text-slate-400">
            {synthesisError
              ? (language === 'en' ? 'The verified-source summary is temporarily unavailable. Please retry.' : 'Sinteza cu surse verificate este temporar indisponibilă. Încearcă din nou.')
              : (language === 'en' ? 'No verified sources are available for this category yet.' : 'Nu există încă surse verificate pentru această categorie.')}
          </p>
        )}
      </section>

      {/* News List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-mono">Aggregating crypto news feeds...</div>
      ) : newsError ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-6 text-center text-xs font-mono text-amber-200">
          {language === 'en' ? 'News sources are temporarily unavailable. Please retry.' : 'Sursele de știri sunt temporar indisponibile. Încearcă din nou.'}
        </div>
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
                  {item.sentiment && (
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      item.sentiment === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.sentiment}
                    </span>
                  )}
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
                {typeof item.credibilityScore === 'number' && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Credibility: {(item.credibilityScore * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
