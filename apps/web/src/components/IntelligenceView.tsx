import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, ExternalLink, RefreshCw } from 'lucide-react';
import { IntelligenceBriefFilters, IntelligenceBriefPayload, IntelligencePeriod, IntelligenceSector, IntelligenceSourceFilter } from '@money-scanner/shared';
import { fetchIntelligenceBrief } from '../services/api.js';
import { useLanguage } from '../i18n.js';
import { Segmented } from './ui/Segmented.js';

type IntelligenceViewProps = {
  initialSource?: IntelligenceSourceFilter;
};

const sectors: Array<{ value: IntelligenceSector; ro: string; en: string }> = [
  { value: 'all', ro: 'Toate', en: 'All' },
  { value: 'crypto', ro: 'Crypto', en: 'Crypto' },
  { value: 'stocks', ro: 'Acțiuni', en: 'Stocks' },
  { value: 'macro', ro: 'Macro', en: 'Macro' },
  { value: 'metals', ro: 'Metale', en: 'Metals' }
];

const periods: Array<{ value: IntelligencePeriod; ro: string; en: string }> = [
  { value: '24h', ro: '24h', en: '24h' },
  { value: '7d', ro: '7 zile', en: '7 days' }
];

const sources: Array<{ value: IntelligenceSourceFilter; ro: string; en: string }> = [
  { value: 'all', ro: 'Toate sursele', en: 'All sources' },
  { value: 'news', ro: 'Știri', en: 'News' },
  { value: 'social', ro: 'Social', en: 'Social' }
];

const readUrlFilters = (initialSource: IntelligenceSourceFilter): IntelligenceBriefFilters => {
  const params = new URLSearchParams(window.location.search);
  const sector = params.get('sector');
  const period = params.get('period');
  const source = params.get('source');
  return {
    sector: sectors.some(item => item.value === sector) ? sector as IntelligenceSector : 'all',
    period: periods.some(item => item.value === period) ? period as IntelligencePeriod : '24h',
    source: sources.some(item => item.value === source) ? source as IntelligenceSourceFilter : initialSource
  };
};

const formatTime = (timestamp: number | null, language: 'ro' | 'en') => {
  if (!timestamp) return language === 'en' ? 'No source timestamp' : 'Fără dată de sursă';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ro-RO', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(timestamp);
};

