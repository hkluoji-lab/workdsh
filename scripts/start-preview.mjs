import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const previewHome = process.env.WORKDSH_PREVIEW_HOME ?? resolve(root, '.test-runtime/preview');
const agentsHome = process.env.DSH_AGENTS_HOME ?? resolve(homedir(), '.agents');
const port = process.env.WORKDSH_PREVIEW_PORT ?? '18989';
const dsh = resolve(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js');

mkdirSync(previewHome, { recursive: true });
const child = spawn(process.execPath, [dsh, '--profile', 'preview', '--host', '127.0.0.1', '--port', port, '--no-open'], {
  cwd: root,
  env: { ...process.env, DSH_HOME: previewHome, DSH_AGENTS_HOME: agentsHome },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
