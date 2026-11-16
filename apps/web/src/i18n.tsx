import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { UI_PAIRS } from './i18n-ui-dictionary';
import { UI_PAIRS_2, UI_EXACT_PAIRS } from './i18n-ui-dictionary-2';
import { CONTENT_PAIRS } from './i18n-content-dictionary';

export type Language = 'ro' | 'en';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}


/** Initial UI language. /tape is the public proof page for the English X
 * audience: it always starts in English regardless of any stored preference.
 * Everywhere else the stored preference applies (default Romanian). */
export const resolveInitialLanguage = (pathname: string, storedPreference: string | null): Language => {
  if (pathname === '/tape' || pathname.startsWith('/tape/')) return 'en';
  return storedPreference === 'en' ? 'en' : 'ro';
};

const LanguageContext = createContext<LanguageContextValue>({
  language: 'ro',
  setLanguage: () => undefined
});

// Romanian is the source language of the current UI. These replacements are
// deliberately phrase-based so they also cover text returned by existing
// components without forcing every component to duplicate language state.

// ---------------------------------------------------------------------------
// Translation engine
//
// Romanian is the source language of most of the UI; some components are
// written in English. Every user-visible string must have a pair in one of the
// dictionaries (BASE_PAIRS here, UI_PAIRS, CONTENT_PAIRS). The DOM translator
// below applies the selected language to every text node and to
// placeholder/title/aria-label attributes under #root.
//
// Matching rules (in this order):
//   1. exact match of the whole (whitespace-normalised) text node;
//   2. template match: pairs containing "{}" placeholders match whole nodes
//      whose dynamic parts (numbers, symbols, names) are carried over as-is;
//   3. phrase fallback with Unicode word boundaries only. A phrase never
//      matches inside a longer word, so "Ray" can no longer turn "Raydium"
//      into "Razădium" and "Watch" can no longer turn "Watchlist" into
//      "De urmăritlist".
// Anything rendered inside translate="no" / data-i18n-skip (asset names,
// tickers, protocol names, third-party headlines) is never touched.
// i18n-coverage.test.ts fails the build when a new user-visible literal is
// added without a dictionary pair.
// ---------------------------------------------------------------------------
export const BASE_PAIRS: Array<[string, string]> = [
  ['Narative & Sectoare Alpha (Minim 30 Active / Sector)', 'Alpha Narratives & Sectors (Minimum 30 Active / Sector)'],
  ['Giganți de inteligență artificială, LLM-uri, compute și protocoale AI onchain', 'Artificial-intelligence giants, LLMs, compute and onchain AI protocols'],
  ['Performanță live 24h agregată și compoziția sectorială selectată de AI după Market Cap', 'Aggregated live 24h performance and AI-selected sector composition by Market Cap'],
  ['Semnale Live Market Scanner 360', 'Market Scanner 360 Live Signals'],
  ['Se încarcă semnalele Live Market Scanner 360...', 'Loading Market Scanner 360 live signals...'],
  ['Se sincronizează datele de piață 360°.', 'Synchronizing 360° market data.'],
  ['Caută orice asset mondial: ASML, NVDA, BTC, BABA, Aur, DXY...', 'Search any global asset: ASML, NVDA, BTC, BABA, Gold, DXY...'],
  ['Caută orice asset mondial: ASML, NVDA, BTC, BABA, Aur...', 'Search any global asset: ASML, NVDA, BTC, BABA, Gold...'],
  ['Datele live nu sunt disponibile momentan. Încearcă din nou.', 'Live data is currently unavailable. Try again.'],
  ['Top 100 monede după capitalizarea de piață. Dimensiunea bulei reflectă market cap-ul.', 'Top 100 coins by market capitalization. Bubble size reflects market cap.'],
  ['Se încarcă datele macroeconomice oficiale ale Statelor Unite (Trezorerie, Fed, CPI, Datorie)...', 'Loading official United States macroeconomic data (Treasury, Fed, CPI, Debt)...'],
  ['Nu s-au putut încărca datele macroeconomice. Te rugăm să reîncerci.', 'Macroeconomic data could not be loaded. Please try again.'],
  ['Date oficiale Trezorerie, Federal Reserve, Biroul de Statistică al Muncii (BLS) & Sinteză Strategică AI în Timp Real.', 'Official Treasury, Federal Reserve and Bureau of Labor Statistics (BLS) data & real-time AI strategic synthesis.'],
  ['Agregatorul AI colectează și analizează cele mai relevante știri și postări de pe X...', 'The AI aggregator collects and analyzes the most relevant news and posts from X...'],
  ['Agregatorul AI analizează fluxul de pe X în timp real, elimină spamul și sintetizează contextul economic crucial.', 'The AI aggregator analyzes the X feed in real time, removes spam and synthesizes crucial economic context.'],
  ['Dă click pe orice știre pentru a deschide direct postarea originală pe X.', 'Click any news item to open the original post directly on X.'],
  ['Clasificare pe 4 sectoare: Macro & Fed, Acțiuni SUA & AI, Metale & Energie, Crypto & Web3', 'Classification across 4 sectors: Macro & Fed, US Stocks & AI, Metals & Energy, Crypto & Web3'],
  ['Top Știri & Alpha de pe X (Twitter) • Economie, Stocks, Metale & Crypto', 'Top News & Alpha from X (Twitter) • Economy, Stocks, Metals & Crypto'],
  ['Nicio știre găsită pentru criteriile selectate.', 'No news found for the selected criteria.'],
  ['Nu există știri sau postări recente pentru', 'There are no recent news items or posts for'],
  ['Analiza AI nu este disponibilă pentru acest asset.', 'AI analysis is not available for this asset.'],
  ['Analiză strategică bazată pe fundamente economice și impuls Money Line.', 'Strategic analysis based on economic fundamentals and Money Line momentum.'],
  ['Utilizează strategia DCA (Dollar Cost Averaging) pentru a acumula pe retrageri către mediile mobile pe graficul săptămânal (1W).', 'Use a DCA (Dollar Cost Averaging) strategy to accumulate on pullbacks toward the moving averages on the weekly chart (1W).'],
  ['Ofertă fixă matematic de 21 milioane unități într-o lume a expansiunii monetare infinite.', 'A mathematically fixed supply of 21 million units in a world of infinite monetary expansion.'],
  ['Canal instituțional direct de capital prin marile fonduri de pensii și ETF-uri.', 'A direct institutional capital channel through major pension funds and ETFs.'],
  ['Efectul de rețea imbatabil și securitate susținută de cel mai puternic supercomputer distribuit din lume.', 'An unmatched network effect and security backed by the world’s most powerful distributed supercomputer.'],
  ['Volatilitate ridicată pe termen scurt cauzată de lichidările pe contractele futures.', 'High short-term volatility caused by futures liquidations.'],
  ['Corelație periodică cu indicii bursieri tech (Nasdaq) în momente de panică macro.', 'Periodic correlation with tech equity indices (Nasdaq) during macro panic.'],
  ['Presiuni de vânzare ocazionale din partea minerilor cu costuri energetice mari.', 'Occasional selling pressure from miners with high energy costs.'],
  ['Bitcoin își consolidează statutul de activ monetar macro și aur digital, alimentat de afluxul instituțional prin ETF-urile Spot americane ($35B+ active nete), reducerea emisiunii zilnice la 450 BTC în urma Halving-ului și expansiunea masei monetare globale M2.', 'Bitcoin is consolidating its status as a macro monetary asset and digital gold, driven by institutional inflows through US Spot ETFs ($35B+ net assets), the post-Halving reduction in daily issuance to 450 BTC, and expansion of the global M2 money supply.'],
  ['Adoptarea Bitcoin ca activ de rezervă strategică corporativă și potențial guvernamentală.', 'Adoption of Bitcoin as a corporate and potentially government strategic reserve asset.'],
  ['Șocul de ofertă post-halving combinat cu cererea instituțională zilnică ce depășește emisiunea minerilor.', 'The post-Halving supply shock combined with daily institutional demand exceeding miner issuance.'],
  ['Creșterea ratei de hash (Hashrate > 750 EH/s) confirmând securitatea rețelei.', 'Rising hash rate (Hashrate > 750 EH/s), confirming network security.'],
  ['Afluxuri instituționale continue prin ETF-uri (BlackRock IBIT, Fidelity FBTC).', 'Continued institutional inflows through ETFs (BlackRock IBIT, Fidelity FBTC).'],
  ['Creșterea datoriei naționale a SUA ($36.2T+) care alimentează devalorizarea monedelor fiduciare.', 'Rising US national debt ($36.2T+) fueling fiat-currency debasement.'],
  ['Ciclul de relaxare monetară al băncilor centrale majore (rate scăzute ale dobânzilor).', 'The monetary-easing cycle of major central banks (lower interest rates).'],
  ['Episoade de aversiune la risc (risk-off) pe piețele financiare tradiționale.', 'Risk-off episodes in traditional financial markets.'],
  ['Presiuni de lichidare din partea unor entități mari sau mișcări pe piețele de derivate.', 'Liquidation pressure from large entities or moves in derivatives markets.'],
  ['Incertitudini de reglementare privind platformele offshore de tranzacționare.', 'Regulatory uncertainty surrounding offshore trading platforms.'],
  ['Sinteză On-Chain & Fluxuri Instituționale ETF', 'On-Chain & Institutional ETF Flow Summary'],
  ['Statistici Rețea & Piețe', 'Network & Market Statistics'],
  ['ETF-urile Spot din SUA dețin peste 1.1 milioane BTC (~5.5% din oferta totală). Rata de hash a rețelei se menține la maxime istorice de 750 EH/s, indicând angajament pe termen lung al minerilor.', 'US Spot ETFs hold more than 1.1 million BTC (~5.5% of total supply). Network hash rate remains near all-time highs at 750 EH/s, indicating long-term miner commitment.'],
  ['Hashrate Rețea', 'Network Hashrate'],
  ['Ofertă Illiquid', 'Illiquid Supply'],
  ['din BTC nemișcat', 'of BTC unmoved'],
  ['Emisiune Zilnică', 'Daily Issuance'],
  ['încredere tehnică', 'technical confidence'],
  ['Riscuri Specifice de Monitorizat', 'Specific Risks to Monitor'],
  ['Ghid de Investiție & Verdict AI', 'Investment Guide & AI Verdict'],
  ['Perspectivă & Forward Economic', 'Outlook & Economic Forward View'],
  ['Analiză Sectorială & Macro', 'Sector & Macro Analysis'],
  ['Catalizatori de Creștere', 'Growth Catalysts'],
  ['Vânturi Macro Favorabile', 'Favorable Macro Tailwinds'],
  ['Presiuni & Vânturi Contrare', 'Pressures & Headwinds'],
  ['Sinteză Ultimele Rapoarte Economice & Financiare', 'Latest Economic & Financial Reports Summary'],
  ['Teză Tehnică & Niveluri S/R', 'Technical Thesis & S/R Levels'],
  ['Recomandare Acțiune:', 'Action Recommendation:'],
  ['De ce merită investit (Catalizatori)', 'Why It May Be Worth Investing (Catalysts)'],
  ['Confluență compozită:', 'Composite confluence:'],
  ['Chiar acum (pe această lumânare)', 'Right now (on this candle)'],
  ['CĂUTĂRI RECENTE & RAPIDE', 'RECENT & QUICK SEARCHES'],
  ['EXEMPLE DE CĂUTARE INTELIGENTĂ', 'SMART SEARCH EXAMPLES'],
  ['Căutare semantică AI → Ethereum', 'AI semantic search → Ethereum'],
  ['Metal prețios refugiu ($XAU)', 'Safe-haven precious metal ($XAU)'],
  ['Deschide direct activul', 'Open the asset directly'],
  ['Deschide Grafic & Analiză MoneyLine', 'Open Chart & MoneyLine Analysis'],
  ['Deschide Panoul de Analiză Detaliată', 'Open Detailed Analysis Panel'],
  ['Deschide Tab TradingView', 'Open TradingView Tab'],
  ['Deschide pe X', 'Open on X'],
  ['Deschide analiza Money Line pentru', 'Open Money Line analysis for'],
  ['Actualizează Datele de Piață', 'Refresh Market Data'],
  ['Actualizează Indicatorii', 'Refresh Indicators'],
  ['Actualizează datele', 'Refresh data'],
  ['Se încarcă top 100...', 'Loading top 100...'],
  ['Se încarcă datele...', 'Loading data...'],
  ['Resetează la Toate Activele', 'Reset to All Assets'],
  ['Resetează la ordinea Market Cap', 'Reset to Market Cap order'],
  ['Afișează Toate Activele 360°', 'Show All 360° Assets'],
  ['Resetează Filtrele', 'Reset Filters'],
  ['Toate Semnalele', 'All Signals'],
  ['Toate Sectoarele (360°)', 'All Sectors (360°)'],
  ['Toate Activele', 'All Assets'],
  ['Active în Watchlist:', 'Watchlist assets:'],
  ['Adaugă în Watchlist', 'Add to Watchlist'],
  ['Adaugă la Watchlist', 'Add to Watchlist'],
  ['Elimină din Watchlist', 'Remove from Watchlist'],
  ['Scoate din Watchlist', 'Remove from Watchlist'],
  ['Mută mai sus în Watchlist', 'Move up in Watchlist'],
  ['Mută mai jos în Watchlist', 'Move down in Watchlist'],
  ['Test Alert expediat cu succes pe Telegram pentru', 'Test alert successfully sent on Telegram for'],
  ['Urmărește cât mai este până la confirmarea bullish. Telegram trimite automat planul tehnic după ce Fast și Slow sunt confirmate pe o lumânare închisă.', 'Track the distance to bullish confirmation. Telegram automatically sends the technical plan after Fast and Slow are confirmed on a closed candle.'],
  ['Activă automat zilnic la', 'Automatically active every day at'],
  ['Detectează Daily bearish sub SMA 50 în Weekly bullish și Daily bullish peste SMA 50 în Weekly bearish.', 'Detects bearish Daily below SMA 50 in a bullish Weekly regime and bullish Daily above SMA 50 in a bearish Weekly regime.'],
  ['Progresul este normalizat cu ATR până la Marginea Nor Slow, nivelul care confirmă flipul.', 'Progress is ATR-normalized to the Slow Cloud Edge, the level that confirms the flip.'],
  ['Nivelurile sunt snapshot-ul calculat când alerta a fost trimisă; nu se modifică ulterior.', 'Levels are the snapshot calculated when the alert was sent; they do not change afterward.'],
  ['Alertele active vor apărea aici.', 'Active alerts will appear here.'],
  ['Istoricul se va popula după prima alertă MoneyLine declanșată.', 'History will populate after the first triggered MoneyLine alert.'],
  ['Flip bullish confirmat; alerta așteaptă următorul ciclu.', 'Bullish flip confirmed; the alert is waiting for the next cycle.'],
  ['trebuie să se închidă lumânarea.', 'the candle must close.'],
  ['Mai trebuie aproximativ', 'Approximately'],
  ['Scanare generală ML 1W → ML 1D + SMA 50', 'General ML 1W → ML 1D + SMA 50 scan'],
  ['Scanare ML 1W → ML 1D + SMA 50', 'ML 1W → ML 1D + SMA 50 scan'],
  ['Automat zilnic la', 'Automatically every day at'],
  ['Rapid verifică watchlist-ul și alertele active; Complet verifică întregul univers crypto, stocks și metale.', 'Quick checks the watchlist and active alerts; Full checks the entire crypto, stocks and metals universe.'],
  ['Scanare rapidă în curs', 'Quick scan in progress'],
  ['Scanare completă în curs', 'Full scan in progress'],
  ['Ultima scanare completă', 'Last full scan'],
  ['Pregătesc universul de scanare…', 'Preparing the scan universe…'],
  ['Poți rămâne pe această pagină; rezultatele și alertele Telegram sunt protejate împotriva duplicării.', 'You can remain on this page; results and Telegram alerts are protected against duplication.'],
  ['Scanarea rapidă s-a încheiat:', 'Quick scan completed:'],
  ['Scanarea completă s-a încheiat:', 'Full scan completed:'],
  ['setup-uri', 'setups'],
  ['erori', 'errors'],
  ['Rapid', 'Quick'],
  ['Complet', 'Full'],
  ['Alertele mele MoneyLine', 'My MoneyLine Alerts'],
  ['Alerte urmărite', 'Tracked Alerts'],
  ['Istoric alerte declanșate', 'Triggered Alert History'],
  ['Alerte active', 'Active Alerts'],
  ['Aproape de trigger', 'Near Trigger'],
  ['Declanșări salvate', 'Saved Triggers'],
  ['Scanare în curs', 'Scan in Progress'],
  ['active verificate', 'assets checked'],
  ['Ultima verificare', 'Last Check'],
  ['Programată', 'Scheduled'],
  ['Următoarea rulare:', 'Next run:'],
  ['semnale', 'signals'],
  ['Nu ai alerte active', 'You have no active alerts'],
  ['Confirmat bullish', 'Bullish Confirmed'],
  ['Așteaptă închiderea', 'Awaiting Close'],
  ['Foarte aproape', 'Very Close'],
  ['În așteptare', 'Waiting'],
  ['Date indisponibile', 'Data Unavailable'],
  ['Progres spre trigger', 'Progress to Trigger'],
  ['Preț acum', 'Current Price'],
  ['Setată', 'Set'],
  ['evaluată', 'checked'],
  ['Deschide graficul', 'Open Chart'],
  ['Șterge alerta', 'Delete Alert'],
  ['Telegram trimis', 'Telegram Sent'],
  ['Netrimis', 'Not Sent'],
  ['Închidere 1D', 'Daily Close'],
  ['Cercetare pe lumânări închise', 'Closed-candle strategy research'],
  ['Alertă veche — fără snapshot SL/TP', 'Legacy alert — no SL/TP snapshot'],
  ['Plan indisponibil', 'Plan Unavailable'],
  ['Așteaptă retest', 'Wait for Retest'],
  ['Evită', 'Avoid'],
  ['a fost adăugat în Watchlist!', 'was added to the Watchlist!'],
  ['a fost eliminat.', 'was removed.'],
  ['Trimite alertă Telegram', 'Send Telegram alert'],
  ['Alertă trimisă!', 'Alert sent!'],
  ['Înapoi la Scanner', 'Back to Scanner'],
  ['Citește pe X', 'Read on X'],
  ['Caută pe X', 'Search on X'],
  ['Postări relevante de pe X — click pentru sursă', 'Relevant posts from X — click for source'],
  ['Nicio conversație salvată', 'No saved conversations'],
  ['Conversație nouă', 'New conversation'],
  ['Întreabă despre o monedă... ex: "Ce se întâmplă cu Solana?"', 'Ask about a coin... e.g. "What is happening with Solana?"'],
  ['Nu am putut finaliza analiza:', 'Could not complete the analysis:'],
  ['Te rog încearcă din nou.', 'Please try again.'],
  ['Sinteză de Piață', 'Market Summary'],
  ['Factori Structurali Cheie', 'Key Structural Drivers'],
  ['Factori Bullish', 'Bullish Factors'],
  ['Factori Bearish & Riscuri', 'Bearish Factors & Risks'],
  ['Active de Urmărit', 'Assets to Watch'],
  ['Salut! Sunt analistul tău AI.', 'Hello! I am your AI analyst.'],
  ['Salut! Întreabă-mă orice despre piața crypto, acțiuni sau commodities.', 'Hello! Ask me anything about crypto, stocks or commodities.'],
  ['Inspirație', 'Inspiration'],
  ['Cum arată', 'How does'],
  ['pe Money Line?', 'look on Money Line?'],
  ['Ce fac balenele pe $ETH?', 'What are the whales doing on $ETH?'],
  ['Top 5 cele mai bullish active acum', 'Top 5 most bullish assets now'],
  ['Analizează $SOL: sentiment și momentum', 'Analyze $SOL: sentiment and momentum'],
  ['Ce spun @lookonchain și @whale_alert?', 'What are @lookonchain and @whale_alert reporting?'],
  ['Care sunt riscurile macro pentru crypto?', 'What are the macro risks for crypto?'],
  ['Analizează', 'Analyze'],
  ['sentiment și momentum', 'sentiment and momentum'],
  ['Ce spun', 'What are'],
  ['Știri Agregate', 'Aggregated News'],
  ['Sentiment Piață', 'Market Sentiment'],
  ['Context & Implicație Piață (AI)', 'Market Context & Implications (AI)'],
  ['Credibilitate Sursă', 'Source Credibility'],
  ['Impact AI & Relevanță', 'AI Impact & Relevance'],
  ['Sortează:', 'Sort:'],
  ['Filtrează după:', 'Filter by:'],
  ['urmăritori', 'followers'],
  ['Încredere', 'Confidence'],
  ['Acțiuni SUA & AI', 'US Stocks & AI'],
  ['Acțiuni SUA & Tech', 'US Stocks & Tech'],
  ['Acțiuni SUA', 'US Stocks'],
  ['Stocks SUA', 'US Stocks'],
  ['Metale & Aur', 'Metals & Gold'],
  ['Metale & Gold', 'Metals & Gold'],
  ['Metale & Mărfuri', 'Metals & Commodities'],
  ['Energie & Mărfuri', 'Energy & Commodities'],
  ['Chips & Siliciu', 'Chips & Silicon'],
  ['Piața Muncii & Șomaj', 'Labor Market & Unemployment'],
  ['Datoria Totală SUA', 'Total US Debt'],
  ['Dobânzi Anuale:', 'Annual Interest:'],
  ['Datorie / Cetățean:', 'Debt / Citizen:'],
  ['Inflație & CPI YoY', 'Inflation & CPI YoY'],
  ['În Răcire', 'Cooling'],
  ['Ținta Fed de Inflație:', 'Fed Inflation Target:'],
  ['PPI (Producători):', 'PPI (Producers):'],
  ['Dobânda Fed & Ciclul FOMC', 'Fed Rate & FOMC Cycle'],
  ['Ședință FOMC:', 'FOMC Meeting:'],
  ['Șanse Reducere 25 bps:', '25 bps Cut Odds:'],
  ['Rată Neutră Estimată:', 'Estimated Neutral Rate:'],
  ['Șomaj', 'Unemployment'],
  ['Cereri Inițiale Șomaj:', 'Initial Jobless Claims:'],
  ['Creștere Salarială:', 'Wage Growth:'],
  ['Evoluția dobânzilor pe maturități de la 1 Lună (scurt) până la 30 de Ani (lung).', 'Yield evolution across maturities from 1 Month (short) to 30 Years (long).'],
  ['Regim Curbă:', 'Curve Regime:'],
  ['Vânzări cu Amănuntul (Retail):', 'Retail Sales:'],
  ['Masa Monetară US M2:', 'US M2 Money Supply:'],
  ['Sinteză Strategică Multimarket', 'Multimarket Strategic Synthesis'],
  ['Analiză macroeconomică generată de AI cu recalculare dinamică la fiecare actualizare a datelor.', 'AI-generated macroeconomic analysis dynamically recalculated with every data update.'],
  ['Spread-ul 10Y - 2Y a revenit în teritoriu pozitiv (+0.20%), confirmând faza de dez-inversare clasică premergătoare relaxării monetare. Istoric, această fază favorizează activele de risc pe fondul expansiunii masei monetare.', 'The 10Y–2Y spread has returned to positive territory (+0.20%), confirming the classic de-inversion phase preceding monetary easing. Historically, this phase favors risk assets amid monetary expansion.'],
  ['Economia Statelor Unite parcurge o tranziție clasică de tip Soft Landing: inflația (CPI 2.7%, PCE 2.6%) se apropie de ținta de 2.0%, permițând Rezervei Federale să inițieze ciclul de reducere a dobânzilor cheie în condițiile unei piețe a muncii reziliente (șomaj 4.1%). Dez-inversarea curbei randamentelor (Spread 10Y-2Y la +0.20%) confirmă relaxarea politicii monetare și expansiunea lichidității globale (M2 la $21.45T).', 'The United States economy is undergoing a classic Soft Landing transition: inflation (CPI 2.7%, PCE 2.6%) is approaching the 2.0% target, allowing the Federal Reserve to begin cutting policy rates while the labor market remains resilient (4.1% unemployment). Yield-curve de-inversion (10Y–2Y spread at +0.20%) confirms monetary easing and expanding global liquidity (M2 at $21.45T).'],
  ['Multiplii de evaluare pentru acțiunile americane (S&P 500, NASDAQ) primesc un impuls puternic prin scăderea costului de discount al fluxurilor viitoare de numerar, susținuți de investițiile record în inteligență artificială și profitabilitatea companiilor Mega-Cap.', 'Valuation multiples for US equities (S&P 500, NASDAQ) receive a strong boost from a lower discount rate on future cash flows, supported by record AI investment and Mega-Cap profitability.'],
  ['Bitcoin ($BTC) și altcoin-urile majore ($ETH, $SOL) prezintă o corelație istorică de peste 85% cu accelerarea M2 și relaxarea dobânzilor reale. Ciclul de lichiditate globală favorizează un breakout puternic pe termen mediu.', 'Bitcoin ($BTC) and major altcoins ($ETH, $SOL) show a historical correlation above 85% with accelerating M2 and easing real rates. The global liquidity cycle favors a strong medium-term breakout.'],
  ['Datoria națională record a SUA ($36.25T) și costul de peste $1.1T anual pentru serviciul datoriei accelerează dedolarizarea și achizițiile fizice de Aur ($XAU) din partea băncilor centrale ca activ de protecție suverană.', 'Record US national debt ($36.25T) and annual debt-service costs above $1.1T accelerate de-dollarization and central-bank purchases of physical Gold ($XAU) as a sovereign hedge.'],
  ['Datoria națională record a SUA ($36.25T) și costul de peste $1.1T anual pentru serviciul datoriei accelerează dedolarizarea și achizițiile fizice de Gold ($XAU) din partea băncilor centrale ca activ de protecție suverană.', 'Record US national debt ($36.25T) and annual debt-service costs above $1.1T accelerate de-dollarization and central-bank purchases of physical Gold ($XAU) as a sovereign hedge.'],
  ['Presiunea fiscală generată de plata dobânzilor la datoria de $36.2T (necesar masiv de refinanțare la Trezorerie).', 'Fiscal pressure from interest payments on $36.2T of debt (requiring massive Treasury refinancing).'],
  ['Persistența componentei Shelter / Chirii în Core CPI ce ar putea încetini ritmul relaxării Fed.', 'Persistent Shelter / Rent inflation in Core CPI could slow the pace of Fed easing.'],
  ['Spike-uri de volatilitate geopolitică pe lanțurile de aprovizionare cu petrol și mărfuri.', 'Geopolitical volatility spikes affecting oil and commodity supply chains.'],
  ['Regimul macro actual recomandă acumularea pe corecții (Buy the Dip) pe suporturile Money Line pentru Acțiuni SUA și Crypto, menținând în același timp o alocare strategică de refugiu pe Aur ($XAU).', 'The current macro regime favors accumulating on pullbacks (Buy the Dip) at Money Line support for US Stocks and Crypto, while maintaining a strategic safe-haven allocation to Gold ($XAU).'],
  ['Expansiune Agresivă a Lichidității (Super-Ciclul de Relaxare)', 'Aggressive Liquidity Expansion (Easing Supercycle)'],
  ['O reducere de 50 bps a dobânzii Fed coroborată cu un CPI la 2.5% semnalează victoria deplină asupra inflației și deschide supapa de lichiditate maximă pentru piețele globale de capital.', 'A 50 bps Fed rate cut combined with CPI at 2.5% signals a decisive victory over inflation and opens the maximum-liquidity channel for global capital markets.'],
  ['Pauză Tactica Fed pe Fond de Inflație Persistentă (Sticky CPI)', 'Tactical Fed Pause Amid Persistent Inflation (Sticky CPI)'],
  ['Creșterea CPI peste 3.3% ar determina Fed să tempereze ritmul reducerilor de dobândă, menținând un regim de dobânzi ridicate pe termen mai lung (Higher for Longer).', 'CPI above 3.3% would cause the Fed to slow the pace of rate cuts, maintaining a Higher-for-Longer regime.'],
  ['Consolidare & Rotație spre Valoare', 'Consolidation & Rotation into Value'],
  ['Consolidare / Range Volatil', 'Consolidation / Volatile Range'],
  ['Creștere Evaluări P/E', 'P/E Multiple Expansion'],
  ['Slăbire DXY & Inflows', 'Weaker DXY & Inflows'],
  ['Hedge Inflație', 'Inflation Hedge'],
  ['Corelație M2 +85%', 'M2 Correlation +85%'],
  ['Scădere Cost Capital', 'Lower Cost of Capital'],
  ['Hedge Datorie', 'Debt Hedge'],
  ['Radar de Riscuri Macro de Monitorizat', 'Macro Risk Radar to Monitor'],
  ['Simulator Interactiv de Scenarii Macro (What-If AI Engine)', 'Interactive Macro Scenario Simulator (What-If AI Engine)'],
  ['Curba Randamentelor Trezoreriei SUA (Yield Curve)', 'US Treasury Yield Curve'],
  ['Indici Majori & Barometru Macro', 'Major Indices & Macro Barometer'],
  ['Sentiment Consumator (U. Mich):', 'Consumer Sentiment (U. Mich):'],
  ['Joburi Noi (NFP)', 'New Jobs (NFP)'],
  ['din PIB', 'of GDP'],
  ['/ an', '/ year'],
  ['Grad de Încredere Model AI:', 'AI Model Confidence:'],
  ['Teză Acționabilă de Trading (Buy the Dip)', 'Actionable Trading Thesis (Buy the Dip)'],
  ['Modifică parametrii pentru a recalcula interpretarea AI', 'Change parameters to recalculate the AI interpretation'],
  ['Reducere Dobândă Fed:', 'Fed Rate Cut:'],
  ['Nivel CPI Inflație:', 'CPI Inflation Level:'],
  ['Pauză (0 bps)', 'Pause (0 bps)'],
  ['Platforma Oficială TradingView v6', 'Official TradingView v6 Platform'],
  ['MoneyLine Force v1 (cu Nor & Bara Instrumente TradingView)', 'MoneyLine Force v1 (with Cloud & TradingView Toolbar)'],
  ['TradingView Oficial (Iframe)', 'Official TradingView (Iframe)'],
  ['TradingView Oficial + MoneyLine', 'Official TradingView + MoneyLine'],
  ['MoneyLine pe TradingView:', 'MoneyLine on TradingView:'],
  ['SuperTrendul nativ oferă reperul vizual direct în grafic, iar pragul exact MoneyLine pentru', 'The native SuperTrend provides a visual reference directly on the chart, while the exact MoneyLine threshold for'],
  ['este linia colorată', 'is the colored'],
  ['PRAG ML EXACT', 'EXACT ML THRESHOLD'],
  ['de sus.', 'line above.'],
  ['Bara laterală din stânga este panoul oficial TradingView pentru instrumentele de desen.', 'The left sidebar is TradingView’s official drawing-tools panel.'],
  ['Mod Cursor (Pan & Zoom normal)', 'Cursor Mode (Normal Pan & Zoom)'],
  ['Cotație:', 'Quote:'],
  ['Bază Nor:', 'Cloud Base:'],
  ['Baza Nor (Fast Supertrend)', 'Cloud Base (Fast Supertrend)'],
  ['Margine Nor (Slow Supertrend)', 'Cloud Edge (Slow Supertrend)'],
  ['Baza Nor (Fast):', 'Cloud Base (Fast):'],
  ['Margine Nor (Slow):', 'Cloud Edge (Slow):'],
  ['Peste SMA 200', 'Above SMA 200'],
  ['Sub SMA 200', 'Below SMA 200'],
  ['Peste (Bull)', 'Above (Bull)'],
  ['Sub (Bear)', 'Below (Bear)'],
  ['Copiază Pine Script', 'Copy Pine Script'],
  ['COPIAT!', 'COPIED!'],
  ['Instrucțiuni:', 'Instructions:'],
  ['Deschide TradingView', 'Open TradingView'],
  ['Lipește scriptul', 'Paste the script'],
  ['Bara Oficială TradingView:', 'Official TradingView Toolbar:'],
  ['Bara TradingView:', 'TradingView Toolbar:'],
  ['Indicatori', 'Indicators'],
  ['MĂSURARE % ACTIVĂ', '% MEASUREMENT ACTIVE'],
  ['Măsoară %', 'Measure %'],
  ['Atinge prima lumânare (Start), apoi a 2-a lumânare (Target)', 'Tap the first candle (Start), then the second candle (Target)'],
  ['Riglă de Măsurat Procente', 'Percentage Measurement Ruler'],
  ['% Variație & Diferență Preț', '% Change & Price Difference'],
  ['Al 2-lea instrument', 'Second tool'],
  ['Linie de Trend', 'Trend Line'],
  ['Click pe start, trage și lasă', 'Click the start, drag and release'],
  ['Trage linia spre infinit la dreapta', 'Extend the line infinitely to the right'],
  ['Click pentru a plasa', 'Click to place'],
  ['Niveluri 23.6%, 38.2%, 50%, 61.8% Golden Pocket, 78.6%', 'Levels 23.6%, 38.2%, 50%, 61.8% Golden Pocket, 78.6%'],
  ['Canal de Trend Paralel', 'Parallel Trend Channel'],
  ['Click & Trage', 'Click & Drag'],
  ['Target Verde, Stop Loss Roșu & Raport Risc:Recompensă', 'Green Target, Red Stop Loss & Risk:Reward Ratio'],
  ['Rază Extinsă', 'Extended Ray'],
  ['Nivel Orizontal Suport / Rezistență', 'Horizontal Support / Resistance Level'],
  ['Linie Verticală Marcaj Timp / Sesiune', 'Vertical Time / Session Marker'],
  ['Dreptunghi / Zonă de Consolidare', 'Rectangle / Consolidation Zone'],
  ['Poziție Long', 'Long Position'],
  ['Poziție Short', 'Short Position'],
  ['Anulează ultimul desen', 'Undo Last Drawing'],
  ['Șterge toate desenele', 'Delete All Drawings'],
  ['Șterge Măsurătoare', 'Delete Measurement'],
  ['Suport / Rezistență', 'Support / Resistance'],
  ['Rază', 'Ray'],
  ['Orizontal', 'Horizontal'],
  ['Vertical', 'Vertical'],
  ['Canal', 'Channel'],
  ['Riglă', 'Ruler'],
  ['bară', 'bar'],
  ['bare', 'bars'],
  ['Preț', 'Price'],
  ['Analiză AI', 'AI Analysis'],
  ['Știri & Social', 'News & Social'],
  ['Variație Medie 24h', '24h Average Change'],
  ['Medie 24h', '24h Average'],
  ['Var. 24h', '24h Change'],
  ['Variație', 'Change'],
  ['Scor Money Line', 'Money Line Score'],
  ['Regim / Tier', 'Regime / Tier'],
  ['Volatilitate ATR', 'ATR Volatility'],
  ['Active filtrate:', 'Filtered assets:'],
  ['Inspectează toate firmele din această narativă', 'Inspect all companies in this narrative'],
  ['FLIP NOU', 'NEW FLIP'],
  ['Acțiuni', 'Actions'],
  ['Semnale:', 'Signals:'],
  ['Filtru Activ', 'Active Filter'],
  ['Narativă AI', 'AI Narrative'],
  ['Compoziție Sector', 'Sector Composition'],
  ['Caută firmă sau ticker în această narativă...', 'Search company or ticker in this narrative...'],
  ['Scor ML', 'ML Score'],
  ['Click pe orice rând pentru a deschide graficul TradingView', 'Click any row to open the TradingView chart'],
  ['Filtrat:', 'Filtered:'],
  ['Actualizează', 'Refresh'],
  ['Selectează:', 'Select:'],
  ['Selectează', 'Select'],
  ['Navighează:', 'Navigate:'],
  ['Închide:', 'Close:'],
  ['Închide', 'Close'],
  ['Anulează', 'Cancel'],
  ['Șterge textul', 'Clear text'],
  ['Niciun activ găsit pentru', 'No asset found for'],
  ['Încearcă:', 'Try:'],
  ['Niciunul', 'None'],
  ['Fără date', 'No data'],
  ['Creștere', 'Gain'],
  ['Scădere', 'Decline'],
  ['Actualizat', 'Updated'],
  ['Chiar acum', 'Right now'],
  ['instrumente', 'instruments'],
  ['Aur', 'Gold'],
  ['Argint', 'Silver'],
  ['Cupru', 'Copper'],
  ['Toate', 'All'],
  ['Se verifică calitatea crypto…', 'Checking crypto quality…'],
  ['Eroare la încărcarea datelor de calitate crypto', 'Error loading crypto quality data'],
  ['Se evaluează profitabilitatea și calitatea acțiunilor…', 'Evaluating stock profitability and business quality…'],
  ['Se evaluează profitabilitatea și calitatea acțiunii…', 'Evaluating stock profitability and business quality…'],
  ['Eroare la încărcarea datelor de calitate a acțiunilor', 'Error loading stock quality data'],
  ['Acțiunea nu are încă suficiente date financiare în scannerul fundamental', 'This stock does not yet have sufficient financial data in the fundamental scanner'],
  ['Stock Business Quality & Profitability', 'Stock Business Quality & Profitability'],
  ['Stock Business Quality · 6 Criterii & Indicatori Profitabilitate', 'Stock Business Quality · 6 Criteria & Profitability Indicators'],
  ['Calitate & Profitabilitate', 'Quality & Profitability'],
  ['Top AI Recomandat', 'Top AI Pick'],
  ['Top AI Recomandate', 'Top AI Picks'],
  ['6/6 Criterii Confirmate', '6/6 Criteria Confirmed'],
  ['Calitate Solidă', 'Solid Quality'],
  ['Risc Ridicat', 'High Risk'],
  ['Marje Mari & ROE', 'High Margins & ROE'],
  ['Creștere & Cash Flow', 'Growth & Free Cash Flow'],
  ['Creștere & FCF', 'Growth & FCF'],
  ['Valoare & Dividende', 'Value & Dividends'],
  ['Profitabilitate & Marje', 'Profitability & Margins'],
  ['Eficiența Capitalului', 'Capital Efficiency'],
  ['Eficiență Capital', 'Capital Efficiency'],
  ['Creștere Venituri & EPS', 'Revenue & EPS Growth'],
  ['Sănătate Financiară', 'Financial Health'],
  ['Cash Flow & Retur Acționari', 'Cash Flow & Shareholder Return'],
  ['Evaluare & Moat (PEG)', 'Valuation & Moat (PEG)'],
  ['Evaluare & Moat', 'Valuation & Moat'],
  ['Indicatori Financiari Cheie', 'Key Financial Indicators'],
  ['Teză Calitativă AI & Profitabilitate', 'AI Qualitative & Profitability Thesis'],
  ['Marjă Netă', 'Net Margin'],
  ['Marjă Operațională', 'Operating Margin'],
  ['Marjă Op', 'Op Margin'],
  ['Creștere Venituri YoY', 'Rev Growth YoY'],
  ['Creșt. YoY', 'Rev YoY'],
  ['criterii confirmate', 'criteria confirmed'],
  ['Verificat ultima dată', 'Last verified'],
  ['Surse de date', 'Data sources'],
  ['Metodologie', 'Methodology'],
  ['Clasificare', 'Classification'],
  ['Scor total', 'Total score'],
  ['Vezi pe CoinGecko', 'View on CoinGecko'],
  ['Vezi pe Yahoo Finance', 'View on Yahoo Finance'],
  ['4/4 confirmat', '4/4 confirmed'],
  ['Primele 3 confirmate', 'First 3 confirmed'],
  ['Parțial', 'Partial'],
  ['Date insuficiente', 'Insufficient Data'],
  ['Confirmat', 'Confirmed'],
  ['De urmărit', 'Watch'],
  ['Top 50 Stocks după Market Cap', 'Top 50 Stocks by Market Cap'],
  ['Top 50 Crypto — Clasament Market Cap', 'Top 50 Crypto — Market Cap Ranking'],
  ['Top 50 Stocks — Clasament Market Cap', 'Top 50 Stocks — Market Cap Ranking'],
  ['Listă completă cu preț live, variație interval și randament YTD %.', 'Detailed breakdown with live price, timeframe return and YTD % return.'],
  ['Caută în Top 50...', 'Search in Top 50...'],
  ['Niciun asset găsit.', 'No assets found.'],
  ['Randament YTD', 'YTD Return'],
  ['Se construiește heat map-ul live...', 'Building the live heat map...'],
  ['Despre Activ · Profil & Ce Face', 'Asset Profile & Core Utility'],
  ['Cu ce se ocupă', 'What It Does'],
  ['Utilitate & Produs Principal', 'Core Utility & Products'],
  ['Origine & Lansare', 'Origin & Background'],
  ['Puncte Cheie de Reținut', 'Key Highlights'],
  ['Activ Criptografic', 'Crypto Protocol'],
  ['Companie Listată Public', 'Public Equity'],
  ['Marfă / Metal', 'Commodity / Metal'],
  ['Actualizează datele', 'Refresh data'],
  // Sidebar + market-filter chrome (static Romanian source strings)
  ['Caută un activ, simbol sau companie…', 'Search any asset, symbol or company…'],
  ['Market Scanner — pagina principală', 'Market Scanner — home page'],
  ['Retrage meniul lateral', 'Collapse sidebar'],
  ['Navigare principală', 'Main navigation'],
  ['Toate piețele', 'All markets'],
  ['Metale', 'Metals'],
  ['Alerte', 'Alerts'],
  ['EXPLORARE', 'EXPLORE'],
  ['CERCETARE', 'RESEARCH'],
  ['Mai multă claritate. Mai puțin zgomot.', 'More clarity. Less noise.']
];