export const IntelligenceView: React.FC<IntelligenceViewProps> = ({ initialSource = 'all' }) => {
  const { language } = useLanguage();
  const [filters, setFilters] = useState<IntelligenceBriefFilters>(() => readUrlFilters(initialSource));
  const [brief, setBrief] = useState<IntelligenceBriefPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    const onPopState = () => setFilters(readUrlFilters(initialSource));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [initialSource]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'intelligence');
    params.set('sector', filters.sector);
    params.set('period', filters.period);
    params.set('source', filters.source);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    setLoading(true);
    setError(false);
    setShowFullText(false);
    fetchIntelligenceBrief(filters, language)
      .then(setBrief)
      .catch(() => {
        setBrief(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [filters, language]);

  const updateFilter = <K extends keyof IntelligenceBriefFilters>(key: K, value: IntelligenceBriefFilters[K]) => {
    const next = { ...filters, [key]: value };
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'intelligence');
    params.set('sector', next.sector);
    params.set('period', next.period);
    params.set('source', next.source);
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
    setFilters(next);
  };

  const refresh = async () => {
    setRefreshing(true);
    setError(false);
    try {
      setBrief(await fetchIntelligenceBrief(filters, language, true));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const sourceById = useMemo(() => new Map((brief?.sources || []).map(source => [source.id, source])), [brief]);
  const visibleSegments = showFullText ? brief?.segments || [] : brief?.segments.slice(0, 5) || [];
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, IntelligenceBriefPayload['sources']>();
    for (const source of brief?.sources || []) {
      const list = groups.get(source.sourceType) || [];
      list.push(source);
      groups.set(source.sourceType, list);
    }
    return Array.from(groups.entries());
  }, [brief]);

  const ro = language === 'ro';
  return (
    <div className="space-y-5">
      <header className="intelligence-hero">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <h1 className="intelligence-title">{ro ? 'Ce contează acum' : 'What matters now'}</h1>
            <p className="intelligence-subtitle">{ro ? 'Un rezumat scurt din știri și surse sociale, cu legături directe către informația originală.' : 'One concise briefing from news and social sources, linked directly to the original information.'}</p>
          </div>
        </div>
        <div className="intelligence-meta">
          <Clock3 size={14} />
          <span>{ro ? 'Ultima sursă' : 'Latest source'}: {formatTime(brief?.latestSourceAt || null, language)}</span>
        </div>
      </header>

      <div className="intelligence-filters" aria-label={ro ? 'Filtre Intelligence' : 'Intelligence filters'}>
        <Segmented ariaLabel={ro ? 'Sector' : 'Sector'} size="sm" scrollable value={filters.sector}
          onChange={value => updateFilter('sector', value)}
          options={sectors.map(option => ({ value: option.value, label: ro ? option.ro : option.en }))} />
        <Segmented ariaLabel={ro ? 'Perioadă' : 'Period'} size="sm" scrollable value={filters.period}
          onChange={value => updateFilter('period', value)}
          options={periods.map(option => ({ value: option.value, label: ro ? option.ro : option.en }))} />
        <Segmented ariaLabel={ro ? 'Surse' : 'Sources'} size="sm" scrollable value={filters.source}
          onChange={value => updateFilter('source', value)}
          options={sources.map(option => ({ value: option.value, label: ro ? option.ro : option.en }))} />
      </div>

      <section className="intelligence-brief" aria-live="polite">
        {loading ? (
          <div className="intelligence-state"><RefreshCw className="animate-spin" size={18} /> {ro ? 'Selectez informația relevantă…' : 'Selecting relevant information…'}</div>
        ) : error ? (
          <div className="intelligence-state is-error"><AlertTriangle size={18} /> {ro ? 'Rezumatul nu este disponibil momentan.' : 'The briefing is temporarily unavailable.'}<button type="button" onClick={refresh}>{ro ? 'Reîncearcă' : 'Retry'}</button></div>
        ) : !brief?.segments.length ? (
          <div className="intelligence-state">{ro ? 'Nu există surse suficiente pentru filtrele alese.' : 'There are not enough sources for the selected filters.'}</div>
        ) : (
          <>
            {brief.aiTake && (
              <div className="intelligence-ai-take">
                <div className="intelligence-ai-take-label">{brief.aiTake.source === 'instinct-agent' ? 'Instinct' : 'AI Gateway'} · {brief.aiTake.model}</div>
                <strong>{brief.aiTake.headline}</strong>
                {brief.aiTake.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                {brief.aiTake.bullets && <ul>{brief.aiTake.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
              </div>
            )}
            <p className={`intelligence-summary ${showFullText ? 'is-expanded' : ''}`}>
              {visibleSegments.map((segment, index) => {
                const source = segment.sourceIds.map(id => sourceById.get(id)).find(Boolean);
                return (
                  <React.Fragment key={`${segment.text}-${index}`}>
                    {index > 0 ? ' ' : ''}
                    {source ? (
                      <a href={source.url} target="_blank" rel="noreferrer" title={`${source.sourceType}: ${source.title}`}>{segment.text}</a>
                    ) : segment.text}
                  </React.Fragment>
                );
              })}
            </p>
            <div className="intelligence-actions">
              <span>{brief.sourceCount} {ro ? 'surse citate' : 'cited sources'} · {brief.mode === 'ai' ? `AI${brief.model ? ` · ${brief.model}` : ''}` : (ro ? 'rezumat extractiv' : 'extractive fallback')}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowFullText(value => !value)}>{showFullText ? (ro ? 'Arată compact' : 'Show compact') : (ro ? 'Citește integral' : 'Read full')}</button>
                <button type="button" onClick={() => setShowSources(value => !value)}>{showSources ? (ro ? 'Ascunde sursele' : 'Hide sources') : (ro ? 'Vezi sursele' : 'View sources')}</button>
                <button type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {ro ? 'Actualizează' : 'Refresh'}</button>
              </div>
            </div>
          </>
        )}
      </section>

      {showSources && brief && (
        <section className="intelligence-sources" aria-label={ro ? 'Surse grupate' : 'Grouped sources'}>
          {sourceGroups.map(([group, items]) => (
            <div key={group} className="intelligence-source-group">
              <h2>{group}</h2>
              {items.map(source => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="intelligence-source-row">
                  <span><strong>{source.author || group}</strong><span>{source.title}</span></span>
                  <span>{formatTime(source.publishedAt, language)} <ExternalLink size={13} /></span>
                </a>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
