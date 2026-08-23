import { AssetInfo, NarrativeDefinition, MarketNarrativeId } from '../types/market.js';

export const NARRATIVE_DEFINITIONS: NarrativeDefinition[] = [
  {
    id: 'broad_market',
    name: 'Broad Market Indices & ETFs',
    shortName: 'Indici & ETF-uri',
    tagline: 'Expunere diversificată pe indicii principali și ETF-urile de referință',
    icon: 'BarChart3',
    category: 'market'
  },
  {
    id: 'ai_ecosystem',
    name: 'AI Software & Autonomous Intelligence',
    shortName: 'AI Software',
    tagline: 'Platforme software AI, automatizare, analiză de date și inteligență autonomă',
    icon: 'BrainCircuit',
    category: 'tech'
  },
  {
    id: 'semiconductors',
    name: 'Semiconductors & Chips',
    shortName: 'Chips & Siliciu',
    tagline: 'Fabs, GPU, procesoare, echipamente litografie și arhitecturi de calcul avansat',
    icon: 'Cpu',
    category: 'tech'
  },
  {
    id: 'consumer_staples',
    name: 'Consumer Staples & Defensive Value',
    shortName: 'Staples & Value',
    tagline: 'Bunuri de larg consum, retail global, alimente, băuturi și dividende defensive',
    icon: 'ShoppingBag',
    category: 'defense_staples'
  },
  {
    id: 'consumer_platforms',
    name: 'Consumer Technology, Commerce & Mobility',
    shortName: 'Consumer Tech',
    tagline: 'Platforme digitale, comerț global, dispozitive și mobilitate electrică',
    icon: 'ShoppingCart',
    category: 'defense_staples'
  },
  {
    id: 'cloud_enterprise',
    name: 'Cloud, SaaS & Enterprise Data',
    shortName: 'Cloud & SaaS',
    tagline: 'Infrastructură cloud, baze de date, securitate cibernetică și platforme SaaS',
    icon: 'Cloud',
    category: 'tech'
  },
  {
    id: 'energy_commodities',
    name: 'Energy, Oil & Renewables',
    shortName: 'Energie & Petrol',
    tagline: 'Petrol, gaze, servicii energetice, energie solară și regenerabile',
    icon: 'Flame',
    category: 'energy'
  },
  {
    id: 'space_defense',
    name: 'Space, Aerospace & Defense Tech',
    shortName: 'Space & Defense',
    tagline: 'Rachete spațiale, sateliți, apărare aerospațială, drone și securitate națională',
    icon: 'Rocket',
    category: 'defense_staples'
  },
  {
    id: 'precious_metals',
    name: 'Precious Metals & Monetary Hedges',
    shortName: 'Metale Prețioase',
    tagline: 'Aur, argint, platină, paladiu și vehicule listate cu acoperire fizică',
    icon: 'Gem',
    category: 'metals'
  },
  {
    id: 'industrial_metals',
    name: 'Industrial Metals & Electrification',
    shortName: 'Metale Industriale',
    tagline: 'Cupru și producători esențiali pentru rețele, construcții și electrificare',
    icon: 'Factory',
    category: 'metals'
  },
  {
    id: 'critical_minerals',
    name: 'Battery & Critical Minerals',
    shortName: 'Minerale Critice',
    tagline: 'Litiu, pământuri rare și metale strategice pentru baterii și tehnologie',
    icon: 'BatteryCharging',
    category: 'metals'
  },
  {
    id: 'crypto_l1',
    name: 'Layer 1 & High-Throughput Chains',
    shortName: 'Crypto Layer 1',
    tagline: 'Monede de bază, blockchain-uri monolitice și modulare, smart contract platforms',
    icon: 'Layers',
    category: 'crypto'
  },
  {
    id: 'crypto_l2',
    name: 'Layer 2 & Scaling Networks',
    shortName: 'Crypto Layer 2',
    tagline: 'Rollups și rețele de scalare pentru Ethereum și ecosistemele modulare',
    icon: 'Boxes',
    category: 'crypto'
  },
  {
    id: 'crypto_defi',
    name: 'DeFi & Next-Gen Financial Infrastructure',
    shortName: 'DeFi & Fintech',
    tagline: 'DEX-uri, piețe de creditare, tokenizare RWA, staking și infrastructură fintech',
    icon: 'Coins',
    category: 'crypto'
  },
  {
    id: 'crypto_ai',
    name: 'Crypto AI & Decentralized Compute',
    shortName: 'Crypto AI',
    tagline: 'Agenți AI, compute descentralizat, date și rețele de inteligență onchain',
    icon: 'Bot',
    category: 'crypto'
  },
  {
    id: 'crypto_meme',
    name: 'Meme Coins & Community Assets',
    shortName: 'Meme Coins',
    tagline: 'Active crypto conduse de comunitate, cultură și lichiditate socială',
    icon: 'Smile',
    category: 'crypto'
  },
  {
    id: 'crypto_infrastructure',
    name: 'Crypto Infrastructure & Data',
    shortName: 'Crypto Infra',
    tagline: 'Oracole, stocare, indexare, interoperabilitate și infrastructură de date',
    icon: 'Network',
    category: 'crypto'
  },
  {
    id: 'crypto_rwa',
    name: 'Real World Assets & Tokenization',
    shortName: 'Crypto RWA',
    tagline: 'Tokenizarea activelor reale, trezorerii și infrastructură financiară onchain',
    icon: 'Landmark',
    category: 'crypto'
  },
  {
    id: 'crypto_gaming',
    name: 'Gaming, Metaverse & Digital Ownership',
    shortName: 'Crypto Gaming',
    tagline: 'Jocuri blockchain, NFT-uri utilitare și proprietate digitală',
    icon: 'Gamepad2',
    category: 'crypto'
  }
];

const cryptoCatalogAsset = (
  symbol: string,
  name: string,
  category: AssetInfo['category'],
  marketCap: number,
  rank: number,
  decimals = 4
): AssetInfo => ({
  symbol,
  name,
  category,
  marketClass: 'crypto',
  narratives: [],
  quoteCurrency: 'USDT',
  aliases: [symbol.toLowerCase(), name.toLowerCase()],
  marketCap,
  rank,
  decimals,
  exchange: 'BINANCE',
  instrumentType: 'spot',
  marketDataSource: 'binance_spot'
});

const metalCatalogAsset = (
  symbol: string,
  name: string,
  marketCap: number,
  rank: number,
  instrumentType: 'equity' | 'etf' = 'equity'
): AssetInfo => ({
  symbol,
  name,
  category: 'Commodity',
  marketClass: 'metals',
  narratives: [],
  quoteCurrency: 'USD',
  aliases: [symbol.toLowerCase(), name.toLowerCase()],
  marketCap,
  rank,
  decimals: 2,
  exchange: instrumentType === 'etf' ? 'NYSEARCA' : 'NYSE/NASDAQ',
  instrumentType,
  marketDataSource: 'public_stock'
});

const stockEtfCatalogAsset = (
  symbol: string,
  name: string,
  assetsUnderManagement: number,
  rank: number
): AssetInfo => ({
  symbol,
  name,
  category: 'Index / ETF',
  marketClass: 'stocks',
  narratives: [],
  quoteCurrency: 'USD',
  aliases: [symbol.toLowerCase(), name.toLowerCase()],
  marketCap: assetsUnderManagement,
  rank,
  decimals: 2,
  exchange: 'NYSEARCA',
  instrumentType: 'etf',
  marketDataSource: 'public_stock'
});

