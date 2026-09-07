import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Queue, startBridge } from '../src/bridge.js';

test('HTTP bridge requires local pairing, rejects browser origins, and routes results', async () => {
  const queue = new Queue();
  const bridge = await startBridge(queue, 'test-token', 0);
  const port = (bridge.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  const sessionId = randomUUID();
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' };
  try {
    assert.equal((await fetch(`${url}/health`)).status, 403);
    assert.equal((await fetch(`${url}/health`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(`${url}/health`, { headers })).status, 200);
    const poll = () => fetch(`${url}/poll`, { method: 'POST', headers, body: JSON.stringify({ sessionId, snapshot: { place: 'Fixture' } }) });
    assert.deepEqual(await (await poll()).json(), { command: null });
    const job = queue.enqueue(sessionId, 'inspect', { rigId: 'fixture-rig' });
    const response = await (await poll()).json() as { command: { id: string } };
    assert.equal(response.command.id, job.id);
    const wrongSession = await fetch(`${url}/result`, { method: 'POST', headers, body: JSON.stringify({ sessionId: randomUUID(), id: job.id, ok: true, result: {} }) });
    assert.equal(wrongSession.status, 400);
    const completed = await fetch(`${url}/result`, { method: 'POST', headers, body: JSON.stringify({ sessionId, id: job.id, ok: true, result: { joints: ['Head'] } }) });
    assert.equal(completed.status, 200);
    assert.equal(queue.get(job.id).status, 'succeeded');
  } finally { bridge.closeAllConnections(); await new Promise<void>(r => bridge.close(() => r())); }
});

async function freePort() {
  const server = createServer();
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(r => server.close(() => r()));
  return port;
}

test('real MCP stdio client discovers tools, authors revisions, and reports offline Studio honestly', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motion-mcp-'));
  const client = new Client({ name: 'motion-integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/src/index.js')], env: { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), MOTION_PROJECT_ROOT: directory, MOTION_PORT: String(await freePort()) }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 20);
    assert.ok(tools.tools.some(t => t.name === 'motion_studio_capture_frame'));
    assert.ok(tools.tools.some(t => t.name === 'motion_studio_capture_chunk'));
    const created = await client.callTool({ name: 'motion_animation_create', arguments: { preset: 'cast', name: 'Test Cast', duration: 2 } });
    assert.ok(!created.isError, JSON.stringify(created));
    const asset = (created.structuredContent as { result: { id: string; recipe: { name: string; duration: number } } }).result;
    assert.equal(asset.recipe.duration, 2);
    const read = await client.callTool({ name: 'motion_library_read', arguments: { assetId: asset.id } });
    assert.equal((read.structuredContent as { result: { id: string } }).result.id, asset.id);
    const invalid = await client.callTool({ name: 'motion_animation_create', arguments: { preset: 'walk', name: 'Invalid', duration: -1 } });
    assert.equal(invalid.isError, true);
    const offline = await client.callTool({ name: 'motion_studio_inspect', arguments: { rigId: randomUUID() } });
    assert.equal(offline.isError, true);
    assert.match(JSON.stringify(offline.content), /Connect one Studio plugin/);
    const revised = await client.callTool({ name: 'motion_library_save', arguments: { parentId: asset.id, recipe: { ...asset.recipe, name: 'Revised Cast' } } });
    assert.ok(!revised.isError, JSON.stringify(revised));
  } finally { await client.close(); await transport.close(); }
});
