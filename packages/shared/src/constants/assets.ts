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
    rank: 1,
    decimals: 2
  },
  {
    symbol: 'XAG',
    name: 'Silver (Argint Spot)',
    category: 'Precious Metal',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['silver', 'argint', 'silver spot', 'argint spot', 'precious metal', 'metal', 'xagusd'],
    rank: 2,
    decimals: 3
  },
  {
    symbol: 'PAXG',
    name: 'Paxos Gold (Gold onchain)',
    category: 'Precious Metal',
    marketClass: 'metals',
    quoteCurrency: 'USDT',
    aliases: ['paxg', 'pax gold', 'gold crypto', 'aur crypto', 'tokenized gold'],
    rank: 3,
    decimals: 2
  },
  {
    symbol: 'OIL',
    name: 'Crude Oil (WTI)',
    category: 'Commodity',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['oil', 'petrol', 'titei', 'crude', 'wti', 'brent', 'energy', 'combustibil'],
    rank: 4,
    decimals: 2
  },
  {
    symbol: 'COPPER',
    name: 'Copper (Cupru)',
    category: 'Commodity',
    marketClass: 'metals',
    quoteCurrency: 'USD',
    aliases: ['copper', 'cupru', 'metal industrial', 'commodities'],
    rank: 5,
    decimals: 4
  },

  // --- MEGA-CAP TECH STOCKS & GLOBAL INNOVATION ---
  {
    symbol: 'SPACEX',
    name: 'SpaceX (Space Exploration Tech)',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['spacex', 'space x', 'elon musk', 'starlink', 'space exploration', 'falcon 9', 'starship', 'rwa tech', 'space tech'],
    rank: 1,
    decimals: 2
  },
  {
    symbol: 'NVDA',
    name: 'Nvidia Corp',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['nvidia', 'jensen huang', 'gpu', 'chips', 'ai chips', 'semiconductors', 'semiconductori', 'h100', 'blackwell'],
    rank: 2,
    decimals: 2
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['tesla', 'elon musk', 'ev', 'electric cars', 'masini electrice', 'cybertruck', 'robotics', 'optimus'],
    rank: 3,
    decimals: 2
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['apple', 'iphone', 'macbook', 'ipad', 'tim cook', 'ios', 'tech stock'],
    rank: 4,
    decimals: 2
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['microsoft', 'windows', 'azure', 'bill gates', 'satya nadella', 'copilot', 'openai investor'],
    rank: 5,
    decimals: 2
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet (Google)',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['google', 'alphabet', 'youtube', 'sundar pichai', 'gemini', 'search engine', 'android'],
    rank: 6,
    decimals: 2
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['amazon', 'aws', 'jeff bezos', 'andy jassy', 'ecommerce', 'cloud'],
    rank: 7,
    decimals: 2
  },
  {
    symbol: 'META',
    name: 'Meta Platforms (Facebook)',
    category: 'Mega-Cap',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['meta', 'facebook', 'instagram', 'whatsapp', 'mark zuckerberg', 'llama', 'oculus', 'metaverse'],
    rank: 8,
    decimals: 2
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['palantir', 'alex karp', 'peter thiel', 'ai defense', 'big data', 'aip'],
    rank: 9,
    decimals: 2
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['amd', 'lisa su', 'ryzen', 'radeon', 'processors', 'gpu', 'chips'],
    rank: 10,
    decimals: 2
  },
  {
    symbol: 'MSTR',
    name: 'MicroStrategy Inc',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['microstrategy', 'michael saylor', 'bitcoin treasury', 'btc proxy', 'saylor'],
    rank: 11,
    decimals: 2
  },
  {
    symbol: 'COIN',
    name: 'Coinbase Global',
    category: 'Tech Stock',
    marketClass: 'stocks',
    quoteCurrency: 'USD',
    aliases: ['coinbase', 'brian armstrong', 'crypto exchange', 'base network'],
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
    rank: 14,
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
    rank: 1,
    decimals: 2
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['eth', 'ethereum', 'vitalik buterin', 'smart contracts', 'ether'],
    rank: 2,
    decimals: 2
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['sol', 'solana', 'anatoly yakovenko', 'breakpoint', 'fast blockchain'],
    rank: 3,
    decimals: 2
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['bnb', 'binance coin', 'cz', 'changpeng zhao', 'bsc', 'binance smart chain'],
    rank: 4,
    decimals: 2
  },
  {
    symbol: 'XRP',
    name: 'XRP (Ripple)',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['xrp', 'ripple', 'brad garlinghouse', 'xrpledger', 'cross border payments'],
    rank: 5,
    decimals: 4
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['doge', 'dogecoin', 'elon doge', 'doge army', 'meme coin original'],
    rank: 6,
    decimals: 5
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ada', 'cardano', 'charles hoskinson', 'ouroboros'],
    rank: 7,
    decimals: 4
  },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['avax', 'avalanche', 'emin gun sirer', 'subnets'],
    rank: 8,
    decimals: 2
  },
  {
    symbol: 'SUI',
    name: 'Sui',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['sui', 'sui network', 'mysten labs', 'move language'],
    rank: 9,
    decimals: 4
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['link', 'chainlink', 'sergey nazarov', 'oracles', 'ccip'],
    rank: 10,
    decimals: 2
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['shib', 'shiba inu', 'shibarium', 'meme dog'],
    rank: 11,
    decimals: 8
  },
  {
    symbol: 'DOT',
    name: 'Polkadot',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['dot', 'polkadot', 'gavin wood', 'parachains'],
    rank: 12,
    decimals: 3
  },
  {
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['near', 'near protocol', 'illia polosukhin', 'user owned ai', 'sharding'],
    rank: 13,
    decimals: 3
  },
  {
    symbol: 'APT',
    name: 'Aptos',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['apt', 'aptos', 'move', 'mo shaikh', 'diem'],
    rank: 14,
    decimals: 2
  },
  {
    symbol: 'PEPE',
    name: 'Pepe',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['pepe', 'pepe the frog', 'frog meme'],
    rank: 15,
    decimals: 8
  },
  {
    symbol: 'UNI',
    name: 'Uniswap',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['uni', 'uniswap', 'hayden adams', 'dex', 'decentralized exchange', 'amm'],
    rank: 16,
    decimals: 3
  },
  {
    symbol: 'ICP',
    name: 'Internet Computer',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['icp', 'internet computer', 'dfinity', 'dominic williams'],
    rank: 17,
    decimals: 2
  },
  {
    symbol: 'LTC',
    name: 'Litecoin',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ltc', 'litecoin', 'charlie lee', 'digital silver'],
    rank: 18,
    decimals: 2
  },
  {
    symbol: 'FET',
    name: 'Artificial Superintelligence (FET)',
    category: 'AI',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['fet', 'fetch.ai', 'asi', 'artificial superintelligence', 'ai agents', 'humayun sheikh'],
    rank: 19,
    decimals: 4
  },
  {
    symbol: 'RENDER',
    name: 'Render Network',
    category: 'AI',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['render', 'rndr', 'jules urbach', 'gpu compute', 'decentralized gpu', 'ai rendering'],
    rank: 20,
    decimals: 3
  },
  {
    symbol: 'TAO',
    name: 'Bittensor',
    category: 'AI',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['tao', 'bittensor', 'opentensor', 'subnets', 'decentralized intelligence', 'ai network'],
    rank: 21,
    decimals: 2
  },
  {
    symbol: 'KAS',
    name: 'Kaspa',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['kas', 'kaspa', 'ghostdag', 'yonatan sompolinsky'],
    rank: 22,
    decimals: 4
  },
  {
    symbol: 'XLM',
    name: 'Stellar',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['xlm', 'stellar', 'jed mccaleb', 'lumens'],
    rank: 23,
    decimals: 4
  },
  {
    symbol: 'INJ',
    name: 'Injective',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['inj', 'injective', 'eric chen', 'defi l1'],
    rank: 24,
    decimals: 2
  },
  {
    symbol: 'AAVE',
    name: 'Aave',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['aave', 'stani kulechov', 'lending', 'defi loans', 'flash loans'],
    rank: 25,
    decimals: 2
  },
  {
    symbol: 'TIA',
    name: 'Celestia',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['tia', 'celestia', 'modular blockchain', 'data availability'],
    rank: 26,
    decimals: 3
  },
  {
    symbol: 'SEI',
    name: 'Sei',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['sei', 'sei network', 'trading l1'],
    rank: 27,
    decimals: 4
  },
  {
    symbol: 'OP',
    name: 'Optimism',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['op', 'optimism', 'superchain', 'optimistic rollups'],
    rank: 28,
    decimals: 3
  },
  {
    symbol: 'ARB',
    name: 'Arbitrum',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['arb', 'arbitrum', 'offchain labs', 'ethereum l2'],
    rank: 29,
    decimals: 4
  },
  {
    symbol: 'STX',
    name: 'Stacks',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['stx', 'stacks', 'bitcoin l2', 'muneeb ali', 'smart contracts bitcoin'],
    rank: 30,
    decimals: 3
  },
  {
    symbol: 'WIF',
    name: 'dogwifhat',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['wif', 'dogwifhat', 'solana dog meme'],
    rank: 31,
    decimals: 4
  },
  {
    symbol: 'BONK',
    name: 'Bonk',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['bonk', 'solana dog', 'bonk meme'],
    rank: 32,
    decimals: 8
  },
  {
    symbol: 'FLOKI',
    name: 'Floki',
    category: 'Meme',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['floki', 'floki inu', 'valhalla'],
    rank: 33,
    decimals: 8
  },
  {
    symbol: 'JUP',
    name: 'Jupiter',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['jup', 'jupiter', 'meow', 'solana dex aggregator'],
    rank: 34,
    decimals: 4
  },
  {
    symbol: 'MKR',
    name: 'Maker',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['mkr', 'makerdao', 'sky', 'dai', 'rune christensen'],
    rank: 35,
    decimals: 2
  },
  {
    symbol: 'CRV',
    name: 'Curve DAO',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['crv', 'curve', 'michael egorov', 'stablecoin dex'],
    rank: 36,
    decimals: 4
  },
  {
    symbol: 'LDO',
    name: 'Lido DAO',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ldo', 'lido', 'liquid staking', 'steth'],
    rank: 37,
    decimals: 3
  },
  {
    symbol: 'ONDO',
    name: 'Ondo Finance',
    category: 'RWA',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ondo', 'ondo finance', 'rwa', 'real world assets', 'us treasury onchain'],
    rank: 38,
    decimals: 4
  },
  {
    symbol: 'PYTH',
    name: 'Pyth Network',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['pyth', 'pyth network', 'oracle', 'high frequency data'],
    rank: 39,
    decimals: 4
  },
  {
    symbol: 'GRT',
    name: 'The Graph',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['grt', 'the graph', 'subgraphs', 'indexing'],
    rank: 40,
    decimals: 4
  },
  {
    symbol: 'IMX',
    name: 'Immutable',
    category: 'Gaming',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['imx', 'immutable', 'web3 gaming', 'robbie ferguson'],
    rank: 41,
    decimals: 3
  },
  {
    symbol: 'GALA',
    name: 'GALA Games',
    category: 'Gaming',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['gala', 'gala games', 'eric schiermeyer', 'gaming'],
    rank: 42,
    decimals: 5
  },
  {
    symbol: 'RUNE',
    name: 'THORChain',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['rune', 'thorchain', 'cross chain dex', 'native swaps'],
    rank: 43,
    decimals: 3
  },
  {
    symbol: 'ENA',
    name: 'Ethena',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ena', 'ethena', 'usde', 'synthetic dollar', 'guy young'],
    rank: 44,
    decimals: 4
  },
  {
    symbol: 'PENDLE',
    name: 'Pendle',
    category: 'DeFi',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['pendle', 'pendle finance', 'tn lee', 'yield trading', 'pt yt'],
    rank: 45,
    decimals: 3
  },
  {
    symbol: 'STRK',
    name: 'Starknet',
    category: 'Layer 2',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['strk', 'starknet', 'starkware', 'eli ben sasson', 'zk rollups'],
    rank: 46,
    decimals: 4
  },
  {
    symbol: 'AR',
    name: 'Arweave',
    category: 'Infrastructure',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ar', 'arweave', 'sam williams', 'permanent storage', 'ao compute'],
    rank: 47,
    decimals: 2
  },
  {
    symbol: 'FTM',
    name: 'Fantom / Sonic',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['ftm', 'fantom', 'sonic', 'andre cronje'],
    rank: 48,
    decimals: 4
  },
  {
    symbol: 'ALGO',
    name: 'Algorand',
    category: 'Layer 1',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['algo', 'algorand', 'silvio micali', 'pure proof of stake'],
    rank: 49,
    decimals: 4
  },
  {
    symbol: 'BEAM',
    name: 'Beam',
    category: 'Gaming',
    marketClass: 'crypto',
    quoteCurrency: 'USDT',
    aliases: ['beam', 'merit circle', 'gaming ecosystem'],
    rank: 50,
    decimals: 5
  }
];

export const TOP_50_CRYPTO_ASSETS: AssetInfo[] = TRADING_360_ASSETS;
export const ASSET_SYMBOLS_SET = new Set(TRADING_360_ASSETS.map(a => a.symbol));
