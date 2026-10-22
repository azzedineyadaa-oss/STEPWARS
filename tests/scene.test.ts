import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SUMMIT, TRAIL_START, pointAt, skyFor, trailPath } from '../src/lib/scene.ts';

test('scène : le ciel suit l’heure', () => {
  assert.equal(skyFor(7).stars, false);
  assert.equal(skyFor(13).top, '#2E6BB8');
  assert.equal(skyFor(19).bottom, '#F07E5A');
  assert.equal(skyFor(23).stars, true);
  assert.equal(skyFor(3).stars, true);
});

test('scène : le marcheur part du pied et arrive au sommet', () => {
  assert.deepEqual(pointAt(0), TRAIL_START);
  assert.deepEqual(pointAt(1), SUMMIT);
  assert.deepEqual(pointAt(1.7), SUMMIT, 'au-delà de l’objectif, on reste au sommet');
  assert.deepEqual(pointAt(-1), TRAIL_START);
  assert.deepEqual(pointAt(Number.NaN), TRAIL_START);
  const mid = pointAt(0.5);
  assert.ok(mid.y < TRAIL_START.y && mid.y > SUMMIT.y, 'à mi-chemin, on est à mi-pente');
});

test('scène : le chemin parcouru s’allonge avec la progression', () => {
  const segments = (d: string) => d.split('L').length;
  assert.ok(segments(trailPath(0.2)) < segments(trailPath(0.8)));
  assert.ok(trailPath(1).endsWith(`L${SUMMIT.x} ${SUMMIT.y}`));
  assert.match(trailPath(0), /^M28 312 L28 312$/);
});