// Stock Business Quality payload (apps/api stock-business-quality-scanner.ts)
// is authored in Romanian; these pairs localise its criterion values,
// explanations, theses, methodology and disclaimer when English is selected.
export const STOCK_BQ_PAIRS: Array<[string, string]> = [
  ["Marjă Netă: {} | Op: {}", "Net Margin: {} | Op: {}"],
  ["Venituri: {} | EPS: {}", "Revenue: {} | EPS: {}"],
  ["FCF: {} | Randament: {}", "FCF: {} | Yield: {}"],
  ["Putere mare de stabilire a prețului: Marjă operațională {} și netă {} peste pragul de 10-15%.", "Strong pricing power: operating margin {} and net margin {} above the 10-15% threshold."],
  ["Profitabil, dar marjele ({} net) sunt moderate sau sub presiune concurențială.", "Profitable, but margins ({} net) are moderate or under competitive pressure."],
  ["Marje negative sau pierderi operaționale/nete.", "Negative margins or operating/net losses."],
  ["Randament excelent al capitalului propriu (ROE {}), demonstrând alocare eficientă a capitalului și moat competitiv.", "Excellent return on equity (ROE {}), showing efficient capital allocation and a competitive moat."],
  ["Randament mediu al capitalului propriu ({} ROE); performanță aliniată mediei sectoriale.", "Average return on equity ({} ROE); performance in line with the sector average."],
  ["Randament scăzut sau distrugere de valoare pentru capitalul acționarilor.", "Low returns or value destruction for shareholders' equity."],
  ["Accelerare robustă a veniturilor ({} YoY) și a profitului per acțiune ({}).", "Strong acceleration in revenue ({} YoY) and earnings per share ({})."],
  ["Creștere moderată sau stabilă ({} YoY); companie matură.", "Moderate or steady growth ({} YoY); mature company."],
  ["Contracție a veniturilor ({} YoY) sau scădere a profitabilității.", "Revenue contraction ({} YoY) or falling profitability."],
  ["Bilanț solid (Debt/Equity {}, Rata Curentă {}, poziție Net Cash); risc minim de faliment/diluare.", "Solid balance sheet (Debt/Equity {}, Current Ratio {}, net cash position); minimal bankruptcy/dilution risk."],
  ["Bilanț solid (Debt/Equity {}, Rata Curentă {}); risc minim de faliment/diluare.", "Solid balance sheet (Debt/Equity {}, Current Ratio {}); minimal bankruptcy/dilution risk."],
  ["Grad moderat de îndatorare ({}); necesită monitorizarea ratelor dobânzilor.", "Moderate leverage ({}); interest rates need monitoring."],
  ["Grad ridicat de îndatorare sau risc de lichiditate pe termen scurt.", "High leverage or short-term liquidity risk."],
  ["Generare puternică de numerar liber ({} FCF) combinată cu returnare de capital (dividende {} + răscumpărări {}).", "Strong free cash flow generation ({} FCF) combined with capital returns (dividends {} + buybacks {})."],
  ["Cash flow pozitiv ({}), dar distribuțiile către acționari sunt reduse sau reinvestite integral.", "Positive cash flow ({}), but shareholder payouts are small or fully reinvested."],
  ["Cash flow negativ (cash burn); compania depinde de finanțare externă sau diluare.", "Negative cash flow (cash burn); the company depends on external financing or dilution."],
  ["Evaluare atractivă sau echitabilă raportată la ritmul de creștere (PEG {}, Forward P/E {}).", "Attractive or fair valuation relative to growth (PEG {}, Forward P/E {})."],
  ["Evaluare cu primă de creștere (Forward P/E {}); piața include așteptări mari de execuție.", "Valuation carries a growth premium (Forward P/E {}); the market prices in high execution expectations."],
  ["Evaluare extinsă sau raport PEG dezechilibrat ({}).", "Stretched valuation or unbalanced PEG ratio ({})."],
  ["Preț/Venituri (P/R)", "Price/Revenue (P/R)"],
  ["Solvabilitate", "Solvency"],
  ["Date insuficiente pentru evaluare (PEG / Forward P/E).", "Insufficient data for valuation (PEG / Forward P/E)."],
  ["Chips & Siliciu", "Chips & Silicon"],
  ["Energie & Petrol", "Energy & Oil"],
  ["Indici & ETF-uri", "Indices & ETFs"],
  ["Bilanț solid: îndatorare redusă și lichiditate bună.", "Solid balance sheet: low leverage and good liquidity."],
  ["Îndatorare moderată; de urmărit costul dobânzilor.", "Moderate leverage; watch interest costs."],
  ["Îndatorare ridicată sau lichiditate slabă pe termen scurt.", "High leverage or weak short-term liquidity."],
  ["Date insuficiente pentru solvabilitate.", "Insufficient data for solvency."],
  ["Date insuficiente: fără date financiare de companie (ETF / indice).", "Insufficient data: no company financials (ETF / index)."],
  ["P/E moderat raportat la profitul realizat.", "Moderate P/E relative to realised earnings."],
  ["P/E cu primă; piața plătește pentru creștere.", "Premium P/E; the market is paying for growth."],
  ["P/E ridicat; așteptări mari incluse în preț.", "High P/E; high expectations priced in."],
  ["Fără P/E valid (profit negativ sau date lipsă).", "No valid P/E (negative earnings or missing data)."],
  ["Preț/Venituri", "Price/Revenue"],
  ["Evaluare rezonabilă raportată la venituri (P/R {}); piața plătește un multiplu moderat pentru veniturile TTM.", "Reasonable valuation relative to revenue (P/R {}); the market pays a moderate multiple for TTM revenue."],
  ["Primă moderată pe venituri (P/R {}); creșterea trebuie să susțină multiplul plătit.", "Moderate revenue premium (P/R {}); growth must justify the multiple paid."],
  ["Evaluare scumpă raportată la venituri (P/R {}); așteptări mari sunt deja incluse în preț.", "Expensive valuation relative to revenue (P/R {}); high expectations are already priced in."],
  ["Date insuficiente pentru raportul Preț/Venituri.", "Insufficient data for the Price/Revenue ratio."],
  ["Preț/Venituri: P/R ≤ 10x (capitalizare raportată la veniturile TTM) indică o evaluare rezonabilă; peste 20x este scump.", "Price/Revenue: P/R ≤ 10x (market cap vs TTM revenue) indicates a reasonable valuation; above 20x is expensive."],
  ["Date financiare live Yahoo Finance (TTM) completate din baza de date curată; snapshot 26h cu cache Firestore", "Live Yahoo Finance financial data (TTM) topped up from the curated database; 26h snapshot with Firestore cache"],
  ["{} este o acțiune de elită cu profitabilitate excepțională (Marjă netă {}), randament ridicat pe capital (ROE {}), bilanț fortăreață și generare masivă de Free Cash Flow ({}).", "{} is an elite stock with exceptional profitability (net margin {}), high return on capital (ROE {}), a fortress balance sheet and massive free cash flow ({})."],
  ["{} îndeplinește toate cele 6 criterii fundamentale de profitabilitate, sănătate a bilanțului, creștere și evaluare echilibrată.", "{} meets all 6 fundamental criteria: profitability, balance-sheet health, growth and balanced valuation."],
  ["{} se remarcă prin marje nete ({}) și eficiență a capitalului ({} ROE) de top în industrie.", "{} stands out with industry-leading net margins ({}) and capital efficiency ({} ROE)."],
  ["{} combină creșterea accelerată a veniturilor ({}) cu un flux de numerar liber pozitiv ({}).", "{} combines accelerating revenue growth ({}) with positive free cash flow ({})."],
  ["{} oferă un profil defensiv cu dividend sustenabil ({}), îndatorare redusă și evaluare conservatoare.", "{} offers a defensive profile with a sustainable dividend ({}), low leverage and a conservative valuation."],
  ["{} nu are date financiare de companie (marje, ROE, creștere, FCF), deci nu primește scor de calitate.", "{} has no company financials (margins, ROE, growth, FCF), so it gets no quality score."],
  ["{} prezintă vulnerabilități fundamentale: marje reduse/negative, grad mare de îndatorare sau evaluare supracumpărată.", "{} shows fundamental weaknesses: thin/negative margins, high leverage or a stretched valuation."],
  ["{} are un profil fundamental echilibrat cu profitabilitate stabilă și risc moderat.", "{} has a balanced fundamental profile with stable profitability and moderate risk."],
  ["De Urmărit", "Watch"],
  ["Rapoarte 10-K/10-Q & date financiare verificate; snapshot 26h cu cache Firestore", "10-K/10-Q reports & verified financial data; 26h snapshot with Firestore cache"],
  ["Profitabilitate & Marje: Marjă operațională ≥ 15% și marjă netă ≥ 10% dovedesc pricing power și profitabilitate robustă.", "Profitability & Margins: operating margin ≥ 15% and net margin ≥ 10% show pricing power and strong profitability."],
  ["Eficiența Capitalului: ROE ≥ 15% sau ROA ≥ 8% confirmă generarea superioară de valoare din capitalul acționarilor.", "Capital Efficiency: ROE ≥ 15% or ROA ≥ 8% confirms superior value creation from shareholders' equity."],
  ["Creștere Sustenabilă: Creștere venituri ≥ +8% YoY combinată cu extinderea profitului per acțiune (EPS).", "Sustainable Growth: revenue growth ≥ +8% YoY combined with expanding earnings per share (EPS)."],
  ["Sănătate Financiară: Debt/Equity ≤ 1.2 sau Net Cash cu Rata Curentă ≥ 1.1 garantează rezistență în fața dobânzilor mari.", "Financial Health: Debt/Equity ≤ 1.2 or net cash with a Current Ratio ≥ 1.1 ensures resilience to high interest rates."],
  ["Cash Flow & Valoare: Free Cash Flow masiv pozitiv cu distribuții active prin răscumpărări de acțiuni sau dividende sustenabile.", "Cash Flow & Value: strongly positive free cash flow with active payouts through buybacks or sustainable dividends."],
  ["Evaluare & Moat: Raport PEG ≤ 2.0 sau Forward P/E rezonabil relativ la profitabilitate și marja de siguranță.", "Valuation & Moat: PEG ratio ≤ 2.0 or a reasonable Forward P/E relative to profitability and margin of safety."],
  ["Scanner fundamental și model calitativ de cercetare bazat pe date financiare auditate. Nu reprezintă un semnal direct de tranzacționare sau sfat individual de investiții.", "Fundamental scanner and qualitative research model based on audited financial data. Not a direct trading signal or individual investment advice."],
];

