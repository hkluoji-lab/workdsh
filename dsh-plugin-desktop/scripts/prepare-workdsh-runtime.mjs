#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKDSH_VERSION = '0.1.0-alpha.8'
const DSH_VERSION = '0.1.7-alpha.1'
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(desktopRoot, 'build', 'workdsh-runtime')
const destination = join(output, 'profiles', 'workdsh')
const cli = join(destination, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`)
}

async function download(url, path) {
  if (existsSync(path)) return
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`)
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

async function installReleasedProfile() {
  const releaseDir = join(desktopRoot, 'build', `.workdsh-release-${WORKDSH_VERSION}`)
  mkdirSync(releaseDir, { recursive: true })
  const base = `https://github.com/techflag/workdsh/releases/download/v${WORKDSH_VERSION}`
  const manifestPath = join(releaseDir, 'release-manifest.json')
  await download(`${base}/release-manifest.json`, manifestPath)
  const installerPath = join(releaseDir, 'install-workdsh.mjs')
  await download(`${base}/install-workdsh.mjs`, installerPath)
  if (process.platform === 'win32') {
    let installer = readFileSync(installerPath, 'utf8')
    installer = installer
      .replace("import { spawnSync } from 'node:child_process';", "import { spawnSync as nativeSpawnSync } from 'node:child_process';")
      .replace('const argv = process.argv.slice(2);', "const portableSpawn = (command, args, options = {}) => nativeSpawnSync(command, args, { ...options, shell: true });\nconst argv = process.argv.slice(2);")
      .replaceAll('spawnSync(', 'portableSpawn(')
    writeFileSync(installerPath, installer)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const item of manifest.packages) {
    await download(`${base}/${item.filename}`, join(releaseDir, item.filename))
  }

  mkdirSync(output, { recursive: true })
  const shim = join(output, process.platform === 'win32' ? 'dsh-runtime.cmd' : 'dsh-runtime')
  const pnpmShim = join(output, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  if (process.platform === 'win32') {
    writeFileSync(shim, `@echo off\r\nnpx --yes @deepseek-ai/dsh@${DSH_VERSION} %*\r\n`)
    writeFileSync(pnpmShim, '@echo off\r\nnpx --yes pnpm@10.34.5 %*\r\n')
  } else {
    writeFileSync(shim, `#!/bin/sh\nexec npx --yes @deepseek-ai/dsh@${DSH_VERSION} \"$@\"\n`)
    writeFileSync(pnpmShim, '#!/bin/sh\nexec npx --yes pnpm@10.34.5 "$@"\n')
    chmodSync(shim, 0o755)
    chmodSync(pnpmShim, 0o755)
  }
  run(process.execPath, [installerPath, '--directory', releaseDir, '--dsh', shim], {
    env: { ...process.env, DSH_HOME: output, PATH: `${output}${delimiter}${process.env.PATH ?? ''}` },
  })
}

async function prepareNodeExecutable(path) {
  mkdirSync(dirname(path), { recursive: true })
  if (process.platform !== 'darwin') {
    cpSync(process.execPath, path)
    if (process.platform !== 'win32') chmodSync(path, 0o755)
    return
  }
  const otherArch = process.arch === 'arm64' ? 'x64' : 'arm64'
  const cache = join(desktopRoot, 'build', '.workdsh-node')
  const archive = join(cache, `node-v${process.versions.node}-darwin-${otherArch}.tar.gz`)
  const extracted = join(cache, `node-v${process.versions.node}-darwin-${otherArch}`, 'bin', 'node')
  mkdirSync(cache, { recursive: true })
  await download(`https://nodejs.org/dist/v${process.versions.node}/node-v${process.versions.node}-darwin-${otherArch}.tar.gz`, archive)
  if (!existsSync(extracted)) run('/usr/bin/tar', ['-xzf', archive, '-C', cache])
  run('/usr/bin/lipo', ['-create', process.execPath, extracted, '-output', path])
  chmodSync(path, 0o755)
}

const candidates = [
  process.env.WORKDSH_BUNDLED_PROFILE,
  process.env.WORKDSH_DSH_HOME && join(process.env.WORKDSH_DSH_HOME, 'profiles', 'workdsh'),
  '/tmp/workdsh-desktop-profile.IbF6US/profiles/workdsh',
].filter(Boolean)
const source = candidates.find(candidate => existsSync(join(candidate, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')))

if (source) {
  rmSync(output, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  // electron-builder intentionally does not follow extra-resource directory links.
  // Clone into a real directory; APFS copy-on-write keeps local preparation fast.
  if (process.platform === 'darwin') run('/bin/cp', ['-cR', resolve(source), destination])
  else cpSync(resolve(source), destination, { recursive: true, dereference: true })
} else if (!existsSync(cli)) {
  await installReleasedProfile()
}

if (!existsSync(cli)) throw new Error(`Failed to prepare WorkDSH runtime at ${destination}`)
cpSync(join(destination, 'package.json'), join(output, 'profile-package.json'))
const nodeExecutable = join(output, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
await prepareNodeExecutable(nodeExecutable)
console.log(`Prepared WorkDSH ${WORKDSH_VERSION} runtime at ${output}`)
