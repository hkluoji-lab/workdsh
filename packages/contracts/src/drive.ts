import type { ActorContext, ResourceOwner } from './governance.js';

/** 归档来源：对话产物捕获自动判定，上传来源由用户动作产生。 */
export type DriveSource = 'ai-generated' | 'user-upload' | 'tool-output';
export type DriveFileKind = 'document' | 'image' | 'video' | 'audio' | 'archive' | 'other';
/** 删除采用归档（保留历史引用），不原地改写已发布对象。 */
export type DriveStatus = 'active' | 'archived';

export interface DriveSpace {
  readonly id: string;
  readonly title: string;
  readonly owner: ResourceOwner;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DriveNode {
  readonly id: string;
  readonly spaceId: string;
  readonly parentId?: string;
  readonly kind: 'folder' | 'file';
  readonly name: string;
  readonly fileId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DriveFile {
  readonly id: string;
  readonly spaceId: string;
  readonly nodeId: string;
  readonly kind: DriveFileKind;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly owner: ResourceOwner;
  readonly status: DriveStatus;
  readonly source: DriveSource;
  /** 来源会话（关联与筛选）。产物捕获时由事件携带。 */
  readonly sessionId?: string;
  readonly currentRevisionId: string;
  /** 内容寻址附件引用（不可变）。 */
  readonly attachmentId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DriveRevision {
  readonly id: string;
  readonly fileId: string;
  readonly number: number;
  readonly sha256: string;
  readonly byteLength: number;
  readonly attachmentId: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface DriveTreeEntry extends DriveNode {
  readonly file?: DriveFile;
  readonly revision?: DriveRevision;
}

export interface DriveSaveInput {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mediaType?: string;
  readonly source: DriveSource;
  readonly sessionId?: string;
  readonly parentId?: string;
  readonly operationId: string;
}

export interface DriveSearchFilters {
  readonly sources?: readonly DriveSource[];
  readonly kinds?: readonly DriveFileKind[];
  readonly sessionId?: string;
  readonly updatedAfter?: string;
  readonly updatedBefore?: string;
}

export interface DriveSearchHit {
  readonly fileId: string;
  readonly revisionId: string;
  readonly nodeId: string;
  readonly name: string;
  readonly kind: DriveFileKind;
  readonly source: DriveSource;
  readonly sessionId?: string;
  readonly updatedAt: string;
  readonly folderPath: string;
  readonly excerpt: string;
  readonly score: number;
}

/** 网盘中存在归档文件的会话引用（用于会话维度筛选）。 */
export interface DriveSessionRef {
  readonly sessionId: string;
  readonly updatedAt: string;
  readonly fileCount: number;
}

export interface DriveService {
  space(actor: ActorContext, signal?: AbortSignal): Promise<DriveSpace>;
  list(actor: ActorContext, parentId?: string, signal?: AbortSignal): Promise<readonly DriveTreeEntry[]>;
  createFolder(actor: ActorContext, name: string, parentId?: string, signal?: AbortSignal): Promise<DriveNode>;
  save(actor: ActorContext, input: DriveSaveInput, signal?: AbortSignal): Promise<DriveTreeEntry>;
  readBytes(actor: ActorContext, fileId: string, revisionId?: string, signal?: AbortSignal): Promise<Uint8Array>;
  search(actor: ActorContext, query: string, filters?: DriveSearchFilters, signal?: AbortSignal): Promise<readonly DriveSearchHit[]>;
  listSessions(actor: ActorContext, signal?: AbortSignal): Promise<readonly DriveSessionRef[]>;
  rename(actor: ActorContext, nodeId: string, name: string, signal?: AbortSignal): Promise<DriveNode>;
  move(actor: ActorContext, nodeId: string, parentId: string | undefined, signal?: AbortSignal): Promise<DriveNode>;
  archive(actor: ActorContext, nodeId: string, signal?: AbortSignal): Promise<void>;
}
