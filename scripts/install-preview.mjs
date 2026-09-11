import { execFile } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const home = resolve(process.env.WORKDSH_PREVIEW_HOME ?? join(root, '.test-runtime/preview'));
const artifacts = join(root, '.artifacts');
const env = { ...process.env, DSH_HOME: home, PATH: `${join(root, 'node_modules/.bin')}:${dirname(process.execPath)}:${process.env.PATH}` };
const exec = promisify(execFile);
const run = async (tool, args) => {
  await exec(process.execPath, [join(root, 'node_modules', tool), ...args], { cwd: root, env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
};
await mkdir(home, { recursive: true }); await mkdir(artifacts, { recursive: true });
const tarballs = [];
for (const directory of ['packages/plugins/skills', 'packages/bundle']) {
  const manifest = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'));
  await access(join(root, directory, manifest.exports['.'].default));
  await run('pnpm/bin/pnpm.cjs', ['--filter', manifest.name, 'pack', '--pack-destination', artifacts]);
  tarballs.push(join(artifacts, `${manifest.name}-${manifest.version}.tgz`));
}
let initialized = false;
try { await access(join(home, 'profiles/preview/package.json')); initialized = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!initialized) await run('@deepseek-ai/dsh/lib/bin.js', ['--profile', 'preview', '--from-default-profile', 'web', '--dump-config']);
// Official CLI owns dependency resolution and the ordered Profile bundle list.
await run('@deepseek-ai/dsh/lib/bin.js', ['plugin', '--profile', 'preview', 'add', ...tarballs]);
console.log('Installed Skill and WorkDSH presentation as separate official Profile layers.');
console.log('Start the stopped preview with: corepack pnpm preview');
