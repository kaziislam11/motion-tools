import { readFile, writeFile, mkdir } from 'node:fs/promises';
const parts = ['Rig', 'EnergyColumn', 'Authoring', 'Preview', 'ReviewCapture'];
await mkdir('dist', { recursive: true });
let output = '-- Roblox Motion Tools. Generated from studio/*.lua.\n';
for (const name of parts) {
  output += `local ${name} = (function()\n${await readFile(`studio/${name}.lua`, 'utf8')}\nend)()\n`;
}
output += await readFile('studio/Plugin.lua', 'utf8');
await writeFile('dist/RobloxMotion.plugin.lua', output);
