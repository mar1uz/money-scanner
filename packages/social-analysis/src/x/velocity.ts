import { XPostItem } from '@money-scanner/shared';

export function calculateTopicVelocity(posts: XPostItem[], timeframeHours = 1): number {
  if (posts.length === 0) return 0;

  const now = Date.now();
  const recentThreshold = now - timeframeHours * 3600 * 1000;
  const recentPosts = posts.filter(p => p.timestamp >= recentThreshold);

  let totalEngagement = 0;
  for (const p of recentPosts) {
    totalEngagement += p.likes + p.reposts * 2 + p.replies;
  }

  // Base velocity on post frequency and engagement density
  const postRate = recentPosts.length / Math.max(timeframeHours, 0.5);
  const engagementPerPost = recentPosts.length > 0 ? totalEngagement / recentPosts.length : 0;

  const rawVelocity = postRate * 2 + Math.log10(engagementPerPost + 1) * 15;
  return Number(Math.max(0, Math.min(100, rawVelocity)).toFixed(1));
}
