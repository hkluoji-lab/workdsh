import { z } from "zod";
import type {
  OfficeBlock,
  OfficeBlockInput,
  OfficeDocumentState,
  OfficeOperation,
} from "workdsh-contracts/office";

export const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
export const mark = z.enum(["bold", "italic", "underline", "strike"]);
export const textStyle = z
  .object({
    fontFamily: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9\u3400-\u9fff -]+$/)
      .optional(),
    fontSize: z.number().min(6).max(96).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .strict();
export const paragraphStyle = z
  .object({
    alignment: z.enum(["left", "center", "right", "justify"]).optional(),
    lineHeight: z.number().min(1).max(3).optional(),
    indent: z.number().int().min(0).max(6).optional(),
  })
  .strict();
export const listStyle = z
  .object({
    type: z.enum(["bullet", "ordered"]),
    depth: z.number().int().min(0).max(5),
    start: z.number().int().min(1).max(9999).optional(),
    continuation: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.type === "ordered" || v.start === undefined,
    "Only ordered lists have a start number",
  );
export const runInput = z
  .object({
    text: z.string().max(20000),
    marks: z.array(mark).max(4),
    style: textStyle.optional(),
  })
  .strict();
export const blockInput = z
  .object({
    type: z.enum(["paragraph", "heading"]),
    level: z.number().int().min(1).max(6).optional(),
    runs: z.array(runInput).max(1000),
    style: paragraphStyle.optional(),
    list: listStyle.optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.type === "heading" ? b.level !== undefined : b.level === undefined,
    "Only headings have a level",
  );
export const operation = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("document.insertBlocks"),
      afterBlockId: id.nullable(),
      blocks: z
        .array(blockInput.safeExtend({ clientRef: id }))
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      op: z.literal("document.replaceBlock"),
      blockId: id,
      expectedText: z.string().max(20000),
      block: blockInput,
    })
    .strict(),
  z
    .object({
      op: z.literal("document.removeBlock"),
      blockId: id,
      expectedText: z.string().max(20000),
    })
    .strict(),
]);
export const editInput = z
  .object({
    documentId: id,
    baseRevision: z.number().int().nonnegative(),
    operationId: id,
    operations: z.array(operation).min(1).max(100),
  })
  .strict();
export const openInput = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("new"),
      title: z.string().trim().min(1).max(160),
      operationId: id,
    })
    .strict(),
  z.object({ source: z.literal("existing"), documentId: id }).strict(),
  z.object({source: z.literal("import"), title: z.string().trim().min(1).max(160), operationId: id, blocks: z.array(blockInput).min(1).max(2000)}).strict(),
]);
export class OfficeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  value: unknown,
  code: string,
  message: string,
): asserts value {
  if (!value) throw new OfficeError(code, message);
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new OfficeError(
      "INVALID_INPUT",
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
        .slice(0, 700),
    );
  return result.data;
}
export const textOf = (block: OfficeBlockInput) =>
  block.runs.map((r) => r.text).join("");

