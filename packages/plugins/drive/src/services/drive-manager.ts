import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Context, Service } from '@deepseek-ai/cordis';
import type { AttachmentStore, FileAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type {
  ActorContext, DriveFile, DriveFileKind, DriveNode, DriveRevision, DriveSaveInput, DriveSearchFilters, DriveSearchHit, DriveService, DriveSessionRef, DriveSource, DriveSpace, DriveTreeEntry, ResourceOwner,
} from 'workdsh-contracts';
import type { IdentityService } from 'workdsh-contracts';
import { driveDomainSpec, stateKey, type DriveState } from '../storage/domain.js';

declare module '@deepseek-ai/cordis' { interface Context { workdshDrive: DriveManager; workdshIdentity: IdentityService; } }

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024 * 1024;
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const now = (): string => new Date().toISOString();
const ATTACHMENT_ID = /^sha256:[0-9a-f]{64}$/;

/** 内容变更 = 新 revision，附件不可变。删除 = 归档（status:'archived'），历史引用保留。 */
export interface DriveReferenceInput {
  readonly name: string;
  readonly attachmentId: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly sessionId?: string;
  readonly operationId: string;
}

export interface DriveManagerOptions { readonly maxBytes?: number; readonly maxTotalBytes?: number; }

/** commitRef 落库所需的完整提交信息（与 DriveSaveInput 解耦，附件引用无需字节）。 */
interface DriveCommitInput {
  readonly name: string;
  readonly attachmentId: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly sessionId?: string;
  readonly operationId: string;
  readonly parentId?: string;
  readonly sha256: string;
  readonly inputSha256: string;
  readonly source: DriveSource;
}

const cleanName = (value: string): string => {
  const name = value.trim();
  if (!name || name.length > 256 || name === '.' || name === '..' || /[\/\\\u0000-\u001f]/.test(name)) throw new Error('drive/invalid-name');
  return name;
};

const extensionKinds: Readonly<Record<string, DriveFileKind>> = {
  '.md': 'document', '.markdown': 'document', '.txt': 'document', '.doc': 'document', '.docx': 'document', '.pdf': 'document',
  '.html': 'document', '.htm': 'document', '.csv': 'document', '.xlsx': 'document', '.xls': 'document', '.ppt': 'document', '.pptx': 'document',
  '.json': 'document', '.yaml': 'document', '.yml': 'document', '.log': 'document', '.rtf': 'document',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image', '.bmp': 'image', '.ico': 'image', '.avif': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.avi': 'video', '.mkv': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.flac': 'audio', '.aac': 'audio', '.ogg': 'audio',
  '.zip': 'archive', '.tar': 'archive', '.gz': 'archive', '.tgz': 'archive', '.7z': 'archive', '.rar': 'archive',
};

const kindFrom = (name: string, mediaType?: string): DriveFileKind => {
  const fromExtension = extensionKinds[extname(name).toLowerCase()];
  if (fromExtension) return fromExtension;
  if (mediaType?.startsWith('image/')) return 'image';
  if (mediaType?.startsWith('video/')) return 'video';
  if (mediaType?.startsWith('audio/')) return 'audio';
  return 'other';
};

export class DriveManager extends Service implements DriveService {
  static inject = ['storageDomain', 'attachments'];
  private table?: KvTable<string, DriveState>;
  private serial: Promise<unknown> = Promise.resolve();
  private readonly maxBytes: number;
  private readonly maxTotalBytes: number;

  constructor(ctx: Context, options: DriveManagerOptions = {}) {
    super(ctx, 'workdshDrive');
    this.maxBytes = options.maxBytes ?? MAX_BYTES;
    this.maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_BYTES;
  }

  async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(driveDomainSpec);
    this.table = domain.table('states');
    this.ctx.effect(() => () => domain.close(), 'workdshDrive.domainClose');
  }

  space(actor: ActorContext, signal?: AbortSignal): Promise<DriveSpace> {
    return this.enqueue(async () => (await this.ensureState(actor, signal)).space);
  }

  list(actor: ActorContext, parentId?: string, signal?: AbortSignal): Promise<readonly DriveTreeEntry[]> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal); this.assertFolder(state, parentId);
      return Object.values(state.nodes).filter((node) => node.parentId === parentId)
        .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, 'zh-CN') : a.kind === 'folder' ? -1 : 1)
        .map((node) => this.entry(state, node))
        .filter((entry) => entry.kind === 'folder' || entry.file?.status === 'active');
    });
  }

  createFolder(actor: ActorContext, name: string, parentId?: string, signal?: AbortSignal): Promise<DriveNode> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal); this.assertFolder(state, parentId); signal?.throwIfAborted();
      this.assertUniqueName(state, parentId, cleanName(name));
      const timestamp = now();
      const node: DriveNode = { id: randomUUID(), spaceId: state.space.id, ...(parentId ? { parentId } : {}), kind: 'folder', name: cleanName(name), createdAt: timestamp, updatedAt: timestamp };
      await this.states().put(this.key(actor), { ...state, nodes: { ...state.nodes, [node.id]: node }, space: { ...state.space, updatedAt: timestamp } });
      return node;
    });
  }

  save(actor: ActorContext, input: DriveSaveInput, signal?: AbortSignal): Promise<DriveTreeEntry> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal);
      const prior = state.receipts[input.operationId];
      const inputSha256 = sha256(`${input.parentId ?? ''}\u0000${input.name}\u0000${sha256(input.bytes)}`);
      if (prior) { if (prior.inputSha256 && prior.inputSha256 !== inputSha256) throw new Error('drive/operation-conflict'); return this.entry(state, this.requireNode(state, prior.nodeId)); }
      if (!input.operationId.trim() || input.operationId.length > 256) throw new Error('drive/invalid-operation');
      if (!input.bytes.byteLength || input.bytes.byteLength > this.maxBytes) throw new Error('drive/file-size');
      if (Object.values(state.revisions).reduce((total, revision) => total + revision.byteLength, 0) + input.bytes.byteLength > this.maxTotalBytes) throw new Error('drive/quota-exceeded');
      this.assertFolder(state, input.parentId); signal?.throwIfAborted();
      const name = this.uniqueName(state, input.parentId, cleanName(input.name));
      const ref = await this.ctx.attachments.saveFile({ data: input.bytes, name });
      return this.commitRef(state, actor, { name, attachmentId: ref.attachmentId, byteLength: ref.bytes, mediaType: input.mediaType?.trim() || 'application/octet-stream', sessionId: input.sessionId, operationId: input.operationId, parentId: input.parentId, sha256: sha256(input.bytes), inputSha256, source: input.source }, signal);
    });
  }

  /** 用户上传附件已由 Host 附件后端存储，只登记不可变引用，不复制字节。 */
  saveReference(actor: ActorContext, input: DriveReferenceInput, signal?: AbortSignal): Promise<DriveTreeEntry> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal);
      const prior = state.receipts[input.operationId];
      const inputSha256 = sha256(`${''}\u0000${input.name}\u0000${input.attachmentId}\u0000${input.byteLength}`);
      if (prior) { if (prior.inputSha256 && prior.inputSha256 !== inputSha256) throw new Error('drive/operation-conflict'); return this.entry(state, this.requireNode(state, prior.nodeId)); }
      if (!input.operationId.trim() || input.operationId.length > 256) throw new Error('drive/invalid-operation');
      if (!ATTACHMENT_ID.test(input.attachmentId)) throw new Error('drive/invalid-attachment');
      if (!input.byteLength || input.byteLength > this.maxBytes) throw new Error('drive/file-size');
      if (Object.values(state.revisions).reduce((total, revision) => total + revision.byteLength, 0) + input.byteLength > this.maxTotalBytes) throw new Error('drive/quota-exceeded');
      signal?.throwIfAborted();
      const name = this.uniqueName(state, undefined, cleanName(input.name));
      return this.commitRef(state, actor, { name, attachmentId: input.attachmentId, byteLength: input.byteLength, mediaType: input.mediaType.trim() || 'application/octet-stream', sessionId: input.sessionId, operationId: input.operationId, parentId: undefined, sha256: input.attachmentId.slice('sha256:'.length), inputSha256, source: 'user-upload' }, signal);
    });
  }

  readBytes(actor: ActorContext, fileId: string, revisionId?: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal); const file = state.files[fileId]; if (!file) throw new Error('drive/not-found');
      const revision = this.requireRevision(state, revisionId ?? file.currentRevisionId); const node = this.requireNode(state, file.nodeId);
      const ref: FileAttachmentRef = { attachmentId: revision.attachmentId as FileAttachmentRef['attachmentId'], name: node.name, bytes: revision.byteLength };
      const chunks: Uint8Array[] = [];
      for await (const chunk of this.ctx.attachments.readFileStream(ref, signal)) chunks.push(chunk);
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    });
  }

  search(actor: ActorContext, query: string, filters: DriveSearchFilters = {}, signal?: AbortSignal): Promise<readonly DriveSearchHit[]> {
    return this.enqueue(async () => {
      const needle = query.trim().toLocaleLowerCase();
      const state = await this.ensureState(actor, signal); const hits: DriveSearchHit[] = [];
      for (const file of Object.values(state.files)) {
        if (file.status !== 'active') continue;
        if (filters.kinds?.length && !filters.kinds.includes(file.kind)) continue;
        if (filters.sources?.length && !filters.sources.includes(file.source)) continue;
        if (filters.sessionId && file.sessionId !== filters.sessionId) continue;
        if (filters.updatedAfter && file.updatedAt < filters.updatedAfter) continue;
        if (filters.updatedBefore && file.updatedAt > filters.updatedBefore) continue;
        signal?.throwIfAborted(); const node = this.requireNode(state, file.nodeId);
        const name = node.name.toLocaleLowerCase();
        const score = needle ? name === needle ? 4 : name.startsWith(needle) ? 3 : name.includes(needle) ? 2 : 1 : 0;
        if (needle && score === 1) continue;
        const excerpt = `来源：${sourceLabel(file.source)}${file.sessionId ? ` · 会话 ${file.sessionId}` : ''}`;
        hits.push({ fileId: file.id, revisionId: file.currentRevisionId, nodeId: node.id, name: node.name, kind: file.kind, source: file.source, ...(file.sessionId ? { sessionId: file.sessionId } : {}), updatedAt: file.updatedAt, folderPath: this.folderPath(state, node.parentId), excerpt, score });
      }
      return hits.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'zh-CN')).slice(0, 50);
    });
  }

  listSessions(actor: ActorContext, signal?: AbortSignal): Promise<readonly DriveSessionRef[]> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal);
      const bySession = new Map<string, { updatedAt: string; count: number }>();
      for (const file of Object.values(state.files)) {
        if (file.status !== 'active' || !file.sessionId) continue;
        const current = bySession.get(file.sessionId);
        bySession.set(file.sessionId, { updatedAt: file.updatedAt > (current?.updatedAt ?? '') ? file.updatedAt : (current?.updatedAt ?? ''), count: (current?.count ?? 0) + 1 });
      }
      return [...bySession.entries()].map(([sessionId, value]) => ({ sessionId, updatedAt: value.updatedAt, fileCount: value.count }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
    });
  }

  rename(actor: ActorContext, nodeId: string, name: string, signal?: AbortSignal): Promise<DriveNode> {
    return this.changeNode(actor, nodeId, signal, (state, node) => { const value = cleanName(name); this.assertUniqueName(state, node.parentId, value, node.id); return { ...node, name: value, updatedAt: now() }; });
  }
  move(actor: ActorContext, nodeId: string, parentId: string | undefined, signal?: AbortSignal): Promise<DriveNode> {
    return this.changeNode(actor, nodeId, signal, (state, node) => {
      this.assertFolder(state, parentId); if (parentId === nodeId || this.descendants(state, nodeId).has(parentId ?? '')) throw new Error('drive/cycle');
      this.assertUniqueName(state, parentId, node.name, node.id); return { ...node, parentId, updatedAt: now() };
    });
  }

  archive(actor: ActorContext, nodeId: string, signal?: AbortSignal): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.ensureState(actor, signal); this.requireNode(state, nodeId); signal?.throwIfAborted();
      const ids = new Set([nodeId, ...this.descendants(state, nodeId)]);
      const files: DriveState['files'] = Object.fromEntries(Object.entries(state.files).map(([id, file]) => ids.has(file.nodeId) && file.status === 'active' ? [id, { ...file, status: 'archived' as const, updatedAt: now() }] : [id, file])) as DriveState['files'];
      await this.states().put(this.key(actor), { ...state, files, space: { ...state.space, updatedAt: now() } });
    });
  }

  private async commitRef(state: DriveState, actor: ActorContext, input: DriveCommitInput, _signal?: AbortSignal): Promise<DriveTreeEntry> {
      const timestamp = now(); const nodeId = randomUUID(); const fileId = randomUUID(); const revisionId = randomUUID();
      const node: DriveNode = { id: nodeId, spaceId: state.space.id, ...(input.parentId ? { parentId: input.parentId } : {}), kind: 'file', name: input.name, fileId, createdAt: timestamp, updatedAt: timestamp };
      const file = { id: fileId, spaceId: state.space.id, nodeId, kind: kindFrom(input.name, input.mediaType), mediaType: input.mediaType, byteLength: input.byteLength, owner: this.owner(actor), status: 'active' as const, source: input.source, ...(input.sessionId ? { sessionId: input.sessionId } : {}), currentRevisionId: revisionId, attachmentId: input.attachmentId, createdAt: timestamp, updatedAt: timestamp } satisfies DriveFile;
      const revision: DriveRevision = { id: revisionId, fileId, number: 1, sha256: input.sha256, byteLength: input.byteLength, attachmentId: input.attachmentId, createdBy: actor.principalId, createdAt: timestamp };
      const next: DriveState = { ...state, space: { ...state.space, updatedAt: timestamp }, nodes: { ...state.nodes, [nodeId]: node }, files: { ...state.files, [fileId]: file }, revisions: { ...state.revisions, [revisionId]: revision }, receipts: { ...state.receipts, [input.operationId]: { operationId: input.operationId, fileId, revisionId, nodeId, inputSha256: input.inputSha256 } } };
      await this.states().put(this.key(actor), next);
      return { ...node, file, revision };
  }

  private changeNode(actor: ActorContext, nodeId: string, signal: AbortSignal | undefined, mutate: (state: DriveState, node: DriveNode) => DriveNode): Promise<DriveNode> {
    return this.enqueue(async () => { const state = await this.ensureState(actor, signal); const next = mutate(state, this.requireNode(state, nodeId)); await this.states().put(this.key(actor), { ...state, nodes: { ...state.nodes, [nodeId]: next }, space: { ...state.space, updatedAt: now() } }); return next; });
  }
  private async ensureState(actor: ActorContext, signal?: AbortSignal): Promise<DriveState> {
    signal?.throwIfAborted(); this.validateActor(actor); const key = this.key(actor); const current = this.states().get(key); if (current) return current;
    const timestamp = now(); const state: DriveState = { schemaVersion: 1, space: { id: randomUUID(), title: '我的网盘', owner: this.owner(actor), createdAt: timestamp, updatedAt: timestamp }, nodes: {}, files: {}, revisions: {}, receipts: {} };
    await this.states().put(key, state); return state;
  }
  private entry(state: DriveState, node: DriveNode): DriveTreeEntry { const file = node.fileId ? state.files[node.fileId] : undefined; const revision = file ? state.revisions[file.currentRevisionId] : undefined; return { ...node, ...(file ? { file } : {}), ...(revision ? { revision } : {}) }; }
  private requireNode(state: DriveState, id: string): DriveNode { const node = state.nodes[id]; if (!node) throw new Error('drive/not-found'); return node; }
  private requireRevision(state: DriveState, id: string): DriveRevision { const revision = state.revisions[id]; if (!revision) throw new Error('drive/not-found'); return revision; }
  private assertFolder(state: DriveState, id?: string): void { if (id && this.requireNode(state, id).kind !== 'folder') throw new Error('drive/not-folder'); }
  private assertUniqueName(state: DriveState, parentId: string | undefined, name: string, except?: string): void { if (Object.values(state.nodes).some((node) => node.id !== except && node.parentId === parentId && node.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('drive/name-conflict'); }
  private uniqueName(state: DriveState, parentId: string | undefined, name: string): string {
    if (!Object.values(state.nodes).some((node) => node.parentId === parentId && node.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return name;
    const extension = extname(name); const stem = extension ? name.slice(0, -extension.length) : name;
    for (let index = 2; index < 1000; index += 1) { const candidate = `${stem} (${index})${extension}`; if (!Object.values(state.nodes).some((node) => node.parentId === parentId && node.name.toLocaleLowerCase() === candidate.toLocaleLowerCase())) return candidate; }
    throw new Error('drive/name-conflict');
  }
  private descendants(state: DriveState, id: string): Set<string> { const result = new Set<string>(); const queue = [id]; while (queue.length) { const parent = queue.shift()!; for (const node of Object.values(state.nodes)) if (node.parentId === parent && !result.has(node.id)) { result.add(node.id); queue.push(node.id); } } return result; }
  private folderPath(state: DriveState, parentId?: string): string { const parts: string[] = []; let current = parentId; const seen = new Set<string>(); while (current && !seen.has(current)) { seen.add(current); const node = state.nodes[current]; if (!node) break; parts.unshift(node.name); current = node.parentId; } return parts.length ? `我的网盘 / ${parts.join(' / ')}` : '我的网盘'; }
  private owner(actor: ActorContext): ResourceOwner & { scope: 'personal' } { return { organizationId: actor.organizationId, ownerPrincipalId: actor.principalId, scope: 'personal' }; }
  private key(actor: ActorContext): string { return stateKey(actor.organizationId, actor.principalId); }
  private validateActor(actor: ActorContext): void { if (!actor.organizationId?.trim() || !actor.principalId?.trim() || !actor.requestId?.trim() || !actor.resolvedBy?.trim()) throw new Error('drive/invalid-actor'); }
  private states(): KvTable<string, DriveState> { if (!this.table) throw new Error('drive/unavailable'); return this.table; }
  private enqueue<T>(run: () => Promise<T>): Promise<T> { const next = this.serial.then(run, run); this.serial = next.catch(() => undefined); return next; }
}

const sourceLabel = (source: DriveFile['source']): string => ({ 'ai-generated': 'AI 生成', 'user-upload': '用户上传', 'tool-output': '工具输出' }[source] ?? source);
