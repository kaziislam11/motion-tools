import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { config } from '../dist/src/config.js';
import { appToken } from '../dist/src/app.js';

const root = resolve('.');
const settings = await config(root);
const base = `http://127.0.0.1:${settings.port}`;
async function health() {
  try { return await (await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${settings.token}` }, signal: AbortSignal.timeout(1500) })).json(); }
  catch { return null; }
}
let state = await health(), child;
if (state && (!state.app || !state.motionReview)) throw new Error('An older Motion Tools server is running. Restart its MCP connection or terminal, then run npm run app again.');
if (!state) {
  child = spawn(process.execPath, [join(root, 'dist/src/index.js'), '--app'], { cwd: root, env: { ...process.env, MOTION_PROJECT_ROOT: root }, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  for (let i = 0; i < 40 && !state; i++) { await new Promise(resolve => setTimeout(resolve, 250)); state = await health(); }
  if (!state?.app || !state?.motionReview) { child.kill(); throw new Error('Could not start the current local app. Check whether another process is using the bridge port.'); }
}
const url = `${base}/app#${await appToken(root)}`;
if (process.argv.includes('--no-open')) console.log(`Private local connection link (do not share): ${url}`);
else {
  const opener = process.platform === 'win32'
    ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:MOTION_APP_URL -WindowStyle Hidden'], { env: { ...process.env, MOTION_APP_URL: url }, windowsHide: true, stdio: 'ignore' })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
  opener.on('error', () => console.error('Browser could not open. Run npm run app -- --no-open for a private local link.'));
  console.log(`Motion Tools opened at ${base}/app. ${child ? 'Keep this terminal open. Ctrl+C stops the server.' : 'Using your running MCP server.'}`);
}
if (child) {
  const close = () => child.kill();
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
