import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, extname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Blender {
  private busy = false;
  constructor(readonly root: string, readonly executable: string) {}
  async run(blendFile: string, request: Record<string, unknown>) {
    if (!isAbsolute(blendFile) || extname(blendFile).toLowerCase() !== '.blend') throw new Error('Provide an absolute path to an existing .blend file.');
    if (this.busy) throw new Error('Blender worker is busy. Wait for the current operation to finish.');
    await access(blendFile);
    this.busy = true;
    try {
      const directory = join(this.root, 'artifacts', 'blender', randomUUID());
      await mkdir(directory, { recursive: true });
      const requestPath = join(directory, 'request.json');
      await writeFile(requestPath, JSON.stringify(request));
      let log = '';
      let executionError: Error | undefined;
      try {
        await new Promise<void>((done, fail) => {
          const child = spawn(this.executable, ['--background', '--factory-startup', '--disable-autoexec', resolve(blendFile), '--python-exit-code', '1', '--python', join(this.root, 'blender', 'worker.py'), '--', requestPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
          const timer = setTimeout(() => { child.kill(); fail(new Error('Blender exceeded the 120-second limit. Check the job log before retrying.')); }, 120000);
          const collect = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-128000); };
          child.stdout.on('data', collect); child.stderr.on('data', collect);
          child.once('error', error => { clearTimeout(timer); fail(new Error(`Could not launch Blender: ${error.message}. Set BLENDER_EXECUTABLE to blender.exe.`)); });
          child.once('close', code => { clearTimeout(timer); code === 0 ? done() : fail(new Error(`Blender exited with code ${code}.`)); });
        });
      } catch (error) { executionError = error as Error; }
      await writeFile(join(directory, 'blender.log'), log);
      let result: { ok: boolean; error?: string; result?: Record<string, unknown> };
      try { result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')); }
      catch { throw new Error(`${executionError?.message ?? 'Blender produced no result.'} Log: ${join(directory, 'blender.log')}`); }
      if (!result.ok || executionError) throw new Error(`${result.error ?? executionError!.message} Log: ${join(directory, 'blender.log')}`);
      return { ...result.result, jobDirectory: directory };
    } finally { this.busy = false; }
  }
}
