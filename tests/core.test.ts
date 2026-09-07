import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { animationPreset, recipeSchema } from '../src/recipes.js';
import { Library } from '../src/library.js';
import { Queue } from '../src/bridge.js';

test('walk loops close and changing speed preserves normalized motion', () => {
  const a = animationPreset('walk', 'Walk', 2, 1);
  const b = animationPreset('walk', 'Fast walk', 1, 1);
  for (const track of a.tracks) {
    assert.deepEqual(track.keys[0]?.rotation, track.keys.at(-1)?.rotation);
    assert.equal(track.keys.at(-1)?.time, 2);
  }
  assert.equal(b.tracks[0]?.keys.at(-1)?.time, 1);
  assert.deepEqual(a.tracks[0]?.keys[1]?.rotation, b.tracks[0]?.keys[1]?.rotation);
});

test('rejects invalid timeline, duplicate joints, non-finite values, and discontinuous loops', () => {
  for (const change of [
    (r: any) => { r.tracks[0].keys[1].time = -1; },
    (r: any) => { r.tracks.push(r.tracks[0]); },
    (r: any) => { r.tracks[0].keys[0].rotation[0] = Infinity; },
    (r: any) => { r.tracks[0].keys.at(-1).rotation[0] = 44; },
  ]) {
    const recipe = animationPreset('walk', 'Walk', 1, 1);
    change(recipe);
    assert.equal(recipeSchema.safeParse(recipe).success, false);
  }
});

test('library creates immutable revisions and rejects path traversal', async () => {
  const library = new Library(await mkdtemp(join(tmpdir(), 'motion-library-')));
  const first = await library.save(animationPreset('idle', 'Idle', 2, 1));
  const second = await library.save(animationPreset('idle', 'Idle revised', 3, 1), first.id);
  assert.notEqual(first.id, second.id);
  assert.equal((await library.get(first.id)).recipe.name, 'Idle');
  assert.equal(second.parentId, first.id);
  await assert.rejects(library.get('../secrets'));
});

test('queue binds to a session, delivers only once, and checks result ownership', () => {
  let now = 1000;
  const queue = new Queue(() => now);
  queue.heartbeat('a', { place: 'A' });
  queue.heartbeat('b', { place: 'B' });
  assert.throws(() => queue.enqueue(undefined, 'inspect', {}), /session/i);
  const job = queue.enqueue('a', 'inspect', {});
  assert.equal(queue.poll('b'), null);
  assert.equal(queue.poll('a')?.id, job.id);
  assert.equal(queue.poll('a'), null);
  assert.throws(() => queue.complete('b', job.id, true, {}), /session/i);
  now += 61000;
  assert.equal(queue.get(job.id).status, 'unknown');
  assert.equal(queue.poll('a'), null);
  queue.complete('a', job.id, true, { inspected: true });
  assert.equal(queue.get(job.id).status, 'succeeded');
});

test('queued commands expire without running after a disconnect', () => {
  let now = 1000;
  const queue = new Queue(() => now);
  queue.heartbeat('a', {});
  const job = queue.enqueue('a', 'save_animation', {});
  now += 31000;
  assert.equal(queue.poll('a'), null);
  assert.equal(queue.get(job.id).status, 'expired');
});
