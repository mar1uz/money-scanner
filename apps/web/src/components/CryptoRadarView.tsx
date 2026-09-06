import React, { useEffect, useMemo, useState } from 'react';
import type { RadarSnapshot, RadarReportSummary, RadarRow } from '@money-scanner/shared';
import { radarTokenChartUrl } from '@money-scanner/shared';
import { requestCsrfToken } from '../services/firebase-auth.js';
import { sortRadarRows, type RadarSortDirection, type RadarSortKey } from './crypto-radar-sort.js';
import { getRadarSecurityStatus } from './crypto-radar-security.js';

interface Payload {
  latest: RadarSnapshot | null;
  collection: RadarSnapshot | null;
  history: RadarReportSummary[];
  delivery: { status: string; detail?: string } | null;
  telegramConfigured: boolean;
}

const usd = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 6 }).format(n));
const compact = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n));
const date = (n: number | null) => (n ? new Date(n).toLocaleString('ro-RO') : '—');
const change = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
const color = (n: number | null) => (n === null ? 'text-slate-500' : n >= 0 ? 'text-emerald-400' : 'text-rose-400');

export const CryptoRadarView: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [data, setData] = useState<Payload | null>(null);
  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(null);
  const [selection, setSelection] = useState('latest');
  const [chain, setChain] = useState('all');
  const [section, setSection] = useState<'main' | 'microcaps'>('main');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [sort, setSort] = useState<{ key: RadarSortKey; direction: RadarSortDirection }>({ key: 'rank', direction: 'asc' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/radar', { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Radar indisponibil (${r.status})`);
      const body = await r.json();
      setData(body);
      if (selection === 'latest') setSnapshot(body.latest || body.collection);
      else if (selection === 'collection') setSnapshot(body.collection);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const select = async (value: string) => {
    setSelection(value);
    setExpanded(null);
    if (value === 'latest') {
      setSnapshot(data?.latest || data?.collection || null);
      return;
    }
    if (value === 'collection') {
      setSnapshot(data?.collection || null);
      return;
    }
    try {
      const r = await fetch(`/api/radar/reports/${value}`);
      if (!r.ok) throw new Error('Raport indisponibil');
      setSnapshot(await r.json());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const scan = async () => {
    setScanning(true);
    setError('');
    try {
      const csrf = await requestCsrfToken();
      const r = await fetch('/api/radar/scan', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        signal: AbortSignal.timeout(240000)
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Scanare eșuată');
      setSnapshot(b);
      setSelection('collection');
      const refresh = await fetch('/api/radar');
      if (refresh.ok) setData(await refresh.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const rawRows = section === 'main' ? (snapshot?.rows || []) : (snapshot?.microcaps || []);
  const rows = useMemo(
    () => sortRadarRows(rawRows.filter(r => chain === 'all' || r.chain === chain), sort.key, sort.direction),
    [rawRows, chain, sort]
  );

  const mainHeaders: { key: RadarSortKey; label: string }[] = [
    { key: 'rank', label: 'Loc' },
    { key: 'name', label: 'Monedă / rețea' },
    { key: 'price', label: 'Preț USD' },
    { key: 'priceChange24h', label: 'Δ 24H' },
    { key: 'firstPrice', label: 'Primul raport' },
    { key: 'changeFirst', label: 'Δ inițial' },
    { key: 'changePrevious', label: 'Δ precedent' },
    { key: 'marketCap', label: 'Market cap' },
    { key: 'volume24h', label: 'Volum 24h' },
    { key: 'liquidity', label: 'Lichiditate' },
    { key: 'top10HoldersPct', label: 'Securitate / Hold.' },
    { key: 'score', label: 'Scor / social' }
  ];

  const microHeaders: { key: RadarSortKey; label: string }[] = [
    { key: 'rank', label: 'Loc' },
    { key: 'name', label: 'Monedă / rețea' },
    { key: 'price', label: 'Preț USD' },
    { key: 'priceChange24h', label: 'Δ 24H' },
    { key: 'marketCap', label: 'Market cap' },
    { key: 'volume24h', label: 'Volum 24h' },
    { key: 'estimatedFees24h', label: 'Comisioane 24h' },
    { key: 'liquidity', label: 'Lichiditate' },
    { key: 'top10HoldersPct', label: 'Securitate / Hold.' },
    { key: 'score', label: 'Scor / utilitate' }
  ];

  const headers = section === 'main' ? mainHeaders : microHeaders;

  const changeSort = (key: RadarSortKey) => {
    setExpanded(null);
    setSort(current => (current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  };

  const renderSecurityBadge = (r: RadarRow) => {
    const sec = getRadarSecurityStatus(r);
    if (sec.level === 'unknown') {
      return <span className="text-slate-500 text-xs" title={sec.title}>—</span>;
    }
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${sec.level === 'danger' ? 'font-semibold' : 'font-medium'} ${sec.badgeColorClass}`}
        title={sec.title}
      >
        {sec.badgeLabel}
      </span>
    );
  };

  const renderUtilityBadges = (r: RadarRow) => {
    const tags = r.utilityTags || [];
    if (!tags.length && !r.hasBuyback) {
      return <span className="text-slate-500 text-xs">Comisioane pool</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {tags.slice(0, 2).map(tag => (
          <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            {tag}
          </span>
        ))}
        {r.hasBuyback && !tags.some(t => t.includes('Buyback')) && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/30">
            🔥 Buyback
          </span>
        )}
      </div>
    );
  };

  const details = (r: RadarRow) => (
    <div className="grid md:grid-cols-2 gap-5 p-4 text-xs">
      <div className="space-y-2.5">
        <p className="font-semibold text-slate-200">Dovezi, Evoluție & Audit Securitate</p>
        <p className="break-all text-slate-400">Contract: {r.address}</p>
        <p>Prima includere: {date(r.firstReportedAt)} · {usd(r.firstPrice)}</p>
        <p>Raport precedent: {usd(r.previousPrice)}</p>
        <p>Date de piață observate: {date(r.observedAt)}</p>
        <p>Capitalizare: {r.marketCapSource}</p>

        <div className="p-3 bg-white/[.025] rounded-lg border border-white/5 space-y-1.5">
          <p className="font-semibold text-cyan-300">Audit Securitate Portofele & Insideri (RugCheck / GoPlus)</p>
          <p>
            Concentrare top 10 holderi:{' '}
            <strong className={r.top10HoldersPct && r.top10HoldersPct > 50 ? 'text-amber-400' : 'text-emerald-400'}>
              {r.top10HoldersPct !== null && r.top10HoldersPct !== undefined ? `${r.top10HoldersPct}%` : 'În curs de colectare'}
            </strong>{' '}
            <span className="text-slate-500">(delimitare contracte DEX LP vs portofele individuale)</span>
          </p>
          <p>
            Rețele / Clustere de insideri:{' '}
            {r.insidersDetected === true ? (
              <strong className="text-rose-400">🚨 DETECTAT (Clustere suspecte de tranzacții sau rețele asociate)</strong>
            ) : r.insidersDetected === false ? (
              <strong className="text-emerald-400">🛡️ Fără clustere de insideri detectate</strong>
            ) : (
              <strong className="text-slate-400">În curs de colectare</strong>
            )}
          </p>
          <p>
            Lansare Bundled:{' '}
            {r.isBundled === true ? (
              <strong className="text-rose-400">🚨 Lansare suspectă bundled detectată</strong>
            ) : r.isBundled === false ? (
              <strong className="text-emerald-400">🛡️ Fără indicii de lansare bundled</strong>
            ) : (
              <strong className="text-slate-400">În curs de colectare</strong>
            )}
          </p>
          <p>
            Contract Honeypot:{' '}
            {r.isHoneypot === true ? (
              <strong className="text-rose-400">🚨 ATENȚIE: Contract Honeypot detectat (vânzare restricționată)</strong>
            ) : r.isHoneypot === false ? (
              <strong className="text-emerald-400">🛡️ Curat (vânzare confirmată)</strong>
            ) : (
              <strong className="text-slate-400">În curs de colectare</strong>
            )}
          </p>
          <p>
            Taxe tranzacționare:{' '}
            <span>
              Buy: {r.buyTax !== null && r.buyTax !== undefined ? `${r.buyTax}%` : '—'} · Sell: {r.sellTax !== null && r.sellTax !== undefined ? `${r.sellTax}%` : '—'}
            </span>
          </p>
          {r.rugScore !== null && r.rugScore !== undefined && (
            <p>
              Scor risc audit: <strong className={r.rugScore > 500 ? 'text-rose-400' : 'text-slate-300'}>{r.rugScore}</strong>
            </p>
          )}
          {!!r.securityRisks?.length && (
            <p className="text-amber-300/90">
              Riscuri identificate: {r.securityRisks.join(' · ')}
            </p>
          )}
        </div>

        <div className="p-3 bg-white/[.025] rounded-lg border border-white/5 space-y-1.5">
          <p className="font-semibold text-cyan-300">Generare Comisioane & Beneficiu Holderi</p>
          <p>
            Comisioane estimate generate (24h):{' '}
            <strong className="text-emerald-400">~${(r.estimatedFees24h || Math.round((r.volume24h || 0) * 0.003)).toLocaleString()}</strong>
          </p>
          <p>
            Beneficiu holderi / Utilitate:{' '}
            <span className="text-slate-300">{r.holderReward || (r.hasBuyback ? 'Buyback & ardere din comisioane' : 'Comisioane din volumul pool-ului de lichiditate')}</span>
          </p>
          {!!r.utilityTags?.length && (
            <p>
              Etichete utilitate: <span className="text-cyan-300">{r.utilityTags.join(' · ')}</span>
            </p>
          )}
        </div>

        <p>
          Scor piață {r.marketScore}/100 · scor social {r.social.score === null ? 'indisponibil' : `${r.social.score}/100`}
          {r.social.confluenceBonus ? ` · bonus confluență +${r.social.confluenceBonus}` : ''}
        </p>
        <p>
          {r.social.authors} autori identificați · {r.social.channels} canale Telegram · {r.social.platforms} platforme
          {r.boostAmount ? ` · ${r.boostAmount} boosturi comunitate DEX Screener` : ''}
          {r.social.telegramCalls ? ` · ${r.social.telegramCalls} alerte Telegram alpha` : ''}
        </p>
        <p>
          Cumpărători unici 24h: {compact(r.buyers24h)} · tranzacții buy/sell: {compact(r.buys24h)} / {compact(r.sells24h)}
        </p>
        <div className="flex flex-wrap gap-4 pt-1">
          <a href={radarTokenChartUrl(r)} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
            Grafic și token pe DEX Screener ↗
          </a>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
            Poolul folosit la scanare ↗
          </a>
          {r.chain === 'solana' && (
            <a href={`https://rugcheck.xyz/tokens/${r.address}`} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
              Raport complet RugCheck ↗
            </a>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-slate-200">De ce apare în clasament</p>
        {r.reasons.map(x => (
          <p key={x}>• {x}</p>
        ))}
        {r.social.examples.map((x, i) => (
          <a key={i} href={x.url} target="_blank" rel="noreferrer" className="block p-3 border border-white/10 rounded-lg hover:border-cyan-400/40">
            <span className="text-cyan-300">
              {x.source} · {x.match} ↗
            </span>
            <p className="mt-1 text-slate-400">{x.text}</p>
          </a>
        ))}
        {!r.social.examples.length && <p className="text-slate-500">Nicio mențiune asociată cu clasamentul în fereastra observată.</p>}
      </div>
    </div>
  );

  const mainCount = (snapshot?.rows || []).filter(r => chain === 'all' || r.chain === chain).length;
  const microCount = (snapshot?.microcaps || []).filter(r => chain === 'all' || r.chain === chain).length;

  return (
    <section className="space-y-5 pb-16">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-cyan-400 text-xs tracking-widest uppercase">Comunitate + activitate on-chain + audit portofele</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Crypto Radar</h1>
          <p className="text-sm text-slate-400 mt-2">Solana · Base · Robinhood — radar principal și microcaps utilitare cu verificare anti-rug</p>
        </div>
        <div className="flex items-start gap-2">
          <button onClick={load} disabled={loading} className="px-3 py-2 rounded-lg border border-white/10 text-sm text-slate-300">
            {loading ? 'Se încarcă…' : 'Actualizează'}
          </button>
          {isAdmin && (
            <button onClick={scan} disabled={scanning} className="px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-sm disabled:opacity-50">
              {scanning ? 'Scanare în curs…' : 'Scanează acum'}
            </button>
          )}
        </div>
      </div>

      {error && <div role="alert" className="p-4 border border-rose-500/30 bg-rose-500/10 rounded-xl text-rose-300 text-sm">{error}</div>}

      {/* Network Filter Cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        {['solana', 'base', 'robinhood'].map(c => {
          const sources = snapshot?.sources.filter(s => s.kind === 'market' && s.id.includes(`:${c}`)) || [];
          const ok = sources.some(s => s.status === 'ok' && s.items > 0);
          const currentSectionRows = section === 'main' ? (snapshot?.rows || []) : (snapshot?.microcaps || []);
          return (
            <button
              key={c}
              onClick={() => setChain(chain === c ? 'all' : c)}
              className={`p-4 rounded-xl border text-left ${chain === c ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-white/10 bg-white/[.025]'}`}
            >
              <div className="flex justify-between">
                <span className="capitalize font-semibold text-slate-200">{c === 'robinhood' ? 'Robinhood Chain' : c}</span>
                <span className={`text-xs ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{!snapshot ? 'În așteptare' : ok ? 'Date disponibile' : 'Date lipsă'}</span>
              </div>
              <p className="mt-2 text-2xl text-white">
                {currentSectionRows.filter(r => r.chain === c).length || 0} <span className="text-xs text-slate-500">monede eligibile</span>
              </p>
            </button>
          );
        })}
      </div>

      {/* Section Switcher & Report Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="inline-flex rounded-xl p-1 bg-white/[.04] border border-white/10">
          <button
            type="button"
            onClick={() => { setSection('main'); setExpanded(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${section === 'main' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🌟 Radar Principal (Cap ≥ $500k)
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-white/10">{mainCount}</span>
          </button>
          <button
            type="button"
            onClick={() => { setSection('microcaps'); setExpanded(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${section === 'microcaps' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🔬 Microcaps Utilitare ($200k – $500k)
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-white/10">{microCount}</span>
            <span className="ml-1.5 text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Fees & Buybacks</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select aria-label="Selectează raportul" value={selection} onChange={e => select(e.target.value)} className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-200">
            <option value="latest">Ultimul raport disponibil</option>
            <option value="collection">Ultima colectare</option>
            {data?.history.map(h => (
              <option key={h.id} value={h.id}>{date(h.generatedAt)} · {h.count} monede</option>
            ))}
          </select>
          <button onClick={() => setChain('all')} className="text-cyan-300">Toate rețelele</button>
          <span className="text-slate-500">{snapshot ? `${snapshot.kind === 'report' ? 'Raport' : 'Colectare'}: ${date(snapshot.generatedAt)}` : 'Nicio scanare salvată încă'}</span>
        </div>
      </div>

      {snapshot && (
        <>
          {section === 'microcaps' ? (
            <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <span>🔬 Secțiune Separată: Microcaps Utilitare ($200.000 – $500.000 Market Cap)</span>
              </p>
              <p>
                Proiecte timpurii mai riscante, dar cu utilitate reală (bots, AI agents, platforme DEX, instrumente on-chain), generare de comisioane prin tranzacționare (trading fees) sau mecanisme de buyback / deflație care recompensează deținătorii.
              </p>
              <p className="text-slate-400">
                Toate proiectele sunt verificate împotriva clusterelor de insideri prin RugCheck (Solana) și GoPlus Security (Base / Robinhood), incluzând detectare lansări bundled, concentrare portofele top 10 și contracte honeypot.
              </p>
            </div>
          ) : (
            <div className="text-xs text-slate-400 space-y-1">
              <p>{snapshot.coverage}</p>
              <p>
                Scor: 70% activitate de piață + 30% dovezi sociale (inclusiv boosturi comunitare DEX Screener și canale Telegram alpha) + bonus de confluență on-chain/social - penalizări securitate portofele. Mențiuni din ultimele 12 ore. Lipsurile nu sunt înlocuite cu engagement inventat. Nu este un indicator de profit validat.
              </p>
              <p>
                {snapshot.discovered} tokenuri observate · {snapshot.excluded.belowCap} sub pragul minim de $200k · {snapshot.excluded.unknownCap} fără capitalizare disponibilă. Comparat cu raportul din {date(snapshot.previousReportAt)}.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-400">Apasă pe numele monedei pentru graficul DEX Screener într-o filă nouă. Butonul Detalii arată dovezile scanării și auditul de securitate.</p>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-[11px] uppercase text-slate-500 bg-white/[.03]">
                <tr>
                  {headers.map(h => {
                    const active = sort.key === h.key;
                    const next = active && sort.direction === 'asc' ? 'descrescător' : 'crescător';
                    return (
                      <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="p-0 text-left" key={h.key}>
                        <button
                          type="button"
                          onClick={() => changeSort(h.key)}
                          aria-label={`Sortează după ${h.label}, ${next}`}
                          className={`w-full min-h-11 px-3 py-3 text-left hover:bg-white/[.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 ${active ? 'text-cyan-300' : 'text-slate-500'}`}
                        >
                          <span>{h.label}</span>
                          <span aria-hidden="true" className="ml-1">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const sec = getRadarSecurityStatus(r);
                  return (
                    <React.Fragment key={r.id}>
                      <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="border-t border-white/[.05] hover:bg-white/[.04] cursor-pointer">
                        <td className="px-3 py-3">
                          <span className="font-semibold text-white">{r.rank}</span>
                          <span className="block text-xs text-cyan-400">
                            {r.rankChange === null ? 'NOU' : r.rankChange > 0 ? `↑${r.rankChange}` : r.rankChange < 0 ? `↓${-r.rankChange}` : '='}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              role="status"
                              aria-label={sec.ariaLabel}
                              title={sec.title}
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ring-2 ${sec.dotColorClass} inline-block cursor-help`}
                            />
                            <a
                              href={radarTokenChartUrl(r)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title={`Vezi ${r.name} pe DEX Screener (${r.chain})`}
                              className="text-white font-medium underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-300"
                            >
                              {r.name} ↗
                            </a>
                          </div>
                        <span className="block text-xs text-slate-500 mt-1">
                          {r.symbol} · {r.chain} ·{' '}
                          <button
                            aria-label={`Detalii scanare ${r.name}`}
                            aria-expanded={expanded === r.id}
                            onClick={e => {
                              e.stopPropagation();
                              setExpanded(expanded === r.id ? null : r.id);
                            }}
                            className="text-cyan-300 hover:underline"
                          >
                            Detalii {expanded === r.id ? '−' : '+'}
                          </button>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-200 font-mono">{usd(r.price)}</td>
                      <td className={`px-3 py-3 ${color(r.priceChange24h)}`}>{change(r.priceChange24h)}</td>
                      {section === 'main' && (
                        <>
                          <td className="px-3 py-3 font-mono text-slate-400">{usd(r.firstPrice)}</td>
                          <td className={`px-3 py-3 ${color(r.changeFirst)}`}>{change(r.changeFirst)}</td>
                          <td className={`px-3 py-3 ${color(r.changePrevious)}`}>{change(r.changePrevious)}</td>
                        </>
                      )}
                      <td className="px-3 py-3 text-slate-300">${compact(r.marketCap)}</td>
                      <td className="px-3 py-3 text-slate-300">{r.volume24h === null ? '—' : '$' + compact(r.volume24h)}</td>
                      {section === 'microcaps' && (
                        <td className="px-3 py-3 text-slate-300 font-mono">
                          {r.estimatedFees24h ? `~$${compact(r.estimatedFees24h)}` : '—'}
                        </td>
                      )}
                      <td className="px-3 py-3 text-slate-300">{r.liquidity === null ? '—' : '$' + compact(r.liquidity)}</td>
                      <td className="px-3 py-3">{renderSecurityBadge(r)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-cyan-300">{r.score}</strong>
                          {r.boostAmount && r.boostAmount > 0 ? (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/15 text-amber-300 border border-amber-400/30"
                              title={`Promovat de comunitate: ${r.boostAmount} boosturi DEX Screener`}
                            >
                              ⚡ {r.boostAmount}
                            </span>
                          ) : null}
                        </div>
                        {section === 'microcaps' ? (
                          <div className="mt-1">{renderUtilityBadges(r)}</div>
                        ) : (
                          <span className="text-xs text-slate-500 block">
                            {r.social.score === null ? 'indisponibil' : `${r.social.mentions} mențiuni`}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="border-t border-white/10 bg-white/[.02]">
                        <td colSpan={headers.length} className="whitespace-normal text-slate-400">
                          {details(r)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-8 text-center text-slate-400">
                Nicio monedă eligibilă în această secțiune ({section === 'main' ? '≥ $500k' : '$200k – $500k'}). Verifică starea surselor mai jos.
              </p>
            )}
          </div>

          <details className="rounded-xl border border-white/10 p-4 text-sm">
            <summary className="cursor-pointer text-slate-200">
              Surse și acoperire ({snapshot.sources.filter(s => s.status === 'ok').length}/{snapshot.sources.length} accesibile)
            </summary>
            <div className="grid md:grid-cols-2 gap-2 mt-4">
              {snapshot.sources.map(s => (
                <div key={s.id} className="p-3 bg-white/[.025] rounded-lg text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-200">{s.id}</span>
                    <span className={s.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
                      {s.status} · {s.items}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">{s.detail}</p>
                </div>
              ))}
            </div>
          </details>

          {!!snapshot.exits.length && (
            <details className="rounded-xl border border-white/10 p-4 text-sm">
              <summary className="cursor-pointer text-slate-200">
                Ieșite din clasament ({snapshot.exits.length}) — istoricul este păstrat
              </summary>
              <div className="mt-3 space-y-2 text-slate-400">
                {snapshot.exits.map(x => (
                  <p key={x.id}>
                    <a href={radarTokenChartUrl(x)} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
                      {x.name} ↗
                    </a>{' '}
                    ({x.symbol}) · {x.chain} · loc anterior {x.previousRank} · {x.reason === 'below_threshold' ? 'sub $500,000' : 'date indisponibile sau în afara selecției'}
                  </p>
                ))}
              </div>
            </details>
          )}
        </>
      )}
      <p className="text-xs text-slate-500">
        Telegram: {data?.telegramConfigured ? data.delivery?.status || 'niciun raport trimis' : 'neconfigurat'}
        {data?.delivery?.detail ? ` · ${data.delivery.detail}` : ''}. Rapoartele salvate rămân disponibile în aplicație.
      </p>
    </section>
  );
};

