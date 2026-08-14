import { XPostItem } from '@money-scanner/shared';

const SPAM_PATTERNS = [
  /airdrop.*claim/i,
  /giveaway.*drop wallet/i,
  /send.*eth.*receive/i,
  /guaranteed\s+100x/i,
  /free\s+mint/i,
  /whatsapp\s+invest/i,
  /telegram\s+pump/i,
  /100%\s+profit/i
];

export function assessSpamProbability(post: Partial<XPostItem>): number {
  let score = 0;
  const text = post.text || '';

  // Pattern checks
  for (const p of SPAM_PATTERNS) {
    if (p.test(text)) {
      score += 0.45;
    }
  }

  // Excessive cashtags/hashtags
  const cashtags = (text.match(/[$#][a-zA-Z0-9_]+/g) || []).length;
  if (cashtags > 6) {
    score += 0.35;
  } else if (cashtags > 4) {
    score += 0.15;
  }

  // Account checks
  if (post.authorFollowers !== undefined && post.authorFollowers < 10) {
    score += 0.25;
  }
  if (post.authorVerified) {
    score -= 0.20;
  }

  return Math.max(0, Math.min(1.0, score));
}
