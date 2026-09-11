import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { identifier, recipeSchema, type Recipe } from './recipes.js';

export interface Asset { id: string; createdAt: string; parentId?: string; recipe: Recipe }
export class Library {
  constructor(readonly directory: string) {}
  async save(recipe: Recipe, parentId?: string): Promise<Asset> {
    const validated = recipeSchema.parse(recipe);
    if (parentId) {
      const parent = await this.get(parentId);
      if (parent.recipe.kind !== validated.kind) throw new Error('A revision must retain its parent asset kind.');
    }
    const asset: Asset = { id: randomUUID(), createdAt: new Date().toISOString(), ...(parentId ? { parentId } : {}), recipe: validated };
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, `${asset.id}.json`), JSON.stringify(asset, null, 2), { flag: 'wx' });
    return asset;
  }
  async get(id: string): Promise<Asset> {
    identifier.parse(id);
    const asset = JSON.parse(await readFile(join(this.directory, `${id}.json`), 'utf8')) as Asset;
    if (asset.id !== id) throw new Error('Asset identity mismatch.');
    asset.recipe = recipeSchema.parse(asset.recipe);
    return asset;
  }
  async list(offset = 0, limit = 30, kind?: Recipe['kind']) {
    await mkdir(this.directory, { recursive: true });
    const ids = (await readdir(this.directory)).filter(n => /^[0-9a-f-]{36}\.json$/.test(n)).sort();
    const all: { id: string; createdAt: string; parentId?: string; name: string; kind: Recipe['kind'] }[] = [];
    // Keep only metadata between batches, instead of retaining every full animation in memory.
    for (let start = 0; start < ids.length; start += 16) {
      const batch = await Promise.all(ids.slice(start, start + 16).map(n => this.get(n.slice(0, -5))));
      for (const { recipe, ...meta } of batch) if (!kind || recipe.kind === kind) all.push({ ...meta, name: recipe.name, kind: recipe.kind });
    }
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return { total: all.length, offset, assets: all.slice(offset, offset + limit), nextOffset: offset + limit < all.length ? offset + limit : null };
  }
}
