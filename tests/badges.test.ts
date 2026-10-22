import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeBadges, newBadges } from '../src/lib/badges.ts';

const byId = (badges: ReturnType<typeof computeBadges>) => Object.fromEntries(badges.map((b) => [b.id, b]));

test('badges : aucun au départ, avancement à 0', () => {
  const badges = computeBadges({}, 10000, 0);
  assert.equal(badges.length, 7);
  assert.ok(badges.every((b) => !b.earned && b.progress === 0));
});

test('badges : objectif, 10 000, semaine à 100 000', () => {
  // Lundi 19 au dimanche 25 octobre : 7 × 15 000 = 105 000.
  const history = Object.fromEntries(
    ['19', '20', '21', '22', '23', '24', '25'].map((d) => [`2026-10-${d}`, 15000]),
  );
  const b = byId(computeBadges(history, 10000, 7));
  assert.ok(b['first-goal'].earned);
  assert.ok(b['ten-k'].earned);
  assert.ok(b['week-100k'].earned);
  assert.ok(b['streak-7'].earned);
  assert.equal(b['twenty-k'].earned, false);
  assert.equal(b['twenty-k'].progress, 0.75);
  assert.equal(b['million'].progress, 0.105);
});

test('badges : une semaine à cheval sur deux semaines ne compte pas', () => {
  // Jeudi 22 au mercredi 28 : 7 × 15 000, mais réparti sur deux semaines.
  const history = Object.fromEntries(
    ['22', '23', '24', '25', '26', '27', '28'].map((d) => [`2026-10-${d}`, 15000]),
  );
  assert.equal(byId(computeBadges(history, 10000, 7))['week-100k'].earned, false);
});

test('badges : nouveaux badges du jour', () => {
  const history = { '2026-10-21': 9000, '2026-10-22': 21000 };
  const fresh = newBadges(history, 10000, 1, 0, '2026-10-22').map((b) => b.id);
  assert.deepEqual(fresh, ['first-goal', 'ten-k', 'twenty-k']);
  assert.deepEqual(newBadges(history, 10000, 1, 1, '2026-10-23'), []);
});
