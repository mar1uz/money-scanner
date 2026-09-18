import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AIBriefingView.tsx'), 'utf8');

describe('AI Briefing — solid surfaces, no gradients', () => {
  it('does not use Tailwind gradient utilities', () => {
    assert.equal(source.includes('bg-gradient'), false);
    assert.equal(/from-(cyan|purple|violet|emerald)-/.test(source) && source.includes('bg-gradient'), false);
  });

  it('does not use gradient text, blur orbs, or hardcoded dark via-stops', () => {
    assert.equal(source.includes('bg-clip-text'), false);
    assert.equal(source.includes('blur-3xl'), false);
    assert.equal(source.includes('via-[#12151A]'), false);
    assert.equal(source.includes('from-[#151A21]'), false);
  });

  it('uses solid theme surface tokens on the three main cards', () => {
    const surfaceCards = source.split('bg-[var(--t-surface)]').length - 1;
    assert.ok(surfaceCards >= 3, `expected ≥3 solid --t-surface cards, got ${surfaceCards}`);
  });
});
