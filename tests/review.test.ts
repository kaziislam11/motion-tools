import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Queue } from '../src/bridge.js';
import { Library } from '../src/library.js';
import { Authoring } from '../src/authoring.js';
import { Connections, providerClient, type Complete } from '../src/providers.js';
import { Reviews, type ReviewRecord } from '../src/reviews.js';
import { inspectMotion, sampleTimes, telemetrySchema, type Telemetry } from '../src/inspection.js';
import { animationPreset, vfxPreset } from '../src/recipes.js';

const recipe = () => animationPreset('walk', 'Weighted Walk', 1, 1);
function telemetry(assetId: string, rigId: string, variant: 'still' | 'moving' | 'jump' | 'seam' = 'still'): Telemetry {
  return { version: 1, source: 'studio_pose_evaluator', assetId, rigId, duration: 1, loop: true, height: 6, groundSource: 'rest_foot_bounds', note: 'Test fixture',
    nodes: [{ name: 'HumanoidRootPart', parent: 0, driven: false, foot: false }, { name: 'LowerTorso', parent: 1, driven: true, foot: false }, { name: 'LeftFoot', parent: 2, driven: true, foot: true }, { name: 'RightFoot', parent: 2, driven: true, foot: true }],
    samples: [0, 0.25, 0.5, 0.75, 1].map((time, i) => {
      const x = variant === 'moving' ? time : variant === 'seam' ? [0, 0.1, 0.2, 2, 0][i]! : 0;
      const y = variant === 'jump' ? [0, 1.5, 3, 1.5, 0][i]! : 0;
      return { id: `s00${i}`, time, points: [[0, 3, 0], [x, 3 + y, 0], [x - 0.5, 0.5 + y, 0], [x + 0.5, 0.5 + y, 0]], bottoms: [2, 2 + y, y, y] };
    }) };
}
const reply = () => ({ approach: 'Preserve the grounded gait and tune the requested timing.', checkpoints: ['Check contact timing', 'Check weight'], avoid: [], recipe: recipe() });
const critique = () => ({ summary: 'The sampled body height is stable; judge whether the weight feels right in Studio.', findings: [{ observation: 'The sampled pelvis remains at the same height.', source: 'pose_samples', evidenceIds: ['s000', 's004'], suggestion: 'Only add more compression if the user wants more weight.' }], questions: [{ id: 'impact', question: 'Would you like a stronger downward weight shift?', choices: ['Keep it', 'More weight'] }] });
const usage = { inputTokens: 20, outputTokens: 30 };
async function setup(complete: Complete = async () => ({ text: JSON.stringify(critique()), usage })) {
  const root = await mkdtemp(join(tmpdir(), 'motion-review-')), library = new Library(join(root, 'artifacts/library')), queue = new Queue();
  const connections = new Connections(join(root, '.local/providers.json'), undefined, { DEEPSEEK_API_KEY: 'not-a-real-key' });
  const reviews = new Reviews(join(root, 'artifacts/reviews'), library, queue, connections, complete);
  const authoring = new Authoring(library, queue, connections, root, complete, reviews);
  const sessionId = randomUUID(), rigId = randomUUID(); queue.heartbeat(sessionId, { selection: [{ id: rigId, name: 'Fixture' }] });
  const timer = setInterval(() => {
    queue.heartbeat(sessionId, { selection: [{ id: rigId, name: 'Fixture' }] });
    const job = queue.poll(sessionId); if (!job) return;
    const payload = job.payload as any;
    if (job.operation === 'sample_animation') queue.complete(sessionId, job.id, true, telemetry(payload.assetId, payload.rigId));
    else if (job.operation === 'inspect') queue.complete(sessionId, job.id, true, { animatedNames: recipe().tracks.map(t => ({ name: t.joint, driven: true })) });
    else if (job.operation === 'preview') queue.complete(sessionId, job.id, true, { previewStarted: true });
    else throw new Error(`Unexpected fixture operation ${job.operation}`);
  }, 5);
  return { root, library, queue, connections, reviews, authoring, sessionId, rigId, close: () => { clearInterval(timer); reviews.close(); authoring.close(); } };
}
async function settled(reviews: Reviews, id: string) {
  for (let i = 0; i < 500; i++) { const record = await reviews.read(id); if (!['inspecting', 'critiquing', 'revising'].includes(record.status)) return record; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Review did not settle');
}
async function draftDone(authoring: Authoring, id: string) {
  for (let i = 0; i < 500; i++) { const job = authoring.get(id); if (job.status !== 'running') return job; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Draft did not settle');
}
function feedback(record: ReviewRecord, overall: 'accept' | 'refine' = 'refine') {
  return { reviewId: record.id, revision: record.revision, feedback: { overall, watchedPreview: true, liked: 'Keep the arm swing and the loop length.', changes: overall === 'accept' ? '' : 'Add more weight by lowering the hips at contact.', answers: [] } };
}

test('pose inspection measures jump height, loop velocity changes, and in-place contact uncertainty', () => {
  const assetId = randomUUID(), rigId = randomUUID();
  const still = inspectMotion(recipe(), telemetry(assetId, rigId));
  assert.equal(still.report.source, 'studio_pose_evaluator');
  assert.equal(still.report.metrics.find(m => m.id === 'body-rise')?.value, 0);
  const jump = inspectMotion(recipe(), telemetry(assetId, rigId, 'jump'));
  assert.equal(jump.report.metrics.find(m => m.id === 'body-rise')?.value, 3);
  assert.equal(jump.report.metrics.find(m => m.id === 'clearance-2')?.value, 3);
  const seam = inspectMotion(recipe(), telemetry(assetId, rigId, 'seam'));
  assert.ok(seam.report.findings.some(f => f.id === 'loop-transition'));
  const inPlace = inspectMotion(recipe(), telemetry(assetId, rigId, 'moving'), 'in_place');
  assert.ok(!inPlace.report.findings.some(f => f.id === 'contact-2'));
  const stationary = inspectMotion(recipe(), telemetry(assetId, rigId, 'moving'), 'stationary');
  assert.ok(stationary.report.findings.some(f => f.id === 'contact-2'));
  assert.match(inPlace.report.metrics.find(m => m.id === 'contact-travel-2')!.detail, /not proof of sliding/);
});

test('telemetry and sample-time contracts reject mismatched arrays, hierarchy and duplicate times', () => {
  const data = telemetry(randomUUID(), randomUUID());
  for (const corrupt of [
    (value: Telemetry) => { value.samples[0]!.points.pop(); },
    (value: Telemetry) => { value.samples[1]!.time = 0; },
    (value: Telemetry) => { value.nodes[1]!.parent = 4; },
    (value: Telemetry) => { value.samples[0]!.points[0]![0] = Infinity; },
  ]) { const changed = structuredClone(data); corrupt(changed); assert.equal(telemetrySchema.safeParse(changed).success, false); }
  const awkward = { ...recipe(), duration: 0.10000001, markers: [{ name: 'Near start', time: 0.000001 }] };
  const times = sampleTimes(awkward); assert.equal(times[0], 0); assert.equal(times.at(-1), awkward.duration); assert.ok(times.length <= 65); assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]!));
});

