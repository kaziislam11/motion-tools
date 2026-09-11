import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { identifier, label } from './recipes.js';
import { Library } from './library.js';
import type { Queue } from './bridge.js';
import { Authoring } from './authoring.js';
import { Connections, providerId } from './providers.js';
import { Reviews } from './reviews.js';

export async function appToken(root: string) {
  const path = join(root, '.local', 'app-token');
  await mkdir(join(root, '.local'), { recursive: true });
  try { await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  return z.string().regex(/^[a-f0-9]{64}$/).parse((await readFile(path, 'utf8')).trim());
}
export const listSchema = z.object({ offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(100), kind: z.enum(['animation', 'vfx']).optional() }).strict();
export const readSchema = z.object({ id: identifier }).strict();
const actionSchema = z.object({ sessionId: identifier, rigId: identifier, assetId: identifier, part: label.default('RightHand'), seconds: z.number().min(0.1).max(30).default(10) }).strict();

export class MotionApp {
  readonly authoring: Authoring;
  readonly reviews: Reviews;
  constructor(readonly token: string, readonly library: Library, readonly queue: Queue, readonly connections: Connections, root: string, authoring?: Authoring, reviews?: Reviews) {
    this.reviews = reviews ?? new Reviews(join(root, 'artifacts', 'reviews'), library, queue, connections);
    this.authoring = authoring ?? new Authoring(library, queue, connections, root, undefined, this.reviews);
  }
  async handle(path: string, input: unknown): Promise<unknown> {
    switch (path) {
      case '/app-api/state': return { providers: await this.connections.list(), sessions: this.queue.listSessions().filter(s => s.online) };
      case '/app-api/connect': return this.connections.save(input);
      case '/app-api/disconnect': return this.connections.remove(z.object({ provider: providerId }).strict().parse(input).provider);
      case '/app-api/library': { const { offset, limit, kind } = listSchema.parse(input); return this.library.list(offset, limit, kind); }
      case '/app-api/asset': return this.library.get(readSchema.parse(input).id);
      case '/app-api/generate': return this.authoring.start(input);
      case '/app-api/draft': return this.authoring.get(readSchema.parse(input).id);
      case '/app-api/cancel': return this.authoring.cancel(readSchema.parse(input).id);
      case '/app-api/inspect': return this.reviews.start(input);
      case '/app-api/review': { const record = await this.reviews.read(readSchema.parse(input).id); return { ...record, questions: this.reviews.questions(record) }; }
      case '/app-api/review-latest': { const record = await this.reviews.latest(readSchema.parse(input).id); return record ? { ...record, questions: this.reviews.questions(record) } : null; }
      case '/app-api/review-feedback': return this.reviews.feedback(input);
      case '/app-api/review-critique': return this.reviews.critique(input);
      case '/app-api/review-cancel': return this.reviews.cancel(readSchema.parse(input).id);
      case '/app-api/review-image': return this.reviews.attach(input);
      case '/app-api/review-image-read': { const data = z.object({ reviewId: identifier, imageId: identifier }).strict().parse(input); return this.reviews.imageData(data.reviewId, data.imageId); }
      case '/app-api/review-revise': {
        const data = z.object({ reviewId: identifier, revision: z.number().int().min(1), provider: providerId, sessionId: identifier.optional(), rigId: identifier.optional(), maxTokens: z.number().int().min(1024).max(32000).default(12000), repair: z.boolean().default(false), aiReview: z.boolean().default(false) }).strict().parse(input);
        const context = await this.reviews.reserveRevision(data.reviewId, data.revision);
        try {
          const asset = await this.library.get(context.assetId), review = await this.reviews.read(context.reviewId);
          return this.authoring.start({ provider: data.provider, parentId: asset.id, kind: asset.recipe.kind, prompt: context.changes, sessionId: data.sessionId, rigId: data.rigId, maxTokens: data.maxTokens, repair: data.repair, aiReview: data.aiReview, inspectAfter: true, motionMode: review.request.motionMode }, context);
        } catch (error) { await this.reviews.finishRevision(context, undefined, 'Generation could not start. Your feedback was preserved.'); throw error; }
      }
      case '/app-api/job': return this.queue.get(readSchema.parse(input).id);
      case '/app-api/stop': return this.queue.enqueue(z.object({ sessionId: identifier }).strict().parse(input).sessionId, 'stop_preview', {});
      case '/app-api/preview':
      case '/app-api/save': {
        const data = actionSchema.parse(input);
        const recipe = (await this.library.get(data.assetId)).recipe;
        if (path === '/app-api/preview') return this.queue.enqueue(data.sessionId, 'preview', {
          rigId: data.rigId, seconds: data.seconds, jointMap: {},
          ...(recipe.kind === 'animation' ? { animation: recipe, effects: [] } : { effects: [{ recipe, part: data.part, time: 0 }] }),
        });
        return this.queue.enqueue(data.sessionId, recipe.kind === 'animation' ? 'save_animation' : 'save_vfx', { rigId: data.rigId, assetId: data.assetId, recipe, jointMap: {}, part: data.part });
      }
      default: throw new Error('Unknown local app endpoint.');
    }
  }
}
