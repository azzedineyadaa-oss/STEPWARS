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
