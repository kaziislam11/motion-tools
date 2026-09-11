import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config } from '../dist/src/config.js';
const root = resolve('.');
const settings = await config(root);
let previousBlender;
try { previousBlender = JSON.parse(await readFile('.local/mcp-config.json', 'utf8')).mcpServers?.['roblox-motion']?.env?.BLENDER_EXECUTABLE; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const blenderExecutable = process.env.BLENDER_EXECUTABLE || previousBlender;
const plugin = (await readFile('dist/RobloxMotion.plugin.lua', 'utf8'))
  .replace('__BRIDGE_URL__', `http://127.0.0.1:${settings.port}`).replace('__BRIDGE_TOKEN__', settings.token);
await writeFile('.local/RobloxMotion.plugin.lua', plugin);
const entry = { command: process.execPath, args: [join(root, 'dist', 'src', 'index.js')], env: { MOTION_PROJECT_ROOT: root, ...(blenderExecutable ? { BLENDER_EXECUTABLE: blenderExecutable } : {}) } };
await writeFile('.local/mcp-config.json', JSON.stringify({ mcpServers: { 'roblox-motion': entry } }, null, 2));
await writeFile('.local/codex-config.toml', `[mcp_servers.roblox-motion]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n\n[mcp_servers.roblox-motion.env]\n${Object.entries(entry.env).map(([k,v]) => `${k} = ${JSON.stringify(v)}`).join('\n')}\n`);
console.log('Prepared paired Studio plugin and MCP configuration in .local/. See README.md for installation.');
