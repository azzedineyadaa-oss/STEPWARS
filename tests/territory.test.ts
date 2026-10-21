import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  boundsForRegion,
  cellAt,
  cellBoundary,
  cellCenter,
  cellDistance,
  cellKey,
  cellsAround,
  distanceMeters,
  parseCellKey,
} from '../src/lib/hex.ts';
import {
  addCellSteps,
  attributeSample,
  cellOwner,
  demoTerritory,
  hourBucket,
  myStepsByCell,
  pendingCellUploads,
  pruneCellSteps,
  teamColor,
  territoryStandings,
  MY_TEAM_COLOR,
} from '../src/lib/territory.ts';

const EIFFEL = { latitude: 48.8584, longitude: 2.2945 };

test('hex : le centre d’une zone appartient à cette zone', () => {
  for (const pos of [EIFFEL, { latitude: -33.8568, longitude: 151.2153 }, { latitude: 0.1, longitude: -0.1 }]) {
    const cell = cellAt(pos);
    assert.deepEqual(cellAt(cellCenter(cell)), cell);
  }
});

test('hex : taille réelle d’une zone à Paris ≈ 200 m', () => {
  const corners = cellBoundary(cellAt(EIFFEL));
  assert.equal(corners.length, 6);
  const width = distanceMeters(corners[0], corners[2]);
  assert.ok(width > 150 && width < 260, `largeur ${width}`);
});

test('hex : à 1 km, au moins 3 zones d’écart', () => {
  const far = { latitude: EIFFEL.latitude + 0.009, longitude: EIFFEL.longitude };
  assert.ok(cellDistance(cellAt(EIFFEL), cellAt(far)) >= 3);
});

test('hex : clés stables, sans -0', () => {
  const cell = cellAt({ latitude: 0, longitude: 0 });
  assert.equal(cellKey(cell), '0:0');
  assert.deepEqual(parseCellKey('-12:7'), { q: -12, r: 7 });
});

test('hex : zones autour d’un centre (rayon 1 = 7 zones, rayon 2 = 19)', () => {
  assert.equal(cellsAround({ q: 0, r: 0 }, 1).length, 7);
  assert.equal(cellsAround({ q: 5, r: -3 }, 2).length, 19);
  assert.ok(cellsAround({ q: 5, r: -3 }, 2).every((c) => cellDistance(c, { q: 5, r: -3 }) <= 2));
});

test('hex : la zone de la carte couvre sa zone centrale', () => {
  const b = boundsForRegion({ ...EIFFEL, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  const c = cellAt(EIFFEL);
  assert.ok(b.minQ < c.q && c.q < b.maxQ && b.minR < c.r && c.r < b.maxR);
});

const t0 = Date.UTC(2026, 9, 21, 18, 10);
const at = (meters: number, seconds: number, steps: number) => ({
  position: { latitude: EIFFEL.latitude + meters / 111_320, longitude: EIFFEL.longitude },
  time: t0 + seconds * 1000,
  steps,
});

test('attribution : pas de marche comptés dans la zone actuelle', () => {
  const r = attributeSample(at(0, 0, 1000), at(70, 60, 1090));
  assert.deepEqual(r, { key: cellKey(cellAt(at(70, 60, 0).position)), steps: 90 });
});

test('attribution : rien en voiture, après une longue pause ou sans nouveaux pas', () => {
  assert.equal(attributeSample(at(0, 0, 1000), at(600, 60, 1050)), null, '36 km/h');
  assert.equal(attributeSample(at(0, 0, 1000), at(10, 20 * 60, 2000)), null, 'pause de 20 min');
  assert.equal(attributeSample(at(0, 0, 1000), at(30, 30, 1000)), null, 'aucun pas');
  assert.equal(attributeSample(null, at(0, 0, 1000)), null, 'premier relevé');
});

test('attribution : cadence plafonnée (pas comptés hors trajet)', () => {
  assert.equal(attributeSample(at(0, 0, 1000), at(20, 10, 5000))?.steps, 35);
});

test('stockage : cumul par zone et par heure, envois en attente, purge', () => {
  const h1 = hourBucket(t0);
  assert.equal(h1, '2026-10-21T18:00:00.000Z');
  let s = addCellSteps({}, '1:2', h1, 100);
  s = addCellSteps(s, '1:2', h1, 50);
  s = addCellSteps(s, '3:4', h1, 0);
  assert.deepEqual(s, { '1:2': { [h1]: 150 } });
  assert.deepEqual(pendingCellUploads(s, { '1:2': { [h1]: 100 } }), [{ q: 1, r: 2, hour: h1, steps: 150 }]);
  assert.deepEqual(pendingCellUploads(s, s), []);
  const old = hourBucket(t0 - 72 * 3_600_000);
  assert.deepEqual(pruneCellSteps({ ...s, '9:9': { [old]: 10 } }, t0), s);
  assert.deepEqual(myStepsByCell({ '1:2': { [old]: 10, [h1]: 150 } }, hourBucket(t0 - 3_600_000)), { '1:2': 150 });
});

const mine = { id: 'mine', name: 'Les Fusées', emoji: '🚀' };
const rival = { id: 'rival', name: 'Les Tortues', emoji: '🐢' };

test('propriétaire : mon équipe prend la zone quand elle dépasse l’équipe en tête', () => {
  assert.equal(cellOwner({ key: 'a', leader: { ...rival, steps: 500 }, myTeamSteps: 400 }, mine)?.id, 'rival');
  assert.equal(cellOwner({ key: 'a', leader: { ...rival, steps: 500 }, myTeamSteps: 501 }, mine)?.isMine, true);
  assert.equal(cellOwner({ key: 'a', leader: null, myTeamSteps: 10 }, mine)?.id, 'mine');
  assert.equal(cellOwner({ key: 'a', leader: null, myTeamSteps: 0 }, mine), null);
  assert.equal(cellOwner({ key: 'a', leader: { ...rival, steps: 5 }, myTeamSteps: 99 }, null)?.id, 'rival', 'sans équipe');
});

test('classement des territoires et couleurs', () => {
  const owners = [
    { ...rival, steps: 1, isMine: false },
    { ...mine, steps: 1, isMine: true },
    { ...rival, steps: 1, isMine: false },
  ];
  assert.deepEqual(territoryStandings(owners).map((t) => [t.name, t.cells]), [['Les Tortues', 2], ['Les Fusées', 1]]);
  assert.equal(teamColor('x', true), MY_TEAM_COLOR);
  assert.equal(teamColor('rival', false), teamColor('rival', false));
  assert.notEqual(teamColor('rival', false), MY_TEAM_COLOR);
});

test('démo : territoire stable sur la semaine, mes pas comptent pour mon équipe', () => {
  const a = demoTerritory({ q: 0, r: 0 }, '2026-10-19', [rival], mine, { '0:0': 99999 });
  const b = demoTerritory({ q: 0, r: 0 }, '2026-10-19', [rival], mine, { '0:0': 99999 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 169);
  assert.equal(cellOwner(a.find((c) => c.key === '0:0')!, mine)?.isMine, true);
  const held = a.filter((c) => cellOwner(c, mine)).length;
  assert.ok(held > 60 && held < 120, `${held} zones tenues`);
});