test('a missing rig and VFX stay explicitly recipe-only, with no claimed visual verdict', () => {
  const animation = inspectMotion(recipe()); assert.equal(animation.report.source, 'recipe_only'); assert.ok(animation.report.findings.some(f => f.severity === 'unknown')); assert.equal(animation.telemetry, undefined);
  const effect = inspectMotion(vfxPreset('impact', 'Impact')); assert.equal(effect.report.source, 'recipe_only'); assert.match(effect.report.limitations[0]!, /not simulated/);
});

test('inspection and AI critique never accept a version; acceptance requires explicit watched feedback', async () => {
  const f = await setup();
  try {
    const asset = await f.library.save(recipe());
    const review = await settled(f.reviews, (await f.reviews.start({ assetId: asset.id, sessionId: f.sessionId, rigId: f.rigId, aiReview: true, provider: 'deepseek' })).id);
    assert.equal(review.status, 'needs_feedback'); assert.equal(review.preview?.status, 'confirmed'); assert.equal(review.critique?.source, 'pose_data'); assert.equal(review.feedback, undefined);
    await assert.rejects(f.reviews.feedback({ ...feedback(review), feedback: { ...feedback(review).feedback, watchedPreview: false } }));
    const accepted = await f.reviews.feedback(feedback(review, 'accept'));
    assert.equal(accepted.status, 'accepted'); assert.equal(accepted.feedback?.source, 'local_user_form');
    await assert.rejects(f.reviews.reserveRevision(accepted.id, accepted.revision), /Record what should change/);
    await assert.rejects(f.reviews.feedback(feedback(accepted)), /busy or complete/);
    const restarted = new Reviews(join(f.root, 'artifacts/reviews'), f.library, f.queue, f.connections);
    assert.equal((await restarted.latest(asset.id))?.status, 'accepted');
  } finally { f.close(); }
});

