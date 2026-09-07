import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Queue, startBridge } from './bridge.js';
import { Library } from './library.js';
import { Blender } from './blender.js';
import { createMcp } from './server.js';
import { config } from './config.js';

const root = resolve(process.env.MOTION_PROJECT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
const settings = await config(root);
const queue = new Queue();
const bridge = await startBridge(queue, settings.token, settings.port);
const blender = new Blender(root, process.env.BLENDER_EXECUTABLE ?? 'blender');
const server = createMcp(new Library(join(root, 'artifacts', 'library')), queue, blender);
const transport = new StdioServerTransport();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  bridge.close(); bridge.closeAllConnections();
  await server.close();
}
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
process.stdin.once('end', () => void close());
await server.connect(transport);
console.error(`Motion Tools bridge: http://127.0.0.1:${settings.port}. Connect the paired Studio plugin.`);
