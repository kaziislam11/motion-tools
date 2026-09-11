import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Connections, WindowsSecrets, providerClient, type Complete } from '../src/providers.js';
import { Authoring } from '../src/authoring.js';
import { Library } from '../src/library.js';
import { animationPreset, vfxPreset } from '../src/recipes.js';
import { Queue, startBridge } from '../src/bridge.js';
import { MotionApp } from '../src/app.js';

const fakeCodec = { protect: async (text: string) => Buffer.from(text).toString('base64'), unprotect: async (text: string) => Buffer.from(text, 'base64').toString() };
const key = 'test-key-that-is-not-real';
async function fixture(complete?: Complete) {
  const root = await mkdtemp(join(tmpdir(), 'motion-app-'));
  const library = new Library(join(root, 'artifacts/library')), queue = new Queue();
  const connections = new Connections(join(root, '.local/providers.json'), fakeCodec, {});
  await connections.save({ provider: 'deepseek', model: 'test-model', apiKey: key });
  const authoring = new Authoring(library, queue, connections, root, complete);
  return { root, library, queue, connections, authoring };
}
const draft = () => ({ approach: 'Standard R15 weight shifts', checkpoints: ['Check planted feet', 'Inspect loop transition'], avoid: ['Foot sliding'], recipe: animationPreset('walk', 'Walk', 1.2, 1) });
async function wait(authoring: Authoring, id: string) {
  for (let i = 0; i < 200; i++) { const job = authoring.get(id); if (job.status !== 'running') return job; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Draft timed out in test');
}

test('connections keep session keys out of disk and API responses; remembered keys survive restart and can be removed', async () => {
  const { root, connections } = await fixture();
  const path = join(root, '.local/providers.json');
  assert.equal((await readFile(path, 'utf8')).includes(key), false);
  assert.equal(JSON.stringify(await connections.list()).includes(key), false);
  await assert.rejects(new Connections(path, fakeCodec, {}).credential('deepseek'), /Connect/);
  await connections.save({ provider: 'deepseek', model: 'changed-model', remember: true });
  assert.equal((await readFile(path, 'utf8')).includes(key), false);
  const restarted = new Connections(path, fakeCodec, {});
  assert.equal((await restarted.credential('deepseek')).apiKey, key);
  assert.equal((await restarted.credential('deepseek')).model, 'changed-model');
  assert.equal((await restarted.list()).find(p => p.id === 'deepseek')?.source, 'remembered');
  await restarted.remove('deepseek');
  await assert.rejects(restarted.credential('deepseek'), /Connect/);
  assert.equal((await readFile(path, 'utf8')).includes('encryptedKey'), false);
});

test('Windows DPAPI round trip does not persist or echo a plaintext key', { skip: process.platform !== 'win32' }, async () => {
  const codec = new WindowsSecrets();
  const encrypted = await codec.protect(key);
  assert.ok(encrypted.length > key.length); assert.equal(encrypted.includes(key), false);
  assert.equal(await codec.unprotect(encrypted), key);
});

test('provider adapters use fixed official endpoints, correct auth, limits, no redirects, and normalize token usage', async () => {
  for (const provider of ['claude', 'deepseek', 'glm'] as const) {
    const client = providerClient(async (url, init) => {
      const request = JSON.parse(init!.body as string), headers = init!.headers as Record<string, string>;
      assert.match(String(url), provider === 'claude' ? /^https:\/\/api.anthropic.com\/v1\/messages$/ : provider === 'deepseek' ? /^https:\/\/api.deepseek.com\/chat\/completions$/ : /^https:\/\/api.z.ai\/api\/paas\/v4\/chat\/completions$/);
      assert.equal(request.max_tokens, 4000); assert.equal(request.stream, false); assert.equal(init!.redirect, 'error');
      assert.equal((init!.body as string).includes(key), false);
      if (provider === 'claude') { assert.equal(headers['x-api-key'], key); assert.equal(headers['anthropic-workspace-id'], 'workspace-test'); assert.equal(request.system, 'system'); }
      else { assert.equal(headers.Authorization, `Bearer ${key}`); assert.equal(request.messages[0].content, 'system'); assert.equal(request.thinking.type, 'disabled'); }
      return Response.json(provider === 'claude' ? { content: [{ type: 'thinking', thinking: 'ignore' }, { type: 'text', text: '{"draft":true}' }], usage: { input_tokens: 10, output_tokens: 20 }, stop_reason: 'end_turn' } : { choices: [{ message: { content: '{"draft":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
    });
    const result = await client({ provider, model: 'example', apiKey: key, workspace: 'workspace-test' }, 'system', 'prompt', 4000, new AbortController().signal);
    assert.equal(result.text, '{"draft":true}'); assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 20 });
  }
});

test('provider failures do not echo upstream secrets; truncated and oversized output is rejected', async () => {
  const credential = { provider: 'deepseek' as const, model: 'test', apiKey: key, workspace: '' };
  for (const response of [new Response(key, { status: 401 }), Response.json({ choices: [{ finish_reason: 'length' }] }), new Response('a'.repeat(2_000_001))]) {
    const client = providerClient(async () => response);
    await assert.rejects(client(credential, '', '', 2000, new AbortController().signal), error => error instanceof Error && !error.message.includes(key));
  }
});

test('library filtering happens before pagination and returns every animation revision after restart', async () => {
  const { library } = await fixture();
  const ids: string[] = [];
  for (let i = 0; i < 7; i++) { ids.push((await library.save(animationPreset('idle', 'Same name', 1, 1), ids.at(-1))).id); await library.save(vfxPreset('impact', 'Effect')); }
  const restarted = new Library(library.directory), found = new Set<string>(); let offset: number | null = 0;
  do { const page = await restarted.list(offset, 2, 'animation'); assert.equal(page.total, 7); for (const asset of page.assets) { assert.equal(asset.kind, 'animation'); found.add(asset.id); } offset = page.nextOffset; } while (offset !== null);
  assert.deepEqual([...found].sort(), ids.sort());
});

test('generation saves validated immutable drafts with a pending visual workflow, usage, and optional single repair', async () => {
  let calls = 0;
  const f = await fixture(async () => ({ text: JSON.stringify(++calls === 1 ? { ...draft(), recipe: { ...draft().recipe, duration: -2 } } : draft()), usage: { inputTokens: 100, outputTokens: 300 } }));
  const parent = await f.library.save(animationPreset('walk', 'Original', 1, 1));
  const first = f.authoring.start({ provider: 'deepseek', kind: 'animation', prompt: 'Walk with weight', parentId: parent.id, repair: true });
  assert.throws(() => f.authoring.start({ provider: 'deepseek', kind: 'animation', prompt: 'Double click' }), /already running/);
  const result = await wait(f.authoring, first.id);
  assert.equal(result.status, 'succeeded', result.error); assert.equal(calls, 2);
  assert.deepEqual(result.usage, { inputTokens: 200, outputTokens: 600 });
  const saved = await f.library.get(result.assetId!); assert.equal(saved.parentId, parent.id);
  assert.equal((await f.library.get(parent.id)).recipe.name, 'Original');
  const provenance = JSON.parse(await readFile(join(f.root, 'artifacts/generations', `${saved.id}.json`), 'utf8'));
  assert.equal(provenance.reviewed, false); assert.equal(JSON.stringify(provenance).includes(key), false);
  const workflow = JSON.parse(await readFile(join(f.root, 'artifacts/workflows', result.workflowId!, '000001.json'), 'utf8'));
  assert.equal(workflow.brief.request, 'Walk with weight'); assert.equal(workflow.candidates.length, 0);
});

test('invalid output does not silently retry or save; cancellation saves no draft', async () => {
  let calls = 0;
  const f = await fixture(async () => { calls++; return { text: '{bad', usage: { inputTokens: 1, outputTokens: 1 } }; });
  const result = await wait(f.authoring, f.authoring.start({ provider: 'deepseek', kind: 'animation', prompt: 'Walk' }).id);
  assert.equal(result.status, 'failed'); assert.equal(calls, 1); assert.equal((await f.library.list()).total, 0);
  const cancelled = await fixture(async (_a, _b, _c, _d, signal) => { await new Promise<void>((resolve, reject) => { if (signal.aborted) reject(new Error('cancelled')); else signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); }); throw new Error('unreachable'); });
  const job = cancelled.authoring.start({ provider: 'deepseek', kind: 'vfx', prompt: 'Fire' }); cancelled.authoring.cancel(job.id);
  assert.equal((await wait(cancelled.authoring, job.id)).status, 'cancelled'); assert.equal((await cancelled.library.list()).total, 0);
});

test('selected rig is inspected before generation and unknown animated names are rejected', async () => {
  let gotContext = false;
  const f = await fixture(async (_c, _s, prompt) => { gotContext = prompt.includes('OnlyDrivenJoint'); return { text: JSON.stringify(draft()), usage: { inputTokens: 1, outputTokens: 1 } }; });
  const sessionId = randomUUID(), rigId = randomUUID(); f.queue.heartbeat(sessionId, { selection: [{ id: rigId, name: 'Rig' }] });
  const job = f.authoring.start({ provider: 'deepseek', kind: 'animation', prompt: 'Walk', sessionId, rigId });
  const timer = setInterval(() => { const command = f.queue.poll(sessionId); if (command) { assert.equal(command.operation, 'inspect'); f.queue.complete(sessionId, command.id, true, { animatedNames: [{ name: 'OnlyDrivenJoint', driven: true }] }); } }, 10);
  try { assert.equal((await wait(f.authoring, job.id)).status, 'failed'); assert.equal(gotContext, true); assert.equal((await f.library.list()).total, 0); } finally { clearInterval(timer); }
});

test('browser app separates auth from Studio, blocks hostile origins, and confirms preview/save through jobs', async () => {
  const f = await fixture(), app = new MotionApp('browser-token', f.library, f.queue, f.connections, f.root, f.authoring);
  const bridge = await startBridge(f.queue, 'studio-token', 0, { library: f.library, app, files: { '/app': { type: 'text/html', content: 'local app' } } });
  const url = `http://127.0.0.1:${(bridge.address() as { port: number }).port}`;
  const post = (path: string, input: unknown = {}, token = 'browser-token', origin = url) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(input) });
  try {
    const page = await fetch(url + '/app'); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal((await post('/app-api/state', {}, 'studio-token')).status, 403);
    assert.equal((await post('/app-api/state', {}, 'browser-token', 'https://evil.example')).status, 403);
    assert.equal((await post('/app-api/state', {}, 'browser-token', 'null')).status, 403);
    const state = await post('/app-api/state'); assert.equal(state.status, 200); assert.equal((await state.text()).includes(key), false);
    assert.equal((await post('/poll', {}, 'studio-token')).status, 403);
    const sessionId = randomUUID(), rigId = randomUUID(); f.queue.heartbeat(sessionId, { selection: [{ id: rigId, name: 'Fixture' }] });
    const asset = await f.library.save(draft().recipe);
    const listing = await post('/library/list', { kind: 'animation' }, 'studio-token', ''); assert.equal((await listing.json() as any).total, 1);
    assert.equal((await post('/library/read', { id: '../../secrets' }, 'studio-token', '')).status, 400);
    const action = { sessionId, rigId, assetId: asset.id };
    for (const path of ['preview', 'save']) {
      const job = await (await post(`/app-api/${path}`, action)).json() as any; assert.equal(job.status, 'queued');
      const delivered = f.queue.poll(sessionId)!; assert.equal(delivered.id, job.id); assert.equal(delivered.operation, path === 'save' ? 'save_animation' : 'preview');
      f.queue.complete(sessionId, job.id, true, { saved: true });
      assert.equal((await (await post('/app-api/job', { id: job.id })).json() as any).status, 'succeeded');
    }
  } finally { f.authoring.close(); bridge.close(); bridge.closeAllConnections(); }
});
