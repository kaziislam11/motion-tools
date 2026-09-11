import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { z } from 'zod';
import type { Library } from './library.js';
import { listSchema, readSchema, type MotionApp } from './app.js';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired' | 'unknown' | 'cancelled';
export interface Job { id: string; sessionId: string; operation: string; payload: unknown; status: JobStatus; createdAt: number; deliveredAt?: number; result?: unknown }
export class Queue {
  private sessions = new Map<string, { seenAt: number; snapshot: Record<string, unknown> }>();
  private jobs = new Map<string, Job>();
  constructor(private now = Date.now) {}
  heartbeat(id: string, snapshot: Record<string, unknown>) {
    for (const [key, s] of this.sessions) if (this.now() - s.seenAt > 300000) this.sessions.delete(key);
    if (!this.sessions.has(id) && this.sessions.size >= 16) throw new Error('Too many Studio sessions.');
    this.sessions.set(id, { seenAt: this.now(), snapshot });
  }
  listSessions() { return [...this.sessions].map(([id, s]) => ({ id, online: this.now() - s.seenAt < 10000, ...s })); }
  enqueue(sessionId: string | undefined, operation: string, payload: unknown) {
    const online = this.listSessions().filter(s => s.online);
    if (!sessionId) {
      if (online.length !== 1) throw new Error('Connect one Studio plugin, or specify sessionId from motion_studio_sessions.');
      sessionId = online[0]!.id;
    }
    if (!online.some(s => s.id === sessionId)) throw new Error('Studio session offline. Open the paired plugin and click Connect.');
    for (const [id, job] of this.jobs) if (this.now() - job.createdAt > 1800000) this.jobs.delete(id);
    if (this.jobs.size >= 256) throw new Error('Job history is full; wait for older jobs to expire.');
    const job: Job = { id: randomUUID(), sessionId, operation, payload, status: 'queued', createdAt: this.now() };
    this.jobs.set(job.id, job);
    return { ...job };
  }
  private expire(job: Job) {
    if (job.status === 'queued' && this.now() - job.createdAt > 30000) job.status = 'expired';
    if (job.status === 'running' && this.now() - job.deliveredAt! > 60000) job.status = 'unknown';
  }
  poll(sessionId: string) {
    for (const job of this.jobs.values()) {
      this.expire(job);
      if (job.sessionId === sessionId && job.status === 'queued') {
        job.status = 'running'; job.deliveredAt = this.now();
        return { ...job };
      }
    }
    return null;
  }
  cancelQueued(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'queued') return false;
    job.status = 'cancelled'; return true;
  }
  complete(sessionId: string, id: string, ok: boolean, result: unknown) {
    const job = this.jobs.get(id);
    if (!job || job.sessionId !== sessionId) throw new Error('Job does not belong to this session.');
    if (job.status === 'succeeded' || job.status === 'failed') return; // Lost HTTP acknowledgement can be retried.
    if (job.status !== 'running' && job.status !== 'unknown') throw new Error('Job was not delivered.');
    job.status = ok ? 'succeeded' : 'failed'; job.result = result;
  }
  get(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Unknown job ID. Job history is local to this server process.');
    this.expire(job);
    return { ...job };
  }
}

const pollSchema = z.object({ sessionId: z.string().uuid(), snapshot: z.record(z.unknown()) }).strict();
const resultSchema = z.object({ sessionId: z.string().uuid(), id: z.string().uuid(), ok: z.boolean(), result: z.unknown() }).strict();
async function body(req: IncomingMessage, limit = 512000) {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error(`Request exceeds ${limit} bytes.`);
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function startBridge(queue: Queue, token: string, port: number, options?: { library: Library; app: MotionApp; files: Record<string, { type: string; content: string }> }) {
  const server = createServer(async (req, res) => {
    const respond = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host ?? '')) return respond(403, { error: 'Invalid local host.' });
      const localOrigin = `http://${req.headers.host}`;
      const staticFile = options?.files[req.url ?? ''];
      if (req.method === 'GET' && staticFile) {
        res.writeHead(200, { 'Content-Type': staticFile.type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
        res.end(staticFile.content); return;
      }
      const auth = Buffer.from(req.headers.authorization ?? '');
      if (options && req.url?.startsWith('/app-api/')) {
        const expectedApp = Buffer.from(`Bearer ${options.app.token}`);
        if ((req.headers.origin && req.headers.origin !== localOrigin) || auth.length !== expectedApp.length || !timingSafeEqual(auth, expectedApp)) return respond(403, { error: 'Open Motion Tools using npm run app to connect this browser.' });
        if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return respond(405, { error: 'Use JSON POST.' });
        return respond(200, await options.app.handle(req.url, await body(req, req.url === '/app-api/review-image' ? 2_100_000 : 512000)));
      }
      const expected = Buffer.from(`Bearer ${token}`);
      if (req.headers.origin || !/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host ?? '') || auth.length !== expected.length || !timingSafeEqual(auth, expected)) return respond(403, { error: 'Invalid local pairing token, host, or browser origin.' });
      if (req.method === 'GET' && req.url === '/health') return respond(200, { name: 'roblox-motion', version: 1, release: '1.0.0', ...(options ? { app: true, animationLibrary: true, motionReview: true } : {}) });
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return respond(404, { error: 'Use the Studio plugin.' });
      if (req.url === '/poll') {
        const data = pollSchema.parse(await body(req));
        queue.heartbeat(data.sessionId, data.snapshot);
        return respond(200, { command: queue.poll(data.sessionId) });
      }
      if (req.url === '/result') {
        const data = resultSchema.parse(await body(req));
        queue.complete(data.sessionId, data.id, data.ok, data.result);
        return respond(200, { accepted: true });
      }
      if (options && req.url === '/library/list') {
        const { offset, limit, kind } = listSchema.parse(await body(req));
        return respond(200, await options.library.list(offset, limit, kind));
      }
      if (options && req.url === '/library/read') return respond(200, await options.library.get(readSchema.parse(await body(req)).id));
      respond(404, { error: 'Unknown endpoint.' });
    } catch (error) { respond(400, { error: error instanceof Error ? error.message : String(error) }); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
