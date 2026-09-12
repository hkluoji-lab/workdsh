import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const packages = [];
for (const directory of ['packages/providers/identity-local', 'packages/plugins/audit', 'packages/plugins/access', 'packages/plugins/skills', 'packages/plugins/experts', 'packages/bundle']) {
  const manifest = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'));
  await access(join(root, directory, manifest.exports['.'].default));
  await run('pnpm/bin/pnpm.cjs', ['--filter', manifest.name, 'pack', '--pack-destination', artifacts]);
  const packed = join(artifacts, `${manifest.name}-${manifest.version}.tgz`);
  // Preview candidates can change before their next release. A stable file:
  // address lets the package manager reuse an older archive, even after pack.
  // Keep official CLI installation, but address each archive by its content.
  const digest = createHash('sha256').update(await readFile(packed)).digest('hex');
  const destination = join(artifacts, 'preview', digest);
  await mkdir(destination, { recursive: true });
  const immutableArchive = join(destination, `${manifest.name}-${manifest.version}.tgz`);
  await copyFile(packed, immutableArchive);
  tarballs.push(immutableArchive);
  packages.push({ directory, manifest });
}
let initialized = false;
try { await access(join(home, 'profiles/preview/package.json')); initialized = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!initialized) await run('@deepseek-ai/dsh/lib/bin.js', ['--profile', 'preview', '--from-default-profile', 'web', '--dump-config']);
// Official CLI owns dependency resolution and the ordered Profile bundle list.
await run('@deepseek-ai/dsh/lib/bin.js', ['plugin', '--profile', 'preview', 'add', ...tarballs]);
for (const { directory, manifest } of packages) {
  for (const face of ['.', './client']) {
    const entry = manifest.exports[face]?.default;
    if (!entry) continue;
    const expected = await readFile(join(root, directory, entry));
    const installed = await readFile(join(home, 'profiles/preview/node_modules', manifest.name, entry));
    if (!expected.equals(installed)) throw new Error(`Installed ${manifest.name} ${face} differs from the current build; refusing to report a successful preview update.`);
  }
}
console.log('Installed Skill, Expert and WorkDSH presentation as separate official Profile layers.');
console.log('Start the stopped preview with: corepack pnpm preview');