/** Pure bounded block reducer. A failed operation cannot mutate the stored state. */
export function applyOperations(
  state: OfficeDocumentState,
  operations: OfficeOperation[],
  allocate: () => string,
) {
  const next = structuredClone(state);
  const ids: Record<string, string> = {};
  const resolved = (key: string) => ids[key] ?? key;
  function materialize(
    input: OfficeBlockInput,
    blockId: string,
    previous?: OfficeBlock,
  ): OfficeBlock {
    const reusable = [...(previous?.runs ?? [])];
    const runs = input.runs
      .filter((r) => r.text.length)
      .map((r) => {
        const marks = [...new Set(r.marks)].sort();
        const index = reusable.findIndex(
          (old) =>
            old.text === r.text &&
            JSON.stringify(old.marks) === JSON.stringify(marks) &&
            JSON.stringify(old.style ?? {}) === JSON.stringify(r.style ?? {}),
        );
        const runId =
          index >= 0 ? reusable.splice(index, 1)[0]!.runId : allocate();
        return {
          runId,
          text: r.text,
          marks,
          ...(r.style && Object.keys(r.style).length
            ? { style: { ...r.style } }
            : {}),
        };
      });
    ensure(
      textOf(input).length <= 20000,
      "LIMIT_REACHED",
      "每段最多 20000 个 UTF-16 单元。",
    );
    return {
      blockId,
      type: input.type,
      ...(input.level ? { level: input.level } : {}),
      runs,
      ...(input.style && Object.keys(input.style).length
        ? { style: { ...input.style } }
        : {}),
      ...(input.list ? { list: { ...input.list } } : {}),
    };
  }
  for (const op of operations) {
    if (op.op === "document.insertBlocks") {
      const after =
        op.afterBlockId === null
          ? -1
          : next.blockIds.indexOf(resolved(op.afterBlockId));
      ensure(
        op.afterBlockId === null || after >= 0,
        "TARGET_NOT_FOUND",
        "插入位置已不存在。",
      );
      const added = op.blocks.map((b) => {
        ensure(
          !Object.hasOwn(ids, b.clientRef) &&
            !Object.hasOwn(next.blocks, b.clientRef),
          "INVALID_INPUT",
          "clientRef 必须唯一。",
        );
        const blockId = allocate();
        ids[b.clientRef] = blockId;
        next.blocks[blockId] = materialize(b, blockId);
        return blockId;
      });
      next.blockIds.splice(after + 1, 0, ...added);
    } else {
      const key = resolved(op.blockId),
        before = next.blocks[key];
      ensure(before, "TARGET_NOT_FOUND", "目标段落已不存在。");
      ensure(
        textOf(before) === op.expectedText,
        "PRECONDITION_FAILED",
        "段落内容已变化，请重新读取。",
      );
      if (op.op === "document.removeBlock") {
        delete next.blocks[key];
        next.blockIds = next.blockIds.filter((b) => b !== key);
      } else next.blocks[key] = materialize(op.block, key, before);
    }
  }
  const outline: { type: string; start?: number }[] = [];
  for (const key of next.blockIds) {
    const list = next.blocks[key]!.list;
    if (!list) {
      outline.length = 0;
      continue;
    }
    ensure(
      list.continuation || next.blocks[key]!.type === "paragraph",
      "INVALID_INPUT",
      "列表项须以正文段落开始。",
    );
    ensure(
      list.depth <= outline.length,
      "INVALID_INPUT",
      "列表层级不能跳级，首项须从第 0 级开始。",
    );
    outline.length = Math.min(outline.length, list.depth + 1);
    const parent = outline[list.depth];
    ensure(
      !list.continuation ||
        (parent && parent.type === list.type && parent.start === list.start),
      "INVALID_INPUT",
      "列表续段必须属于已有列表项。",
    );
    outline[list.depth] = { type: list.type, start: list.start };
  }
  ensure(
    next.blockIds.length > 0 && next.blockIds.length <= 2000,
    "LIMIT_REACHED",
    "文档须保留 1–2000 个段落。",
  );
  ensure(
    JSON.stringify(next).length <= 2 * 1024 * 1024,
    "LIMIT_REACHED",
    "文档内容达到当前 2 MiB 限额。",
  );
  return { state: next, ids };
}

export const capabilities = {
  protocolVersion: 1,
  kind: "document",
  modelVersion: 1,
  operations: [
    "document.insertBlocks",
    "document.replaceBlock",
    "document.removeBlock",
  ],
  blocks: ["paragraph", "heading"],
  marks: ["bold", "italic", "underline", "strike"],
  textStyle: ["fontFamily", "fontSize", "color", "backgroundColor"],
  paragraphStyle: ["alignment", "lineHeight", "indent"],
  lists: { types: ["bullet", "ordered"], maxDepth: 5, continuation: true },
  import: false,
  export: {formats: ["docx"], requires: ["bash", "present"], frozenRevision: true, maxBytes: 1048576},
  browserRequiredForEdit: false,
  limits: {
    batchBytes: 131072,
    operations: 100,
    blocks: 2000,
    contentBytes: 2097152,
    receipts: 10000,
    recordBytes: 33554432,
  },
  humanEditing:
    "Lease required for UI writes. HUMAN_EDITING means wait for the user; do not poll with repeated model calls.",
  delivery:
    "Each successful batch is durable; content_present requests a Session-bound view. Not a DOCX file or a byte-by-byte token stream.",
} as const;
