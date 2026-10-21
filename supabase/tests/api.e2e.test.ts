// Bout en bout : le vrai code src/lib/api.ts, via supabase-js, contre PostgREST + Postgres
// avec la migration. Lancé par scripts/test-api.sh (npm run test:api).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import * as api from '../../src/lib/api.ts';
import { addDays } from '../../src/lib/game.ts';

const ALICE = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';
const CHLOE = '00000000-0000-0000-0000-00000000000c';

function jwt(sub: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac('sha256', process.env.JWT_SECRET!).update(body).digest('base64url')}`;
}
const client = (sub: string) =>
  createClient(`http://127.0.0.1:${process.env.PROXY_PORT}`, 'anon-key', { accessToken: async () => jwt(sub) });

const alice = client(ALICE);
const bob = client(BOB);
const chloe = client(CHLOE);
// Jour du serveur (UTC) : c'est lui qui borne les jours acceptés.
const today = new Date().toISOString().slice(0, 10);

test('parcours complet : profil, amis, pas, défi, retrait', async () => {
  let snap = await api.fetchSnapshot(alice, ALICE, today);
  assert.match(snap.profile.friend_code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.deepEqual(snap.friends, []);

  await api.updateProfile(alice, ALICE, { name: 'Alice', avatar: '🦊', daily_goal: 10000 });
  await api.uploadSteps(alice, [
    { day: today, steps: 4200 },
    { day: addDays(today, -1), steps: 9100 },
  ]);
  await api.uploadSteps(alice, [{ day: today, steps: 100 }]); // ne doit pas baisser

  const added = await api.addFriend(bob, ` ${snap.profile.friend_code.toLowerCase()} `);
  assert.deepEqual(added, { id: ALICE, name: 'Alice', avatar: '🦊' });

  const bobSnap = await api.fetchSnapshot(bob, BOB, today);
  assert.deepEqual(bobSnap.friends, [{ id: ALICE, name: 'Alice', avatar: '🦊' }]);
  assert.deepEqual(bobSnap.friendSteps[ALICE], { [today]: 4200, [addDays(today, -1)]: 9100 });
  assert.deepEqual(bobSnap.mySteps, {});

  const challenge = await api.createChallenge(bob, BOB, ALICE, today, 3);
  assert.equal(challenge.opponentId, ALICE);
  assert.equal(challenge.startDay, today);

  snap = await api.fetchSnapshot(alice, ALICE, today);
  assert.equal(snap.profile.daily_goal, 10000);
  assert.deepEqual(snap.friends.map((f) => f.id), [BOB]);
  assert.equal(snap.challenges.length, 1);
  assert.equal(snap.challenges[0].opponentId, BOB, 'vu par Alice, l’adversaire est Bob');
  assert.deepEqual(snap.mySteps, { [today]: 4200, [addDays(today, -1)]: 9100 });

  // Un tiers ne voit rien et ne peut pas défier sans être ami.
  const chloeSnap = await api.fetchSnapshot(chloe, CHLOE, today);
  assert.deepEqual([chloeSnap.friends, chloeSnap.challenges, chloeSnap.friendSteps], [[], [], {}]);
  await assert.rejects(api.createChallenge(chloe, CHLOE, ALICE, today, 1), api.ApiError);
  await api.deleteChallenge(chloe, challenge.id); // sans effet
  assert.equal((await api.fetchSnapshot(alice, ALICE, today)).challenges.length, 1);

  await assert.rejects(api.addFriend(chloe, 'ZZZZZZ'), { message: 'Aucun joueur ne correspond à ce code.' });

  await api.deleteChallenge(alice, challenge.id);
  assert.equal((await api.fetchSnapshot(bob, BOB, today)).challenges.length, 0);

  await api.removeFriend(alice, BOB);
  assert.deepEqual((await api.fetchSnapshot(bob, BOB, today)).friends, []);
});

test('suppression de compte', async () => {
  // signOut local échoue sans session : on appelle la RPC directement comme le fait deleteAccount.
  const { error } = await chloe.rpc('delete_account');
  assert.equal(error, null);
  await assert.rejects(api.fetchSnapshot(chloe, CHLOE, today), api.ApiError);
});
