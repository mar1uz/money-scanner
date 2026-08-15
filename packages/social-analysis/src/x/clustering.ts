import { XPostItem, XTrendTopic, NarrativeCategory, TOP_50_CRYPTO_ASSETS } from '@money-scanner/shared';
import { calculateTopicVelocity } from './velocity.js';

const NARRATIVE_KEYWORDS: Record<string, NarrativeCategory> = {
  'etf': 'ETF & Institutional',
  'blackrock': 'ETF & Institutional',
  'sec': 'Regulation & Legal',
  'lawsuit': 'Regulation & Legal',
  'hack': 'Exploit & Security',
  'exploit': 'Exploit & Security',
  'drain': 'Exploit & Security',
  'defi': 'DeFi & Yield',
  'airdrop': 'DeFi & Yield',
  'staking': 'DeFi & Yield',
  'ai': 'AI & Compute',
  'gpu': 'AI & Compute',
  'nvidia': 'AI & Compute',
  'meme': 'Meme Coins',
  'layer2': 'Layer 1 & 2',
  'l2': 'Layer 1 & 2',
  'fed': 'Macro & Fed',
  'inflation': 'Macro & Fed',
  'rates': 'Macro & Fed'
};

export function clusterPostsIntoTopics(posts: XPostItem[]): XTrendTopic[] {
  // Filter out high-probability spam
  const validPosts = posts.filter(p => p.isSpamProbability < 0.6);
  const symbolMap = new Map<string, XPostItem[]>();

  for (const post of validPosts) {
    for (const sym of post.mentionedSymbols) {
      if (!symbolMap.has(sym)) {
        symbolMap.set(sym, []);
      }
      symbolMap.get(sym)!.push(post);
    }
  }

  const topics: XTrendTopic[] = [];

  for (const [symbol, pList] of symbolMap.entries()) {
    if (pList.length === 0) continue;

    // Detect narrative category from text
    let category: NarrativeCategory = 'Layer 1 & 2';
    const allText = pList.map(p => p.text.toLowerCase()).join(' ');

    for (const [keyword, cat] of Object.entries(NARRATIVE_KEYWORDS)) {
      if (allText.includes(keyword)) {
        category = cat;
        break;
      }
    }

    const assetInfo = TOP_50_CRYPTO_ASSETS.find(a => a.symbol === symbol);
    if (assetInfo?.category === 'AI') category = 'AI & Compute';
    if (assetInfo?.category === 'Meme') category = 'Meme Coins';
    if (assetInfo?.category === 'DeFi') category = 'DeFi & Yield';

    const velocity = calculateTopicVelocity(pList, 1);
    
    // Average sentiment and credibility
    const avgCredibility = pList.reduce((acc, p) => acc + p.authorCredibilityScore, 0) / pList.length;

    // Estimate sentiment from keywords
    let bullishCount = 0;
    let bearishCount = 0;
    const bullishWords = ['breakout', 'pump', 'bullish', 'ath', 'surge', 'buy', 'accumulate', 'upgrade', 'moon'];
    const bearishWords = ['dump', 'bearish', 'drop', 'crash', 'sell', 'scam', 'hack', 'sec', 'ban'];

    for (const p of pList) {
      const lower = p.text.toLowerCase();
      if (bullishWords.some(w => lower.includes(w))) bullishCount++;
      if (bearishWords.some(w => lower.includes(w))) bearishCount++;
    }

    const sentimentScore = pList.length > 0
      ? Number(((bullishCount - bearishCount) / pList.length).toFixed(2))
      : 0;

    const firstPost = pList[0];
    const sector = firstPost?.sector || 'crypto';
    const aiSummaryRo = firstPost?.aiSummaryRo;

    topics.push({
      id: `topic_${symbol.toLowerCase()}_${Date.now()}`,
      topic: `$${symbol} Momentum & Ecosystem Discussions`,
      cashtag: `$${symbol}`,
      category,
      sector,
      aiSummaryRo,
      postCountLastHour: pList.length,
      velocityScore: velocity,
      sentimentScore,
      credibilityScore: Number(avgCredibility.toFixed(2)),
      samplePosts: pList.slice(0, 4),
      firstDetected: Math.min(...pList.map(p => p.timestamp)),
      lastUpdated: Date.now()
    });
  }

  // Sort by velocity desc
  return topics.sort((a, b) => b.velocityScore - a.velocityScore);
}
