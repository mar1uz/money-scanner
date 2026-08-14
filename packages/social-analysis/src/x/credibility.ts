export function calculateAuthorCredibility(
  followers: number,
  isVerified: boolean,
  likes: number,
  reposts: number
): number {
  let score = 0.3; // base

  if (isVerified) {
    score += 0.25;
  }

  if (followers >= 100_000) {
    score += 0.35;
  } else if (followers >= 10_000) {
    score += 0.20;
  } else if (followers >= 1_000) {
    score += 0.10;
  }

  const engagement = likes + reposts * 2;
  if (engagement >= 500) {
    score += 0.15;
  } else if (engagement >= 50) {
    score += 0.08;
  }

  return Number(Math.max(0.05, Math.min(1.0, score)).toFixed(2));
}