test('stale and concurrent feedback cannot overwrite another response; edits invalidate evidence', async () => {
  const f = await setup();
  try {
    const asset = await f.library.save(recipe()), record = await settled(f.reviews, (await f.reviews.start({ assetId: asset.id })).id);
    const results = await Promise.allSettled([f.reviews.feedback(feedback(record)), f.reviews.feedback(feedback(record, 'accept'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(f.reviews.feedback(feedback(record)), /changed/);
    await writeFile(join(f.library.directory, `${asset.id}.json`), JSON.stringify({ ...asset, recipe: { ...asset.recipe, name: 'Externally edited' } }));
    await assert.rejects(f.reviews.read(record.id), /changed outside/);
  } finally { f.close(); }
});

test('generation, inspection, user feedback and revision form a persistent loop that preserves liked qualities', async () => {
  const prompts: string[] = [];
  const f = await setup(async (_credential, system, prompt) => {
    prompts.push(prompt); return { text: JSON.stringify(system.startsWith('Review a Motion') ? critique() : reply()), usage };
  });
  try {
    const first = await draftDone(f.authoring, f.authoring.start({ provider: 'deepseek', kind: 'animation', prompt: 'Make a heavy grounded walk with a clear arm swing.', sessionId: f.sessionId, rigId: f.rigId, aiReview: true }).id);
    assert.equal(first.status, 'succeeded', first.error); assert.ok(first.reviewId);
    const inspected = await settled(f.reviews, first.reviewId!); assert.equal(inspected.status, 'needs_feedback');
    const answered = await f.reviews.feedback(feedback(inspected));
    const context = await f.reviews.reserveRevision(answered.id, answered.revision);
    await assert.rejects(f.reviews.reserveRevision(answered.id, answered.revision), /changed/);
    const second = await draftDone(f.authoring, f.authoring.start({ provider: 'deepseek', kind: 'animation', prompt: context.changes, parentId: context.assetId, sessionId: f.sessionId, rigId: f.rigId, aiReview: true }, context).id);
    assert.equal(second.status, 'succeeded', second.error); assert.notEqual(second.assetId, first.assetId);
    assert.equal((await f.library.get(second.assetId!)).parentId, first.assetId);
    assert.equal((await f.reviews.read(inspected.id)).childAssetId, second.assetId);
    assert.equal((await settled(f.reviews, second.reviewId!)).status, 'needs_feedback');
    const revisionPrompt = prompts.find(p => p.includes('userFeedback'))!;
    assert.match(revisionPrompt, /Keep the arm swing and the loop length/); assert.match(revisionPrompt, /Make a heavy grounded walk/); assert.match(revisionPrompt, /Add more weight/);
    const provenance = JSON.parse(await readFile(join(f.root, 'artifacts/generations', `${second.assetId}.json`), 'utf8'));
    assert.equal(provenance.feedbackReviewId, inspected.id); assert.equal(provenance.originalRequest, 'Make a heavy grounded walk with a clear arm swing.');
    assert.equal((await f.library.get(first.assetId!)).recipe.name, recipe().name);
  } finally { f.close(); }
});

test('AI evidence citations are validated and invalid critique does not trigger retries or acceptance', async () => {
  let calls = 0;
  const f = await setup(async () => { calls++; return { text: JSON.stringify({ ...critique(), findings: [{ ...critique().findings[0], source: 'user_image', evidenceIds: ['made-up-image'] }] }), usage }; });
  try {
    const asset = await f.library.save(recipe());
    const record = await settled(f.reviews, (await f.reviews.start({ assetId: asset.id, sessionId: f.sessionId, rigId: f.rigId, aiReview: true, provider: 'deepseek' })).id);
    assert.equal(calls, 1); assert.equal(record.status, 'needs_feedback'); assert.equal(record.critique, undefined); assert.match(record.error!, /evidence that was not provided/);
    assert.ok(record.telemetry); assert.equal(record.feedback, undefined);
  } finally { f.close(); }
});

test('screenshots are bounded, tied to the exact review, and fingerprinted before provider transmission', async () => {
  let calls = 0;
  const f = await setup(async () => { calls++; return { text: JSON.stringify(critique()), usage }; });
  try {
    const asset = await f.library.save(recipe()), record = await settled(f.reviews, (await f.reviews.start({ assetId: asset.id })).id);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const attached = await f.reviews.attach({ reviewId: record.id, revision: record.revision, view: 'front', time: 0.5, pngBase64: png });
    assert.equal(attached.images.length, 1); assert.equal(calls, 0);
    await assert.rejects(f.reviews.attach({ reviewId: record.id, revision: attached.revision, view: 'side', pngBase64: png }), /already attached/);
    assert.equal((await f.reviews.imageData(record.id, attached.images[0]!.id)).base64, png);
    await writeFile(join(f.root, 'artifacts/reviews', record.id, `${attached.images[0]!.id}.png`), 'changed');
    const critiquing = await f.reviews.critique({ reviewId: record.id, revision: attached.revision, provider: 'deepseek' });
    const failed = await settled(f.reviews, critiquing.id); assert.match(failed.error!, /screenshot changed/); assert.equal(calls, 0);
  } finally { f.close(); }
});

test('image provider adapters encode native Claude blocks and compatible image URLs without leaking keys into prompts', async () => {
  for (const provider of ['claude', 'deepseek', 'glm'] as const) {
    const client = providerClient(async (_url, init) => {
      const body = JSON.parse(init!.body as string); assert.equal((init!.body as string).includes('fixture-secret-key'), false);
      if (provider === 'claude') assert.deepEqual(body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'fixture-png' } });
      else assert.equal(body.messages[1].content[1].image_url.url, 'data:image/png;base64,fixture-png');
      return Response.json(provider === 'claude' ? { content: [{ type: 'text', text: '{}' }] } : { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] });
    });
    await client({ provider, model: 'fixture-model', workspace: '', apiKey: 'fixture-secret-key' }, 'system', 'prompt', 2000, new AbortController().signal, [{ base64: 'fixture-png', mimeType: 'image/png' }]);
  }
});

test('cancelling a pending inspection prevents its undelivered Studio command from running later', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motion-cancel-review-')), library = new Library(join(root, 'library')), queue = new Queue();
  const sessionId = randomUUID(), rigId = randomUUID(); queue.heartbeat(sessionId, {});
  const reviews = new Reviews(join(root, 'reviews'), library, queue, new Connections(join(root, 'connections.json')));
  const asset = await library.save(recipe()), record = await reviews.start({ assetId: asset.id, sessionId, rigId });
  await reviews.cancel(record.id);
  const done = await settled(reviews, record.id); assert.equal(done.status, 'needs_feedback'); assert.equal(done.feedback, undefined); assert.match(done.error!, /cancel/i); assert.equal(queue.poll(sessionId), null);
});

