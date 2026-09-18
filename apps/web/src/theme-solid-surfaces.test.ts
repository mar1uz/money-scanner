import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.tsx') || name.endsWith('.css')) out.push(full);
  }
  return out;
}

describe('Theme surfaces — no hardcoded dark cards, no card gradients', () => {
  const files = walk(SRC).filter(path => !path.endsWith('.test.ts'));
  const blob = files.map(path => readFileSync(path, 'utf8')).join('\n');

  it('does not hardcode dark graphite card fills', () => {
    assert.equal(blob.includes('from-[#151A21]'), false);
    assert.equal(blob.includes('from-[#161B24]'), false);
    assert.equal(blob.includes('to-[#0D1015]'), false);
    assert.equal(blob.includes('via-[#12151A]'), false);
  });

  it('does not use dark-950 tints that stay black on light themes', () => {
    assert.equal(/bg-(cyan|emerald|rose|purple|slate)-950\//.test(blob), false);
  });

  it('AI Analysis cards use theme surface tokens', () => {
    const profile = readFileSync(join(SRC, 'components/AssetProfileOverviewCard.tsx'), 'utf8');
    const dive = readFileSync(join(SRC, 'components/AssetDeepDiveView.tsx'), 'utf8');
    assert.match(profile, /bg-\[var\(--t-surface\)\]/);
    assert.equal(profile.includes('bg-gradient'), false);
    assert.equal(dive.includes('from-[#151A21]'), false);
    assert.match(dive, /bg-\[var\(--t-surface\)\]/);
  });
});
