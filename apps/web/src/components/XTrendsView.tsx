import React, { useEffect, useState } from 'react';
import { XTrendTopic } from '../types.js';
import { fetchXTrends } from '../services/api.js';
import { Flame, ExternalLink, ShieldCheck, MessageCircle, Heart, Repeat, Sparkles } from 'lucide-react';

export const XTrendsView: React.FC = () => {
  const [trends, setTrends] = useState<XTrendTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchXTrends()
      .then(res => setTrends(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-slate-400 font-mono">Scanning X social stream & clustering narratives...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="cyber-glass rounded-xl p-5 border border-amber-500/30 bg-amber-500/5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">X (Twitter) Crypto Trend Intelligence</h2>
          </div>
          <p className="text-xs text-slate-400">
            Real-time clustering of crypto narratives, velocity acceleration, author credibility scoring, and spam filtration.
          </p>
        </div>
        <span className="text-xs font-mono px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
          {trends.length} Active Topic Clusters
        </span>
      </div>

      {/* Topics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trends.map((topic) => (
          <div
            key={topic.id}
            className="cyber-glass rounded-xl p-4 border border-background-border hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              {/* Category & Velocity */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {topic.category}
                </span>
                <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  Velocity: {topic.velocityScore}
                </span>
              </div>

              {/* Cashtag & Title */}
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2 mb-1">
                <span className="text-cyan-300 font-mono">{topic.cashtag}</span>
                <span>{topic.topic}</span>
              </h3>

              {/* Quality Metrics */}
              <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400 my-2">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Credibility: {(topic.credibilityScore * 100).toFixed(0)}%
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Sentiment: {topic.sentimentScore > 0 ? `+${topic.sentimentScore}` : topic.sentimentScore}
                </span>
              </div>
            </div>

            {/* Sample Verified Posts */}
            {topic.samplePosts && topic.samplePosts.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-background-border">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Sample High-Authority Post</span>
                {topic.samplePosts.slice(0, 1).map((post) => (
                  <div key={post.id} className="p-2.5 rounded-lg bg-background-surface/90 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="font-semibold text-slate-200">@{post.authorHandle}</span>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline flex items-center gap-0.5"
                      >
                        <span>View</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      "{post.text}"
                    </p>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 pt-1">
                      <span className="flex items-center gap-1"><Heart className="w-2.5 h-2.5" /> {post.likes}</span>
                      <span className="flex items-center gap-1"><Repeat className="w-2.5 h-2.5" /> {post.reposts}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
