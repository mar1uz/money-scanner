import { AssetInfo, NarrativeDefinition, MarketNarrativeId } from '../types/market.js';

export const NARRATIVE_DEFINITIONS: NarrativeDefinition[] = [
  {
    id: 'ai_ecosystem',
    name: 'AI & Autonomous Intelligence',
    shortName: 'AI & GenAI',
    tagline: 'Giganți de inteligență artificială, LLM-uri, compute și protocoale AI onchain',
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
    id: 'cloud_enterprise',
    name: 'Cloud, SaaS & Enterprise Data',
    shortName: 'Cloud & SaaS',
    tagline: 'Infrastructură cloud, baze de date, securitate cibernetică și platforme SaaS',
    icon: 'Cloud',
    category: 'tech'
  },
  {
    id: 'energy_commodities',
    name: 'Energy, Oil & Green Commodities',
    shortName: 'Energie & Mărfuri',
    tagline: 'Petrol, gaze, metale prețioase (Aur/Argint), tranziție verde și regenerabile',
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
    id: 'crypto_l1',
    name: 'Layer 1 & High-Throughput Chains',
    shortName: 'Crypto Layer 1',
    tagline: 'Monede de bază, blockchain-uri monolitice și modulare, smart contract platforms',
    icon: 'Layers',
    category: 'crypto'
  },
  {
    id: 'crypto_defi',
    name: 'DeFi & Next-Gen Financial Infrastructure',
    shortName: 'DeFi & Fintech',
    tagline: 'DEX-uri, piețe de creditare, tokenizare RWA, staking și infrastructură fintech',
    icon: 'Coins',
    category: 'crypto'
  }
];

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
    decimals: 4
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
    rank: 0,
    decimals: 2
  },
  {
    symbol: 'REMX',
    name: 'VanEck Rare Earth and Strategic Metals ETF',
    category: 'Commodity',
    marketClass: 'metals',
    narratives: ['energy_commodities', 'semiconductors'],
    quoteCurrency: 'USD',
    aliases: ['remx', 'rare earth', 'metale rare', 'strategic metals'],
    rank: 0,
    decimals: 2
  }
];

// Production scanner universe: up to 50 supported spot-crypto assets. The broader
// catalog remains available for search, but unsupported assets are never
// silently filled with synthetic quotes.
export const TOP_50_CRYPTO_ASSETS: AssetInfo[] = TRADING_360_ASSETS
  .filter(asset =>
    asset.marketClass === 'crypto' &&
    asset.quoteCurrency === 'USDT' &&
    !asset.symbol.includes('.') &&
    !asset.symbol.startsWith('TOTAL')
  )
  .slice(0, 50);

/**
 * Curated liquid US-equity universe. Asset membership is deliberately fixed;
 * prices, candles and displayed metrics are always obtained from Yahoo Finance.
 */
export const TOP_50_STOCK_ASSETS: AssetInfo[] = TRADING_360_ASSETS
  .filter(asset => asset.marketClass === 'stocks' && asset.quoteCurrency === 'USD' && asset.rank > 0)
  .slice(0, 50);

/** Major precious and industrial metals/commodity instruments with a live Yahoo or Binance mapping. */
export const TOP_METALS_ASSETS: AssetInfo[] = TRADING_360_ASSETS
  .filter(asset => asset.marketClass === 'metals');

export const SCANNER_ASSETS: AssetInfo[] = [
  ...TOP_50_CRYPTO_ASSETS,
  ...TOP_50_STOCK_ASSETS,
  ...TOP_METALS_ASSETS
];

export type ScannerMarketClass = 'ALL' | 'crypto' | 'stocks' | 'metals';

export const getScannerAssets = (marketClass: ScannerMarketClass = 'ALL'): AssetInfo[] =>
  marketClass === 'ALL'
    ? SCANNER_ASSETS
    : SCANNER_ASSETS.filter(asset => asset.marketClass === marketClass);

export const ASSET_SYMBOLS_SET = new Set(TRADING_360_ASSETS.map(a => a.symbol));
