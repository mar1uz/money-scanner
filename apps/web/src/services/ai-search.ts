import { TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import { AssetScannerRow } from '../types.js';

export interface SemanticAsset {
  symbol: string;
  name: string;
  category: string;
  aliases: string[];
  concepts: string[];
  roTerms: string[];
  enTerms: string[];
  price: number;
  change24h: number;
  tier: string;
  moneyLineScore: number;
  rank: number;
}

export interface SearchMatchResult extends SemanticAsset {
  score: number;
  matchReason?: string;
  isTopMatch?: boolean;
}

// Deep Semantic Knowledge Base with comprehensive Romanian & English concept ontology
const SEMANTIC_CONCEPTS: Record<string, { concepts: string[]; roTerms: string[]; enTerms: string[]; aliases: string[] }> = {
  'BTC': {
    concepts: ['layer 1', 'digital gold', 'store of value', 'pow', 'halving', 'lightning network', 'satoshis', 'sats', 'crypto king'],
    roTerms: ['aur digital', 'regele criptomonedelor', 'prima moneda crypto', 'satoshi nakamoto', 'moneda principala', 'bitcoin', 'btc'],
    enTerms: ['digital gold', 'first cryptocurrency', 'satoshi nakamoto', 'store of value', 'crypto benchmark'],
    aliases: ['btc', 'bitcoin', 'satoshi', 'nakamoto', 'digital gold', 'aur digital', 'regele crypto', 'sats']
  },
  'ETH': {
    concepts: ['smart contracts', 'defi', 'erc20', 'evm', 'layer 1', 'pos', 'dapps', 'gas', 'gwei', 'ultrasound money'],
    roTerms: ['moneda lui vitalik', 'vitalik buterin', 'contracte inteligente', 'ether', 'ethereum', 'gwei', 'gaz'],
    enTerms: ['smart contract platform', 'vitalik buterin', 'ether', 'world computer', 'defi foundation'],
    aliases: ['eth', 'ethereum', 'vitalik', 'buterin', 'ether', 'contracte inteligente', 'vitalik buterin']
  },
  'SOL': {
    concepts: ['high throughput', 'layer 1', 'proof of history', 'meme hub', 'fast blockchain', 'low fees', 'pumpfun'],
    roTerms: ['solana', 'blockchain rapid', 'monede meme solana', 'anatoly yakovenko', 'viteza mare', 'taxe mici'],
    enTerms: ['fast layer 1', 'proof of history', 'anatoly yakovenko', 'solana memes', 'high speed'],
    aliases: ['sol', 'solana', 'anatoly', 'yakovenko', 'poh', 'meme solana', 'pumpfun']
  },
  'BNB': {
    concepts: ['binance ecosystem', 'exchange token', 'bsc', 'bnb chain', 'cz', 'trading fee discount', 'launchpool'],
    roTerms: ['bursa binance', 'moneda binance', 'changpeng zhao', 'cz binance', 'bnb chain'],
    enTerms: ['binance exchange', 'changpeng zhao', 'cz', 'bnb chain', 'exchange coin'],
    aliases: ['bnb', 'binance', 'cz', 'changpeng zhao', 'bsc', 'binance coin']
  },
  'XRP': {
    concepts: ['cross border payments', 'ripple', 'banking crypto', 'sec', 'settlement', 'brad garlinghouse'],
    roTerms: ['ripple', 'plati bancare', 'plati transfrontaliere', 'brad garlinghouse', 'xrp'],
    enTerms: ['cross border settlement', 'ripple labs', 'brad garlinghouse', 'banking remittance'],
    aliases: ['xrp', 'ripple', 'garlinghouse', 'plati bancare', 'ripple labs']
  },
  'DOGE': {
    concepts: ['meme coin', 'dogecoin', 'shiba inu dog', 'elon favorite', 'kabosu', 'original meme', 'tipping coin'],
    roTerms: ['caine meme', 'doge', 'moneda cu caine', 'cainele kabosu', 'favorita lui elon', 'dogecoin'],
    enTerms: ['meme coin', 'dogecoin', 'shiba dog', 'elon musk doge', 'kabosu dog'],
    aliases: ['doge', 'dogecoin', 'caine', 'caine meme', 'kabosu', 'shiba doge', 'elon doge']
  },
  'PEPE': {
    concepts: ['pepe the frog', 'meme coin', 'frog meme', 'viral crypto', 'ethereum meme', 'matt furie'],
    roTerms: ['broasca pepe', 'broasca verde meme', 'pepe the frog', 'moneda broasca', 'pepe coin'],
    enTerms: ['pepe the frog', 'green frog meme', 'viral frog meme', 'pepe token'],
    aliases: ['pepe', 'pepe the frog', 'broasca', 'broasca meme', 'broasca verde', 'matt furie']
  },
  'WIF': {
    concepts: ['dogwifhat', 'solana meme', 'dog with hat', 'pink hat dog', 'viral solana'],
    roTerms: ['caine cu caciula', 'caine cu palarie', 'caciula roz', 'dogwifhat', 'wif solana'],
    enTerms: ['dog with hat', 'dogwifhat', 'pink beanie dog', 'solana dog meme'],
    aliases: ['wif', 'dogwifhat', 'caine cu caciula', 'caine cu palarie', 'caciula roz', 'hat dog']
  },
  'BONK': {
    concepts: ['solana dog', 'bonk meme', 'airdrop solana', 'community coin', 'dog meme'],
    roTerms: ['caine solana', 'bonk', 'bonk coin', 'meme solana bonk'],
    enTerms: ['solana first dog', 'bonk token', 'solana meme coin'],
    aliases: ['bonk', 'caine solana', 'bonk coin', 'solana dog']
  },
  'SHIB': {
    concepts: ['shiba inu', 'doge killer', 'shibarium', 'ryoshi', 'meme token', 'leash', 'bone'],
    roTerms: ['shiba inu', 'caine shiba', 'ucigasul lui doge', 'ryoshi', 'shib'],
    enTerms: ['shiba inu token', 'doge killer', 'ryoshi', 'shibarium'],
    aliases: ['shib', 'shiba', 'shiba inu', 'ryoshi', 'shibarium']
  },
  'NVDA': {
    concepts: ['gpu', 'ai chips', 'semiconductors', 'h100', 'blackwell', 'geforce', 'jensen huang', 'cuda', 'hardware ai'],
    roTerms: ['placi video', 'cipuri ai', 'inteligenta artificiala', 'jensen huang', 'placi grafice', 'producator cipuri', 'nvidia'],
    enTerms: ['graphics cards', 'ai accelerators', 'jensen huang', 'gpu maker', 'chipmaker', 'ai hardware', 'blackwell'],
    aliases: ['nvda', 'nvidia', 'placi video', 'cipuri ai', 'jensen huang', 'gpu', 'h100', 'blackwell', 'placi grafice', 'inteligenta artificiala']
  },
  'TSLA': {
    concepts: ['electric vehicles', 'ev', 'elon musk', 'cybertruck', 'robotaxi', 'autopilot', 'fsd', 'energy storage', 'gigafactory'],
    roTerms: ['masini electrice', 'masina lui elon', 'elon musk', 'cybertruck', 'robotaxi', 'gigafactory', 'tesla'],
    enTerms: ['electric cars', 'elon musk', 'cybertruck', 'robotaxi', 'full self driving', 'clean energy'],
    aliases: ['tsla', 'tesla', 'elon musk', 'masini electrice', 'masina electrica', 'cybertruck', 'robotaxi', 'elon']
  },
  'AAPL': {
    concepts: ['iphone', 'macbook', 'ipad', 'apple watch', 'ios', 'tim cook', 'consumer electronics', 'silicon m series'],
    roTerms: ['telefon iphone', 'macbook', 'tim cook', 'apple', 'ipad', 'ceas apple', 'ios'],
    enTerms: ['iphone maker', 'macbook', 'tim cook', 'apple computer', 'ios ecosystem'],
    aliases: ['aapl', 'apple', 'iphone', 'macbook', 'tim cook', 'ipad', 'apple watch', 'ios']
  },
  'MSFT': {
    concepts: ['windows', 'azure cloud', 'office 365', 'openai investor', 'satya nadella', 'bill gates', 'xbox', 'copilot'],
    roTerms: ['windows', 'sistem de operare', 'satya nadella', 'bill gates', 'azure cloud', 'microsoft', 'xbox'],
    enTerms: ['windows os', 'azure cloud', 'satya nadella', 'bill gates', 'copilot ai', 'microsoft corp'],
    aliases: ['msft', 'microsoft', 'windows', 'satya nadella', 'bill gates', 'azure', 'xbox', 'office']
  },
  'GOOGL': {
    concepts: ['google search', 'youtube', 'android', 'alphabet', 'sundar pichai', 'gemini ai', 'google cloud', 'deepmind'],
    roTerms: ['motor de cautare', 'google', 'youtube', 'android', 'alphabet', 'sundar pichai', 'gemini ai'],
    enTerms: ['search engine', 'google', 'youtube', 'android', 'sundar pichai', 'gemini ai', 'alphabet'],
    aliases: ['googl', 'goog', 'google', 'alphabet', 'youtube', 'motor de cautare', 'sundar pichai', 'gemini']
  },
  'META': {
    concepts: ['facebook', 'instagram', 'whatsapp', 'mark zuckerberg', 'metaverse', 'llama ai', 'rayban smart glasses', 'threads'],
    roTerms: ['facebook', 'instagram', 'whatsapp', 'mark zuckerberg', 'retele sociale', 'metaverse', 'meta'],
    enTerms: ['facebook', 'instagram', 'whatsapp', 'mark zuckerberg', 'social media', 'llama ai', 'meta platforms'],
    aliases: ['meta', 'facebook', 'instagram', 'whatsapp', 'zuckerberg', 'mark zuckerberg', 'metaverse', 'retele sociale']
  },
  'AMZN': {
    concepts: ['e-commerce', 'aws cloud', 'jeff bezos', 'andy jassy', 'prime delivery', 'retail giant', 'kindle'],
    roTerms: ['cumparaturi online', 'magazin online', 'jeff bezos', 'aws cloud', 'livrare prime', 'amazon'],
    enTerms: ['e-commerce leader', 'aws cloud services', 'jeff bezos', 'online shopping', 'amazon.com'],
    aliases: ['amzn', 'amazon', 'jeff bezos', 'aws', 'cumparaturi online', 'magazin online', 'e-commerce']
  },
  'PLTR': {
    concepts: ['defense software', 'data analytics', 'alex karp', 'peter thiel', 'gotham', 'foundry', 'military ai', 'cia contracts'],
    roTerms: ['software aparare', 'analiza date militar', 'alex karp', 'peter thiel', 'palantir', 'securitate nationala'],
    enTerms: ['defense tech', 'data intelligence', 'alex karp', 'military software', 'palantir technologies'],
    aliases: ['pltr', 'palantir', 'alex karp', 'peter thiel', 'software militar', 'aparare', 'analiza date']
  },
  'MSTR': {
    concepts: ['bitcoin treasury', 'michael saylor', 'btc proxy', 'corporate bitcoin', 'convertible notes'],
    roTerms: ['companie btc', 'michael saylor', 'trezorerie bitcoin', 'microstrategy', 'actiuni bitcoin'],
    enTerms: ['bitcoin treasury company', 'michael saylor', 'microstrategy', 'btc corporate holder'],
    aliases: ['mstr', 'microstrategy', 'michael saylor', 'saylor', 'trezorerie btc', 'actiuni bitcoin']
  },
  'COIN': {
    concepts: ['crypto exchange', 'brian armstrong', 'us exchange', 'base l2', 'custody', 'sec compliant'],
    roTerms: ['bursa crypto sua', 'brian armstrong', 'coinbase', 'exchange reglementat sua', 'base network'],
    enTerms: ['crypto exchange us', 'brian armstrong', 'coinbase global', 'us crypto stock'],
    aliases: ['coin', 'coinbase', 'brian armstrong', 'bursa crypto', 'exchange sua']
  },
  'SPACEX': {
    concepts: ['space exploration', 'starship', 'falcon 9', 'mars colonization', 'elon space', 'starlink satellite', 'arkx'],
    roTerms: ['rachete spatiale', 'starship', 'colonizare marte', 'starlink sateliti', 'spacex', 'eloon spatiu'],
    enTerms: ['rocket launches', 'starship mars', 'starlink internet', 'falcon 9', 'space exploration tech'],
    aliases: ['spacex', 'space x', 'starship', 'starlink', 'rachete', 'marte', 'spatiu', 'elon rachete']
  },
  'XAU': {
    concepts: ['gold', 'precious metal', 'inflation hedge', 'bullion', 'safe haven', 'central bank gold'],
    roTerms: ['aur', 'lingou aur', 'metal pretios galben', 'aur spot', 'rezerva valuta aur', 'aur fizic'],
    enTerms: ['physical gold', 'bullion', 'precious metal', 'gold spot', 'safe haven metal', 'yellow metal'],
    aliases: ['xau', 'gold', 'aur', 'aur spot', 'lingou', 'metal pretios', 'gold spot', 'bullion']
  },
  'XAG': {
    concepts: ['silver', 'precious metal', 'industrial metal', 'solar panel metal', 'silver bullion'],
    roTerms: ['argint', 'metal alb pretios', 'argint spot', 'lingou argint', 'argint pur'],
    enTerms: ['physical silver', 'precious metal', 'silver spot', 'industrial precious metal'],
    aliases: ['xag', 'silver', 'argint', 'argint spot', 'metal alb', 'lingou argint']
  },
  'OIL': {
    concepts: ['crude oil', 'wti', 'petroleum', 'black gold', 'energy commodity', 'opec', 'fuel'],
    roTerms: ['petrol', 'titei', 'aur negru', 'combustibil', 'baril petrol', 'petrol wti american'],
    enTerms: ['crude oil', 'wti oil', 'black gold', 'petroleum', 'energy commodity', 'oil barrel'],
    aliases: ['oil', 'petrol', 'titei', 'crude', 'wti', 'aur negru', 'combustibil', 'baril petrol']
  },
  'BRENT': {
    concepts: ['brent crude', 'north sea oil', 'global oil benchmark', 'energy', 'uk oil'],
    roTerms: ['petrol brent', 'titei marea nordului', 'petrol european', 'brent'],
    enTerms: ['brent crude oil', 'north sea oil benchmark', 'uk crude'],
    aliases: ['brent', 'ukoil', 'petrol brent', 'titei brent', 'marea nordului']
  },
  'COPPER': {
    concepts: ['copper', 'dr copper', 'industrial metal', 'electrification metal', 'wiring', 'economic barometer'],
    roTerms: ['cupru', 'metal industrial', 'conductibilitate electrica', 'cupru pur'],
    enTerms: ['copper metal', 'dr copper', 'industrial wiring', 'economic indicator metal'],
    aliases: ['copper', 'cupru', 'metal industrial', 'dr copper']
  },
  'BTC.D': {
    concepts: ['bitcoin dominance', 'market share', 'altseason trigger', 'btc vs alts', 'crypto dominance'],
    roTerms: ['dominatie bitcoin', 'cota piata bitcoin', 'procent bitcoin din piata', 'dominance btc'],
    enTerms: ['bitcoin market share percentage', 'btc dominance ratio', 'crypto market dominance'],
    aliases: ['btc.d', 'btcd', 'dominatie btc', 'dominatie bitcoin', 'bitcoin dominance', 'cota btc']
  },
  'ETH.D': {
    concepts: ['ethereum dominance', 'eth market share', 'altcoin health', 'eth percentage'],
    roTerms: ['dominatie ethereum', 'cota piata eth', 'procent ethereum'],
    enTerms: ['ethereum market share', 'eth dominance ratio'],
    aliases: ['eth.d', 'ethd', 'dominatie eth', 'dominatie ethereum', 'ethereum dominance']
  },
  'USDT.D': {
    concepts: ['tether dominance', 'stablecoin dominance', 'cash on sidelines', 'risk off indicator'],
    roTerms: ['dominatie tether', 'bani pe margine', 'stables dominance', 'lichiditate pe bara'],
    enTerms: ['tether market share', 'stablecoin dominance', 'cash sidelines ratio'],
    aliases: ['usdt.d', 'usdtd', 'dominatie usdt', 'tether dominance', 'bani pe margine']
  },
  'TOTAL': {
    concepts: ['total market cap', 'entire crypto valuation', 'all crypto market', 'global crypto cap'],
    roTerms: ['capitalizare totala crypto', 'toata piata crypto', 'valoarea intregii piete crypto', 'total market'],
    enTerms: ['total crypto market cap', 'all cryptocurrencies value', 'entire market valuation'],
    aliases: ['total', 'piata totala', 'capitalizare totala', 'total market cap', 'crypto total']
  },
  'TOTAL2': {
    concepts: ['altcoin market cap', 'total excl btc', 'altseason tracker', 'all altcoins'],
    roTerms: ['capitalizare altcoins', 'toata piata fara bitcoin', 'total altcoins', 'altseason'],
    enTerms: ['altcoin market cap excluding bitcoin', 'all altcoins total', 'alt market size'],
    aliases: ['total2', 'altcoins total', 'total altcoins', 'piata altcoins', 'fara btc']
  },
  'DXY': {
    concepts: ['us dollar index', 'greenback', 'currency index', 'usd strength', 'fiat benchmark'],
    roTerms: ['indice dolar american', 'putere dolar', 'valuta americana', 'curs usd index', 'dolarul'],
    enTerms: ['us dollar strength index', 'greenback index', 'usd currency basket'],
    aliases: ['dxy', 'dyxy', 'dolar index', 'usd index', 'putere dolar', 'indice dolar', 'dolar']
  },
  'VIX': {
    concepts: ['volatility index', 'fear gauge', 'cboe vix', 'wall street fear', 'stock volatility'],
    roTerms: ['indice frica bursa', 'volatilitate bursa', 'frica wall street', 'vix index'],
    enTerms: ['cboe volatility index', 'fear gauge', 'market fear indicator', 'wall street volatility'],
    aliases: ['vix', 'frica bursa', 'volatilitate', 'fear index', 'indice frica', 'cboe vix']
  },
  'US10Y': {
    concepts: ['10 year treasury yield', 'risk free rate', 'us bond 10y', 'benchmark yield', 'discount rate'],
    roTerms: ['titluri trezorerie 10 ani', 'dobanda sua 10 ani', 'obligatiuni americane 10 ani', 'randament 10 ani'],
    enTerms: ['10 year us treasury yield', 'benchmark bond rate', 'us sovereign debt 10y'],
    aliases: ['us10y', 'titluri 10 ani', 'dobanda 10 ani', 'treasury 10y', '10y yield', 'obligatiuni 10 ani']
  },
  'US02Y': {
    concepts: ['2 year treasury yield', 'fed rate expectations', 'short term yield', 'treasury 2y'],
    roTerms: ['titluri trezorerie 2 ani', 'dobanda 2 ani', 'obligatiuni 2 ani', 'rate dobânzi fed'],
    enTerms: ['2 year treasury yield', 'short term us bond yield', 'fed policy expectations'],
    aliases: ['us02y', 'titluri 2 ani', 'dobanda 2 ani', 'treasury 2y', '2y yield']
  },
  'SPY': {
    concepts: ['s&p 500 etf', 'top 500 us companies', 'wall street broad index', 'sp500', 'warren buffett index'],
    roTerms: ['bursa americana sp500', 'cele mai mari 500 companii sua', 'indice s&p 500', 'etf spy'],
    enTerms: ['s&p 500 index etf', '500 largest us companies', 'broad market us index'],
    aliases: ['spy', 'sp500', 's&p500', 's&p 500', 'bursa sua', 'top 500 companii', 'spx']
  },
  'QQQ': {
    concepts: ['nasdaq 100 etf', 'top 100 tech stocks', 'invesco qqq', 'tech index', 'silicon valley index'],
    roTerms: ['bursa tech nasdaq', 'cele mai mari 100 companii tech', 'indice nasdaq 100', 'tehnologie sua'],
    enTerms: ['nasdaq 100 etf', 'top 100 technology companies', 'invesco qqq trust'],
    aliases: ['qqq', 'nasdaq', 'nasdaq 100', 'bursa tech', 'top tech', 'tech stocks']
  },
  'EURUSD': {
    concepts: ['euro us dollar', 'major forex pair', 'ecb vs fed', 'fx currency pair'],
    roTerms: ['euro dolar', 'curs valutar euro dolar', 'valuta europeana', 'pereche forex euro'],
    enTerms: ['euro dollar exchange rate', 'eur/usd forex pair', 'european currency'],
    aliases: ['eurusd', 'eur/usd', 'euro dolar', 'euro', 'curs euro']
  },
  'USDJPY': {
    concepts: ['dollar yen', 'boj carry trade', 'japanese yen', 'safe haven currency'],
    roTerms: ['dolar yen', 'yen japonez', 'curs dolar yen', 'carry trade'],
    enTerms: ['dollar japanese yen', 'usd/jpy currency pair', 'japanese yen'],
    aliases: ['usdjpy', 'usd/jpy', 'yen', 'yen japonez', 'dolar yen']
  },
  'KAS': {
    concepts: ['kaspa', 'ghostdag', 'blockdag', 'proof of work fast', 'gmax', 'jonas'],
    roTerms: ['kaspa', 'blockdag rapid', 'minare pow rapida', 'kas'],
    enTerms: ['kaspa currency', 'blockdag high speed', 'ghostdag consensus'],
    aliases: ['kas', 'kaspa', 'ghostdag', 'blockdag']
  },
  'TAO': {
    concepts: ['bittensor', 'decentralized ai', 'subnets', 'machine intelligence marketplace', 'ai neural network'],
    roTerms: ['bittensor', 'inteligenta artificiala descentralizata', 'subnets ai', 'retea ai'],
    enTerms: ['bittensor ai network', 'decentralized machine learning', 'ai subnet ecosystem'],
    aliases: ['tao', 'bittensor', 'retea ai', 'inteligenta artificiala descentralizata']
  },
  'RENDER': {
    concepts: ['render network', 'distributed 3d graphics', 'jules urbach', 'octanerender', 'gpu cloud'],
    roTerms: ['render', 'randare 3d', 'placi video descentralizate', 'rndr', 'octane render'],
    enTerms: ['render network', 'distributed gpu rendering', '3d graphics cloud'],
    aliases: ['render', 'rndr', 'randare 3d', 'gpu cloud', 'octanerender']
  },
  'ADA': {
    concepts: ['cardano', 'charles hoskinson', 'peer reviewed', 'hydra', 'ouroboros'],
    roTerms: ['cardano', 'charles hoskinson', 'moneda cardano', 'ada'],
    enTerms: ['cardano platform', 'charles hoskinson', 'peer reviewed blockchain'],
    aliases: ['ada', 'cardano', 'charles hoskinson', 'hoskinson']
  },
  'AVAX': {
    concepts: ['avalanche', 'subnets', 'emin gun sirer', 'ava labs', 'fast l1'],
    roTerms: ['avalanche', 'emin gun sirer', 'subnets avalanche', 'avax'],
    enTerms: ['avalanche blockchain', 'emin gun sirer', 'ava labs'],
    aliases: ['avax', 'avalanche', 'emin gun sirer', 'ava labs']
  },
  'LINK': {
    concepts: ['chainlink', 'sergey nazarov', 'oracles', 'ccip', 'cross chain interoperability', 'rwa'],
    roTerms: ['chainlink', 'sergey nazarov', 'oracole date', 'ccip transfer', 'link'],
    enTerms: ['chainlink oracles', 'sergey nazarov', 'cross chain ccip', 'data feeds'],
    aliases: ['link', 'chainlink', 'sergey nazarov', 'oracole', 'ccip']
  },
  'DOT': {
    concepts: ['polkadot', 'gavin wood', 'parachains', 'interoperability', 'relay chain'],
    roTerms: ['polkadot', 'gavin wood', 'parachains polkadot', 'dot'],
    enTerms: ['polkadot network', 'gavin wood', 'parachain ecosystem'],
    aliases: ['dot', 'polkadot', 'gavin wood', 'parachains']
  },
  'NEAR': {
    concepts: ['near protocol', 'nightshade sharding', 'illia polosukhin', 'transformer author', 'user owned ai'],
    roTerms: ['near protocol', 'sharding rapid', 'illia polosukhin', 'near'],
    enTerms: ['near protocol', 'nightshade sharding', 'illia polosukhin', 'ai on blockchain'],
    aliases: ['near', 'near protocol', 'illia polosukhin', 'sharding']
  },
  'SUI': {
    concepts: ['sui network', 'mysten labs', 'move programming', 'evan cheng', 'object centric'],
    roTerms: ['sui', 'mysten labs', 'limbaj move', 'evan cheng', 'sui blockchain'],
    enTerms: ['sui blockchain', 'mysten labs', 'move language', 'high performance l1'],
    aliases: ['sui', 'mysten labs', 'move', 'sui network']
  },
  'APT': {
    concepts: ['aptos', 'mo shaikh', 'avery ching', 'move language', 'diem facebook team'],
    roTerms: ['aptos', 'mo shaikh', 'echipa facebook diem', 'limbaj move', 'apt'],
    enTerms: ['aptos blockchain', 'mo shaikh', 'diem engineers', 'move l1'],
    aliases: ['apt', 'aptos', 'mo shaikh', 'diem team']
  },
  'INJ': {
    concepts: ['injective', 'defi l1', 'onchain orderbook', 'eric chen', 'derivatives'],
    roTerms: ['injective', 'defi trading', 'orderbook pe blockchain', 'eric chen', 'inj'],
    enTerms: ['injective protocol', 'defi layer 1', 'onchain derivatives'],
    aliases: ['inj', 'injective', 'eric chen', 'defi orderbook']
  },
  'TIA': {
    concepts: ['celestia', 'modular blockchain', 'data availability', 'mustafa al bassam', 'rollups'],
    roTerms: ['celestia', 'blockchain modular', 'disponibilitate date', 'mustafa al bassam', 'tia'],
    enTerms: ['celestia network', 'modular blockchain', 'data availability layer'],
    aliases: ['tia', 'celestia', 'modular blockchain', 'data availability']
  },
  'SEI': {
    concepts: ['sei network', 'trading layer 1', 'twin turbo consensus', 'parallel evm'],
    roTerms: ['sei', 'blockchain pentru trading', 'parallel evm', 'sei network'],
    enTerms: ['sei network', 'trading optimized l1', 'parallelized evm'],
    aliases: ['sei', 'sei network', 'parallel evm', 'trading l1']
  },
  'MATIC': {
    concepts: ['polygon', 'sandeep nailwal', 'ethereum l2', 'zk evm', 'matic network', 'pol'],
    roTerms: ['polygon', 'sandeep nailwal', 'scalare ethereum', 'matic', 'pol'],
    enTerms: ['polygon network', 'sandeep nailwal', 'ethereum scaling', 'matic token'],
    aliases: ['matic', 'polygon', 'pol', 'sandeep nailwal', 'polygon matic']
  },
  'POL': {
    concepts: ['polygon ecosystem token', 'pol upgrade', 'aggregated blockchains', 'zk scaling'],
    roTerms: ['polygon pol', 'upgrade matic', 'pol token', 'scalare zk'],
    enTerms: ['polygon pol token', 'matic upgrade', 'aggregated l2 network'],
    aliases: ['pol', 'polygon pol', 'matic upgrade', 'polygon']
  },
  'TON': {
    concepts: ['telegram open network', 'pavel durov', 'toncoin', 'telegram wallet', 'mini apps'],
    roTerms: ['telegram coin', 'pavel durov', 'toncoin', 'portofel telegram', 'mini apps telegram'],
    enTerms: ['telegram crypto', 'pavel durov', 'toncoin', 'telegram ecosystem'],
    aliases: ['ton', 'toncoin', 'telegram', 'pavel durov', 'telegram coin']
  },
  'TRX': {
    concepts: ['tron', 'justin sun', 'usdt transfers', 'stablecoin settlement', 'tron network'],
    roTerms: ['tron', 'justin sun', 'transferuri usdt ieftine', 'trx'],
    enTerms: ['tron network', 'justin sun', 'usdt trc20 transfer hub'],
    aliases: ['trx', 'tron', 'justin sun', 'usdt trc20']
  }
};

/**
 * Fast Levenshtein distance for fuzzy typo correction
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > 4) return 99; // Fast reject

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Clean & normalize text for semantic search
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/^[$#]/, '')
    .replace(/[ăâ]/g, 'a')
    .replace(/[î]/g, 'i')
    .replace(/[ș]/g, 's')
    .replace(/[ț]/g, 't')
    .replace(/[\/\-\_\,\.]/g, ' ');
}

/**
 * Builds full semantic searchable asset universe
 */
export function buildSearchUniverse(liveRows: AssetScannerRow[] = []): SemanticAsset[] {
  return TOP_50_CRYPTO_ASSETS.map(base => {
    const live = liveRows.find(a => a.symbol.toUpperCase() === base.symbol.toUpperCase());
    const extra = SEMANTIC_CONCEPTS[base.symbol.toUpperCase()] || {
      concepts: [],
      roTerms: [],
      enTerms: [],
      aliases: []
    };

    const combinedAliases = Array.from(new Set([
      base.symbol.toLowerCase(),
      base.name.toLowerCase(),
      ...((base as any).aliases || []).map((al: string) => al.toLowerCase()),
      ...extra.aliases.map(al => al.toLowerCase())
    ]));

    return {
      symbol: base.symbol,
      name: base.name,
      category: base.category,
      aliases: combinedAliases,
      concepts: extra.concepts,
      roTerms: extra.roTerms,
      enTerms: extra.enTerms,
      price: live ? live.price : 0,
      change24h: live ? live.change24h : 0,
      tier: live ? live.tier : 'Bullish',
      moneyLineScore: live ? live.moneyLineScore : 0,
      rank: base.rank || 50
    };
  });
}

/**
 * AI Approximate Relevance Matcher:
 * Computes deep relevance scores and returns ranked list with the #1 best approximated match.
 */
export function performAISearchMatch(
  query: string,
  universe: SemanticAsset[]
): SearchMatchResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const rawWords = q.split(/\s+/).filter(w => w.length > 0);
  if (rawWords.length === 0) return [];

  const results: SearchMatchResult[] = [];

  for (const asset of universe) {
    const symNorm = normalizeQuery(asset.symbol);
    const nameNorm = normalizeQuery(asset.name);
    const catNorm = normalizeQuery(asset.category);
    const aliasesNorm = asset.aliases.map(normalizeQuery);
    const conceptsNorm = asset.concepts.map(normalizeQuery);
    const roNorm = asset.roTerms.map(normalizeQuery);
    const enNorm = asset.enTerms.map(normalizeQuery);

    let score = 0;
    let matchReason = '';

    // 1. EXACT & PREFIX MATCHES (HIGHEST PRIORITY)
    if (symNorm === q) {
      score += 20000;
      matchReason = 'Simbol exact';
    } else if (aliasesNorm.includes(q)) {
      score += 15000;
      matchReason = 'Alias / Denumire directă';
    } else if (nameNorm === q) {
      score += 12000;
      matchReason = 'Nume complet exact';
    } else if (symNorm.startsWith(q)) {
      score += 8000;
      matchReason = `Prefix simbol (${asset.symbol})`;
    } else if (nameNorm.startsWith(q)) {
      score += 6000;
      matchReason = `Prefix nume (${asset.name})`;
    }

    // 2. PHRASE CONTAINMENT
    if (nameNorm.includes(q)) {
      score += 4000;
      if (!matchReason) matchReason = 'Nume conține termenul';
    }
    if (catNorm.includes(q)) {
      score += 2500;
      if (!matchReason) matchReason = `Categorie: ${asset.category}`;
    }

    for (const al of aliasesNorm) {
      if (al === q) {
        score += 10000;
        if (!matchReason) matchReason = `Alias exact: "${al}"`;
      } else if (al.includes(q)) {
        score += 3500;
        if (!matchReason) matchReason = `Alias: "${al}"`;
      }
    }

    for (const c of conceptsNorm) {
      if (c === q) {
        score += 8000;
        if (!matchReason) matchReason = `Concept cheie: "${c}"`;
      } else if (c.includes(q)) {
        score += 3000;
        if (!matchReason) matchReason = `Concept: "${c}"`;
      }
    }

    for (const r of roNorm) {
      if (r === q) {
        score += 9000;
        if (!matchReason) matchReason = `Potrivire semantică (RO): "${r}"`;
      } else if (r.includes(q) || q.includes(r)) {
        score += 4500;
        if (!matchReason) matchReason = `Concept (RO): "${r}"`;
      }
    }

    for (const e of enNorm) {
      if (e === q) {
        score += 8500;
        if (!matchReason) matchReason = `Semantic match (EN): "${e}"`;
      } else if (e.includes(q) || q.includes(e)) {
        score += 4000;
        if (!matchReason) matchReason = `Concept (EN): "${e}"`;
      }
    }

    // 3. MULTI-WORD TOKEN ANALYSIS & FUZZY SCORING
    let matchedTokenCount = 0;

    for (const word of rawWords) {
      let wordMatched = false;

      if (symNorm === word) {
        score += 4000;
        wordMatched = true;
      } else if (symNorm.includes(word)) {
        score += 1500;
        wordMatched = true;
      }

      if (nameNorm.includes(word)) {
        score += 1200;
        wordMatched = true;
      }

      if (catNorm.includes(word)) {
        score += 800;
        wordMatched = true;
      }

      for (const al of aliasesNorm) {
        if (al === word) {
          score += 3000;
          wordMatched = true;
          if (!matchReason) matchReason = `Alias: "${al}"`;
        } else if (al.includes(word)) {
          score += 1000;
          wordMatched = true;
        }
      }

      for (const c of conceptsNorm) {
        if (c.includes(word)) {
          score += 900;
          wordMatched = true;
        }
      }

      for (const r of roNorm) {
        if (r.includes(word)) {
          score += 1200;
          wordMatched = true;
          if (!matchReason) matchReason = `Termen RO: "${r}"`;
        }
      }

      // Fuzzy typo match (Levenshtein) for words >= 3 chars
      if (word.length >= 3) {
        if (levenshteinDistance(word, symNorm) <= 1) {
          score += 3500;
          wordMatched = true;
          if (!matchReason) matchReason = `Corecție automată: "${asset.symbol}"`;
        } else if (levenshteinDistance(word, nameNorm.split(' ')[0]) <= 1) {
          score += 2500;
          wordMatched = true;
          if (!matchReason) matchReason = `Corecție nume: "${asset.name}"`;
        }

        for (const al of aliasesNorm) {
          if (al.length >= 3 && levenshteinDistance(word, al) <= 1) {
            score += 2800;
            wordMatched = true;
            if (!matchReason) matchReason = `Corecție alias: "${al}"`;
            break;
          }
        }
      }

      if (wordMatched) {
        matchedTokenCount++;
      }
    }

    // Reward full multi-word query coverage
    if (rawWords.length > 1 && matchedTokenCount === rawWords.length) {
      score += 6000;
      if (!matchReason) matchReason = 'Potrivire semantică completă pentru toți termenii';
    } else if (matchedTokenCount > 0) {
      score += matchedTokenCount * 600;
    }

    // Rank tie-breaker bonus (Top assets get gentle nudge for generic searches)
    score += Math.max(0, 50 - asset.rank) * 5;

    if (score > 600) {
      results.push({
        ...asset,
        score,
        matchReason: matchReason || `Relevanță AI: ${score} pct`
      });
    }
  }

  // Sort descending by highest AI relevance score
  results.sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    results[0].isTopMatch = true;
  }

  return results;
}