export const ALL_PAIRS: Array<[string, string]> = [...BASE_PAIRS, ...UI_PAIRS, ...UI_PAIRS_2, ...CONTENT_PAIRS, ...STOCK_BQ_PAIRS];

const normalise = (value: string) => value.replace(/[\s\u00a0]+/g, ' ').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface CompiledTemplate { regex: RegExp; target: string; }
interface CompiledPhrase { source: string; regex: RegExp; target: string; }
interface Direction { exact: Map<string, string>; templates: CompiledTemplate[]; phrases: CompiledPhrase[]; }

function compileDirection(pairs: Array<[string, string]>, exactOnly: Array<[string, string]> = []): Direction {
  const exact = new Map<string, string>();
  for (const [rawSource, rawTarget] of exactOnly) {
    const source = normalise(rawSource);
    const target = normalise(rawTarget);
    if (source && source !== target && !exact.has(source)) exact.set(source, target);
  }
  const templates: CompiledTemplate[] = [];
  const phrases: CompiledPhrase[] = [];
  for (const [rawSource, rawTarget] of pairs) {
    const source = normalise(rawSource);
    const target = normalise(rawTarget);
    if (!source || source === target) continue;
    if (source.includes('{}')) {
      const pattern = source.split('{}').map(escapeRegex).join('(.+?)');
      templates.push({ regex: new RegExp(`^${pattern}$`, 'u'), target });
      continue;
    }
    if (!exact.has(source)) exact.set(source, target);
    if (source.length >= 3) {
      phrases.push({ source, target, regex: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(source)}(?![\\p{L}\\p{N}])`, 'gu') });
    }
  }
  templates.sort((a, b) => b.regex.source.length - a.regex.source.length);
  phrases.sort((a, b) => b.source.length - a.source.length);
  return { exact, templates, phrases };
}

let compiled: { en: Direction; ro: Direction } | null = null;
function directions() {
  if (!compiled) {
    compiled = {
      en: compileDirection(ALL_PAIRS, UI_EXACT_PAIRS),
      ro: compileDirection(ALL_PAIRS.map(([ro, en]) => [en, ro] as [string, string]), UI_EXACT_PAIRS.map(([ro, en]) => [en, ro] as [string, string]))
    };
  }
  return compiled;
}

function fillTemplate(target: string, captures: string[], direction: Direction): string {
  let index = 0;
  return target.replace(/\{\}/g, () => {
    const value = captures[index++] ?? '';
    return direction.exact.get(normalise(value)) ?? value;
  });
}

function translateCore(core: string, language: Language): string {
  const direction = directions()[language];
  const key = normalise(core);
  const exact = direction.exact.get(key);
  if (exact !== undefined) return exact;
  for (const template of direction.templates) {
    const match = key.match(template.regex);
    if (match) return fillTemplate(template.target, match.slice(1), direction);
  }
  let output = core;
  for (const phrase of direction.phrases) {
    if (!output.includes(phrase.source)) continue;
    phrase.regex.lastIndex = 0;
    output = output.replace(phrase.regex, phrase.target);
  }
  return output;
}

const TRANSLATION_CACHE_LIMIT = 5000;
const translationCache: Record<Language, Map<string, string>> = { ro: new Map(), en: new Map() };

function translateTextUncached(value: string, language: Language): string {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = match?.[1] ?? '';
  const core = match?.[2] ?? value;
  const trail = match?.[3] ?? '';
  if (!core || !/\p{L}/u.test(core)) return value;
  let output = core;
  // Relative-time patterns first, so templates never split them.
  if (language === 'en') {
    output = output
      .replace(/Afișate (\d+) din (\d+) active/g, 'Showing $1 of $2 assets')
      .replace(/acum (\d+) zil?e? și (\d+) or[ăe]/g, '$1 days and $2 hours ago')
      .replace(/acum (\d+) or[ăe] și (\d+) minute?/g, '$1 hours and $2 minutes ago')
      .replace(/acum (\d+)z(?: (\d+)h)?/g, (_, days, hours) => `${days}d${hours ? ` ${hours}h` : ''} ago`)
      .replace(/acum (\d+)h(?: (\d+)m)?/g, (_, hours, mins) => `${hours}h${mins ? ` ${mins}m` : ''} ago`)
      .replace(/acum (\d+) minute?/g, '$1 minutes ago')
      .replace(/acum (\d+) or[ăe]/g, '$1 hours ago')
      .replace(/acum (\d+) zil?e?/g, '$1 days ago');
  }

  output = translateCore(output, language);

  return lead + output + trail;
}

export function translateText(value: string, language: Language): string {
  const cache = translationCache[language];
  const hit = cache.get(value);
  if (hit !== undefined) return hit;
  const result = translateTextUncached(value, language);
  if (cache.size >= TRANSLATION_CACHE_LIMIT) cache.clear();
  cache.set(value, result);
  return result;
}

const sourceText = new WeakMap<Text, string>();
const lastText = new WeakMap<Text, string>();
const sourceAttrs = new WeakMap<Element, Map<string, string>>();
const lastAttrs = new WeakMap<Element, Map<string, string>>();
const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

const SKIP_SELECTOR = '[translate="no"],[data-i18n-skip]';

function shouldSkipText(node: Text): boolean {
  const parent = node.parentElement;
  const tag = parent?.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'TEXTAREA') return true;
  return Boolean(parent?.closest(SKIP_SELECTOR));
}

function translateNode(node: Node, language: Language): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text;
    if (shouldSkipText(textNode)) return;
    const current = textNode.nodeValue || '';
    if (lastText.get(textNode) !== current) sourceText.set(textNode, current);
    const translated = translateText(sourceText.get(textNode) || current, language);
    lastText.set(textNode, translated);
    if (translated !== current) textNode.nodeValue = translated;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (element.closest?.(SKIP_SELECTOR)) return;
  const attrSources = sourceAttrs.get(element) || new Map<string, string>();
  const attrLast = lastAttrs.get(element) || new Map<string, string>();
  for (const attr of TRANSLATED_ATTRIBUTES) {
    if (!element.hasAttribute(attr)) continue;
    const current = element.getAttribute(attr) || '';
    if (attrLast.get(attr) !== current) attrSources.set(attr, current);
    const translated = translateText(attrSources.get(attr) || current, language);
    attrLast.set(attr, translated);
    if (translated !== current) element.setAttribute(attr, translated);
  }
  sourceAttrs.set(element, attrSources);
  lastAttrs.set(element, attrLast);

  for (const child of Array.from(element.childNodes)) translateNode(child, language);
}

function translateDocument(language: Language): void {
  const root = document.getElementById('root');
  if (root) translateNode(root, language);
}

let activeLanguage: Language = 'ro';
let dialogsPatched = false;

/** Native dialogs (alert/confirm/prompt) never pass through the DOM, so their
 * messages are translated here with the same dictionaries. */
function patchNativeDialogs(): void {
  if (dialogsPatched || typeof window === 'undefined') return;
  dialogsPatched = true;
  const originalAlert = window.alert.bind(window);
  const originalConfirm = window.confirm.bind(window);
  const originalPrompt = window.prompt.bind(window);
  window.alert = (message?: unknown) => originalAlert(translateText(String(message ?? ''), activeLanguage));
  window.confirm = (message?: string) => originalConfirm(translateText(String(message ?? ''), activeLanguage));
  window.prompt = (message?: string, value?: string) => originalPrompt(translateText(String(message ?? ''), activeLanguage), value);
}

const RO_MARKERS = /[ăâîșțşţĂÂÎȘȚ]|(^|[^\p{L}])(și|sau|pentru|este|sunt|după|fără|toate|niciun|nicio|acum|mai mult)(?=$|[^\p{L}])/iu;
const EN_MARKERS = /(^|[^\p{L}])(the|and|with|for|is|are|loading|show|hide|more|ago|failed|latest|read|view|what|does)(?=$|[^\p{L}])/iu;

/** Lists visible text that is in the other language (skip zones excluded).
 * Exposed as window.__msI18nAudit() for verification and debugging. */
export function auditLanguageLeaks(language: Language, root: HTMLElement | null = document.getElementById('root')): string[] {
  if (!root) return [];
  const marker = language === 'en' ? RO_MARKERS : EN_MARKERS;
  const leaks = new Set<string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = normalise(node.nodeValue || '');
    if (text.length < 2 || shouldSkipText(node as Text)) continue;
    if (!(node.parentElement?.getClientRects().length)) continue;
    if (marker.test(text)) leaks.add(text.slice(0, 160));
  }
  for (const element of Array.from(root.querySelectorAll('[placeholder],[title],[aria-label]'))) {
    if (element.closest(SKIP_SELECTOR)) continue;
    for (const attr of TRANSLATED_ATTRIBUTES) {
      const value = element.getAttribute(attr);
      if (value && marker.test(value)) leaks.add(`@${attr}: ${value.slice(0, 140)}`);
    }
  }
  return Array.from(leaks);
}

export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return resolveInitialLanguage(window.location.pathname, localStorage.getItem('money_scanner_language'));
    } catch {
      return 'ro';
    }
  });

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem('money_scanner_language', next);
    } catch {}
  };

  useEffect(() => {
    document.documentElement.lang = language;
    activeLanguage = language;
    patchNativeDialogs();
    (window as unknown as { __msI18nAudit?: () => string[] }).__msI18nAudit = () => auditLanguageLeaks(language);
    translateDocument(language);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateNode(mutation.target, language);
        if (mutation.type === 'attributes') translateNode(mutation.target, language);
        for (const added of Array.from(mutation.addedNodes)) translateNode(added, language);
      }
    });
    const root = document.getElementById('root');
    if (root) observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: TRANSLATED_ATTRIBUTES });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
