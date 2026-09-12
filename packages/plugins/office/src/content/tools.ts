import type { OfficeSnapshot } from "workdsh-contracts/office";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type ToolRunContext } from "@deepseek-ai/dsh-tools";
import { capabilities, editInput, openInput, parse } from "./model.js";
import { exportAndPresent } from "./export.js";
import { registerAuthoringGuide } from "./authoring.js";
export const name = "workdsh-office-tools";
export const inject = [
  "tools",
  "systemPrompt",
  "workdshOfficeContent",
  "workdshIdentity",
];
const string = { type: "string", required: true } as const;
const textStyleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fontFamily: {
      type: "string",
      description:
        "Font family, e.g. 宋体 or Calibri; letters, Chinese, spaces and hyphens only.",
    },
    fontSize: { type: "number", description: "Font size in points, 6–96." },
    color: { type: "string", description: "#rrggbb" },
    backgroundColor: { type: "string", description: "#rrggbb" },
  },
} as const;
const paragraphStyleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    alignment: { type: "string", enum: ["left", "center", "right", "justify"] },
    lineHeight: {
      type: "number",
      description: "Line spacing multiplier, 1–3.",
    },
    indent: { type: "integer", description: "Indent steps, 0–6." },
  },
} as const;
const listSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["bullet", "ordered"], required: true },
    depth: {
      type: "integer",
      description: "0–5; first item depth 0, no depth jumps.",
      required: true,
    },
    start: {
      type: "integer",
      description: "Ordered lists only; start number 1–9999.",
    },
    continuation: {
      type: "boolean",
      description:
        "True for another paragraph of the existing item at this depth.",
    },
  },
} as const;
const run = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: string,
    style: textStyleSchema,
    marks: {
      type: "array",
      required: true,
      items: {
        type: "string",
        enum: ["bold", "italic", "underline", "strike"],
      },
    },
  },
} as const;
const blockProperties = {
  type: { type: "string", enum: ["paragraph", "heading"], required: true },
  level: {
    type: "integer",
    description: "Required for heading (1–6); omit for paragraph.",
  },
  runs: { type: "array", items: run, required: true },
  style: paragraphStyleSchema,
  list: listSchema,
} as const;
const block = {
  type: "object",
  additionalProperties: false,
  properties: blockProperties,
} as const;
const operation = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        op: { type: "string", const: "document.insertBlocks", required: true },
        afterBlockId: {
          oneOf: [{ type: "string" }, { type: "null" }],
          required: true,
        },
        blocks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { ...blockProperties, clientRef: string },
          },
          required: true,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        op: { type: "string", const: "document.replaceBlock", required: true },
        blockId: string,
        expectedText: string,
        block: { ...block, required: true },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        op: { type: "string", const: "document.removeBlock", required: true },
        blockId: string,
        expectedText: string,
      },
    },
  ],
} as const;
const snapshot = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentId: string,
    kind: { type: "string", const: "document", required: true },
    title: string,
    revision: { type: "integer", required: true },
    generation: string,
    state: {
      type: "object",
      required: true,
      additionalProperties: false,
      properties: {
        modelVersion: { type: "integer", const: 1, required: true },
        blockIds: { type: "array", items: { type: "string" }, required: true },
        blocks: {
          type: "object",
          additionalProperties: true,
          required: true,
          description:
            "Dictionary keyed by blockId; block has type, optional heading level and runs with runId/text/marks.",
        },
      },
    },
  },
} as const;
const render = (_args: unknown, value: unknown) => [
  { type: "text" as const, text: JSON.stringify(value) },
];
async function actor(ctx: Context, exec: ToolRunContext) {
  exec.signal.throwIfAborted();
  return ctx.workdshIdentity.resolve(
    exec.agent ? { sessionId: String(exec.agent.id) } : undefined,
    exec.signal,
  );
}
function wire(s: OfficeSnapshot) {
  return {
    ...s,
    state: {
      ...s.state,
      blocks: Object.fromEntries(
        s.state.blockIds.map((id) => {
          const b = s.state.blocks[id]!;
          return [id, { ...b, runs: b.runs.map((r) => ({ ...r })) }];
        }),
      ),
    },
  };
}
export function apply(ctx: Context) {
  for (const toolName of [
    "content_open",
    "content_read",
    "content_capabilities",
    "content_edit",
    "content_present",
    "content_export",
  ]) {
    if (ctx.tools.get(toolName))
      throw new Error(`Office tool name already registered: ${toolName}`);
  }
  registerAuthoringGuide(ctx);
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_export",
      description:
        "Export a committed document as real DOCX through the official present card. Use baseRevision from content_read. Same document/revision/content has a stable path; uncertain-write retries check existing bytes and never overwrite conflicts. Uses official bash approval and requires bash/present in this Session. On delivery-only failure, check the card and retry present for the returned path. The live editor remains editable. No editable tables or lossless DOCX import.",
      parameters: { documentId: string, baseRevision: {type: "integer", description: "Latest revision from content_read. Reuse on uncertain-write retries; rejects changed document revisions."} },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            documentId: string,
            revision: { type: "integer", required: true },
            path: string,
            status: { type: "string", const: "presented", required: true },
          },
        },
        render,
      },
      execute: async (args, exec) =>
        exportAndPresent(
          ctx,
          exec,
          await ctx.workdshOfficeContent.read(
            await actor(ctx, exec),
            args.documentId,
            exec.signal,
          ),
          args.baseRevision,
        ),
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_open",
      description:
        "Create or reopen a document for writing a report, proposal or other document. Automatically opens the live right-hand editor immediately; no content_present call is needed. New documents start with one empty paragraph. Use content_edit in small meaningful batches as you write so the user sees progress in the document, rather than waiting for the whole report. Reuse operationId on retries. This is not DOCX import.",
      parameters: {
        input: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                source: { type: "string", const: "new", required: true },
                title: string,
                operationId: string,
              },
            },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                source: { type: "string", const: "existing", required: true },
                documentId: string,
              },
            },
          ],
          required: true,
        },
      },
      output: { schema: snapshot, render },
      execute: async (args, exec) =>
        wire(
          await ctx.workdshOfficeContent.open(
            await actor(ctx, exec),
            parse(openInput, args.input),
            exec.signal,
          ),
        ),
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_read",
      description:
        "Read the latest committed document, revision and stable block/run IDs. Re-read after a user edit or REVISION_CONFLICT; never guess revision or text.",
      parameters: { documentId: string },
      output: { schema: snapshot, render },
      execute: async (args, exec) =>
        wire(
          await ctx.workdshOfficeContent.read(
            await actor(ctx, exec),
            args.documentId,
            exec.signal,
          ),
        ),
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_capabilities",
      description:
        "Discover implemented operations and limits. Currently native document paragraphs/headings; DOCX export through content_export is available when official bash/present tools are mounted; DOCX import and other editor kinds remain unavailable.",
      parameters: {},
      output: {
        schema: {
          type: "object",
          additionalProperties: true,
          description:
            "Versioned capability descriptor: operations, marks, limits, import/export availability.",
        },
        render,
      },
      execute: async (_args, exec) => {
        await actor(ctx, exec);
        return JSON.parse(JSON.stringify(capabilities));
      },
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_edit",
      description:
        "Atomically commit at most 100 typed operations / 128 KiB. Each batch is visible without waiting for the whole answer. Use baseRevision from content_read and a new operationId. Retry uncertain delivery with exactly the same payload and ID. HUMAN_EDITING: user holds the editor; stop writing and wait, do not repeatedly call. A committed receipt is durable content, not an exported Office file.",
      parameters: {
        input: {
          type: "object",
          additionalProperties: false,
          required: true,
          properties: {
            documentId: string,
            baseRevision: { type: "integer", required: true },
            operationId: string,
            operations: { type: "array", required: true, items: operation },
          },
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            operationId: string,
            revision: { type: "integer", required: true },
            status: { type: "string", const: "committed", required: true },
            ids: {
              type: "object",
              additionalProperties: true,
              required: true,
              description: "clientRef to assigned blockId mapping",
            },
          },
        },
        render,
      },
      execute: async (args, exec) =>
        ctx.workdshOfficeContent.edit(
          await actor(ctx, exec),
          parse(editInput, args.input),
          exec.signal,
        ),
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_present",
      description:
        "Request this document in the calling Session right sidebar. Call once, then continue edit batches. status=requested does not claim a browser displayed it. Never switches another Session.",
      parameters: { documentId: string },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            requestId: string,
            documentId: string,
            revision: { type: "integer", required: true },
            status: { type: "string", const: "requested", required: true },
          },
        },
        render,
      },
      execute: async (args, exec) =>
        ctx.workdshOfficeContent.present(
          await actor(ctx, exec),
          args.documentId,
          exec.signal,
        ),
    }),
  ));
}