export const TRADING_360_ASSETS: AssetInfo[] = [
  // --- MACRO INDICES & CRYPTO DOMINANCE ---
  {
    symbol: 'BTC.D',
    name: 'Bitcoin Dominance',
    category: 'Macro / Index',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: '%',
    aliases: ['btc.d', 'bitcoin dominance', 'btc dominance', 'dominance', 'btcd', 'crypto dominance'],
    marketCap: 1350000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'ETH.D',
    name: 'Ethereum Dominance',
    category: 'Macro / Index',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: '%',
    aliases: ['eth.d', 'ethereum dominance', 'eth dominance', 'ethd'],
    marketCap: 350000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'USDT.D',
    name: 'Tether Dominance',
    category: 'Macro / Index',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: '%',
    aliases: ['usdt.d', 'tether dominance', 'usdt dominance', 'stables dominance'],
    marketCap: 120000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'TOTAL',
    name: 'Crypto Total Market Cap',
    category: 'Macro / Index',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USD',
    aliases: ['total', 'crypto total', 'total market cap', 'market cap total', 'cryptocap:total'],
    marketCap: 2450000000000,
    rank: 0,
    decimals: 0
  },
  {
    symbol: 'TOTAL2',
    name: 'Total Market Cap (Excl. BTC)',
    category: 'Macro / Index',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USD',
    aliases: ['total2', 'total 2', 'altcoin market cap', 'alts cap', 'cryptocap:total2'],
    marketCap: 1100000000000,
    rank: 0,
    decimals: 0
  },
  {
    symbol: 'TOTAL3',
    name: 'Total Altcoins (Excl. BTC & ETH)',
    category: 'Macro / Index',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USD',
    aliases: ['total3', 'total 3', 'pure altcoins', 'cryptocap:total3'],
    marketCap: 750000000000,
    rank: 0,
    decimals: 0
  },
  {
    symbol: 'DXY',
    name: 'US Dollar Currency Index',
    category: 'Macro / Index',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['dxy', 'dyxy', 'dollar index', 'us dollar', 'dolar index', 'dolar', 'usd index', 'tvc:dxy'],
    marketCap: 25000000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'VIX',
    name: 'CBOE Volatility Fear Index',
    category: 'Macro / Index',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['vix', 'volatility index', 'fear index', 'cboe vix', 'cboe:vix', 'volatilitate'],
    marketCap: 0,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'SPY',
    name: 'S&P 500 ETF Trust',
    category: 'Index / ETF',
    marketClass: 'stocks',
    narratives: ['consumer_staples', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['spy', 'sp500', 's&p 500', 'index', 'us stock market', 'bursa sua'],
    marketCap: 550000000000,
    rank: 1,
    decimals: 2
  },
  {
    symbol: 'QQQ',
    name: 'Invesco Nasdaq 100',
    category: 'Index / ETF',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['qqq', 'nasdaq', 'nasdaq 100', 'tech index', 'bursa tech'],
    marketCap: 290000000000,
    rank: 2,
    decimals: 2
  },

  // ═══════════════════════════════════════════════════════════════════
  // 1. 🤖 AI & AUTONOMOUS INTELLIGENCE (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'NVDA',
    name: 'Nvidia Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['nvidia', 'jensen huang', 'gpu', 'chips', 'ai chips', 'semiconductors', 'h100', 'blackwell'],
    marketCap: 3150000000000,
    rank: 3,
    decimals: 2
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['microsoft', 'windows', 'azure', 'bill gates', 'satya nadella', 'copilot', 'openai investor'],
    marketCap: 3310000000000,
    rank: 4,
    decimals: 2
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['apple', 'iphone', 'macbook', 'ipad', 'tim cook', 'ios', 'apple intelligence'],
    marketCap: 3420000000000,
    rank: 5,
    decimals: 2
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet (Google)',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['google', 'alphabet', 'youtube', 'sundar pichai', 'gemini', 'search engine', 'deepmind'],
    marketCap: 2050000000000,
    rank: 6,
    decimals: 2
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['amazon', 'aws', 'jeff bezos', 'andy jassy', 'ecommerce', 'bedrock ai'],
    marketCap: 1950000000000,
    rank: 7,
    decimals: 2
  },
  {
    symbol: 'META',
    name: 'Meta Platforms (Facebook)',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['meta', 'facebook', 'instagram', 'whatsapp', 'mark zuckerberg', 'llama', 'llama 3', 'ai open source'],
    marketCap: 1350000000000,
    rank: 8,
    decimals: 2
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['tesla', 'elon musk', 'ev', 'electric cars', 'robotics', 'optimus', 'fsd', 'robotaxi'],
    marketCap: 685000000000,
    rank: 9,
    decimals: 2
  },
  {
    symbol: 'ORCL',
    name: 'Oracle Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['oracle', 'larry ellison', 'oci', 'oracle cloud ai', 'database'],
    marketCap: 380000000000,
    rank: 10,
    decimals: 2
  },
  {
    symbol: 'CRM',
    name: 'Salesforce Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['salesforce', 'marc benioff', 'einstein ai', 'agentforce', 'crm'],
    marketCap: 285000000000,
    rank: 11,
    decimals: 2
  },
  {
    symbol: 'ADBE',
    name: 'Adobe Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['adobe', 'photoshop', 'firefly', 'creative cloud', 'ai generative'],
    marketCap: 230000000000,
    rank: 12,
    decimals: 2
  },
  {
    symbol: 'NOW',
    name: 'ServiceNow Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['servicenow', 'bill mcdermott', 'now platform', 'enterprise ai workflow'],
    marketCap: 175000000000,
    rank: 13,
    decimals: 2
  },
  {
    symbol: 'IBM',
    name: 'IBM Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['ibm', 'watson', 'watsonx', 'quantum computing', 'redhat'],
    marketCap: 185000000000,
    rank: 14,
    decimals: 2
  },
  {
    symbol: 'SAP',
    name: 'SAP SE',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['sap', 'erp', 'joule ai', 'enterprise software'],
    marketCap: 240000000000,
    rank: 15,
    decimals: 2
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['palantir', 'alex karp', 'peter thiel', 'ai defense', 'aip', 'foundry', 'gotham'],
    marketCap: 72000000000,
    rank: 16,
    decimals: 2
  },
  {
    symbol: 'SNOW',
    name: 'Snowflake Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['snowflake', 'data cloud', 'cortex ai', 'data warehouse'],
    marketCap: 45000000000,
    rank: 17,
    decimals: 2
  },
  {
    symbol: 'SMCI',
    name: 'Super Micro Computer',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['supermicro', 'smci', 'ai server', 'liquid cooling', 'charles liang'],
    marketCap: 35000000000,
    rank: 18,
    decimals: 2
  },
  {
    symbol: 'DELL',
    name: 'Dell Technologies',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['dell', 'michael dell', 'ai servers', 'poweredge'],
    marketCap: 95000000000,
    rank: 19,
    decimals: 2
  },
  {
    symbol: 'PATH',
    name: 'UiPath Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['uipath', 'daniel dines', 'rpa', 'ai agents', 'automation'],
    marketCap: 8500000000,
    rank: 20,
    decimals: 2
  },
  {
    symbol: 'AI',
    name: 'C3.ai Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['c3ai', 'tom siebel', 'enterprise ai'],
    marketCap: 3200000000,
    rank: 21,
    decimals: 2
  },
  {
    symbol: 'BBAI',
    name: 'BigBear.ai Holdings',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['bigbear', 'bbai', 'defense ai', 'decision intelligence'],
    marketCap: 450000000,
    rank: 22,
    decimals: 2
  },
  {
    symbol: 'SOUN',
    name: 'SoundHound AI',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['soundhound', 'soun', 'voice ai', 'automotive ai'],
    marketCap: 1600000000,
    rank: 23,
    decimals: 2
  },
  {
    symbol: 'FET',
    name: 'Artificial Superintelligence (ASI)',
    category: 'AI',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem'],
    quoteCurrency: 'USDT',
    aliases: ['fet', 'asi', 'fetch ai', 'humayun sheikh', 'artificial superintelligence', 'ocean', 'singularitynet'],
    marketCap: 3200000000,
    rank: 24,
    decimals: 4
  },
  {
    symbol: 'RENDER',
    name: 'Render Network',
    category: 'AI',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem'],
    quoteCurrency: 'USDT',
    aliases: ['render', 'rndr', 'jules urbach', 'gpu compute', 'decentralized rendering'],
    marketCap: 3100000000,
    rank: 25,
    decimals: 3
  },
  {
    symbol: 'TAO',
    name: 'Bittensor',
    category: 'AI',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem'],
    quoteCurrency: 'USDT',
    aliases: ['tao', 'bittensor', 'jacob steeves', 'subnets', 'decentralized ai'],
    marketCap: 2800000000,
    rank: 26,
    decimals: 2
  },
  {
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem', 'crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['near', 'near protocol', 'illia polosukhin', 'user owned ai', 'sharding'],
    marketCap: 5600000000,
    rank: 27,
    decimals: 3
  },
  {
    symbol: 'AR',
    name: 'Arweave & AO Compute',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem', 'crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['ar', 'arweave', 'sam williams', 'permanent storage', 'ao compute', 'ai hyperparallel'],
    marketCap: 1200000000,
    rank: 28,
    decimals: 2
  },
  {
    symbol: 'GRT',
    name: 'The Graph',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['grt', 'the graph', 'indexing', 'subgraphs', 'web3 ai data'],
    marketCap: 1650000000,
    rank: 29,
    decimals: 4
  },
  {
    symbol: 'ICP',
    name: 'Internet Computer',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem', 'crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['icp', 'dfinity', 'dominic williams', 'onchain ai canister'],
    marketCap: 3800000000,
    rank: 30,
    decimals: 2
  },
  {
    symbol: 'FIL',
    name: 'Filecoin',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem', 'crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['fil', 'filecoin', 'protocol labs', 'juan benet', 'ipfs', 'decentralized storage'],
    marketCap: 2600000000,
    rank: 32,
    decimals: 3
  },
  {
    symbol: 'WLD',
    name: 'Worldcoin',
    category: 'AI',
    marketClass: 'crypto',
    narratives: ['ai_ecosystem'],
    quoteCurrency: 'USDT',
    aliases: ['wld', 'worldcoin', 'sam altman', 'tools for humanity', 'world id', 'orb proof of personhood'],
    marketCap: 1400000000,
    rank: 33,
    decimals: 4
  },

  // ═══════════════════════════════════════════════════════════════════
  // 2. ⚡ SEMICONDUCTORS & CHIPS (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'TSM',
    name: 'Taiwan Semiconductor (TSMC)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['tsm', 'tsmc', 'foundry', 'taiwan semiconductor', 'morris chang', '3nm', '2nm'],
    marketCap: 880000000000,
    rank: 31,
    decimals: 2
  },
  {
    symbol: 'AVGO',
    name: 'Broadcom Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['avgo', 'broadcom', 'hock tan', 'custom silicon', 'asic', 'networking chips'],
    marketCap: 760000000000,
    rank: 32,
    decimals: 2
  },
  {
    symbol: 'ASML',
    name: 'ASML Holding NV',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['asml', 'euv', 'lithography', 'chip machines', 'semiconductor equipment'],
    marketCap: 320000000000,
    rank: 33,
    decimals: 2
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['amd', 'lisa su', 'ryzen', 'epyc', 'mi300', 'radeon', 'processors', 'gpu'],
    marketCap: 240000000000,
    rank: 34,
    decimals: 2
  },
  {
    symbol: 'QCOM',
    name: 'Qualcomm Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['qualcomm', 'qcom', 'snapdragon', '5g chips', 'snapdragon x elite', 'arm chips'],
    marketCap: 195000000000,
    rank: 35,
    decimals: 2
  },
  {
    symbol: 'ARM',
    name: 'Arm Holdings plc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['arm', 'arm architecture', 'rene haas', 'softbank', 'cpu ip'],
    marketCap: 145000000000,
    rank: 36,
    decimals: 2
  },
  {
    symbol: 'INTC',
    name: 'Intel Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['intel', 'pat gelsinger', 'x86', 'gaudi', 'foundry', 'chips act'],
    marketCap: 98000000000,
    rank: 37,
    decimals: 2
  },
  {
    symbol: 'TXN',
    name: 'Texas Instruments',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['txn', 'texas instruments', 'analog chips', 'embedded processors'],
    marketCap: 185000000000,
    rank: 38,
    decimals: 2
  },
  {
    symbol: 'AMAT',
    name: 'Applied Materials',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['amat', 'applied materials', 'semiconductor equipment', 'wafer fabrication'],
    marketCap: 165000000000,
    rank: 39,
    decimals: 2
  },
  {
    symbol: 'MU',
    name: 'Micron Technology',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['micron', 'mu', 'hbm3e', 'dram', 'nand', 'ai memory'],
    marketCap: 115000000000,
    rank: 40,
    decimals: 2
  },
  {
    symbol: 'LRCX',
    name: 'Lam Research Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['lam research', 'lrcx', 'wafer fabrication equipment', 'etching'],
    marketCap: 105000000000,
    rank: 41,
    decimals: 2
  },
  {
    symbol: 'KLAC',
    name: 'KLA Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['kla', 'klac', 'process control', 'yield management', 'metrology'],
    marketCap: 95000000000,
    rank: 42,
    decimals: 2
  },
  {
    symbol: 'MRVL',
    name: 'Marvell Technology',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['marvell', 'mrvl', 'custom asic', 'optical interconnect', 'datacenter chips'],
    marketCap: 68000000000,
    rank: 43,
    decimals: 2
  },
  {
    symbol: 'ADI',
    name: 'Analog Devices Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['analog devices', 'adi', 'analog chips', 'signal processing'],
    marketCap: 110000000000,
    rank: 44,
    decimals: 2
  },
  {
    symbol: 'ON',
    name: 'ON Semiconductor',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['onsemi', 'on', 'silicon carbide', 'sic', 'automotive power chips'],
    marketCap: 32000000000,
    rank: 45,
    decimals: 2
  },
  {
    symbol: 'NXPI',
    name: 'NXP Semiconductors',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['nxp', 'nxpi', 'automotive semiconductors', 'secure identification'],
    marketCap: 62000000000,
    rank: 46,
    decimals: 2
  },
  {
    symbol: 'MPWR',
    name: 'Monolithic Power Systems',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['mpwr', 'power management', 'gpu power solutions'],
    marketCap: 38000000000,
    rank: 47,
    decimals: 2
  },
  {
    symbol: 'MCHP',
    name: 'Microchip Technology',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['microchip', 'mchp', 'microcontrollers', 'mixed signal'],
    marketCap: 44000000000,
    rank: 48,
    decimals: 2
  },
  {
    symbol: 'GFS',
    name: 'GlobalFoundries Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['globalfoundries', 'gfs', 'pure play foundry'],
    marketCap: 22000000000,
    rank: 49,
    decimals: 2
  },
  {
    symbol: 'WDC',
    name: 'Western Digital Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['western digital', 'wdc', 'flash memory', 'hard drives', 'datacenter storage'],
    marketCap: 24000000000,
    rank: 50,
    decimals: 2
  },
  {
    symbol: 'STX',
    name: 'Seagate Technology',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['seagate', 'stx', 'mass data storage', 'hamr technology'],
    marketCap: 22500000000,
    rank: 51,
    decimals: 2
  },
  {
    symbol: 'TER',
    name: 'Teradyne Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['teradyne', 'ter', 'automated test equipment', 'universal robots'],
    marketCap: 19500000000,
    rank: 52,
    decimals: 2
  },
  {
    symbol: 'ENTG',
    name: 'Entegris Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['entegris', 'entg', 'advanced materials', 'microcontamination control'],
    marketCap: 18000000000,
    rank: 53,
    decimals: 2
  },
  {
    symbol: 'SWKS',
    name: 'Skyworks Solutions',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['skyworks', 'swks', 'rf chips', 'wireless analog'],
    marketCap: 14000000000,
    rank: 54,
    decimals: 2
  },
  {
    symbol: 'QRVO',
    name: 'Qorvo Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['qorvo', 'qrvo', 'rf solutions', 'connectivity'],
    marketCap: 9500000000,
    rank: 55,
    decimals: 2
  },
  {
    symbol: 'POWI',
    name: 'Power Integrations',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['power integrations', 'powi', 'gan', 'gallium nitride', 'high voltage power conversion'],
    marketCap: 3800000000,
    rank: 56,
    decimals: 2
  },
  {
    symbol: 'CRUS',
    name: 'Cirrus Logic Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['cirrus logic', 'crus', 'audio chips', 'haptics'],
    marketCap: 6200000000,
    rank: 57,
    decimals: 2
  },
  {
    symbol: 'DIOD',
    name: 'Diodes Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['diodes', 'diod', 'discrete semiconductors', 'power management'],
    marketCap: 3100000000,
    rank: 58,
    decimals: 2
  },
  {
    symbol: 'SLAB',
    name: 'Silicon Laboratories',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['silicon labs', 'slab', 'iot chips', 'wireless soic'],
    marketCap: 4100000000,
    rank: 59,
    decimals: 2
  },
  {
    symbol: 'ALAB',
    name: 'Astera Labs Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['astera labs', 'alab', 'pcie retimers', 'cxl', 'ai connectivity'],
    marketCap: 12000000000,
    rank: 60,
    decimals: 2
  },

  // ═══════════════════════════════════════════════════════════════════
  // 3. 🛒 CONSUMER STAPLES & DEFENSIVE VALUE (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'WMT',
    name: 'Walmart Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['walmart', 'wmt', 'retail king', 'grocery giant', 'doug mcmillon'],
    marketCap: 620000000000,
    rank: 61,
    decimals: 2
  },
  {
    symbol: 'COST',
    name: 'Costco Wholesale',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['costco', 'cost', 'membership warehouse', 'kirkland signature'],
    marketCap: 395000000000,
    rank: 62,
    decimals: 2
  },
  {
    symbol: 'PG',
    name: 'Procter & Gamble Co',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['pg', 'procter gamble', 'pampers', 'tide', 'gillette', 'dividend king'],
    marketCap: 405000000000,
    rank: 63,
    decimals: 2
  },
  {
    symbol: 'KO',
    name: 'The Coca-Cola Co',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['coca cola', 'ko', 'coke', 'warren buffett stock', 'beverages'],
    marketCap: 295000000000,
    rank: 64,
    decimals: 2
  },
  {
    symbol: 'PEP',
    name: 'PepsiCo Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['pepsico', 'pep', 'pepsi', 'frito lay', 'doritos', 'gatorade'],
    marketCap: 235000000000,
    rank: 65,
    decimals: 2
  },
  {
    symbol: 'MCD',
    name: 'McDonald\'s Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['mcdonalds', 'mcd', 'fast food', 'big mac', 'golden arches'],
    marketCap: 215000000000,
    rank: 66,
    decimals: 2
  },
  {
    symbol: 'NKE',
    name: 'Nike Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['nike', 'nke', 'jordan', 'just do it', 'sportswear'],
    marketCap: 125000000000,
    rank: 67,
    decimals: 2
  },
  {
    symbol: 'TGT',
    name: 'Target Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['target', 'tgt', 'retail', 'department store'],
    marketCap: 65000000000,
    rank: 68,
    decimals: 2
  },
  {
    symbol: 'CL',
    name: 'Colgate-Palmolive Co',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['colgate', 'cl', 'toothpaste', 'palmolive', 'oral care'],
    marketCap: 82000000000,
    rank: 69,
    decimals: 2
  },
  {
    symbol: 'PM',
    name: 'Philip Morris International',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['philip morris', 'pm', 'iqos', 'smoke free', 'marlboro global'],
    marketCap: 195000000000,
    rank: 70,
    decimals: 2
  },
  {
    symbol: 'MO',
    name: 'Altria Group Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['altria', 'mo', 'marlboro usa', 'on nicotine', 'high dividend yield'],
    marketCap: 92000000000,
    rank: 71,
    decimals: 2
  },
  {
    symbol: 'MDLZ',
    name: 'Mondelez International',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['mondelez', 'mdlz', 'oreo', 'cadbury', 'milka', 'snacking'],
    marketCap: 94000000000,
    rank: 72,
    decimals: 2
  },
  {
    symbol: 'GIS',
    name: 'General Mills Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['general mills', 'gis', 'cheerios', 'nature valley', 'haagen dazs'],
    marketCap: 38000000000,
    rank: 73,
    decimals: 2
  },
  {
    symbol: 'KMB',
    name: 'Kimberly-Clark Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['kimberly clark', 'kmb', 'huggies', 'kleenex', 'scott'],
    marketCap: 48000000000,
    rank: 74,
    decimals: 2
  },
  {
    symbol: 'HSY',
    name: 'The Hershey Company',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['hershey', 'hsy', 'chocolate', 'reeses', 'confectionery'],
    marketCap: 39000000000,
    rank: 75,
    decimals: 2
  },
  {
    symbol: 'EL',
    name: 'The Estée Lauder Companies',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['estee lauder', 'el', 'cosmetics', 'skincare', 'mac cosmetics', 'clinique'],
    marketCap: 34000000000,
    rank: 76,
    decimals: 2
  },
  {
    symbol: 'STZ',
    name: 'Constellation Brands',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['constellation brands', 'stz', 'corona beer', 'modelo especial'],
    marketCap: 45000000000,
    rank: 77,
    decimals: 2
  },
  {
    symbol: 'KR',
    name: 'The Kroger Co',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['kroger', 'kr', 'grocery chain', 'supermarkets'],
    marketCap: 38000000000,
    rank: 78,
    decimals: 2
  },
  {
    symbol: 'SYY',
    name: 'Sysco Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['sysco', 'syy', 'food distribution', 'restaurant supplier'],
    marketCap: 37000000000,
    rank: 79,
    decimals: 2
  },
  {
    symbol: 'ADM',
    name: 'Archer-Daniels-Midland',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples', 'energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['adm', 'archer daniels', 'agricultural processing', 'grain trading'],
    marketCap: 27000000000,
    rank: 80,
    decimals: 2
  },
  {
    symbol: 'TSN',
    name: 'Tyson Foods Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['tyson foods', 'tsn', 'chicken', 'beef', 'protein producer'],
    marketCap: 21000000000,
    rank: 81,
    decimals: 2
  },
  {
    symbol: 'K',
    name: 'Kellanova (Kellogg)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['kellanova', 'k', 'pringles', 'cheez it', 'pop tarts'],
    marketCap: 28000000000,
    rank: 82,
    decimals: 2
  },
  {
    symbol: 'CHD',
    name: 'Church & Dwight Co',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['church dwight', 'chd', 'arm hammer', 'oxiclean', 'trojan'],
    marketCap: 24000000000,
    rank: 83,
    decimals: 2
  },
  {
    symbol: 'CLX',
    name: 'The Clorox Company',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['clorox', 'clx', 'bleach', 'cleaning products', 'burt bees'],
    marketCap: 19000000000,
    rank: 84,
    decimals: 2
  },
  {
    symbol: 'MKC',
    name: 'McCormick & Company',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['mccormick', 'mkc', 'spices', 'seasoning', 'franks redhot'],
    marketCap: 22000000000,
    rank: 85,
    decimals: 2
  },
  {
    symbol: 'CAG',
    name: 'Conagra Brands Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['conagra', 'cag', 'healthy choice', 'marie callender', 'slim jim'],
    marketCap: 14000000000,
    rank: 86,
    decimals: 2
  },
  {
    symbol: 'CPB',
    name: 'The Campbell\'s Company',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['campbell soup', 'cpb', 'campbells', 'goldfish crackers', 'raos'],
    marketCap: 13500000000,
    rank: 87,
    decimals: 2
  },
  {
    symbol: 'SJM',
    name: 'The J.M. Smucker Co',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['smucker', 'sjm', 'jif peanut butter', 'folgers coffee', 'hostess'],
    marketCap: 12500000000,
    rank: 88,
    decimals: 2
  },
  {
    symbol: 'HRL',
    name: 'Hormel Foods Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['hormel', 'hrl', 'spam', 'skippy peanut butter', 'jennie o'],
    marketCap: 16500000000,
    rank: 89,
    decimals: 2
  },
  {
    symbol: 'TAP',
    name: 'Molson Coors Beverage',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['molson coors', 'tap', 'coors light', 'miller lite', 'blue moon'],
    marketCap: 11500000000,
    rank: 90,
    decimals: 2
  },

  // ═══════════════════════════════════════════════════════════════════
  // 4. ☁️ CLOUD, SAAS & ENTERPRISE DATA (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'PANW',
    name: 'Palo Alto Networks',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['palo alto', 'panw', 'cybersecurity', 'firewall', 'nikesh arora', 'prisma cloud'],
    marketCap: 120000000000,
    rank: 91,
    decimals: 2
  },
  {
    symbol: 'CRWD',
    name: 'CrowdStrike Holdings',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['crowdstrike', 'crwd', 'falcon platform', 'george kurtz', 'edr', 'cybersecurity'],
    marketCap: 88000000000,
    rank: 92,
    decimals: 2
  },
  {
    symbol: 'WDAY',
    name: 'Workday Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['workday', 'wday', 'hcm', 'cloud hcm', 'financial management'],
    marketCap: 68000000000,
    rank: 93,
    decimals: 2
  },
  {
    symbol: 'DDOG',
    name: 'Datadog Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['datadog', 'ddog', 'cloud monitoring', 'observability', 'apm'],
    marketCap: 42000000000,
    rank: 94,
    decimals: 2
  },
  {
    symbol: 'NET',
    name: 'Cloudflare Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['cloudflare', 'net', 'cdn', 'ddos protection', 'workers ai', 'edge compute'],
    marketCap: 34000000000,
    rank: 95,
    decimals: 2
  },
  {
    symbol: 'FTNT',
    name: 'Fortinet Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['fortinet', 'ftnt', 'fortigate', 'network security', 'sase'],
    marketCap: 62000000000,
    rank: 96,
    decimals: 2
  },
  {
    symbol: 'ZS',
    name: 'Zscaler Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'space_defense'],
    quoteCurrency: 'USD',
    aliases: ['zscaler', 'zs', 'zero trust', 'cloud security', 'jay chaudhry'],
    marketCap: 28000000000,
    rank: 97,
    decimals: 2
  },
  {
    symbol: 'TEAM',
    name: 'Atlassian Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise'],
    quoteCurrency: 'USD',
    aliases: ['atlassian', 'team', 'jira', 'confluence', 'trello', 'agile software'],
    marketCap: 52000000000,
    rank: 98,
    decimals: 2
  },
  {
    symbol: 'MDB',
    name: 'MongoDB Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['mongodb', 'mdb', 'nosql', 'atlas database', 'vector search'],
    marketCap: 22000000000,
    rank: 99,
    decimals: 2
  },
  {
    symbol: 'ESTC',
    name: 'Elastic N.V.',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['cloud_enterprise', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['elastic', 'estc', 'elasticsearch', 'kibana', 'ai search vector'],
    marketCap: 9500000000,
    rank: 100,
    decimals: 2
  },

  // ═══════════════════════════════════════════════════════════════════
  // 5. ⛽ ENERGY, OIL & GREEN TRANSITION (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'XOM',
    name: 'Exxon Mobil Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['exxon', 'xom', 'exxonmobil', 'oil supermajor', 'darren woods'],
    marketCap: 480000000000,
    rank: 101,
    decimals: 2
  },
  {
    symbol: 'CVX',
    name: 'Chevron Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['chevron', 'cvx', 'mike wirth', 'oil and gas', 'hess merger'],
    marketCap: 285000000000,
    rank: 102,
    decimals: 2
  },
  {
    symbol: 'COP',
    name: 'ConocoPhillips',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['conocophillips', 'cop', 'upstream oil', 'exploration production'],
    marketCap: 128000000000,
    rank: 103,
    decimals: 2
  },
  {
    symbol: 'SHEL',
    name: 'Shell plc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['shell', 'shel', 'royal dutch shell', 'lng giant', 'wael sawan'],
    marketCap: 220000000000,
    rank: 104,
    decimals: 2
  },
  {
    symbol: 'TTE',
    name: 'TotalEnergies SE',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['totalenergies', 'tte', 'total', 'patrick pouyanne', 'multi energy'],
    marketCap: 165000000000,
    rank: 105,
    decimals: 2
  },
  {
    symbol: 'BP',
    name: 'BP plc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['bp', 'british petroleum', 'murray auchincloss', 'integrated energy'],
    marketCap: 105000000000,
    rank: 106,
    decimals: 2
  },
  {
    symbol: 'OXY',
    name: 'Occidental Petroleum',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['occidental', 'oxy', 'vicki hollub', 'warren buffett oil', 'permian basin'],
    marketCap: 52000000000,
    rank: 107,
    decimals: 2
  },
  {
    symbol: 'SLB',
    name: 'Schlumberger (SLB)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['slb', 'schlumberger', 'oilfield services', 'drilling tech'],
    marketCap: 65000000000,
    rank: 108,
    decimals: 2
  },
  {
    symbol: 'EOG',
    name: 'EOG Resources Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['eog resources', 'eog', 'shale oil', 'permian driller'],
    marketCap: 72000000000,
    rank: 109,
    decimals: 2
  },
  {
    symbol: 'XAU',
    name: 'Gold (Aur Spot)',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['gold', 'aur', 'gold spot', 'aur spot', 'precious metal', 'metal', 'bullion', 'xauusd', 'tvc:gold'],
    marketCap: 16800000000000,
    rank: 110,
    decimals: 2
  },
  {
    symbol: 'OIL',
    name: 'Crude Oil (WTI)',
    category: 'Commodity',
    marketClass: 'metals',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['oil', 'petrol', 'titei', 'crude', 'wti', 'brent', 'energy', 'combustibil'],
    marketCap: 2500000000000,
    rank: 111,
    decimals: 2
  },
  {
    symbol: 'XAG',
    name: 'Silver (Argint Spot)',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['silver', 'argint', 'silver spot', 'argint spot', 'precious metal', 'metal', 'xagusd'],
    marketCap: 1750000000000,
    rank: 112,
    decimals: 3
  },
  {
    symbol: 'COPPER',
    name: 'Copper (Cupru Industrial)',
    category: 'Commodity',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'semiconductors', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['copper', 'cupru', 'metal industrial', 'electrification', 'grid metal'],
    marketCap: 650000000000,
    rank: 113,
    decimals: 4
  },
  {
    symbol: 'PAXG',
    name: 'Paxos Gold (Gold onchain)',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['paxg', 'pax gold', 'gold crypto', 'aur crypto', 'tokenized gold'],
    marketCap: 520000000,
    rank: 114,
    decimals: 2
  },
  {
    symbol: 'NEE',
    name: 'NextEra Energy',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['nextera', 'nee', 'clean energy', 'fpl', 'wind solar power'],
    marketCap: 155000000000,
    rank: 115,
    decimals: 2
  },
  {
    symbol: 'FSLR',
    name: 'First Solar Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['first solar', 'fslr', 'solar panels', 'thin film photovoltaic'],
    marketCap: 24000000000,
    rank: 116,
    decimals: 2
  },
  {
    symbol: 'ENPH',
    name: 'Enphase Energy',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['enphase', 'enph', 'microinverters', 'solar storage battery'],
    marketCap: 14000000000,
    rank: 117,
    decimals: 2
  },

  // ═══════════════════════════════════════════════════════════════════
  // 6. 🚀 SPACE, AEROSPACE & DEFENSE TECH (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'SPACEX',
    name: 'SpaceX (Space Exploration Tech)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['spacex', 'space x', 'elon musk', 'starlink', 'space exploration', 'falcon 9', 'starship', 'rwa tech', 'space tech'],
    marketCap: 210000000000,
    rank: 118,
    decimals: 2
  },
  {
    symbol: 'LMT',
    name: 'Lockheed Martin Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['lockheed martin', 'lmt', 'f35 fighter', 'skunk works', 'missile defense'],
    marketCap: 135000000000,
    rank: 119,
    decimals: 2
  },
  {
    symbol: 'RTX',
    name: 'RTX Corp (Raytheon)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['rtx', 'raytheon', 'pratt whitney', 'collins aerospace', 'patriot missile'],
    marketCap: 165000000000,
    rank: 120,
    decimals: 2
  },
  {
    symbol: 'NOC',
    name: 'Northrop Grumman',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['northrop grumman', 'noc', 'b21 raider', 'stealth bomber', 'james webb space'],
    marketCap: 74000000000,
    rank: 121,
    decimals: 2
  },
  {
    symbol: 'GD',
    name: 'General Dynamics',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['general dynamics', 'gd', 'gulfstream', 'nuclear submarines', 'combat systems'],
    marketCap: 82000000000,
    rank: 122,
    decimals: 2
  },
  {
    symbol: 'BA',
    name: 'The Boeing Company',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['boeing', 'ba', 'commercial aviation', '737 max', 'starliner space', 'defense'],
    marketCap: 95000000000,
    rank: 123,
    decimals: 2
  },
  {
    symbol: 'RKLB',
    name: 'Rocket Lab USA Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['rocket lab', 'rklb', 'peter beck', 'electron rocket', 'neutron', 'satellite bus'],
    marketCap: 8500000000,
    rank: 124,
    decimals: 2
  },
  {
    symbol: 'LUNR',
    name: 'Intuitive Machines',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense'],
    quoteCurrency: 'USD',
    aliases: ['intuitive machines', 'lunr', 'lunar lander', 'nova c', 'nasa artemis'],
    marketCap: 1200000000,
    rank: 125,
    decimals: 2
  },
  {
    symbol: 'ASTS',
    name: 'AST SpaceMobile Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['ast spacemobile', 'asts', 'abel avellan', 'bluebird satellite', 'direct to cell'],
    marketCap: 7800000000,
    rank: 126,
    decimals: 2
  },
  {
    symbol: 'KTOS',
    name: 'Kratos Defense & Security',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['space_defense', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['kratos defense', 'ktos', 'valkyrie drone', 'unmanned combat', 'space communications'],
    marketCap: 3400000000,
    rank: 127,
    decimals: 2
  },

  // ═══════════════════════════════════════════════════════════════════
  // 7. 🪙 CRYPTO LAYER 1 & HIGH THROUGHPUT (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'energy_commodities'],
    quoteCurrency: 'USDT',
    aliases: ['btc', 'bitcoin', 'satoshi nakamoto', 'digital gold', 'crypto king'],
    marketCap: 1280000000000,
    rank: 128,
    decimals: 2
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['eth', 'ethereum', 'vitalik buterin', 'smart contracts', 'ether'],
    marketCap: 320000000000,
    rank: 129,
    decimals: 2
  },
  {
    symbol: 'BNB',
    name: 'BNB (Binance)',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['bnb', 'binance coin', 'cz', 'changpeng zhao', 'bsc', 'binance smart chain'],
    marketCap: 82000000000,
    rank: 130,
    decimals: 2
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['sol', 'solana', 'anatoly yakovenko', 'breakpoint', 'fast blockchain', 'parallel svm'],
    marketCap: 68000000000,
    rank: 131,
    decimals: 2
  },
  {
    symbol: 'XRP',
    name: 'XRP (Ripple)',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['xrp', 'ripple', 'brad garlinghouse', 'xrpledger', 'cross border payments'],
    marketCap: 32000000000,
    rank: 132,
    decimals: 4
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['ada', 'cardano', 'charles hoskinson', 'ouroboros', 'plutus'],
    marketCap: 13000000000,
    rank: 133,
    decimals: 4
  },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['avax', 'avalanche', 'emin gun sirer', 'subnets', 'avalanche9000'],
    marketCap: 9500000000,
    rank: 134,
    decimals: 2
  },
  {
    symbol: 'SUI',
    name: 'Sui Network',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['sui', 'sui network', 'mysten labs', 'move language', 'evan cheng'],
    marketCap: 8800000000,
    rank: 135,
    decimals: 4
  },
  {
    symbol: 'DOT',
    name: 'Polkadot',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['dot', 'polkadot', 'gavin wood', 'parachains', 'jam chain'],
    marketCap: 5800000000,
    rank: 136,
    decimals: 3
  },
  {
    symbol: 'APT',
    name: 'Aptos',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['apt', 'aptos', 'mo shaikh', 'avery ching', 'move blockchain'],
    marketCap: 3600000000,
    rank: 137,
    decimals: 3
  },
  {
    symbol: 'SEI',
    name: 'Sei Network',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['sei', 'sei network', 'jay jog', 'parallelized evm', 'sei v2'],
    marketCap: 1700000000,
    rank: 138,
    decimals: 4
  },
  {
    symbol: 'FTM',
    name: 'Fantom / Sonic',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['ftm', 'fantom', 'sonic', 'andre cronje', 'sonic labs'],
    marketCap: 1100000000,
    rank: 139,
    decimals: 4
  },
  {
    symbol: 'ALGO',
    name: 'Algorand',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['algo', 'algorand', 'silvio micali', 'pure proof of stake'],
    marketCap: 950000000,
    rank: 140,
    decimals: 4
  },
  {
    symbol: 'HBAR',
    name: 'Hedera Hashgraph',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['hbar', 'hedera', 'hashgraph', 'leemon baird', 'enterprise dlt'],
    marketCap: 2400000000,
    rank: 141,
    decimals: 4
  },
  {
    symbol: 'TON',
    name: 'Toncoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['ton', 'toncoin', 'the open network', 'telegram crypto', 'pavel durov'],
    marketCap: 13500000000,
    rank: 142,
    decimals: 3
  },
  {
    symbol: 'KAS',
    name: 'Kaspa',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['kas', 'kaspa', 'ghostdag', 'yonatan sompolinsky', 'blockdag'],
    marketCap: 3400000000,
    rank: 143,
    decimals: 4,
    exchange: 'BINANCE Futures',
    instrumentType: 'perpetual',
    marketDataSource: 'binance_futures',
    providerSymbol: 'KASUSDT'
  },
  {
    symbol: 'LTC',
    name: 'Litecoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['ltc', 'litecoin', 'charlie lee', 'digital silver'],
    marketCap: 4800000000,
    rank: 144,
    decimals: 2
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['doge', 'dogecoin', 'elon musk', 'meme king', 'shiba doge', 'dogecoin network', 'billy markus'],
    marketCap: 38000000000,
    rank: 8,
    decimals: 4
  },
  {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['xlm', 'stellar', 'jed mccaleb', 'soroban', 'stellar lumens'],
    marketCap: 9500000000,
    rank: 14,
    decimals: 4
  },
  {
    symbol: 'BCH',
    name: 'Bitcoin Cash',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['bch', 'bitcoin cash', 'roger ver', 'peer to peer cash'],
    marketCap: 9200000000,
    rank: 15,
    decimals: 2
  },
  {
    symbol: 'ETC',
    name: 'Ethereum Classic',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['etc', 'ethereum classic', 'original ether', 'etc pow'],
    marketCap: 3800000000,
    rank: 25,
    decimals: 2
  },
  {
    symbol: 'ATOM',
    name: 'Cosmos',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['atom', 'cosmos', 'tendermint', 'interchain', 'ibc'],
    marketCap: 2800000000,
    rank: 31,
    decimals: 3
  },
  {
    symbol: 'ARB',
    name: 'Arbitrum',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['arb', 'arbitrum', 'offchain labs', 'ethereum layer 2', 'arbitrum one', 'nitro'],
    marketCap: 2500000000,
    rank: 34,
    decimals: 4
  },
  {
    symbol: 'OP',
    name: 'Optimism',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['op', 'optimism', 'superchain', 'op stack', 'optimistic rollup'],
    marketCap: 2200000000,
    rank: 35,
    decimals: 4
  },
  {
    symbol: 'POL',
    name: 'Polygon Ecosystem Token',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['pol', 'polygon', 'matic', 'sandeep nailwal', 'polygon 2.0', 'agglayer'],
    marketCap: 2900000000,
    rank: 36,
    decimals: 4
  },
  {
    symbol: 'TIA',
    name: 'Celestia',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['tia', 'celestia', 'modular blockchain', 'mustafa al bassam', 'data availability'],
    marketCap: 1600000000,
    rank: 37,
    decimals: 3
  },
  {
    symbol: 'STX',
    name: 'Stacks',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['stx', 'stacks', 'muneeb ali', 'bitcoin l2', 'nakamoto upgrade', 'sbtc'],
    marketCap: 2400000000,
    rank: 40,
    decimals: 4
  },
  {
    symbol: 'IMX',
    name: 'Immutable',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['imx', 'immutable', 'immutable x', 'robbie ferguson', 'web3 gaming zk'],
    marketCap: 2100000000,
    rank: 41,
    decimals: 4
  },
  {
    symbol: 'S',
    name: 'Sonic (ex-FTM)',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_l1', 'crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['s', 'sonic', 'ftm', 'fantom', 'andre cronje', 'sonic labs', 'sonic svm'],
    marketCap: 1600000000,
    rank: 47,
    decimals: 4
  },

  // ═══════════════════════════════════════════════════════════════════
  // 8. 🏦 CRYPTO DEFI & NEXT-GEN FINTECH (30 active de top)
  // ═══════════════════════════════════════════════════════════════════
  {
    symbol: 'UNI',
    name: 'Uniswap',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['uni', 'uniswap', 'hayden adams', 'dex', 'amm', 'unichain'],
    marketCap: 4900000000,
    rank: 145,
    decimals: 2
  },
  {
    symbol: 'AAVE',
    name: 'Aave',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['aave', 'stani kulechov', 'lending', 'defi money market', 'gho stablecoin'],
    marketCap: 2400000000,
    rank: 146,
    decimals: 2
  },
  {
    symbol: 'MKR',
    name: 'Maker / Sky',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['mkr', 'sky', 'makerdao', 'rune christensen', 'dai stablecoin', 'usds'],
    marketCap: 1800000000,
    rank: 147,
    decimals: 2
  },
  {
    symbol: 'CRV',
    name: 'Curve Finance',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['crv', 'curve', 'michael egorov', 'stableswap', 'crvusd'],
    marketCap: 420000000,
    rank: 148,
    decimals: 4
  },
  {
    symbol: 'LDO',
    name: 'Lido DAO',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['ldo', 'lido', 'liquid staking', 'steth'],
    marketCap: 1150000000,
    rank: 149,
    decimals: 3
  },
  {
    symbol: 'PENDLE',
    name: 'Pendle Finance',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['pendle', 'tn lee', 'yield trading', 'principal tokens', 'yield tokens'],
    marketCap: 620000000,
    rank: 150,
    decimals: 3
  },
  {
    symbol: 'ENA',
    name: 'Ethena',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['ena', 'ethena', 'guy young', 'synthetic dollar', 'usde', 'internet bond'],
    marketCap: 850000000,
    rank: 151,
    decimals: 4
  },
  {
    symbol: 'ONDO',
    name: 'Ondo Finance',
    category: 'RWA',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['ondo', 'ondo finance', 'nathan allman', 'rwa', 'tokenized treasuries', 'ousg', 'usdy'],
    marketCap: 1250000000,
    rank: 152,
    decimals: 4
  },
  {
    symbol: 'JUP',
    name: 'Jupiter',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['jup', 'jupiter', 'meow', 'solana dex aggregator', 'perpetuals'],
    marketCap: 1300000000,
    rank: 153,
    decimals: 4
  },
  {
    symbol: 'PYTH',
    name: 'Pyth Network',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['pyth', 'pyth network', 'oracle', 'low latency financial data'],
    marketCap: 1450000000,
    rank: 154,
    decimals: 4
  },
  {
    symbol: 'INJ',
    name: 'Injective',
    category: 'Layer 1',
    marketClass: 'crypto',
    narratives: ['crypto_defi', 'crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['inj', 'injective', 'eric chen', 'defi l1', 'fast derivatives', 'orderbook'],
    marketCap: 2100000000,
    rank: 155,
    decimals: 3
  },
  {
    symbol: 'RUNE',
    name: 'THORChain',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi'],
    quoteCurrency: 'USDT',
    aliases: ['rune', 'thorchain', 'cross chain swaps', 'native settlement'],
    marketCap: 1550000000,
    rank: 156,
    decimals: 3
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['crypto_defi', 'ai_ecosystem'],
    quoteCurrency: 'USDT',
    aliases: ['link', 'chainlink', 'sergey nazarov', 'oracles', 'ccip', 'cross chain interoperability'],
    marketCap: 7200000000,
    rank: 157,
    decimals: 2
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    category: 'Meme',
    marketClass: 'crypto',
    narratives: ['crypto_defi', 'consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['shib', 'shiba inu', 'shibarium', 'ryoshi', 'shiba'],
    marketCap: 15000000000,
    rank: 12,
    decimals: 8
  },
  {
    symbol: 'PEPE',
    name: 'Pepe',
    category: 'Meme',
    marketClass: 'crypto',
    narratives: ['crypto_defi', 'consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['pepe', 'pepe the frog', 'memecoin', 'pepe coin'],
    marketCap: 5500000000,
    rank: 20,
    decimals: 8
  },
  {
    symbol: 'WIF',
    name: 'dogwifhat',
    category: 'Meme',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['wif', 'dogwifhat', 'solana meme', 'hat on'],
    marketCap: 1700000000,
    rank: 42,
    decimals: 4
  },
  {
    symbol: 'BONK',
    name: 'Bonk',
    category: 'Meme',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['bonk', 'bonk dog', 'solana dog', 'bonk coin'],
    marketCap: 1500000000,
    rank: 43,
    decimals: 8
  },
  {
    symbol: 'FLOKI',
    name: 'Floki',
    category: 'Meme',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['floki', 'floki inu', 'valhalla', 'floki token'],
    marketCap: 1300000000,
    rank: 44,
    decimals: 8
  },
  {
    symbol: 'KAVA',
    name: 'Kava',
    category: 'DeFi',
    marketClass: 'crypto',
    narratives: ['crypto_defi', 'crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['kava', 'kava network', 'cosmos ethereum co chain'],
    marketCap: 520000000,
    rank: 48,
    decimals: 4
  },
  {
    symbol: 'GALA',
    name: 'Gala Games',
    category: 'Gaming',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['gala', 'gala games', 'gala music', 'gala film', 'eric schiermeyer'],
    marketCap: 950000000,
    rank: 49,
    decimals: 5
  },
  {
    symbol: 'SAND',
    name: 'The Sandbox',
    category: 'Gaming',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['sand', 'the sandbox', 'sebastien borget', 'metaverse voxel'],
    marketCap: 850000000,
    rank: 50,
    decimals: 4
  },
  {
    symbol: 'MANA',
    name: 'Decentraland',
    category: 'Gaming',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['mana', 'decentraland', 'virtual world', 'ariel meilich'],
    marketCap: 780000000,
    rank: 51,
    decimals: 4
  },
  {
    symbol: 'APE',
    name: 'ApeCoin',
    category: 'Gaming',
    marketClass: 'crypto',
    narratives: ['consumer_staples'],
    quoteCurrency: 'USDT',
    aliases: ['ape', 'apecoin', 'yuga labs', 'bored ape', 'bayc', 'apechain'],
    marketCap: 650000000,
    rank: 52,
    decimals: 4
  },
  {
    symbol: 'COIN',
    name: 'Coinbase Global',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['crypto_defi', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['coinbase', 'brian armstrong', 'crypto exchange', 'base network', 'usdc custodian'],
    marketCap: 52000000000,
    rank: 158,
    decimals: 2
  },
  {
    symbol: 'MSTR',
    name: 'MicroStrategy Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['crypto_defi', 'crypto_l1'],
    quoteCurrency: 'USD',
    aliases: ['microstrategy', 'michael saylor', 'bitcoin treasury', 'btc proxy', 'saylor'],
    marketCap: 26000000000,
    rank: 159,
    decimals: 2
  },
  {
    symbol: 'HOOD',
    name: 'Robinhood Markets',
    category: 'Tech Stock',
    marketClass: 'stocks',
    narratives: ['crypto_defi', 'consumer_staples'],
    quoteCurrency: 'USD',
    aliases: ['robinhood', 'hood', 'vlad tenev', 'retail trading app', 'crypto trading'],
    marketCap: 21000000000,
    rank: 160,
    decimals: 2
  },

  // Liquid, exchange-traded metal funds supplement the spot/futures contracts
  // above. Their prices and candles are fetched directly from Yahoo Finance.
  {
    symbol: 'GLD',
    name: 'SPDR Gold Shares ETF',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['gld', 'gold etf', 'aur etf'],
    marketCap: 100000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'SLV',
    name: 'iShares Silver Trust',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['slv', 'silver etf', 'argint etf'],
    marketCap: 20000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'PPLT',
    name: 'abrdn Physical Platinum Shares ETF',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['pplt', 'platinum', 'platina'],
    marketCap: 2000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'PALL',
    name: 'abrdn Physical Palladium Shares ETF',
    category: 'Precious Metal',
    marketClass: 'metals',
    narratives: ['energy_commodities'],
    quoteCurrency: 'USD',
    aliases: ['pall', 'palladium', 'paladiu'],
    marketCap: 400000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'COPX',
    name: 'Global X Copper Miners ETF',
    category: 'Commodity',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['copx', 'copper miners', 'mineri cupru'],
    marketCap: 5000000000,
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'LIT',
    name: 'Global X Lithium & Battery Tech ETF',
    category: 'Commodity',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'ai_ecosystem'],
    quoteCurrency: 'USD',
    aliases: ['lit', 'lithium', 'litiu', 'battery metals'],
    marketCap: 3000000000,
    rank: 0,
    decimals: 2,
    exchange: 'AMEX',
    instrumentType: 'etf',
    marketDataSource: 'public_stock'
  },
  {
    // `.P` is the TradingView/Binance convention for a USDT perpetual. It
    // deliberately remains distinct from the AMEX:LIT lithium ETF above.
    symbol: 'LITUSDT.P',
    name: 'Lighter / USDT Perpetual',
    category: 'Infrastructure',
    marketClass: 'crypto',
    narratives: ['crypto_l1'],
    quoteCurrency: 'USDT',
    aliases: ['lit', 'litusdt', 'lighter', 'lighter usdt', 'lighter perpetual', 'binance lit futures'],
    rank: 0,
    decimals: 6,
    exchange: 'BINANCE Futures',
    instrumentType: 'perpetual',
    marketDataSource: 'binance_futures',
    providerSymbol: 'LITUSDT'
  },
  {
    symbol: 'REMX',
    name: 'VanEck Rare Earth and Strategic Metals ETF',
    category: 'Commodity',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['remx', 'rare earth', 'metale rare', 'strategic metals'],
    marketCap: 1000000000,
    rank: 0,
    decimals: 2
  },

  // Sector-completion universe. Live CoinGecko caps replace these fallback
  // values; every crypto instrument below has an active Binance USDT market.
  cryptoCatalogAsset('STRK', 'Starknet', 'Layer 2', 190_000_000, 174),
  cryptoCatalogAsset('ZK', 'ZKsync', 'Layer 2', 150_000_000, 185),
  cryptoCatalogAsset('METIS', 'Metis', 'Layer 2', 45_000_000, 320),
  cryptoCatalogAsset('SKL', 'SKALE', 'Layer 2', 75_000_000, 280),
  cryptoCatalogAsset('MANTA', 'Manta Network', 'Layer 2', 65_000_000, 300),
  cryptoCatalogAsset('SCR', 'Scroll', 'Layer 2', 90_000_000, 260),

  cryptoCatalogAsset('VIRTUAL', 'Virtuals Protocol', 'AI', 454_000_000, 110),
  cryptoCatalogAsset('KAITO', 'Kaito', 'AI', 300_000_000, 135),
  cryptoCatalogAsset('IO', 'io.net', 'AI', 190_000_000, 175),
  cryptoCatalogAsset('ARKM', 'Arkham', 'AI', 180_000_000, 180),
  cryptoCatalogAsset('AWE', 'AWE Network', 'AI', 126_000_000, 219),
  cryptoCatalogAsset('KITE', 'Kite AI', 'AI', 260_000_000, 146),

  cryptoCatalogAsset('TRUMP', 'Official Trump', 'Meme', 642_000_000, 93),
  cryptoCatalogAsset('PENGU', 'Pudgy Penguins', 'Meme', 532_000_000, 101),
  cryptoCatalogAsset('TURBO', 'Turbo', 'Meme', 120_000_000, 225, 6),
  cryptoCatalogAsset('NEIRO', 'Neiro', 'Meme', 95_000_000, 255, 8),
  cryptoCatalogAsset('MEME', 'Memecoin', 'Meme', 85_000_000, 270, 6),
  cryptoCatalogAsset('DOGS', 'Dogs', 'Meme', 70_000_000, 290, 6),

  cryptoCatalogAsset('ZRO', 'LayerZero', 'Infrastructure', 433_000_000, 113),
  cryptoCatalogAsset('IOTA', 'IOTA', 'Infrastructure', 209_000_000, 160),
  cryptoCatalogAsset('THETA', 'Theta Network', 'Infrastructure', 190_000_000, 175),
  cryptoCatalogAsset('ENS', 'Ethereum Name Service', 'Infrastructure', 244_000_000, 153),

  cryptoCatalogAsset('QNT', 'Quant', 'RWA', 934_000_000, 73),
  cryptoCatalogAsset('POLYX', 'Polymesh', 'RWA', 110_000_000, 235),
  cryptoCatalogAsset('PLUME', 'Plume', 'RWA', 90_000_000, 260),
  cryptoCatalogAsset('CFG', 'Centrifuge', 'RWA', 80_000_000, 275),
  cryptoCatalogAsset('RSR', 'Reserve Rights', 'RWA', 300_000_000, 130, 6),
  cryptoCatalogAsset('SYRUP', 'Maple Finance', 'RWA', 227_000_000, 155),
  cryptoCatalogAsset('SKY', 'Sky', 'RWA', 1_542_000_000, 56, 6),
  cryptoCatalogAsset('USUAL', 'Usual', 'RWA', 100_000_000, 250, 6),
  cryptoCatalogAsset('PROVE', 'Succinct', 'RWA', 85_000_000, 270),

  cryptoCatalogAsset('AXS', 'Axie Infinity', 'Gaming', 172_000_000, 183),
  cryptoCatalogAsset('ENJ', 'Enjin Coin', 'Gaming', 80_000_000, 275, 6),
  cryptoCatalogAsset('ILV', 'Illuvium', 'Gaming', 75_000_000, 285),
  cryptoCatalogAsset('MAGIC', 'Treasure', 'Gaming', 60_000_000, 310, 6),
  cryptoCatalogAsset('CHZ', 'Chiliz', 'Gaming', 151_000_000, 193, 5),

  cryptoCatalogAsset('CAKE', 'PancakeSwap', 'DeFi', 554_000_000, 97),
  cryptoCatalogAsset('COMP', 'Compound', 'DeFi', 204_000_000, 162),
  cryptoCatalogAsset('MORPHO', 'Morpho', 'DeFi', 1_601_000_000, 52),
  cryptoCatalogAsset('AERO', 'Aerodrome Finance', 'DeFi', 452_000_000, 111),

  // Broad-market and allocation ETFs use fund AUM for size ordering.
  stockEtfCatalogAsset('VOO', 'Vanguard S&P 500 ETF', 1_400_000_000_000, 183),
  stockEtfCatalogAsset('VTI', 'Vanguard Total Stock Market ETF', 570_000_000_000, 184),
  stockEtfCatalogAsset('IVV', 'iShares Core S&P 500 ETF', 720_000_000_000, 185),
  stockEtfCatalogAsset('IWM', 'iShares Russell 2000 ETF', 75_000_000_000, 186),
  stockEtfCatalogAsset('DIA', 'SPDR Dow Jones Industrial Average ETF', 45_000_000_000, 187),
  stockEtfCatalogAsset('VEA', 'Vanguard FTSE Developed Markets ETF', 160_000_000_000, 188),
  stockEtfCatalogAsset('VWO', 'Vanguard FTSE Emerging Markets ETF', 95_000_000_000, 189),
  stockEtfCatalogAsset('VT', 'Vanguard Total World Stock ETF', 55_000_000_000, 190),

  // Precious-metal funds and miners, ordered by market cap or fund AUM.
  metalCatalogAsset('IAU', 'iShares Gold Trust', 40_000_000_000, 161, 'etf'),
  metalCatalogAsset('GDX', 'VanEck Gold Miners ETF', 20_000_000_000, 162, 'etf'),
  metalCatalogAsset('GDXJ', 'VanEck Junior Gold Miners ETF', 5_000_000_000, 163, 'etf'),
  metalCatalogAsset('SGOL', 'abrdn Physical Gold Shares ETF', 4_000_000_000, 164, 'etf'),
  metalCatalogAsset('SIVR', 'abrdn Physical Silver Shares ETF', 2_000_000_000, 165, 'etf'),

  // Industrial-metal producers and diversified base-metal funds.
  metalCatalogAsset('BHP', 'BHP Group', 150_000_000_000, 166),
  metalCatalogAsset('RIO', 'Rio Tinto', 115_000_000_000, 167),
  metalCatalogAsset('SCCO', 'Southern Copper', 90_000_000_000, 168),
  metalCatalogAsset('FCX', 'Freeport-McMoRan', 70_000_000_000, 169),
  metalCatalogAsset('VALE', 'Vale', 45_000_000_000, 170),
  metalCatalogAsset('TECK', 'Teck Resources', 30_000_000_000, 171),
  metalCatalogAsset('AA', 'Alcoa', 6_000_000_000, 172),
  metalCatalogAsset('DBB', 'Invesco DB Base Metals Fund', 700_000_000, 173, 'etf'),
  metalCatalogAsset('CPER', 'United States Copper Index Fund', 400_000_000, 174, 'etf'),

  // Lithium, uranium and strategic-mineral leaders.
  metalCatalogAsset('CCJ', 'Cameco', 40_000_000_000, 175),
  metalCatalogAsset('ALB', 'Albemarle', 15_000_000_000, 176),
  metalCatalogAsset('SQM', 'Sociedad Quimica y Minera', 15_000_000_000, 177),
  metalCatalogAsset('MP', 'MP Materials', 8_000_000_000, 178),
  metalCatalogAsset('URA', 'Global X Uranium ETF', 4_000_000_000, 179, 'etf'),
  metalCatalogAsset('URNM', 'Sprott Uranium Miners ETF', 1_500_000_000, 180, 'etf'),
  metalCatalogAsset('LAC', 'Lithium Americas', 1_000_000_000, 181),
  metalCatalogAsset('UEC', 'Uranium Energy Corp', 4_000_000_000, 182),

  // Liquid energy commodity funds complete the existing Oil category.
  metalCatalogAsset('USO', 'United States Oil Fund', 1_500_000_000, 191, 'etf'),
  metalCatalogAsset('BNO', 'United States Brent Oil Fund', 200_000_000, 192, 'etf'),
  metalCatalogAsset('UNG', 'United States Natural Gas Fund', 900_000_000, 193, 'etf'),
  metalCatalogAsset('XLE', 'Energy Select Sector SPDR Fund', 40_000_000_000, 194, 'etf'),
  metalCatalogAsset('XOP', 'SPDR S&P Oil & Gas Exploration ETF', 3_500_000_000, 195, 'etf'),
  metalCatalogAsset('OIH', 'VanEck Oil Services ETF', 2_000_000_000, 196, 'etf'),
  metalCatalogAsset('DBE', 'Invesco DB Energy Fund', 150_000_000, 197, 'etf'),
  metalCatalogAsset('UGA', 'United States Gasoline Fund', 100_000_000, 198, 'etf'),
  metalCatalogAsset('AMLP', 'Alerian MLP ETF', 10_000_000_000, 199, 'etf'),
  metalCatalogAsset('IEO', 'iShares U.S. Oil & Gas Exploration ETF', 1_000_000_000, 200, 'etf')
];

const STOCK_BROAD_MARKET_SYMBOLS = new Set(['MSTR']);
const STOCK_CONSUMER_PLATFORM_SYMBOLS = new Set([
  'AAPL', 'AMZN', 'META', 'TSLA', 'WMT', 'COST', 'MCD', 'NKE', 'TGT', 'HOOD'
]);
const STOCK_AI_SOFTWARE_SYMBOLS = new Set([
  'AI', 'PATH', 'SOUN', 'PLTR', 'BBAI', 'SNOW', 'DDOG', 'MDB', 'ESTC', 'COIN'
]);
const CRYPTO_LAYER_2_SYMBOLS = new Set([
  'ARB', 'OP', 'POL', 'STX', 'STRK', 'ZK', 'METIS', 'SKL', 'MANTA', 'SCR'
]);
const CRYPTO_MEME_SYMBOLS = new Set([
  'DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'TRUMP', 'PENGU', 'TURBO', 'NEIRO', 'MEME', 'DOGS'
]);
const CRYPTO_LAYER_1_SYMBOLS = new Set(['TRX', 'ZEC', 'GRAM', 'ALGO', 'DASH', 'VET']);
const CRYPTO_DEFI_SYMBOLS = new Set([
  'USDC', 'USDS', 'USDE', 'USD1', 'RLUSD', 'BFUSD', 'U', 'JST', 'NEXO', 'WLFI', 'ASTER', 'ETHFI', 'TUSD'
]);
const CRYPTO_RWA_SYMBOLS = new Set(['XAUT', 'PAXG']);
const CRYPTO_GAMING_SYMBOLS = new Set(['IMX']);
const ENERGY_COMMODITY_SYMBOLS = new Set([
  'OIL', 'USO', 'BNO', 'UNG', 'XLE', 'XOP', 'OIH', 'DBE', 'UGA', 'AMLP', 'IEO'
]);
const CRITICAL_MINERAL_SYMBOLS = new Set([
  'LIT', 'REMX', 'ALB', 'SQM', 'MP', 'LAC', 'UEC', 'URA', 'URNM', 'CCJ'
]);
const INDUSTRIAL_METAL_SYMBOLS = new Set([
  'COPPER', 'COPX', 'BHP', 'RIO', 'VALE', 'FCX', 'SCCO', 'TECK', 'AA', 'DBB', 'CPER'
]);

/**
 * Assigns one primary, mutually exclusive sector to every scanner asset.
 * The original catalog tags intentionally remain available above as search
 * metadata, while scanner rows use this normalized taxonomy for exact filters.
 */
export const getPrimaryNarrative = (asset: AssetInfo): MarketNarrativeId => {
  const tags = new Set(asset.narratives || []);

  if (asset.marketClass === 'metals') {
    if (ENERGY_COMMODITY_SYMBOLS.has(asset.symbol)) return 'energy_commodities';
    if (CRITICAL_MINERAL_SYMBOLS.has(asset.symbol)) return 'critical_minerals';
    if (INDUSTRIAL_METAL_SYMBOLS.has(asset.symbol)) return 'industrial_metals';
    return 'precious_metals';
  }

  if (asset.marketClass === 'stocks') {
    if (asset.category === 'Index / ETF' || STOCK_BROAD_MARKET_SYMBOLS.has(asset.symbol)) return 'broad_market';
    if (STOCK_CONSUMER_PLATFORM_SYMBOLS.has(asset.symbol)) return 'consumer_platforms';
    if (tags.has('semiconductors')) return 'semiconductors';
    if (tags.has('energy_commodities')) return 'energy_commodities';
    if (STOCK_AI_SOFTWARE_SYMBOLS.has(asset.symbol)) {
      return 'ai_ecosystem';
    }
    if (tags.has('space_defense')) return 'space_defense';
    if (tags.has('cloud_enterprise')) return 'cloud_enterprise';
    if (tags.has('consumer_staples')) return 'consumer_staples';
    if (tags.has('crypto_defi') || tags.has('crypto_l1')) return 'crypto_defi';
    return 'broad_market';
  }

  if (asset.category === 'Meme' || CRYPTO_MEME_SYMBOLS.has(asset.symbol)) return 'crypto_meme';
  if (asset.category === 'RWA' || CRYPTO_RWA_SYMBOLS.has(asset.symbol)) return 'crypto_rwa';
  if (asset.category === 'AI') return 'crypto_ai';
  if (asset.category === 'DeFi' || CRYPTO_DEFI_SYMBOLS.has(asset.symbol)) return 'crypto_defi';
  if (asset.category === 'Gaming' || CRYPTO_GAMING_SYMBOLS.has(asset.symbol)) return 'crypto_gaming';
  if (asset.category === 'Layer 2' || CRYPTO_LAYER_2_SYMBOLS.has(asset.symbol)) return 'crypto_l2';
  if (asset.category === 'Layer 1' || CRYPTO_LAYER_1_SYMBOLS.has(asset.symbol)) return 'crypto_l1';
  if (asset.category === 'Infrastructure') return 'crypto_infrastructure';
  return 'crypto_l1';
};

export const withPrimaryNarrative = (asset: AssetInfo): AssetInfo => ({
  ...asset,
  narratives: [getPrimaryNarrative(asset)]
});

export const MIN_ASSETS_PER_NARRATIVE = 10;

const byMarketCap = (left: AssetInfo, right: AssetInfo) =>
  (right.marketCap || 0) - (left.marketCap || 0) || left.rank - right.rank;

const isSupportedScannerStock = (asset: AssetInfo) =>
  asset.marketClass === 'stocks' &&
  asset.quoteCurrency === 'USD' &&
  asset.rank > 0 &&
  asset.symbol !== 'SPACEX';

/**
 * Keeps the global market-cap leaders while guaranteeing that every available
 * primary sector contributes its ten largest constituents. When a sector has
 * fewer than ten supported instruments, all verified constituents are kept.
 */
export const selectNarrativeBalancedAssets = (
  candidates: AssetInfo[],
  baseAssets: AssetInfo[] = [],
  minimumPerNarrative = MIN_ASSETS_PER_NARRATIVE
): AssetInfo[] => {
  const normalized = candidates.map(withPrimaryNarrative).sort(byMarketCap);
  const selected = new Map<string, AssetInfo>();
  const add = (asset: AssetInfo) => selected.set(`${asset.marketClass}:${asset.symbol}`, asset);

  baseAssets.map(withPrimaryNarrative).forEach(add);
  for (const definition of NARRATIVE_DEFINITIONS) {
    normalized
      .filter(asset => asset.narratives?.[0] === definition.id)
      .slice(0, minimumPerNarrative)
      .forEach(add);
  }

  return Array.from(selected.values()).sort(byMarketCap);
};

// Production scanner universe: up to 50 supported spot-crypto assets. The broader
// catalog remains available for search, but unsupported assets are never
// silently filled with synthetic quotes.
export const CRYPTO_SPOT_ASSETS: AssetInfo[] = TRADING_360_ASSETS
  .filter(asset =>
    asset.marketClass === 'crypto' &&
    asset.quoteCurrency === 'USDT' &&
    asset.marketDataSource !== 'binance_futures' &&
    !asset.symbol.includes('.') &&
    !asset.symbol.startsWith('TOTAL')
  )
  .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
  .map(withPrimaryNarrative);

export const TOP_50_CRYPTO_ASSETS: AssetInfo[] = CRYPTO_SPOT_ASSETS.slice(0, 50);

export const BALANCED_CRYPTO_ASSETS: AssetInfo[] = selectNarrativeBalancedAssets(
  CRYPTO_SPOT_ASSETS,
  TOP_50_CRYPTO_ASSETS
);

/**
 * Curated liquid US-equity universe. Asset membership is deliberately fixed;
 * prices, candles and displayed metrics are always obtained from Yahoo Finance.
 */
export const TOP_50_STOCK_ASSETS: AssetInfo[] = TRADING_360_ASSETS
  .filter(isSupportedScannerStock)
  .sort(byMarketCap)
  .slice(0, 50)
  .map(withPrimaryNarrative);

export const BALANCED_STOCK_ASSETS: AssetInfo[] = selectNarrativeBalancedAssets(
  TRADING_360_ASSETS.filter(isSupportedScannerStock),
  TOP_50_STOCK_ASSETS
);

/** Major precious and industrial metals/commodity instruments with a live Yahoo or Binance mapping. */
export const TOP_METALS_ASSETS: AssetInfo[] = TRADING_360_ASSETS
  .filter(asset => asset.marketClass === 'metals')
  .sort(byMarketCap)
  .map(withPrimaryNarrative);

export const SCANNER_ASSETS: AssetInfo[] = [
  ...BALANCED_CRYPTO_ASSETS,
  ...BALANCED_STOCK_ASSETS,
  ...TOP_METALS_ASSETS
];

export type ScannerMarketClass = 'ALL' | 'crypto' | 'stocks' | 'metals';

export const getScannerAssets = (marketClass: ScannerMarketClass = 'ALL'): AssetInfo[] =>
  marketClass === 'ALL'
    ? SCANNER_ASSETS
    : SCANNER_ASSETS.filter(asset => asset.marketClass === marketClass);

export const ASSET_SYMBOLS_SET = new Set(TRADING_360_ASSETS.map(a => a.symbol));
