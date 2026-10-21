import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  buildLeaderboard,
  demoStepsFor,
  evaluateChallenge,
  generateFriendCode,
  lastDays,
  ME_ID,
  recordSteps,
  toDayKey,
  type Challenge,
} from '../src/lib/game.ts';

const challenge: Challenge = {
  id: 'c1',
  opponentId: 'friend',
  startDay: '2026-03-30',
  days: 3,
  createdAt: '2026-03-29T10:00:00.000Z',
};

test('addDays traverse les fins de mois et d’année', () => {
  assert.equal(addDays('2026-03-31', 1), '2026-04-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('toDayKey utilise la date locale', () => {
  assert.equal(toDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('lastDays renvoie les jours dans l’ordre chronologique', () => {
  assert.deepEqual(lastDays('2026-04-02', 3), ['2026-03-31', '2026-04-01', '2026-04-02']);
});

test('défi à venir : aucun pas compté', () => {
  const r = evaluateChallenge(challenge, '2026-03-29', { '2026-03-29': 9000 }, {});
  assert.equal(r.status, 'upcoming');
  assert.equal(r.myTotal, 0);
  assert.equal(r.winner, null);
  assert.equal(r.daysElapsed, 0);
});

test('défi en cours : ne compte que les jours commencés, pas de vainqueur', () => {
  const r = evaluateChallenge(
    challenge,
    '2026-03-31',
    { '2026-03-30': 5000, '2026-03-31': 2000, '2026-04-01': 99999 },
    { '2026-03-30': 6000 },
  );
  assert.equal(r.status, 'active');
  assert.equal(r.myTotal, 7000);
  assert.equal(r.opponentTotal, 6000);
  assert.equal(r.winner, null);
  assert.equal(r.daysElapsed, 2);
});

test('défi terminé : vainqueur et égalité', () => {
  const after = '2026-04-02';
  const mine = { '2026-03-30': 5000, '2026-04-01': 5000 };
  assert.equal(evaluateChallenge(challenge, after, mine, { '2026-03-31': 9000 }).winner, 'me');
  assert.equal(evaluateChallenge(challenge, after, mine, { '2026-03-31': 11000 }).winner, 'opponent');
  assert.equal(evaluateChallenge(challenge, after, mine, { '2026-03-31': 10000 }).winner, 'tie');
  // Les pas hors période ne comptent pas.
  assert.equal(evaluateChallenge(challenge, after, mine, { '2026-04-02': 50000 }).winner, 'me');
});

test('classement : tri décroissant et rangs partagés en cas d’égalité', () => {
  const days = ['2026-04-01'];
  const board = buildLeaderboard(
    [
      { id: 'a', name: 'Alice', avatar: '', history: { '2026-04-01': 3000 } },
      { id: ME_ID, name: 'Moi', avatar: '', history: { '2026-04-01': 8000 } },
      { id: 'b', name: 'Bob', avatar: '', history: { '2026-04-01': 3000 } },
      { id: 'c', name: 'Chloé', avatar: '', history: {} },
    ],
    days,
  );
  assert.deepEqual(
    board.map((e) => [e.name, e.rank]),
    [['Moi', 1], ['Alice', 2], ['Bob', 2], ['Chloé', 4]],
  );
  assert.equal(board[0].isMe, true);
});

test('recordSteps ne fait jamais baisser le compteur', () => {
  const h = recordSteps({}, '2026-04-01', 1200);
  assert.equal(h['2026-04-01'], 1200);
  assert.equal(recordSteps(h, '2026-04-01', 800), h);
  assert.equal(recordSteps(h, '2026-04-01', 1500)['2026-04-01'], 1500);
});

test('pas de démo déterministes et proportionnels à la journée écoulée', () => {
  const full = demoStepsFor('demo-lina', '2026-04-01');
  assert.equal(demoStepsFor('demo-lina', '2026-04-01'), full);
  assert.ok(full >= 1500 && full <= 12500);
  assert.equal(demoStepsFor('demo-lina', '2026-04-01', 0.5), Math.round(full / 2));
});

test('code ami : 6 caractères sans caractères ambigus', () => {
  const code = generateFriendCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});
