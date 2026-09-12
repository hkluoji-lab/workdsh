/** Office v1 public DTOs. No SDK, storage implementation or runtime values. */
import type { ActorContext } from "./governance.js";
export type OfficeMark = "bold" | "italic" | "underline" | "strike";
export type OfficeTextStyle = {
  fontFamily?: string;
  fontSize?: number; // points
  color?: string; // #rrggbb
  backgroundColor?: string;
};
export type OfficeParagraphStyle = {
  alignment?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  indent?: number; // 0–6 steps
};
export type OfficeList = {
  type: "bullet" | "ordered";
  depth: number; // 0–5
  start?: number;
  continuation?: boolean; // another paragraph in the same list item
};
export interface OfficeRunInput {
  text: string;
  marks: OfficeMark[];
  style?: OfficeTextStyle;
}
export interface OfficeRun extends OfficeRunInput {
  runId: string;
}
export interface OfficeTableCell {
  colspan: number;
  rowspan: number;
  colwidth?: number[];
  header?: boolean;
  paragraphs: OfficeParagraphInput[];
}
export interface OfficeTable { rows: { cells: OfficeTableCell[] }[] }
export interface OfficeImage {
  src: string; // bounded embedded PNG/JPEG, never remote URL
  alt?: string;
  width: number;
  height: number;
  alignment?: "left" | "center" | "right";
}
export interface OfficeParagraphInput {
  type: "paragraph" | "heading";
  level?: number;
  runs: OfficeRunInput[];
  style?: OfficeParagraphStyle;
  list?: OfficeList;
}
export interface OfficeBlockInput extends Omit<OfficeParagraphInput, "type"> {
  type: "paragraph" | "heading" | "table" | "image";
  table?: OfficeTable;
  image?: OfficeImage;
  level?: number;
  runs: OfficeRunInput[];
  style?: OfficeParagraphStyle;
  list?: OfficeList;
}
export interface OfficeBlock extends Omit<OfficeBlockInput, "runs"> {
  blockId: string;
  runs: OfficeRun[];
}
export interface OfficeDocumentState {
  modelVersion: 1;
  blockIds: string[];
  blocks: Record<string, OfficeBlock>;
}
export type OfficeOperation =
  | {
      op: "document.insertBlocks";
      afterBlockId: string | null;
      blocks: (OfficeBlockInput & { clientRef: string })[];
    }
  | {
      op: "document.replaceBlock";
      blockId: string;
      expectedText: string;
      block: OfficeBlockInput;
    }
  | { op: "document.removeBlock"; blockId: string; expectedText: string };
export type OfficeOpenInput =
  | { source: "new"; title: string; operationId: string }
  | { source: "existing"; documentId: string }
  | { source: "import"; title: string; operationId: string; blocks: OfficeBlockInput[] };
export interface OfficeEditInput {
  documentId: string;
  baseRevision: number;
  operationId: string;
  operations: OfficeOperation[];
}
export interface OfficeReceipt {
  operationId: string;
  revision: number;
  status: "committed";
  ids: Record<string, string>;
}
export interface OfficeSnapshot {
  documentId: string;
  kind: "document";
  title: string;
  revision: number;
  state: OfficeDocumentState;
  generation: string;
}
export interface OfficeContentService {
  open(
    actor: ActorContext,
    input: OfficeOpenInput|OfficePresentationOpenInput,
    signal?: AbortSignal,
  ): Promise<OfficeContentSnapshot>;
  read(
    actor: ActorContext,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<OfficeContentSnapshot>;
  edit(
    actor: ActorContext,
    input: OfficeEditInput|OfficePresentationEditInput,
    signal?: AbortSignal,
  ): Promise<OfficeReceipt>;
  present(
    actor: ActorContext,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<{
    requestId: string;
    documentId: string;
    revision: number;
    status: "requested";
  }>;
}

/** Adapter-owned native JSON, validated by the Office presentation provider. */
export interface OfficePresentationSnapshot extends Omit<OfficeSnapshot, "kind" | "state"> {
  kind: "presentation";
  state: {modelVersion: 1; deck: unknown; focusSlideId?: string};
}
export type OfficeContentSnapshot = OfficeSnapshot | OfficePresentationSnapshot;
export interface OfficePresentationOpenInput {
  source: "new";
  kind: "presentation";
  title: string;
  operationId: string;
  brief?: string;
}
export interface OfficePresentationEditInput extends Omit<OfficeEditInput, "operations"> {
  operations: unknown[]; // native adapter validates the exact operation union
}
