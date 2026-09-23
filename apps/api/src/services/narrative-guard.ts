import type { AIContentTake, MarketIntelligenceReport } from '@money-scanner/shared';

/**
 * Narrative guard for every piece of user-visible generated text.
 *
 * Policy (Marius, 2026-09-23): the app's narrative text is written by Instinct
 * and must be correct. Model-generated prose (local AI Gateway writer, Gemini
 * report/synthesis) is no longer served. Every Instinct take also passes this
 * guard at publish time and again at read time, so a bad take is rejected
 * instead of shown.
 *
 * Rules (deterministic, testable):
 * 1. Unit sanity: an aggregate market cap (total / global / crypto market) can
 *    never be stated in billions or under $100B, and never above $1,000T.
 *    Catches "total market cap $2.96 billion" (should be trillion).
 * 2. No undated central-bank news: any sentence that mentions a central-bank
 *    rate decision (Fed/FOMC/ECB/BoE/BoJ/Norges Bank, hike/cut/hold) must carry
 *    an explicit date in the same sentence (e.g. "Sep 16", "16 sept.",
 *    "2026-09-16"). Stops an old decision being presented as today's news.
 */

const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+/;

const AGGREGATE_CAP = /\b(?:total|global|overall|whole|entire|combined)\b[^.\n]{0,40}?(?:market[\s-]?cap(?:itali[sz]ation)?|mcap)|\bcrypto(?:currency)?\s+market[\s-]?cap(?:itali[sz]ation)?|capitaliz[aă]r(?:e|ea)\s+(?:total[aă]|global[aă]|a\s+pie[tț]ei|pie[tț]ei\s+cripto)|capitalizare\s+de\s+pia[tț][aă]\s+(?:total[aă]|global[aă])/i;
const AMOUNT = /\$?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(trillion|trilioane|trilion|tn|t\b|billion|miliarde|miliard|mld\.?|bn|b\b|million|milioane|mil\.?|m\b)/gi;

const BANK = /\b(fed|fomc|federal reserve|rezerva federal[aă]|ecb|bce|boe|bank of england|boj|bank of japan|norges bank|central bank|banca central[aă])\b/i;
const DECISION = /\b(hike[ds]?|hiking|rais(?:e[ds]?|ing)|cut(?:s|ting)?|lower(?:s|ed|ing)?|held|hold(?:s|ing)?|pause[ds]?|kept|keeps|keep(?:ing)?|decision|rate move|majora(?:t|re|rea|t[aă])?|major[eă]|reduc(?:e|ere|erea|ut)|men[tț]in(?:e|ut|ere)|p[aă]strat|decizi[ae])\b/i;
const MONTHS_EN = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTHS_RO = '(?:ian(?:uarie)?|feb(?:ruarie)?|mar(?:tie)?|apr(?:ilie)?|mai|iun(?:ie)?|iul(?:ie)?|aug(?:ust)?|sep(?:t(?:embrie)?)?|oct(?:ombrie)?|noi(?:embrie)?|nov|dec(?:embrie)?)';
const DATE = new RegExp([
  `\\b${MONTHS_EN}\\.?\\s+\\d{1,2}\\b`,
  `\\b\\d{1,2}\\s+${MONTHS_EN}\\b`,
  `\\b\\d{1,2}\\s+${MONTHS_RO}\\b`,
  '\\b\\d{4}-\\d{2}-\\d{2}\\b',
  '\\b\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?\\b'
].join('|'), 'i');

const toNumber = (raw: string): number => {
  // "2,96" (RO decimal) vs "1,234" (thousands). Treat a single comma followed by 1-2 digits as a decimal.
  if (/^\d+,\d{1,2}$/.test(raw)) return Number(raw.replace(',', '.'));
  return Number(raw.replace(/,/g, ''));
};

const unitMultiplier = (unit: string): number => {
  const u = unit.toLowerCase().replace(/\.$/, '');
  if (/^(trillion|trilioane|trilion|tn|t)$/.test(u)) return 1e12;
  if (/^(billion|miliarde|miliard|mld|bn|b)$/.test(u)) return 1e9;
  return 1e6;
};

