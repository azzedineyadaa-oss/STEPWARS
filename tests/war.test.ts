import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeStreak,
  memberContribution,
  nextTarget,
  rankByScore,
  warTimeLeft,
  weekDays,
  weekStart,
} from '../src/lib/game.ts';

test('série : aujourd’hui atteint, compte jusqu’à aujourd’hui', () => {
  const h = { '2026-10-19': 9000, '2026-10-20': 8000, '2026-10-21': 8500 };
  assert.deepEqual(computeStreak(h, 8000, '2026-10-21'), { current: 3, best: 3, todayDone: true });
});

test('série : aujourd’hui pas encore atteint, la série d’hier reste vivante', () => {
  const h = { '2026-10-19': 9000, '2026-10-20': 8000, '2026-10-21': 1200 };
  assert.deepEqual(computeStreak(h, 8000, '2026-10-21'), { current: 2, best: 2, todayDone: false });
});

test('série : cassée hier, record conservé', () => {
  const h = { '2026-10-10': 9000, '2026-10-11': 9000, '2026-10-12': 9000, '2026-10-20': 100, '2026-10-21': 9000 };
  assert.deepEqual(computeStreak(h, 8000, '2026-10-21'), { current: 1, best: 3, todayDone: true });
});

test('série : jours non consécutifs ne s’additionnent pas dans le record', () => {
  const h = { '2026-10-01': 9000, '2026-10-03': 9000 };
  assert.equal(computeStreak(h, 8000, '2026-10-21').best, 1);
});

test('la semaine de guerre va du lundi au dimanche', () => {
  assert.equal(weekStart('2026-10-21'), '2026-10-19'); // mercredi
  assert.equal(weekStart('2026-10-19'), '2026-10-19'); // lundi
  assert.equal(weekStart('2026-10-25'), '2026-10-19'); // dimanche
  assert.deepEqual(weekDays('2026-10-21'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ]);
});

test('temps restant jusqu’au lundi suivant minuit', () => {
  assert.deepEqual(warTimeLeft(new Date(2026, 9, 21, 20, 30)), { days: 4, hours: 3, minutes: 30 });
  assert.deepEqual(warTimeLeft(new Date(2026, 9, 25, 23, 59)), { days: 0, hours: 0, minutes: 1 });
});

test('contribution : seuls les jours depuis l’arrivée comptent', () => {
  const h = { '2026-10-19': 5000, '2026-10-20': 6000, '2026-10-21': 7000 };
  assert.equal(memberContribution(h, weekDays('2026-10-21'), '2026-10-20'), 13000);
});

test('rankByScore partage les rangs à égalité', () => {
  const ranked = rankByScore([
    { name: 'B', steps: 10 },
    { name: 'A', steps: 10 },
    { name: 'C', steps: 30 },
  ]);
  assert.deepEqual(ranked.map((r) => [r.name, r.rank]), [['C', 1], ['A', 2], ['B', 2]]);
});

test('nextTarget : équipe juste devant et écart pour la dépasser', () => {
  const ranked = rankByScore([
    { id: 'a', name: 'A', emoji: '', members: 3, steps: 50000 },
    { id: 'b', name: 'B', emoji: '', members: 3, steps: 42000 },
    { id: 'me', name: 'Moi', emoji: '', members: 3, steps: 40000 },
  ]);
  const target = nextTarget(ranked, 'me');
  assert.equal(target?.team.id, 'b');
  assert.equal(target?.gap, 2001);
  assert.equal(nextTarget(ranked, 'a'), null);
});
