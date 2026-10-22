import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeFromRow,
  friendlyError,
  leagueFromRows,
  groupSteps,
  pendingUploads,
  teamMemberFromRow,
  teamStandingFromRow,
  mapPlayerFromRow,
  playerCardFromRow,
} from '../src/lib/remote.ts';

const row = {
  id: 'c1',
  challenger_id: 'alice',
  opponent_id: 'bob',
  start_day: '2026-10-20',
  days: 3,
  created_at: '2026-10-20T08:00:00Z',
  status: 'pending' as const,
  stake: 'Le perdant paie le café',
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
    status: 'pending',
    incoming: false,
    stake: 'Le perdant paie le café',
  });
  assert.equal(challengeFromRow(row, 'bob').incoming, true);
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

test('friendlyError traduit les erreurs de connexion par e-mail', () => {
  assert.equal(friendlyError('Token has expired or is invalid'), 'Code incorrect ou expiré. Vérifie-le ou demande un nouveau code.');
  assert.equal(friendlyError('For security purposes, you can only request this after 42 seconds.'), 'Trop de demandes. Réessaie dans quelques minutes.');
  assert.equal(friendlyError('email rate limit exceeded'), 'Trop de demandes. Réessaie dans quelques minutes.');
  assert.equal(friendlyError('Signups not allowed for otp'), 'Aucun compte n’utilise cette adresse.');
  assert.equal(friendlyError('A user with this email address has already been registered'), 'Cette adresse est déjà liée à un autre compte.');
  assert.equal(friendlyError('Email address "abc" is invalid'), 'Cette adresse e-mail n’est pas valide.');
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

test('carte : conversion des joueurs et des fiches', () => {
  assert.deepEqual(
    mapPlayerFromRow({
      id: 'u', name: 'Lina', avatar: '🦊', team_name: null, team_emoji: null, steps_today: 8400,
      goal_reached: true, is_friend: true, cell_q: 1, cell_r: 2, minutes_ago: 7,
    }),
    { id: 'u', name: 'Lina', avatar: '🦊', teamName: null, teamEmoji: null, stepsToday: 8400, goalReached: true, isFriend: true, cell: { q: 1, r: 2 }, minutesAgo: 7 },
  );
  const card = playerCardFromRow({
    id: 'u', name: 'Lina', avatar: '🦊', team_name: 'A', team_emoji: '🚀', is_friend: false, steps_today: 1, steps_week: 2,
    best_day: 3, streak: 4, week_rank: 5, week_players: 6, duels_won: 7, duels_lost: 8, duels_tied: 9,
  });
  assert.equal(card.teamName, 'A');
  assert.equal(card.duelsTied, 9);
  assert.equal(friendlyError('player_not_visible'), 'Ce joueur n’est plus visible.');
});

test('ligue : conversion des lignes de my_league', () => {
  const base = { week_start: '2026-10-19', division: 3, members: 2 };
  const league = leagueFromRows([
    { ...base, user_id: 'b', name: 'Bob', steps: '1200', league_position: 2, is_me: true },
    { ...base, user_id: 'a', name: 'Anna', steps: 5000, league_position: 1, is_me: false },
  ]);
  assert.deepEqual(league, {
    division: 3,
    weekStart: '2026-10-19',
    entries: [
      { id: 'a', name: 'Anna', steps: 5000, position: 1, isMe: false },
      { id: 'b', name: 'Bob', steps: 1200, position: 2, isMe: true },
    ],
  });
  assert.equal(leagueFromRows([]), null);
});
