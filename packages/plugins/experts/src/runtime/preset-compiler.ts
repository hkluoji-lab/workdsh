import { assetBytes, validateResources, type PackageAssets } from '../authoring/package-resources.js';
import { mkdir, readFile, writeFile, readdir, lstat, chmod, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import { homedir } from 'node:os';
import type { ExpertDefinition, ExpertRevisionRef } from 'workdsh-contracts';
import { readFileSync } from 'node:fs';
import { compilePersonaPrefix, compilePersonaSuffix } from '../domain/definition.js';
import { sha256, shortDigest } from '../domain/digest.js';

/**
 * Expert preset compiler (G01, ADR-0017 #4, HLD 5.1).
 *
 * An expert is a READ-ONLY preset. The compiler never accepts user-supplied
 * composition text, npm package names, Cordis services, arbitrary config code or
 * absolute directories: it reads the effective `@deepseek-ai/dsh-agent-preset`
 * declaration already loaded by the Host Loader, rewrites only two rows from
 * validated definition fields, and registers the resulting declaration with the
 * official `AgentPresetRegistry` —
 *   - the `@deepseek-ai/dsh-persona` row: preset-scope role, `complete:false` and
 *     `includeRuntimeContext:true` so native tool guidance and runtime context survive;
 *   - the `@deepseek-ai/dsh-skill-filesystem` row: `includeDefaultRoots:true` keeps the
 *     global dynamic pool, `customSkillDirs` mounts the frozen snapshots, `watch:false`
 *     freezes them.
 * Every other row of the base declaration — including `!!js` gates — is preserved.
 *
 * The frozen declaration and the expert package resources are materialized under a
 * WorkDSH-managed directory so a published revision stays byte-stable and auditable;
 * the registry owns activation of the registered rows.
 */

/** Expert revisions declare official presets; the Loader and AgentPresetRegistry own activation. */
export const COMPILER_VERSION = 'workdsh-expert-compiler/0.4-declarative-presets';

const PERSONA_MODULE = '@deepseek-ai/dsh-persona';
const SKILL_FS_MODULE = '@deepseek-ai/dsh-skill-filesystem';
const TOOL_SKILL_MODULE = '@deepseek-ai/dsh-tool-skill';
const PRESET_MODULE = '@deepseek-ai/dsh-agent-preset';
const PRESET_FILE = 'preset.json';
const MANIFEST_FILE = 'workdsh-expert-manifest.json';

/**
 * The base declaration is a Loader row addressed either by package name (Profile YAML)
 * or by its resolved module path (programmatic composition, which is how the probes
 * and the packaged Profile layers mount it). The sibling `-registry` row is never a
 * match: only the row that carries the preset's own `config.id` may be copied.
 */
function isPresetModule(name: string): boolean {
  return name === PRESET_MODULE || name.includes(`${PRESET_MODULE}/`);
}

const LEGACY_TEAM_TOOL_REPLACEMENTS: Readonly<Record<string, string>> = {
  workdsh_expert_team_start: '官方 Team 已随当前会话建立（无需调用建团工具）',
  workdsh_expert_team_ask: '`spawn_teammate`、`send_message` 与 `wait_agent`',
  workdsh_expert_team_delegate: '`spawn_teammate`、`team_task_create` 与 `send_message`',
  workdsh_expert_team_status: '`list_agents`、`team_task_list` 与 `team_task_get`',
  workdsh_expert_team_complete: '`team_task_update`',
  workdsh_expert_team_deliver: '完成共享任务后直接汇总交付',
  workdsh_expert_team_cancel: '`interrupt_agent` 或更新共享任务状态',
};

/** Keep older published team assets usable after the 0.1.6 official Team migration. */
export function migrateLegacyTeamInstructions(text: string): string {
  return text.replace(/workdsh_expert_team_(?:start|ask|delegate|status|complete|deliver|cancel)\b/g, tool => LEGACY_TEAM_TOOL_REPLACEMENTS[tool] ?? tool);
}

export interface CompiledPreset {
  readonly presetId: string;
  readonly presetDir: string;
  readonly compositionDigest: string;
  readonly created: boolean;
}

export interface CompileInput {
  readonly expertId: string;
  readonly definition: ExpertDefinition;
  /** Absolute managed snapshot directories, one per retained Skill revision. */
  readonly snapshotDirs: readonly string[];
  readonly basePresetId: string;
  readonly packageRoot?: string;
  readonly teamMembers?: Readonly<Record<string, ExpertRevisionRef>>;
}

/** Lowercase kebab segment safe for `PRESET_ID = /^[a-z0-9][a-z0-9-]*$/`. */
function kebab(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return normalized || 'expert';
}

/** Deterministic preset id: `wd-exp-<kebab>-<digest>`; same content ⇒ same id (idempotent). */
export function presetIdFor(input: CompileInput): string {
  const digest = shortDigest({
    compiler: COMPILER_VERSION,
    base: input.basePresetId,
    definition: input.definition,
    snapshotDirs: [...input.snapshotDirs].sort(),
    ...(input.teamMembers ? { teamMembers: input.teamMembers } : {}),
  });
  return `wd-exp-${kebab(input.expertId)}-${digest}`;
}

/** Managed directory holding one immutable expert revision: declaration plus package resources. */
export function expertPresetDir(presetId: string): string {
  if (!/^wd-exp-[a-z0-9-]+$/.test(presetId)) throw new Error('experts/invalid-preset-id');
  return join(process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents'), '.workdsh-state', 'experts', 'presets', presetId);
}

/** Registered declarations per runtime Context, so one revision is registered once. */
const registrations = new WeakMap<Context, Map<string, Promise<void>>>();

/**
 * Read the frozen declaration of a published revision.
 *
 * A missing declaration means the revision predates the declarative registry (the
 * 0.1.6 directory format). This reader never recompiles or rewrites anything: the
 * expert service recompiles an expired revision into a derived revision and advances
 * the published pointer, then registers that declaration. A caller that still receives
 * this diagnostic is reading a revision whose migration did not succeed (for example a
 * Skill snapshot that is gone), so the explicit error stands in for a silent swap.
 */
export async function readExpertPreset(presetId: string): Promise<string> {
  try { return await readFile(join(expertPresetDir(presetId), PRESET_FILE), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw Object.assign(new Error('此专家修订为旧编译器预设且未能自动重建，请检查技能依赖后重试或重新发布；历史任务不会自动换用新组合。'), { code: 'experts/preset-broken' });
    throw error;
  }
}

/** Register one frozen declaration with the official registry, owned by the declaring Context. */
export async function registerExpertPreset(ctx: Context, presetId: string, expectedDigest: string): Promise<void> {
  const text = await readExpertPreset(presetId);
  if (sha256(text) !== expectedDigest) throw Object.assign(new Error('专家预设内容已变化，请重新发布。'), { code: 'experts/preset-drift' });
  let pending = registrations.get(ctx);
  if (!pending) { pending = new Map(); registrations.set(ctx, pending); }
  if (!pending.has(presetId)) {
    const definition = JSON.parse(text) as PresetDefinition;
    if (definition.id !== presetId) throw Object.assign(new Error('专家预设内容已变化，请重新发布。'), { code: 'experts/preset-drift' });
    const promise = ctx.agentPresets.register(definition).then(dispose => { ctx.effect(() => dispose); });
    pending.set(presetId, promise);
    promise.catch(() => { pending!.delete(presetId); });
  }
  await pending.get(presetId);
}

/**
 * Compile (or reuse) the immutable preset for one expert revision.
 * Idempotent: a published revision whose manifest and package contents still match is reused.
 */
export async function compileExpertPreset(ctx: Context, input: CompileInput): Promise<CompiledPreset> {
  const presetId = presetIdFor(input);
  const presetDir = expertPresetDir(presetId);
  const files = input.definition.packageDocuments ?? {};
  const assets = input.definition.packageAssets ?? {};
  validateResources(files, assets);
  const manifestPath = join(presetDir, MANIFEST_FILE);
  const inputDigest = sha256(renderComposition(input));
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { inputDigest?: string; compositionDigest?: string };
    if (manifest.inputDigest !== inputDigest) throw Object.assign(new Error('专家预设内容已变化，请重新发布。'), { code: 'experts/preset-drift' });
    await verifyPackageFiles(presetDir, files, assets);
    await registerExpertPreset(ctx, presetId, manifest.compositionDigest ?? '');
    return { presetId, presetDir, compositionDigest: manifest.compositionDigest ?? '', created: false };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

  // The public Loader entry contains the effective Profile declaration, including !!js nodes.
  const base = [...ctx.loader.entries()].find(entry => !entry.disabled && isPresetModule(entry.options.name) && entry.options.config?.id === input.basePresetId);
  if (!base) throw Object.assign(new Error('缺少官方标准模式声明，无法发布专家。'), { code: 'experts/preset-broken' });
  const plugins = JSON.parse(JSON.stringify(base.options.config.plugins)) as PresetDefinition['plugins'];
  const rootsInPackage = Object.keys(files).filter(path => /^skills\/[a-z][a-z0-9-]+\/SKILL\.md$/.test(path)).map(path => join(presetDir, 'expert-package', path.slice(0, -9)));
  const packageRoot = Object.keys(files).length ? join(presetDir, 'expert-package') : undefined;
  const persona = expertPersonaConfig({ ...input, packageRoot });
  const skillConfig = { includeDefaultRoots: true, watch: false, customSkillDirs: [...input.snapshotDirs, ...rootsInPackage].sort() };
  const rows = [...plugins];
  for (const [name, config] of [[PERSONA_MODULE, persona], [SKILL_FS_MODULE, skillConfig]] as const) {
    const index = rows.findIndex(row => row.name === name);
    const row = { id: name === PERSONA_MODULE ? 'persona' : 'skill-filesystem', name, config };
    if (index < 0) rows.push(row); else rows[index] = { ...rows[index], config };
  }
  if (!rows.some(row => row.name === TOOL_SKILL_MODULE)) rows.push({ id: 'tool-skill', name: TOOL_SKILL_MODULE });
  const definition: PresetDefinition = { id: presetId, name: input.definition.name, description: input.definition.description, plugins: rows };
  const text = JSON.stringify(definition);
  await mkdir(join(presetDir, '..'), { recursive: true });
  const staging = await mkdtemp(presetDir + '.staging-');
  try {
    await mkdir(join(staging, 'expert-package'), { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      const target = join(staging, 'expert-package', path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, content, 'utf8');
    }
    for (const [path, asset] of Object.entries(assets)) {
      const target = join(staging, 'expert-package', path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, assetBytes(path, asset));
      if (asset.executable) await chmod(target, 0o755);
    }
    await writeFile(join(staging, PRESET_FILE), text, { flag: 'wx' });
    const compositionDigest = sha256(text);
    await writeFile(join(staging, MANIFEST_FILE), JSON.stringify({ inputDigest, compositionDigest }), { flag: 'wx' });
    try { await rename(staging, presetDir); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      // Another publisher won; validate its immutable result instead of overwriting it.
      return await compileExpertPreset(ctx, input);
    }
    await registerExpertPreset(ctx, presetId, compositionDigest);
    return { presetId, presetDir, compositionDigest, created: true };
  } finally { await rm(staging, { recursive: true, force: true }); }
}

/** Render the persona/skill config we intend, used only for the idempotency digest. */
function renderComposition(input: CompileInput): string {
  return JSON.stringify({
    compiler: COMPILER_VERSION,
    prefix: compilePersonaPrefix(input.definition),
    suffix: compilePersonaSuffix(input.definition),
    snapshotDirs: [...input.snapshotDirs].sort(),
    packageDocuments: input.definition.packageDocuments ?? null,
    ...(input.definition.packageAssets ? { packageAssets: input.definition.packageAssets } : {}),
    teamMembers: input.teamMembers ?? null,
  });
}

export async function verifyPackageFiles(presetDir: string, files: Readonly<Record<string, string>>, assets: PackageAssets = {}): Promise<void> {
  validateResources(files, assets);
  if (!Object.keys(files).length && !Object.keys(assets).length) return;
  const root = join(presetDir, 'expert-package');
  const found: string[] = [];
  async function inventory(dir: string, prefix = ''): Promise<void> {
    for (const name of await readdir(dir)) {
      const path = prefix ? `${prefix}/${name}` : name;
      const info = await lstat(join(dir, name));
      if (info.isSymbolicLink()) throw new Error('experts/package-drift');
      if (info.isDirectory()) await inventory(join(dir, name), path);
      else if (info.isFile()) found.push(path);
      else throw new Error('experts/package-drift');
    }
  }
  await inventory(root);
  if (JSON.stringify(found.sort()) !== JSON.stringify([...Object.keys(files), ...Object.keys(assets)].sort())) throw new Error('experts/package-drift');
  for (const [path, text] of Object.entries(files)) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('experts/invalid-package-path');
    if (await readFile(join(presetDir, 'expert-package', path), 'utf8') !== text) throw new Error('experts/package-drift');
  }
  for (const [path, asset] of Object.entries(assets)) {
    const target = join(root, path);
    if (!(await readFile(target)).equals(assetBytes(path, asset)) || asset.executable && ((await lstat(target)).mode & 0o111) === 0) throw new Error('experts/package-drift');
  }
}

export function expertPersonaConfig(input: Pick<CompileInput, 'definition' | 'packageRoot' | 'teamMembers'>) {
  const authoredPersona = compilePersonaPrefix(input.definition);
  const prefix = [...(input.teamMembers ? [
    readFileSync(new URL('../../resources/skills/workdsh-expert-manager/runtime/team-lead.md', import.meta.url), 'utf8'),
    JSON.stringify({ members: input.teamMembers, workflows: input.definition.team?.workflows }),
    migrateLegacyTeamInstructions(authoredPersona),
  ] : [authoredPersona]), ...(input.packageRoot ? [`专家作品资源目录：${input.packageRoot}。bin 下的工具已随发布版本安装；用原生 bash 按此路径调用，仍遵守沙箱和审批。`] : [])].join('\n\n');
  const suffix = compilePersonaSuffix(input.definition);
  return { prefix, suffix, complete: false, includeRuntimeContext: true };
}
