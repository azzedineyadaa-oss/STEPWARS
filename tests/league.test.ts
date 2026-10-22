import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  demoLeague,
  demoLeagueResult,
  resultHeadline,
  divisionForAverage,
  divisionName,
  leagueTarget,
  movementCount,
  nextDivision,
  rankLeague,
  zoneFor,
  type League,
} from '../src/lib/league.ts';

test('niveau de départ selon la moyenne quotidienne', () => {
  assert.equal(divisionForAverage(0), 1);
  assert.equal(divisionForAverage(4999), 1);
  assert.equal(divisionForAverage(5000), 2);
  assert.equal(divisionForAverage(9999), 3);
  assert.equal(divisionForAverage(10000), 4);
  assert.equal(divisionForAverage(20000), 5);
  assert.equal(divisionName(4), 'Col');
});

test('montées et descentes : jusqu’à 5, aucune sous 4 joueurs', () => {
  assert.equal(movementCount(3), 0);
  assert.equal(movementCount(4), 1);
  assert.equal(movementCount(12), 3);
  assert.equal(movementCount(30), 5);
});

test('zones d’une ligue de 30', () => {
  assert.equal(zoneFor(1, 30, 3), 'up');
  assert.equal(zoneFor(5, 30, 3), 'up');
  assert.equal(zoneFor(6, 30, 3), 'stay');
  assert.equal(zoneFor(25, 30, 3), 'stay');
  assert.equal(zoneFor(26, 30, 3), 'down');
  // Pas de montée au sommet, pas de descente au premier niveau.
  assert.equal(zoneFor(1, 30, 5), 'stay');
  assert.equal(zoneFor(30, 30, 1), 'stay');
  assert.equal(nextDivision(3, 2, 30), 4);
  assert.equal(nextDivision(3, 28, 30), 2);
  assert.equal(nextDivision(5, 1, 30), 5);
  assert.equal(nextDivision(2, 2, 3), 2);
});

test('classement : à égalité, le premier arrivé passe devant', () => {
  const ranked = rankLeague(
    [
      { id: 'a', name: 'Zoé', steps: 100 },
      { id: 'b', name: 'Anna', steps: 300 },
      { id: 'c', name: 'Bob', steps: 100 },
    ],
    'c',
  );
  assert.deepEqual(
    ranked.map((e) => [e.id, e.position, e.isMe]),
    [
      ['b', 1, false],
      ['a', 2, false],
      ['c', 3, true],
    ],
  );
});

function league(steps: number[], myIndex: number, division: League['division'] = 3): League {
  return {
    division,
    weekStart: '2026-10-19',
    entries: rankLeague(
      steps.map((s, i) => ({ id: `p${i}`, name: `P${i}`, steps: s })),
      `p${myIndex}`,
    ),
  };
}

test('objectif : sortir de la zone de descente', () => {
  // 8 joueurs : 2 montent, 2 descendent. Je suis dernier avec 1 000.
  const l = league([9000, 8000, 7000, 6000, 5000, 4000, 3000, 1000], 7);
  assert.deepEqual(leagueTarget(l), { kind: 'escape', steps: 3001 });
});

test('objectif : entrer dans la zone de montée', () => {
  const l = league([9000, 8000, 7000, 6000, 5000, 4000, 3000, 1000], 3);
  assert.deepEqual(leagueTarget(l), { kind: 'promote', steps: 2001 });
});

test('objectif : dépasser le joueur devant, puis garder la tête', () => {
  const l = league([9000, 8000, 7000, 6000, 5000, 4000, 3000, 1000], 1);
  assert.deepEqual(leagueTarget(l), { kind: 'overtake', steps: 1001, name: 'P0' });
  assert.deepEqual(leagueTarget(league([9000, 8000, 7000, 6000], 0)), { kind: 'lead', steps: 1000 });
  assert.deepEqual(leagueTarget(league([500], 0)), { kind: 'alone' });
  // Au sommet, pas de montée : on vise la place devant.
  assert.deepEqual(leagueTarget(league([9000, 8000, 7000, 6000, 5000, 4000, 3000, 1000], 3, 5)), {
    kind: 'overtake',
    steps: 1001,
    name: 'P2',
  });
});

test('ligue de démo : 20 joueurs, mon niveau, déterministe', () => {
  const history = { '2026-10-15': 10500, '2026-10-16': 11000, '2026-10-20': 9000, '2026-10-21': 6000 };
  const a = demoLeague({ id: 'me', name: 'Moi' }, history, '2026-10-21', '2026-10-19', 0.5);
  const b = demoLeague({ id: 'me', name: 'Moi' }, history, '2026-10-21', '2026-10-19', 0.5);
  assert.equal(a.entries.length, 20);
  assert.deepEqual(a, b);
  assert.equal(a.entries.find((e) => e.isMe)?.steps, 15000);
  // Moyenne des 7 derniers jours : (10 500 + 11 000 + 9 000) / 7 ≈ 4 357 → Sentier.
  assert.equal(a.division, 1);
});

test('bilan de la semaine : phrase et démo', () => {
  const base = { weekStart: '2026-10-12', position: 1, members: 20, steps: 80000 };
  assert.equal(resultHeadline({ ...base, division: 2, nextDivision: 3 }), 'Tu montes en Route !');
  assert.equal(resultHeadline({ ...base, division: 2, nextDivision: 1 }), 'Tu redescends en Sentier');
  assert.equal(resultHeadline({ ...base, division: 5, nextDivision: 5 }), 'Tu restes en Sommet');
  assert.equal(demoLeagueResult({ id: 'me', name: 'Moi' }, {}, '2026-10-19'), null);
  const r = demoLeagueResult({ id: 'me', name: 'Moi' }, { '2026-10-13': 12000, '2026-10-14': 11000 }, '2026-10-19');
  assert.equal(r?.weekStart, '2026-10-12');
  assert.equal(r?.steps, 23000);
  assert.equal(r?.members, 20);
});
