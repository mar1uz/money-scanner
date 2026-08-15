import { AssetInfo } from '../types/market.js';

export const TRADING_360_ASSETS: AssetInfo[] = [
  // --- METALS & COMMODITIES ---
  {
    symbol: 'XAU',
    name: 'Gold (Aur Spot)',
    category: 'Precious Metal',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['gold', 'aur', 'gold spot', 'aur spot', 'precious metal', 'metal', 'bullion', 'xauusd'],
    marketCap: 16800000000000, // $16.8T
    rank: 1,
    decimals: 2
  },
  {
    symbol: 'OIL',
    name: 'Crude Oil (WTI)',
    category: 'Commodity',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['oil', 'petrol', 'titei', 'crude', 'wti', 'brent', 'energy', 'combustibil'],
    marketCap: 2500000000000, // $2.5T
    rank: 2,
    decimals: 2
  },
  {
    symbol: 'XAG',
    name: 'Silver (Argint Spot)',
    category: 'Precious Metal',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['silver', 'argint', 'silver spot', 'argint spot', 'precious metal', 'metal', 'xagusd'],
    marketCap: 1750000000000, // $1.75T
    rank: 3,
    decimals: 3
  },
  {
    symbol: 'COPPER',
    name: 'Copper (Cupru)',
    category: 'Commodity',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['copper', 'cupru', 'metal industrial', 'commodities'],
    marketCap: 650000000000, // $650B
    rank: 4,
    decimals: 4
  },
  {
    symbol: 'PAXG',
    name: 'Paxos Gold (Gold onchain)',
    category: 'Precious Metal',
    marketClass: 'metals',
    quoteCurrency: 'USDT',
    aliases: ['paxg', 'pax gold', 'gold crypto', 'aur crypto', 'tokenized gold'],
    marketCap: 520000000, // $520M
    rank: 5,
    decimals: 2
  },

  // --- MEGA-CAP TECH STOCKS & GLOBAL INNOVATION ---
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['apple', 'iphone', 'macbook', 'ipad', 'tim cook', 'ios', 'tech stock'],
    marketCap: 3420000000000, // $3.42T
    rank: 6,
    decimals: 2
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['microsoft', 'windows', 'azure', 'bill gates', 'satya nadella', 'copilot', 'openai investor'],
    marketCap: 3310000000000, // $3.31T
    rank: 7,
    decimals: 2
  },
  {
    symbol: 'NVDA',
    name: 'Nvidia Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['nvidia', 'jensen huang', 'gpu', 'chips', 'ai chips', 'semiconductors', 'semiconductori', 'h100', 'blackwell'],
    marketCap: 3150000000000, // $3.15T
    rank: 8,
    decimals: 2
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet (Google)',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['google', 'alphabet', 'youtube', 'sundar pichai', 'gemini', 'search engine', 'android'],
    marketCap: 2050000000000, // $2.05T
    rank: 9,
    decimals: 2
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['amazon', 'aws', 'jeff bezos', 'andy jassy', 'ecommerce', 'cloud'],
    marketCap: 1950000000000, // $1.95T
    rank: 10,
    decimals: 2
  },
  {
    symbol: 'META',
    name: 'Meta Platforms (Facebook)',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['meta', 'facebook', 'instagram', 'whatsapp', 'mark zuckerberg', 'llama', 'oculus', 'metaverse'],
    marketCap: 1350000000000, // $1.35T
    rank: 11,
    decimals: 2
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['tesla', 'elon musk', 'ev', 'electric cars', 'masini electrice', 'cybertruck', 'robotics', 'optimus'],
    marketCap: 685000000000, // $685B
    rank: 12,
    decimals: 2
  },
  {
    symbol: 'SPY',
    name: 'S&P 500 ETF Trust',
    category: 'Index / ETF',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['spy', 'sp500', 's&p 500', 'index', 'us stock market', 'bursa sua'],
    marketCap: 550000000000, // $550B
    rank: 13,
    decimals: 2
  },
  {
    symbol: 'QQQ',
    name: 'Invesco Nasdaq 100',
    category: 'Index / ETF',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['qqq', 'nasdaq', 'nasdaq 100', 'tech index', 'bursa tech'],
    marketCap: 290000000000, // $290B
    rank: 14,
    decimals: 2
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['amd', 'lisa su', 'ryzen', 'radeon', 'processors', 'gpu', 'chips'],
    marketCap: 240000000000, // $240B
    rank: 15,
    decimals: 2
  },
  {
    symbol: 'SPACEX',
    name: 'SpaceX (Space Exploration Tech)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['spacex', 'space x', 'elon musk', 'starlink', 'space exploration', 'falcon 9', 'starship', 'rwa tech', 'space tech'],
    marketCap: 210000000000, // $210B Valuation
    rank: 16,
    decimals: 2
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['palantir', 'alex karp', 'peter thiel', 'ai defense', 'big data', 'aip'],
    marketCap: 72000000000, // $72B
    rank: 17,
    decimals: 2
  },
  {
    symbol: 'COIN',
    name: 'Coinbase Global',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['coinbase', 'brian armstrong', 'crypto exchange', 'base network'],
    marketCap: 52000000000, // $52B
    rank: 18,
    decimals: 2
  },
  {
    symbol: 'MSTR',
    name: 'MicroStrategy Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['microstrategy', 'michael saylor', 'bitcoin treasury', 'btc proxy', 'saylor'],
    marketCap: 26000000000, // $26B
    rank: 19,
    decimals: 2
  },

  // --- CRYPTO UNIVERSE ---
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['btc', 'bitcoin', 'satoshi nakamoto', 'digital gold', 'crypto king'],
    marketCap: 1280000000000, // $1.28T
    rank: 20,
    decimals: 2
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['eth', 'ethereum', 'vitalik buterin', 'smart contracts', 'ether'],
    marketCap: 320000000000, // $320B
    rank: 21,
    decimals: 2
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['bnb', 'binance coin', 'cz', 'changpeng zhao', 'bsc', 'binance smart chain'],
    marketCap: 82000000000, // $82B
    rank: 22,
    decimals: 2
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['sol', 'solana', 'anatoly yakovenko', 'breakpoint', 'fast blockchain'],
    marketCap: 68000000000, // $68B
    rank: 23,
    decimals: 2
  },
  {
    symbol: 'XRP',
    name: 'XRP (Ripple)',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['xrp', 'ripple', 'brad garlinghouse', 'xrpledger', 'cross border payments'],
    marketCap: 32000000000, // $32B
    rank: 24,
    decimals: 4
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['doge', 'dogecoin', 'elon doge', 'doge army', 'meme coin original'],
    marketCap: 16000000000, // $16B
    rank: 25,
    decimals: 5
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ada', 'cardano', 'charles hoskinson', 'ouroboros'],
    marketCap: 13000000000, // $13B
    rank: 26,
    decimals: 4
  },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['avax', 'avalanche', 'emin gun sirer', 'subnets'],
    marketCap: 9500000000, // $9.5B
    rank: 27,
    decimals: 2
  },
  {
    symbol: 'SUI',
    name: 'Sui',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['sui', 'sui network', 'mysten labs', 'move language'],
    marketCap: 8800000000, // $8.8B
    rank: 28,
    decimals: 4
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['shib', 'shiba inu', 'shibarium', 'shiba army'],
    marketCap: 8500000000, // $8.5B
    rank: 29,
    decimals: 6
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['link', 'chainlink', 'sergey nazarov', 'oracles', 'ccip'],
    marketCap: 7200000000, // $7.2B
    rank: 30,
    decimals: 2
  },
  {
    symbol: 'DOT',
    name: 'Polkadot',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['dot', 'polkadot', 'gavin wood', 'parachains'],
    marketCap: 5800000000, // $5.8B
    rank: 31,
    decimals: 3
  },
  {
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['near', 'near protocol', 'illia polosukhin', 'user owned ai', 'sharding'],
    marketCap: 5600000000, // $5.6B
    rank: 32,
    decimals: 3
  },
  {
    symbol: 'UNI',
    name: 'Uniswap',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['uni', 'uniswap', 'hayden adams', 'dex', 'amm'],
    marketCap: 4900000000, // $4.9B
    rank: 33,
    decimals: 2
  },
  {
    symbol: 'LTC',
    name: 'Litecoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ltc', 'litecoin', 'charlie lee', 'digital silver'],
    marketCap: 4800000000, // $4.8B
    rank: 34,
    decimals: 2
  },
  {
    symbol: 'PEPE',
    name: 'Pepe',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['pepe', 'pepe the frog', 'meme coin king', 'pepecoin'],
    marketCap: 4200000000, // $4.2B
    rank: 35,
    decimals: 7
  },
  {
    symbol: 'MATIC',
    name: 'Polygon / POL',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['matic', 'pol', 'polygon', 'sandeep nailwal', 'agglayer', 'zkevm'],
    marketCap: 3800000000, // $3.8B
    rank: 36,
    decimals: 4
  },
  {
    symbol: 'APT',
    name: 'Aptos',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['apt', 'aptos', 'mo shaikh', 'avery ching', 'move blockchain'],
    marketCap: 3600000000, // $3.6B
    rank: 37,
    decimals: 3
  },
  {
    symbol: 'FET',
    name: 'Artificial Superintelligence',
    category: 'AI',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['fet', 'asi', 'fetch ai', 'humayun sheikh', 'artificial superintelligence', 'ocean', 'singularitynet'],
    marketCap: 3200000000, // $3.2B
    rank: 38,
    decimals: 4
  },
  {
    symbol: 'RENDER',
    name: 'Render Network',
    category: 'AI',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['render', 'rndr', 'jules urbach', 'gpu compute', 'decentralized rendering'],
    marketCap: 3100000000, // $3.1B
    rank: 39,
    decimals: 3
  },
  {
    symbol: 'TAO',
    name: 'Bittensor',
    category: 'AI',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['tao', 'bittensor', 'jacob steeves', 'subnets', 'decentralized ai'],
    marketCap: 2800000000, // $2.8B
    rank: 40,
    decimals: 2
  },
  {
    symbol: 'AAVE',
    name: 'Aave',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['aave', 'stani kulechov', 'lending', 'defi money market'],
    marketCap: 2400000000, // $2.4B
    rank: 41,
    decimals: 2
  },
  {
    symbol: 'INJ',
    name: 'Injective',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['inj', 'injective', 'eric chen', 'defi l1', 'fast derivatives'],
    marketCap: 2100000000, // $2.1B
    rank: 42,
    decimals: 3
  },
  {
    symbol: 'OP',
    name: 'Optimism',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['op', 'optimism', 'superchain', 'jinglejam', 'optimistic rollup'],
    marketCap: 1950000000, // $1.95B
    rank: 43,
    decimals: 3
  },
  {
    symbol: 'ARB',
    name: 'Arbitrum',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['arb', 'arbitrum', 'offchain labs', 'ed felten', 'nitro'],
    marketCap: 1900000000, // $1.9B
    rank: 44,
    decimals: 4
  },
  {
    symbol: 'TIA',
    name: 'Celestia',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['tia', 'celestia', 'mustafa al bassam', 'modular blockchain', 'data availability'],
    marketCap: 1800000000, // $1.8B
    rank: 45,
    decimals: 3
  },
  {
    symbol: 'SEI',
    name: 'Sei Network',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['sei', 'sei network', 'jay jog', 'parallelized evm'],
    marketCap: 1700000000, // $1.7B
    rank: 46,
    decimals: 4
  },
  {
    symbol: 'STRK',
    name: 'Starknet',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['strk', 'starknet', 'starkware', 'eli ben sasson', 'zk rollups'],
    marketCap: 1400000000, // $1.4B
    rank: 47,
    decimals: 4
  },
  {
    symbol: 'AR',
    name: 'Arweave',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ar', 'arweave', 'sam williams', 'permanent storage', 'ao compute'],
    marketCap: 1200000000, // $1.2B
    rank: 48,
    decimals: 2
  },
  {
    symbol: 'FTM',
    name: 'Fantom / Sonic',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ftm', 'fantom', 'sonic', 'andre cronje'],
    marketCap: 1100000000, // $1.1B
    rank: 49,
    decimals: 4
  },
  {
    symbol: 'ALGO',
    name: 'Algorand',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['algo', 'algorand', 'silvio micali', 'pure proof of stake'],
    marketCap: 950000000, // $950M
    rank: 50,
    decimals: 4
  },
  {
    symbol: 'BEAM',
    name: 'Beam',
    category: 'Gaming',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['beam', 'merit circle', 'gaming ecosystem'],
    marketCap: 750000000, // $750M
    rank: 51,
    decimals: 5
  }
];

export const TOP_50_CRYPTO_ASSETS: AssetInfo[] = TRADING_360_ASSETS;
export const ASSET_SYMBOLS_SET = new Set(TRADING_360_ASSETS.map(a => a.symbol));
