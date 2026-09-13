import type { OfficeContentSnapshot } from "workdsh-contracts/office";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type ToolRunContext } from "@deepseek-ai/dsh-tools";
import { capabilities, openInput, contentOpenInput, parse } from "./model.js";
import { exportAndPresent } from "./export.js";
import { registerAuthoringGuide } from "./authoring.js";
export const name = "workdsh-office-tools";
export const inject = [
  "tools",
  "systemPrompt",
  "workdshOfficeContent",
  "workdshIdentity",
];
const pdfGeometry={id:{type:"string",required:true},x:{type:"number",required:true},y:{type:"number",required:true},width:{type:"number",required:true},height:{type:"number",required:true}} as const;
const pdfPageSchema={type:"object",additionalProperties:false,properties:{id:{type:"string",required:true},width:{type:"number",required:true},height:{type:"number",required:true},background:{type:"string",required:true},elements:{type:"array",required:true,items:{oneOf:[{type:"object",additionalProperties:false,properties:{...pdfGeometry,type:{type:"string",const:"text",required:true},text:{type:"string",required:true},fontSize:{type:"number",required:true},lineHeight:{type:"number",required:true},color:{type:"string",required:true}}},{type:"object",additionalProperties:false,properties:{...pdfGeometry,type:{type:"string",const:"rectangle",required:true},fill:{type:"string",required:true}}}]}}}} as const;
const pdfOperation=[
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"pdf.insertPage",required:true},afterPageId:{oneOf:[{type:"string"},{type:"null"}],required:true},page:{...pdfPageSchema,required:true}}},
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"pdf.updatePage",required:true},pageId:{type:"string",required:true},page:{...pdfPageSchema,required:true}}},
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"pdf.removePage",required:true},pageId:{type:"string",required:true}}},
] as const;
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
  type: { type: "string", enum: ["paragraph", "heading", "table", "image"], required: true },
  level: {
    type: "integer",
    description: "Required for heading (1–6); omit for paragraph.",
  },
  runs: { type: "array", items: run, required: true },
  style: paragraphStyleSchema,
  list: listSchema,
} as const;
const paragraphBlock = {type:"object",additionalProperties:false,properties:{...blockProperties,type:{type:"string",enum:["paragraph","heading"],required:true}}} as const;
const extendedBlockProperties = {...blockProperties,
  table:{type:"object",additionalProperties:false,properties:{rows:{type:"array",required:true,items:{type:"object",additionalProperties:false,properties:{cells:{type:"array",required:true,items:{type:"object",additionalProperties:false,properties:{colspan:{type:"integer",required:true},rowspan:{type:"integer",required:true},header:{type:"boolean"},colwidth:{type:"array",items:{type:"integer"}},paragraphs:{type:"array",required:true,items:paragraphBlock}}}}}}}}},
  image:{type:"object",additionalProperties:false,properties:{src:{type:"string",required:true,description:"Use office-image:sourceDocumentId:blockId:hash returned by content_read to copy an image from an authorized Office document. New image: embedded PNG/JPEG data URL, up to 512 KiB. Remote URLs unsupported."},alt:{type:"string"},width:{type:"number",required:true},height:{type:"number",required:true},alignment:{type:"string",enum:["left","center","right"]}}},
} as const;
const block = {
  type: "object",
  additionalProperties: false,
  properties: extendedBlockProperties,
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
            properties: { ...extendedBlockProperties, clientRef: string },
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
  type:"object",additionalProperties:false,
  properties:{documentId:string,kind:{type:"string",enum:["document","presentation","spreadsheet","html","pdf"],required:true},title:string,revision:{type:"integer",required:true},generation:string,
    state:{type:"object",additionalProperties:true,required:true,description:"document: modelVersion/blockIds/blocks; presentation: modelVersion/deck, pptx-viewer-core native slides and PPTX bytes with stable slide IDs and elements."}},
} as const;
const sheetCell={type:"object",additionalProperties:false,properties:{value:{oneOf:[{type:"string"},{type:"number"},{type:"boolean"},{type:"null"}]},formula:{type:"string",description:"= prefixed formula; omit value"}}} as const;
const sheetOperation={oneOf:[
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"spreadsheet.setCells",required:true},sheetId:string,cells:{type:"array",required:true,items:{type:"object",additionalProperties:false,properties:{address:{...string,description:"A1 address, within A1:CV1000"},cell:{...sheetCell,required:true}}}}}},
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"spreadsheet.clearCells",required:true},sheetId:string,addresses:{type:"array",required:true,items:{type:"string"}}}},
 ...["spreadsheet.addSheet","spreadsheet.renameSheet"].map(op=>({type:"object" as const,additionalProperties:false as const,properties:{op:{type:"string" as const,const:op,required:true as const},sheetId:string,name:string}})),
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"spreadsheet.removeSheet",required:true},sheetId:string}},
]} as const;
const pptOperation={oneOf:[
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"presentation.updateSlide",required:true},slideId:string,patch:{type:"object",required:true,additionalProperties:false,properties:{elements:{type:"array",items:{type:"object",additionalProperties:true}},name:{type:"string"},backgroundColor:{type:"string"},notes:{type:"string"}}}}},
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"presentation.insertSlides",required:true},afterSlideId:{oneOf:[{type:"string"},{type:"null"}],required:true},slides:{type:"array",required:true,items:{type:"object",additionalProperties:true,description:"One pptx-viewer-core native slide: id, slideNumber, elements. Element geometry x,y,width,height; chartData holds chartType,categories,series [{name,values}]."}}}},
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"presentation.removeSlide",required:true},slideId:string}},
 {type:"object",additionalProperties:false,properties:{op:{type:"string",const:"presentation.moveSlide",required:true},slideId:string,afterSlideId:{oneOf:[{type:"string"},{type:"null"}],required:true}}},
]} as const;
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
type WireValue = string | number | boolean | null | WireValue[] | {[key:string]:WireValue};
function jsonValue(value:unknown):WireValue {
  if(value===null || typeof value==="string" || typeof value==="number" || typeof value==="boolean") return value;
  if(Array.isArray(value)) return value.map(jsonValue);
  if(typeof value==="object") return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,jsonValue(v)]));
  throw new Error("Invalid Office wire value");
}
function wire(s:OfficeContentSnapshot) {
 return {...s,state:jsonValue(s.state) as {[key:string]:WireValue}};
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
        "Export a committed PDF working copy as its actual PDF file, or HTML webpage as its actual HTML file, or Word document as real DOCX or native presentation as real PPTX, or spreadsheet as real XLSX through the official present card. Use baseRevision from content_read. Same document/revision/content has a stable path; uncertain-write retries check existing bytes and never overwrite conflicts. Uses official bash approval and requires bash/present in this Session. On delivery-only failure, check the card and retry present for the returned path. The live editor remains editable. Tables and embedded PNG/JPEG images are retained; complex Word pagination is not lossless.",
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
        "Create or reopen Word, PPT, Excel, PDF or a live single-file HTML webpage. For new PDF use kind=pdf, source=new; read pages and edit one page through pdf.updatePage/insertPage/removePage. Coordinates are top-left points, A4 595.28x841.89. Text and rectangles are supported; Chinese font is bundled. Existing arbitrary PDF import/OCR/image editing is unavailable. For HTML use kind=html, source=new, then html.replaceDocument with a complete self-contained HTML string in each meaningful batch; preview opens immediately and refreshes after committed revisions. Inline scripts/styles work; external dependencies are blocked in preview. For Excel use kind=spreadsheet, source=new; returned state has sheetOrder and sheets with A1-keyed cells. For PPT set input.kind=presentation, source=new, title and operationId; optional brief. Automatically opens the live right-hand editor immediately; no content_present call is needed. New documents start with one empty paragraph. Use content_edit in small meaningful batches as you write so the user sees progress in the document, rather than waiting for the whole report. Reuse operationId on retries. This is not DOCX import.",
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
            {type:"object",additionalProperties:false,properties:{source:{type:"string",const:"new",required:true},kind:{type:"string",const:"html",required:true},title:string,operationId:string}},
            {type:"object",additionalProperties:false,properties:{source:{type:"string",const:"new",required:true},kind:{type:"string",const:"pdf",required:true},title:string,operationId:string}},
            ...(ctx.workdshOfficeContent.spreadsheetEnabled?[{type:"object",additionalProperties:false,properties:{source:{type:"string",const:"new",required:true},kind:{type:"string",const:"spreadsheet",required:true},title:string,operationId:string}} as const]:[]),
            ...(ctx.workdshOfficeContent.presentationEnabled?[{type:"object",additionalProperties:false,properties:{source:{type:"string",const:"new",required:true},kind:{type:"string",const:"presentation",required:true},title:string,operationId:string,brief:{type:"string",description:"Optional planning context; opening initializes only one title page. Add/update each slide in a separate content_edit."}}} as const]:[]),
          ],
          required: true,
        },
      },
      output: { schema: snapshot, render },
      execute: async (args, exec) =>
        wire(
          ctx.workdshOfficeContent.projectForAgent(await ctx.workdshOfficeContent.open(
            await actor(ctx, exec),
            parse(contentOpenInput, args.input),
            exec.signal,
          )),
        ),
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_read",
      description:
        "Read the latest committed document, revision and stable block/run IDs. Re-read after a user edit or REVISION_CONFLICT; never guess revision or text. Image src values are opaque references, not Base64; copy them exactly into content_edit for the target document; source read access is checked.",
      parameters: { documentId: string },
      output: { schema: snapshot, render },
      execute: async (args, exec) =>
        wire(
          ctx.workdshOfficeContent.projectForAgent(await ctx.workdshOfficeContent.read(
            await actor(ctx, exec),
            args.documentId,
            exec.signal,
          )),
        ),
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_capabilities",
      description:
        "Discover implemented operations and limits. Currently native document paragraphs/headings/tables/embedded images; DOCX export through content_export is available when official bash/present tools are mounted; Browser DOCX working-copy import is available; pptx-react-viewer presentations support native slides and editable charts; PPTX download is available in the right-hand editor, content_export delivers the saved PPTX through the official file card. Excel supports new live workbooks, A1 cell values/formulas, and sheet add/rename/remove; browser Univer computes formulas, Host does not. Formatting/charts and live XLSX import remain unavailable.",
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
        return JSON.parse(JSON.stringify(ctx.workdshOfficeContent.capabilities()));
      },
    }),
  ));
  ctx.effect(() => ctx.tools.register(
    defineTool({
      name: "content_edit",
      description:
        "Atomically commit at most 100 typed operations / 1 MiB. Each batch is visible without waiting for the whole answer. Use baseRevision from content_read and a new operationId. Retry uncertain delivery with exactly the same payload and ID. HUMAN_EDITING: user holds the editor; stop writing and wait, do not repeatedly call. A committed receipt is durable content, not an exported Office file.",
      parameters: {
        input: {
          type: "object",
          additionalProperties: false,
          required: true,
          properties: {
            documentId: string,
            baseRevision: { type: "integer", required: true },
            operationId: string,
            operations: { type: "array", required: true, items: {oneOf:[...operation.oneOf,...pdfOperation,{type:"object",additionalProperties:false,properties:{op:{type:"string",const:"html.replaceDocument",required:true},html:string}},...(ctx.workdshOfficeContent.spreadsheetEnabled?sheetOperation.oneOf:[]),...(ctx.workdshOfficeContent.presentationEnabled?pptOperation.oneOf:[])]} },
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
        ctx.workdshOfficeContent.editForAgent(
          await actor(ctx, exec),
          args.input,
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