export const findNarrativeIssues = (texts: string[]): string[] => {
  const issues: string[] = [];
  for (const text of texts) {
    for (const sentence of String(text || '').split(SENTENCE_SPLIT)) {
      const s = sentence.trim();
      if (!s) continue;
      const cap = AGGREGATE_CAP.exec(s);
      if (cap) {
        const after = s.slice(cap.index);
        AMOUNT.lastIndex = 0;
        const amount = AMOUNT.exec(after);
        if (amount && amount.index <= 60) {
          const value = toNumber(amount[1]) * unitMultiplier(amount[2]);
          if (Number.isFinite(value) && (value < 100e9 || value > 1000e12)) {
            issues.push(`unit: aggregate market cap stated as "${amount[0].trim()}" (${s.slice(0, 140)})`);
          }
        }
      }
      if (BANK.test(s) && DECISION.test(s) && !DATE.test(s)) {
        issues.push(`undated-central-bank-news: add the decision date to this sentence (${s.slice(0, 140)})`);
      }
    }
  }
  return issues;
};

export const takeTexts = (take: Pick<AIContentTake, 'headline' | 'paragraphs' | 'bullets'>): string[] => [
  take.headline,
  ...(take.paragraphs || []),
  ...(take.bullets || [])
];

export const takeIssues = (take: Pick<AIContentTake, 'headline' | 'paragraphs' | 'bullets'>): string[] =>
  findNarrativeIssues(takeTexts(take));

/** Only Instinct-authored takes that pass the guard are ever served. */
export const isServableTake = (take: AIContentTake | undefined): take is AIContentTake =>
  Boolean(take) && take!.source === 'instinct-agent' && takeIssues(take!).length === 0;

type Takes = {
  briefing?: AIContentTake;
  marketIntelligence?: AIContentTake;
  capitalRotation?: AIContentTake;
};

/**
 * Builds the AI Briefing report the app serves. Model prose from the stored
 * report (headline, summary, macro drivers, risk radar, discoveries, model
 * narrative cards) is dropped. The header is the Instinct daily briefing;
 * narrative cards are kept only when they are the deterministic
 * price-computed cards. Sources (real article links) are kept.
 */
export const buildInstinctReport = (
  report: MarketIntelligenceReport,
  takes: Takes,
  language: 'ro' | 'en'
): MarketIntelligenceReport => {
  const ro = language === 'ro';
  const deterministic = report.mode === 'deterministic';
  const narratives = deterministic
    ? report.narratives.map(narrative => ({
      ...narrative,
      whyNow: ro ? 'Calculat din prețurile live pe 24h ale activelor urmărite.' : 'Calculated from live 24h prices of the tracked assets.',
      catalysts: [],
      risks: []
    }))
    : [];
  const base: MarketIntelligenceReport = {
    ...report,
    macroDrivers: [],
    discoveries: [],
    riskRadar: [],
    narratives,
    searchQueries: [],
    model: undefined
  };
  const briefing = takes.briefing;
  if (briefing) {
    return {
      ...base,
      headline: briefing.headline,
      executiveSummary: briefing.paragraphs.join('\n\n'),
      mode: 'instinct',
      model: briefing.model,
      generatedAt: briefing.generatedAt,
      dataFreshness: ro ? 'Scris de Instinct' : 'Written by Instinct',
      aiTake: takes.marketIntelligence,
      capitalRotation: takes.capitalRotation
    };
  }
  return {
    ...base,
    headline: ro ? 'Briefingul Instinct de azi nu este publicat încă' : "Today's Instinct briefing is not published yet",
    executiveSummary: ro
      ? 'Datele de piață și clasamentele de mai jos sunt live. Textul briefingului apare după publicarea zilnică.'
      : 'The market data and rankings below are live. The briefing text appears after the daily publish.',
    mode: 'deterministic',
    dataFreshness: ro ? 'Doar date live' : 'Live data only',
    aiTake: takes.marketIntelligence,
    capitalRotation: takes.capitalRotation
  };
};
