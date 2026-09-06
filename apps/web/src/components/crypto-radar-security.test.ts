import test from 'node:test';
import assert from 'node:assert/strict';
import { getRadarSecurityStatus } from './crypto-radar-security.js';

test('clean audit: top 10 holders <= 50% without danger flags yields emerald circle and shield badge', () => {
  const normalSafe = getRadarSecurityStatus({
    name: 'SafeCoin',
    top10HoldersPct: 27,
    isBundled: false,
    insidersDetected: false,
    isHoneypot: false,
    rugScore: 120,
  });

  assert.equal(normalSafe.level, 'clean');
  assert.match(normalSafe.dotColorClass, /bg-emerald-400/);
  assert.match(normalSafe.badgeColorClass, /bg-emerald-400/);
  assert.equal(normalSafe.badgeLabel, '🛡️ Top 10: 27%');
  assert.match(normalSafe.title, /Curat/);
  assert.match(normalSafe.title, /27%/);
  assert.match(normalSafe.ariaLabel, /Securitate SafeCoin/);

  // Exact 50% boundary check
  const boundarySafe = getRadarSecurityStatus({
    name: 'FiftyPct',
    top10HoldersPct: 50,
  });
  assert.equal(boundarySafe.level, 'clean');
  assert.match(boundarySafe.dotColorClass, /bg-emerald-400/);
  assert.equal(boundarySafe.badgeLabel, '🛡️ Top 10: 50%');

  // 0% check
  const zeroSafe = getRadarSecurityStatus({
    top10HoldersPct: 0,
  });
  assert.equal(zeroSafe.level, 'clean');
  assert.match(zeroSafe.dotColorClass, /bg-emerald-400/);
});

test('warning: top 10 holders > 50% without danger flags yields amber circle and warning badge', () => {
  const warning67 = getRadarSecurityStatus({
    name: 'ConcentratedCoin',
    top10HoldersPct: 67.4,
    isBundled: false,
    insidersDetected: false,
    isHoneypot: false,
  });

  assert.equal(warning67.level, 'warning');
  assert.match(warning67.dotColorClass, /bg-amber-400/);
  assert.match(warning67.badgeColorClass, /bg-amber-400/);
  assert.equal(warning67.badgeLabel, '⚠️ Top 10: 67%');
  assert.match(warning67.title, /Atenție/);
  assert.match(warning67.title, /67%/);
  assert.match(warning67.ariaLabel, /Securitate ConcentratedCoin/);

  // Boundary check just above 50%
  const boundaryWarning = getRadarSecurityStatus({
    top10HoldersPct: 50.1,
  });
  assert.equal(boundaryWarning.level, 'warning');
  assert.match(boundaryWarning.dotColorClass, /bg-amber-400/);
});

test('danger: honeypot, bundled launch, insider clustering, or high rugScore yields rose circle and danger badge', () => {
  // Honeypot takes priority even if top 10 holders is low
  const honeypot = getRadarSecurityStatus({
    name: 'TrapToken',
    isHoneypot: true,
    top10HoldersPct: 15,
  });
  assert.equal(honeypot.level, 'danger');
  assert.match(honeypot.dotColorClass, /bg-rose-500/);
  assert.match(honeypot.badgeColorClass, /bg-rose-500/);
  assert.equal(honeypot.badgeLabel, '🚨 Honeypot');
  assert.match(honeypot.title, /Honeypot/);
  assert.match(honeypot.ariaLabel, /Securitate TrapToken/);

  // Bundled launch
  const bundled = getRadarSecurityStatus({
    name: 'BundledToken',
    isBundled: true,
    top10HoldersPct: 35,
  });
  assert.equal(bundled.level, 'danger');
  assert.match(bundled.dotColorClass, /bg-rose-500/);
  assert.equal(bundled.badgeLabel, '🚨 Bundled/Insiders');
  assert.match(bundled.title, /bundled/i);

  // Insider networks detected
  const insiders = getRadarSecurityStatus({
    name: 'InsiderToken',
    insidersDetected: true,
    top10HoldersPct: 40,
  });
  assert.equal(insiders.level, 'danger');
  assert.match(insiders.dotColorClass, /bg-rose-500/);
  assert.equal(insiders.badgeLabel, '🚨 Bundled/Insiders');
  assert.match(insiders.title, /insideri/i);

  // High rug score (> 500)
  const highRug = getRadarSecurityStatus({
    name: 'RiskyAudit',
    rugScore: 750,
    top10HoldersPct: 30,
  });
  assert.equal(highRug.level, 'danger');
  assert.match(highRug.dotColorClass, /bg-rose-500/);
  assert.equal(highRug.badgeLabel, '🚨 Risc: 750');
  assert.match(highRug.title, /750/);

  // Danger takes priority even if top 10 is concentrated > 50%
  const dangerAndConcentrated = getRadarSecurityStatus({
    isBundled: true,
    top10HoldersPct: 80,
  });
  assert.equal(dangerAndConcentrated.level, 'danger');
  assert.match(dangerAndConcentrated.dotColorClass, /bg-rose-500/);
});

test('unknown / in progress: missing top10HoldersPct yields slate circle and dash badge', () => {
  const unAuditedNull = getRadarSecurityStatus({
    name: 'NewListing',
    top10HoldersPct: null,
    isBundled: false,
    insidersDetected: false,
    isHoneypot: false,
  });
  assert.equal(unAuditedNull.level, 'unknown');
  assert.match(unAuditedNull.dotColorClass, /bg-slate-500/);
  assert.equal(unAuditedNull.badgeLabel, '—');
  assert.match(unAuditedNull.title, /în curs de colectare/);

  const unAuditedUndefined = getRadarSecurityStatus({});
  assert.equal(unAuditedUndefined.level, 'unknown');
  assert.match(unAuditedUndefined.dotColorClass, /bg-slate-500/);
  assert.equal(unAuditedUndefined.badgeLabel, '—');
});
