import type { ActorContext, ResourceOwner } from './governance.js';

export type LibraryAssetKind = 'markdown' | 'text' | 'pdf' | 'docx' | 'pptx';
export type LibraryConversionStatus = 'ready' | 'pending' | 'failed';

export interface LibrarySpace {
  readonly id: string;
  readonly title: string;
  readonly owner: ResourceOwner;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryNode {
  readonly id: string;
  readonly spaceId: string;
  readonly parentId?: string;
  readonly kind: 'folder' | 'asset';
  readonly name: string;
  readonly assetId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryAsset {
  readonly id: string;
  readonly spaceId: string;
  readonly nodeId: string;
  readonly kind: LibraryAssetKind;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly owner: ResourceOwner;
  readonly currentRevisionId: string;
  readonly source: 'upload' | 'task' | 'created';
  readonly sourceTaskId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryRevision {
  readonly id: string;
  readonly assetId: string;
  readonly number: number;
  readonly originalSha256: string;
  readonly contentSha256: string;
  readonly originalRelativePath: string;
  readonly contentRelativePath: string;
  readonly conversionStatus: LibraryConversionStatus;
  readonly conversionWarnings: readonly string[];
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface LibraryTreeEntry extends LibraryNode {
  readonly asset?: LibraryAsset;
  readonly revision?: LibraryRevision;
}

export interface LibraryImportInput {
  readonly parentId?: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mediaType?: string;
  readonly source?: LibraryAsset['source'];
  readonly sourceTaskId?: string;
  readonly operationId: string;
}

export interface LibrarySearchHit {
  readonly assetId: string;
  readonly revisionId: string;
  readonly nodeId: string;
  readonly name: string;
  readonly kind: LibraryAssetKind;
  readonly excerpt: string;
  readonly score: number;
}

export interface LibraryService {
  space(actor: ActorContext, signal?: AbortSignal): Promise<LibrarySpace>;
  list(actor: ActorContext, parentId?: string, signal?: AbortSignal): Promise<readonly LibraryTreeEntry[]>;
  createFolder(actor: ActorContext, name: string, parentId?: string, signal?: AbortSignal): Promise<LibraryNode>;
  importAsset(actor: ActorContext, input: LibraryImportInput, signal?: AbortSignal): Promise<LibraryTreeEntry>;
  readText(actor: ActorContext, assetId: string, revisionId?: string, signal?: AbortSignal): Promise<string>;
  readOriginal(actor: ActorContext, assetId: string, revisionId?: string, signal?: AbortSignal): Promise<Uint8Array>;
  search(actor: ActorContext, query: string, signal?: AbortSignal): Promise<readonly LibrarySearchHit[]>;
  rename(actor: ActorContext, nodeId: string, name: string, signal?: AbortSignal): Promise<LibraryNode>;
  move(actor: ActorContext, nodeId: string, parentId: string | undefined, signal?: AbortSignal): Promise<LibraryNode>;
  remove(actor: ActorContext, nodeId: string, signal?: AbortSignal): Promise<void>;
}

