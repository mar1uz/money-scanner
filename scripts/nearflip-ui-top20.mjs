/**
 * Near-flip UI Top-20 adapter - replicates the exact AlertsCenterView default
 * "Top 20 aproape de flip" selection on a local scan-1w-parity packet:
 * filter ALL/ALL/ALL on the ranked upcoming candidates, one candidate per
 * asset (first in ranked order wins), slice 20. Source of truth for the rule:
 * apps/web/src/components/AlertsCenterView.tsx filterFlipCandidates and
 * AppState.rankUpcomingCandidates (already applied upstream by the scan).
 */
import { readFileSync, writeFileSync } from 'node:fs';

export function selectUiTop20(upcomingCandidates, limit = 20) {
  const seen = new Set();
  return (upcomingCandidates ?? [])
    .filter(c => c.status !== 'CONFIRMED')
    .filter(c => {
      const key = `${c.marketClass}:${c.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildUiTop20Scan(scan, limit = 20) {
  const selected = selectUiTop20(scan.upcomingCandidates, limit);
  return {
    generatedAt: scan.generatedAt,
    method: 'UI Top 20 selection (filterFlipCandidates ALL/ALL/ALL, one candidate per asset) over local scan-1w-parity packet',
    ruleId: 'NEAR_FLIP_UI_TOP20',
    sourceGeneratedAt: scan.generatedAt,
    sourceMethod: scan.method,
    universeCount: scan.universeCount,
    candidatePool: (scan.upcomingCandidates ?? []).length,
    upcomingCandidates: selected
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const input = process.argv[2];
  const output = process.argv[3];
  const scan = JSON.parse(readFileSync(input, 'utf8'));
  const result = buildUiTop20Scan(scan);
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(`selected ${result.upcomingCandidates.length} of pool ${result.candidatePool} (scan ${scan.generatedAt})`);
  for (const [i, c] of result.upcomingCandidates.entries()) {
    console.log(`${i + 1}. ${c.symbol} ${c.timeframe} ${c.direction} dist ${c.distanceAtr} prio ${c.priorityScore} ${c.marketClass}`);
  }
}
