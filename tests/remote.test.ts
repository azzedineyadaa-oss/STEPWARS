import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeFromRow,
  friendlyError,
  groupSteps,
  pendingUploads,
  teamMemberFromRow,
  teamStandingFromRow,
} from '../src/lib/remote.ts';

const row = {
  id: 'c1',
  challenger_id: 'alice',
  opponent_id: 'bob',
  start_day: '2026-10-20',
  days: 3,
  created_at: '2026-10-20T08:00:00Z',
};

test('challengeFromRow : l’adversaire est toujours l’autre joueur', () => {
  assert.equal(challengeFromRow(row, 'alice').opponentId, 'bob');
  assert.equal(challengeFromRow(row, 'bob').opponentId, 'alice');
  assert.deepEqual(challengeFromRow(row, 'alice'), {
    id: 'c1',
    opponentId: 'bob',
    startDay: '2026-10-20',
    days: 3,
    createdAt: '2026-10-20T08:00:00Z',
  });
});

test('groupSteps regroupe les pas par joueur', () => {
  assert.deepEqual(
    groupSteps([
      { user_id: 'a', day: '2026-10-20', steps: 100 },
      { user_id: 'b', day: '2026-10-20', steps: 200 },
      { user_id: 'a', day: '2026-10-21', steps: 300 },
    ]),
    { a: { '2026-10-20': 100, '2026-10-21': 300 }, b: { '2026-10-20': 200 } },
  );
});

test('pendingUploads : jours nouveaux ou en hausse, dans la fenêtre acceptée', () => {
  const history = { '2026-10-10': 9000, '2026-10-19': 4000, '2026-10-20': 5000, '2026-10-21': 1200 };
  const uploaded = { '2026-10-19': 4000, '2026-10-20': 4500 };
  assert.deepEqual(pendingUploads(history, uploaded, '2026-10-13'), [
    { day: '2026-10-20', steps: 5000 },
    { day: '2026-10-21', steps: 1200 },
  ]);
});

test('pendingUploads envoie aussi un jour à 0 pas jamais envoyé', () => {
  assert.deepEqual(pendingUploads({ '2026-10-21': 0 }, {}, '2026-10-13'), [{ day: '2026-10-21', steps: 0 }]);
});

test('friendlyError traduit les erreurs SQL connues', () => {
  assert.equal(friendlyError('friend_code_not_found'), 'Aucun joueur ne correspond à ce code.');
  assert.equal(friendlyError('TypeError: Network request failed'), 'Pas de connexion internet.');
  assert.equal(friendlyError(undefined), 'Une erreur est survenue. Réessayez.');
});

test('équipes : conversion des lignes', () => {
  assert.deepEqual(teamStandingFromRow({ id: 't', name: 'A', emoji: '🚀', members: 3, steps: '123456' }), {
    id: 't',
    name: 'A',
    emoji: '🚀',
    members: 3,
    steps: 123456,
  });
  assert.equal(teamMemberFromRow({ id: 'u', name: 'B', avatar: '🏃', team_joined_on: '2026-10-20' }).joinedOn, '2026-10-20');
  assert.equal(friendlyError('team_full'), 'Cette équipe est complète (30 membres).');
});