test('saved answers retain the original question after a screenshot invalidates the earlier critique', async () => {
  const f = await setup();
  try {
    const asset = await f.library.save(recipe());
    const inspected = await settled(f.reviews, (await f.reviews.start({ assetId: asset.id, sessionId: f.sessionId, rigId: f.rigId, aiReview: true, provider: 'deepseek' })).id);
    const input = feedback(inspected);
    const saved = await f.reviews.feedback({ ...input, feedback: { ...input.feedback, answers: [{ questionId: 'ai-impact', answer: 'More weight, please.' }] } });
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=';
    const attached = await f.reviews.attach({ reviewId: saved.id, revision: saved.revision, view: 'front', pngBase64: png });
    assert.equal(attached.critique, undefined);
    const context = await f.reviews.reserveRevision(attached.id, attached.revision);
    assert.deepEqual(context.answers, [{ question: 'Would you like a stronger downward weight shift?', answer: 'More weight, please.' }]);
  } finally { f.close(); }
});

test('a provenance write failure reports the saved child and releases its feedback reservation', async () => {
  const f = await setup(async () => ({ text: JSON.stringify(reply()), usage }));
  try {
    const asset = await f.library.save(recipe());
    const reviewed = await settled(f.reviews, (await f.reviews.start({ assetId: asset.id, preview: false })).id);
    const saved = await f.reviews.feedback(feedback(reviewed));
    const context = await f.reviews.reserveRevision(saved.id, saved.revision);
    await mkdir(join(f.root, 'artifacts'), { recursive: true });
    await writeFile(join(f.root, 'artifacts/generations'), 'fixture blocks the provenance directory');
    const result = await draftDone(f.authoring, f.authoring.start({ provider: 'deepseek', kind: 'animation', parentId: asset.id, prompt: context.changes, inspectAfter: false }, context).id);
    assert.equal(result.status, 'failed'); assert.ok(result.assetId); assert.match(result.error!, /Draft saved/);
    // Background error handling releases the reservation after reporting the failure.
    const record = await settled(f.reviews, saved.id);
    assert.equal(record.childAssetId, result.assetId); assert.equal(record.reservation, undefined);
    assert.equal((await f.library.get(result.assetId!)).parentId, asset.id);
  } finally { f.close(); }
});
