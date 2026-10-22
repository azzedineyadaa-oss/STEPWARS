import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  coarseCell,
  dayLeader,
  demoPlayerCard,
  demoPlayersAround,
  distanceLabel,
  rankLabel,
  topPercent,
  winRate,
} from '../src/lib/players.ts';

test('arrondi des inconnus identique au serveur (blocs de 3 × 3 zones)', () => {
  assert.deepEqual(coarseCell({ q: 101, r: 100 }), { q: 100, r: 100 });
  assert.deepEqual(coarseCell({ q: 104, r: 98 }), { q: 103, r: 97 });
  assert.deepEqual(coarseCell({ q: -1, r: -3 }), { q: -2, r: -2 });
});

test('pourcentage de victoires, égalités exclues', () => {
  assert.equal(winRate({ duelsWon: 3, duelsLost: 1 }), 75);
  assert.equal(winRate({ duelsWon: 0, duelsLost: 0 }), null);
  assert.equal(winRate({ duelsWon: 2, duelsLost: 1 }), 67);
});

test('rang et top %', () => {
  assert.equal(rankLabel(1), '1er');
  assert.equal(rankLabel(12), '12ᵉ');
  assert.equal(topPercent(12, 400), 3);
  assert.equal(topPercent(1, 5000), 1);
  assert.equal(topPercent(5, 0), 100);
});

test('distance approximative', () => {
  assert.equal(distanceLabel({ q: 0, r: 0 }, { q: 0, r: 0 }), 'tout près');
  assert.match(distanceLabel({ q: 0, r: 0 }, { q: 2, r: 0 }), /^à ~\d+00 m$/);
  assert.match(distanceLabel({ q: 0, r: 0 }, { q: 10, r: 0 }), /^à ~[\d,]+ km$/);
});

test('couronne pour le joueur avec le plus de pas', () => {
  assert.equal(dayLeader([{ id: 'a', stepsToday: 10 }, { id: 'b', stepsToday: 30 }]), 'b');
  assert.equal(dayLeader([{ id: 'a', stepsToday: 0 }]), null);
  assert.equal(dayLeader([]), null);
});

const friends = [{ id: 'demo-lina', name: 'Lina', avatar: '🦊' }];

test('démo : réciprocité comme sur le serveur', () => {
  const center = { q: 50, r: 50 };
  const asFriends = demoPlayersAround(center, friends, 'friends', '2026-10-22', 0.5, 'h1');
  assert.deepEqual(asFriends.map((p) => p.name), ['Lina']);
  const asPublic = demoPlayersAround(center, friends, 'public', '2026-10-22', 0.5, 'h1');
  assert.equal(asPublic.length, 9);
  for (const p of asPublic.filter((x) => !x.isFriend)) assert.deepEqual(coarseCell(p.cell), p.cell, 'inconnus arrondis');
  assert.deepEqual(demoPlayersAround(center, friends, 'public', '2026-10-22', 0.5, 'h1'), asPublic, 'stable');
});

test('démo : fiche cohérente', () => {
  const card = demoPlayerCard({ id: 'x', name: 'X', avatar: '🐻', teamName: null, teamEmoji: null, isFriend: false, stepsToday: 4000 });
  assert.equal(card.stepsToday, 4000);
  assert.ok(card.stepsWeek > card.stepsToday);
  assert.ok(card.bestDay >= card.stepsToday);
  assert.ok(card.weekRank >= 1 && card.weekRank <= card.weekPlayers);
});
