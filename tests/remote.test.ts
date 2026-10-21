import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeFromRow,
  friendOnMapFromRow,
  friendlyError,
  groupSteps,
  pendingUploads,
  teamMemberFromRow,
  teamStandingFromRow,
  territoryCellFromRow,
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

test('carte : conversion des zones et des amis', () => {
  assert.deepEqual(
    territoryCellFromRow({ cell_q: 3, cell_r: -2, leader_id: 't', leader_name: 'A', leader_emoji: '🚀', leader_steps: '500', my_team_steps: '0' }),
    { key: '3:-2', leader: { id: 't', name: 'A', emoji: '🚀', steps: 500 }, myTeamSteps: 0 },
  );
  assert.deepEqual(
    territoryCellFromRow({ cell_q: 0, cell_r: 0, leader_id: null, leader_name: null, leader_emoji: null, leader_steps: null, my_team_steps: 42 }),
    { key: '0:0', leader: null, myTeamSteps: 42 },
  );
  const f = friendOnMapFromRow(
    { id: 'u', name: 'Lina', avatar: '🦊', cell_q: 1, cell_r: 2, updated_at: '2026-10-21T18:00:00Z' },
    Date.parse('2026-10-21T18:07:10Z'),
  );
  assert.deepEqual(f, { id: 'u', name: 'Lina', avatar: '🦊', cell: { q: 1, r: 2 }, minutesAgo: 7 });
  assert.equal(friendlyError('area_too_large'), 'Zoome un peu plus pour voir les territoires.');
});
