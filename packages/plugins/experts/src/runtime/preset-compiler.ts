import { assetBytes, validateResources, type PackageAssets } from '../authoring/package-resources.js';
import { mkdir, readFile, writeFile, readdir, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent-presets';
import {
  COMPOSITION_FILE,
  METADATA_FILE,
  renderPresetMetadata,
  writableRoot,
} from '@deepseek-ai/dsh-agent-presets';
import { YAMLMap, YAMLSeq, parseDocument } from 'yaml';
import type { ExpertDefinition, ExpertRevisionRef } from 'workdsh-contracts';
import { readFileSync } from 'node:fs';
import { compilePersonaPrefix, compilePersonaSuffix } from '../domain/definition.js';
import { sha256, shortDigest } from '../domain/digest.js';

/**
 * Expert preset compiler (G01, ADR-0017 #4, HLD 5.1).
 *
 * An expert is a READ-ONLY preset. The compiler never accepts user-supplied
 * composition text, npm package names, Cordis services, arbitrary config code or
 * absolute directories: it copies a known-working base preset through the official
 * authoring write (`agentPresets.copy`, a whole-directory copy), then rewrites only
 * two rows of the copied composition from validated definition fields —
 *   - the `@deepseek-ai/dsh-persona` row: preset-scope role, `complete:false` and
 *     `includeRuntimeContext:true` so native tool guidance and runtime context survive;
 *   - the `@deepseek-ai/dsh-skill-filesystem` row: `includeDefaultRoots:true` keeps the
 *     global dynamic pool, `customSkillDirs` mounts the frozen snapshots, `watch:false`
 *     freezes them.
 * The rest of the document (comments, `!!js` gates, every other row) is preserved by
 * mutating the parsed YAML Document in place.
 */

export const COMPILER_VERSION = 'workdsh-expert-compiler/0.1';

const PERSONA_MODULE = '@deepseek-ai/dsh-persona';
const SKILL_FS_MODULE = '@deepseek-ai/dsh-skill-filesystem';
const TOOL_SKILL_MODULE = '@deepseek-ai/dsh-tool-skill';

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

/**
 * Compile (or reuse) the immutable preset directory for one expert revision.
 * Idempotent: an existing directory whose composition digest matches is reused.
 */
export async function compileExpertPreset(ctx: Context, input: CompileInput): Promise<CompiledPreset> {
  const agentPresets = ctx.agentPresets;
  if (!agentPresets.authorable) {
    throw Object.assign(new Error('此部署未配置可写的 preset 根，无法发布专家。'), { code: 'experts/unavailable' });
  }
  const roots = agentPresets.roots;
  const presetId = presetIdFor(input);
  const writable = writableRoot(roots, presetId);
  const presetDir = join(writable, presetId);
  const compositionPath = join(presetDir, COMPOSITION_FILE);
  const manifestPath = join(presetDir, 'workdsh-expert-manifest.json');
  const files = input.definition.packageDocuments ?? {};
  const assets = input.definition.packageAssets ?? {};
  validateResources(files, assets);
  const rootsInPackage = Object.keys(files).filter(path => /^skills\/[a-z][a-z0-9-]+\/SKILL\.md$/.test(path)).map(path => join(presetDir, 'expert-package', path.slice(0, -9)));

  const expected = renderComposition(input);
  const expectedDigest = sha256(expected);

  // Idempotent reuse: a prior publish of the same content already produced this directory.
  try {
    const existing = await readFile(compositionPath, 'utf8');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { inputDigest?: string; compositionDigest?: string };
    if (manifest.inputDigest !== expectedDigest || manifest.compositionDigest !== sha256(existing)) {
      throw Object.assign(new Error('已发布专家 preset 已变化，拒绝覆盖。'), { code: 'experts/preset-broken' });
    }
    await verifyPackageFiles(presetDir, files, assets);
    return { presetId, presetDir, compositionDigest: sha256(existing), created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  // Official authoring write: whole-directory copy of a known-working base preset.
  let exists = false;
  try {
    await agentPresets.resolve(presetId);
    exists = true;
  } catch {
    exists = false;
  }
  if (!exists) {
    await agentPresets.copy(input.basePresetId, presetId, input.definition.name);
  } else {
    throw Object.assign(new Error('已有专家 preset 缺少可验证清单，拒绝覆盖。'), { code: 'experts/preset-broken' });
  }
  await mkdir(presetDir, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('experts/invalid-package-path');
    const target = join(presetDir, 'expert-package', path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, text, 'utf8');
  }

  for (const [path, asset] of Object.entries(assets)) {
    const target = join(presetDir, 'expert-package', path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, assetBytes(path, asset));
    if (asset.executable) await chmod(target, 0o755);
  }

  // Rewrite only the persona and skill-filesystem rows; preserve everything else.
  const baseText = await readFile(compositionPath, 'utf8');
  const composed = rewriteComposition(baseText, { ...input, packageRoot: Object.keys(files).length ? join(presetDir, 'expert-package') : undefined, snapshotDirs: [...input.snapshotDirs, ...rootsInPackage] });
  await writeFile(compositionPath, composed, 'utf8');
  await writeFile(
    join(presetDir, METADATA_FILE),
    renderPresetMetadata({ name: input.definition.name, description: input.definition.description }) ?? '',
    'utf8',
  );

  // The copy must still read as a healthy composition before we record it.
  await agentPresets.read(presetId);
  await writeFile(manifestPath, JSON.stringify({ inputDigest: expectedDigest, compositionDigest: sha256(composed) }), 'utf8');
  return { presetId, presetDir, compositionDigest: sha256(composed), created: true };
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

/**
 * Mutate the copied composition in place: set the persona row config and the
 * skill-filesystem row config, inserting them when the base somehow lacks them.
 */
function rewriteComposition(baseText: string, input: CompileInput): string {
  const doc = parseDocument(baseText);
  const seq = doc.contents as YAMLSeq | null;
  if (!seq || !(seq instanceof YAMLSeq)) {
    throw Object.assign(new Error('基础 preset 组合不是插件行列表，无法编译专家。'), { code: 'experts/preset-broken' });
  }

  const prefix = [compilePersonaPrefix(input.definition), ...(input.packageRoot ? [`专家作品资源目录：${input.packageRoot}。bin 下的工具已随发布版本安装；用原生 bash 按此路径调用，仍遵守沙箱和审批。`] : []), ...(input.teamMembers ? [
    readFileSync(new URL('../../resources/expert-manager/runtime/team-lead.md', import.meta.url), 'utf8'),
    JSON.stringify({ members: input.teamMembers, workflows: input.definition.team?.workflows }),
  ] : [])].join('\n\n');
  const suffix = compilePersonaSuffix(input.definition);
  const personaConfig = doc.createNode({ prefix, suffix, complete: false, includeRuntimeContext: true });
  const skillConfig = doc.createNode({
    includeDefaultRoots: true,
    watch: false,
    customSkillDirs: [...input.snapshotDirs].sort(),
  });

  let sawPersona = false;
  let sawSkillFs = false;
  let sawToolSkill = false;
  for (const item of seq.items) {
    if (!(item instanceof YAMLMap)) continue;
    const name = item.get('name');
    if (name === PERSONA_MODULE) {
      item.set('config', personaConfig);
      sawPersona = true;
    } else if (name === SKILL_FS_MODULE) {
      item.set('config', skillConfig);
      sawSkillFs = true;
    } else if (name === TOOL_SKILL_MODULE) {
      sawToolSkill = true;
    }
  }

  if (!sawPersona) {
    seq.items.push(doc.createNode({ id: `persona-${randomUUID().slice(0, 8)}`, name: PERSONA_MODULE, config: { prefix, suffix, complete: false, includeRuntimeContext: true } }) as unknown as YAMLMap);
  }
  if (!sawSkillFs) {
    seq.items.push(doc.createNode({ id: `skill-filesystem-${randomUUID().slice(0, 8)}`, name: SKILL_FS_MODULE, config: { includeDefaultRoots: true, watch: false, customSkillDirs: [...input.snapshotDirs].sort() } }) as unknown as YAMLMap);
  }
  if (!sawToolSkill) {
    seq.items.push(doc.createNode({ id: `tool-skill-${randomUUID().slice(0, 8)}`, name: TOOL_SKILL_MODULE }) as unknown as YAMLMap);
  }

  return doc.toString();
}
