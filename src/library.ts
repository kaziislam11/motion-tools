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
  async list(offset = 0, limit = 30) {
    await mkdir(this.directory, { recursive: true });
    const ids = (await readdir(this.directory)).filter(n => /^[0-9a-f-]{36}\.json$/.test(n)).sort();
    const assets = await Promise.all(ids.slice(offset, offset + limit).map(n => this.get(n.slice(0, -5))));
    return { total: ids.length, offset, assets: assets.map(({ recipe, ...meta }) => ({ ...meta, name: recipe.name, kind: recipe.kind })), nextOffset: offset + limit < ids.length ? offset + limit : null };
  }
}
