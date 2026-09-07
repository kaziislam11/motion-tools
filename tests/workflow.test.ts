import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workflows, type Workflow } from '../src/workflow.js';

// Tiny image envelopes test transport and fingerprinting, not artistic judgment.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const png2 = Buffer.concat([png, Buffer.from('fixture-two')]);
async function setup(kind: 'model' | 'animation' | 'vfx' = 'model') {
  const root = await mkdtemp(join(tmpdir(), 'motion-workflow-'));
  const a = join(root, 'a.png'), b = join(root, 'b.png'), artifact = join(root, 'asset.json');
  await Promise.all([writeFile(a, png), writeFile(b, png2), writeFile(artifact, '{}')]);
  const store = new Workflows(join(root, 'sessions'));
  const brief = { name: 'Test', kind, request: 'Create the requested asset', approach: 'Compare rough forms before detailing', requirements: [{ id: 'shape', description: 'Match reference shape' }], avoid: ['Beveled boxes'], references: [{ path: a, useFor: 'Proportions' }] };
  const { workflow } = await store.start(brief);
  const evidence = [{ path: a, view: 'front', time: 0, description: 'Start' }, { path: b, view: 'side', time: 1, description: 'End' }];
  const attach = (w: Workflow) => store.candidate(w.id, w.revision, artifact, 'Changed silhouette based on the brief', evidence);
  return { root, store, workflow, brief, evidence, attach, artifact, a, b };
}
function review(w: Workflow, verdict: 'pass' | 'fail' | 'unknown' = 'pass') {
  const ids = w.candidates.at(-1)!.evidence.map(e => e.id);
  return { reviewer: 'ai' as const, summary: 'Fixture review, not a real quality assessment', findings: [{ requirementId: 'shape', verdict, evidenceIds: ids, reason: 'Fixture finding', ...(verdict === 'fail' ? { correction: 'Rebuild the silhouette' } : {}) }], exclusions: [{ index: 0, verdict: 'pass' as const, evidenceIds: ids, reason: 'Fixture exclusion check' }] };
}

test('all asset types follow their own full stage plans and persist across restart', async () => {
  const expected = { model: ['silhouette', 'surfaces', 'rigging'], animation: ['key_poses', 'timing', 'polish'], vfx: ['shape', 'timing', 'integration'] };
  for (const kind of ['model', 'animation', 'vfx'] as const) {
    const s = await setup(kind); let w = s.workflow;
    for (const stage of expected[kind]) {
      assert.equal((await s.store.read(w.id)).next.stage, stage);
      w = (await s.attach(w)).workflow;
      assert.equal((await s.store.read(w.id)).next.state, 'needs_review');
      if (stage === expected[kind].at(-1)) {
        const incomplete = { ...review(w), findings: [{ ...review(w).findings[0]!, verdict: 'not_applicable' as const }] };
        await assert.rejects(s.store.review(w.id, w.revision, w.candidates.at(-1)!.id, incomplete), /final stage must assess/);
      }
      const result = await s.store.review(w.id, w.revision, w.candidates.at(-1)!.id, review(w));
      w = result.workflow;
    }
    assert.equal((await new Workflows(s.store.directory).read(w.id)).next.state, 'reviewed');
    assert.equal((await s.store.list()).entries[0]!.revision, 7);
    await assert.rejects(s.attach(w), /reviewed/);
  }
});
test('failed and unknown reviews retain the stage and three attempts require a new approach', async () => {
  const s = await setup(); let w = s.workflow;
  for (let i = 0; i < 3; i++) {
    w = (await s.attach(w)).workflow;
    w = (await s.store.review(w.id, w.revision, w.candidates.at(-1)!.id, review(w, i === 1 ? 'unknown' : 'fail'))).workflow;
    assert.equal((await s.store.read(w.id)).next.stage, 'silhouette');
  }
  await assert.rejects(s.attach(w), /rethink_approach/);
  const revised = await s.store.revise(w.id, w.revision, { ...s.brief, approach: 'A genuinely different approach after feedback' });
  assert.equal(revised.next.attempts, 0); assert.equal(revised.workflow.candidates.length, 3);
  assert.equal(revised.workflow.briefRevision, 2);
});
test('reviews reject omissions, other-candidate evidence, duplicate findings and unreviewed replacement', async () => {
  const s = await setup(); const w = (await s.attach(s.workflow)).workflow; const c = w.candidates.at(-1)!;
  const run = (r: ReturnType<typeof review>) => s.store.review(w.id, w.revision, c.id, r);
  await assert.rejects(s.attach(w), /needs_review/);
  await assert.rejects(run({ ...review(w), exclusions: [] }), /every avoid/);
  await assert.rejects(run({ ...review(w), findings: [...review(w).findings, ...review(w).findings] }), /exactly once/);
  const wrong = review(w); wrong.findings[0]!.evidenceIds = [s.workflow.id];
  await assert.rejects(run(wrong), /another candidate/);
  const absent = review(w); absent.findings[0]!.evidenceIds = [];
  await assert.rejects(run(absent), /cite candidate evidence/);
});
test('changed artifact, evidence, or reference cannot inherit a review', async () => {
  for (const target of ['artifact', 'a', 'b'] as const) {
    const s = await setup(); const w = (await s.attach(s.workflow)).workflow;
    await writeFile(s[target], 'changed');
    await assert.rejects(s.store.review(w.id, w.revision, w.candidates.at(-1)!.id, review(w)), /Attached file changed/);
    if (target !== 'artifact') await assert.rejects(s.store.image(w.id, w.candidates.at(-1)!.evidence[target === 'a' ? 0 : 1]!.id), /changed/);
  }
});
test('stale and concurrent updates cannot overwrite revision history', async () => {
  const s = await setup();
  const result = await Promise.allSettled([s.attach(s.workflow), s.attach(s.workflow)]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  await assert.rejects(s.store.revise(s.workflow.id, 1, s.brief), /Stale/);
  assert.equal((await s.store.read(s.workflow.id)).workflow.candidates.length, 1);
});
test('evidence requires real distinct files, views or times and can be delivered with its fingerprint', async () => {
  const s = await setup(); const w = s.workflow;
  await assert.rejects(s.store.candidate(w.id, w.revision, s.artifact, 'test', s.evidence.map(e => ({ ...e, view: 'front' }))), /two distinct views/);
  await writeFile(s.b, png);
  await assert.rejects(s.attach(w), /distinct content/);
  await writeFile(s.b, png2);
  const attached = (await s.attach(w)).workflow;
  const image = await s.store.image(w.id, attached.candidates[0]!.evidence[0]!.id);
  assert.equal(image.mimeType, 'image/png'); assert.deepEqual(Buffer.from(image.data, 'base64'), png);
  assert.equal((await s.store.image(w.id, undefined, 0)).data, image.data);
  const a = await setup('animation');
  await assert.rejects(a.store.candidate(a.workflow.id, 1, a.artifact, 'test', a.evidence.map(e => ({ ...e, time: 0 }))), /distinct explicit sample times/);
});
