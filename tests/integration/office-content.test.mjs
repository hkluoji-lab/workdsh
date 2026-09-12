import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as JsonStorage from "@deepseek-ai/dsh-storage-json";
import * as StorageDomain from "@deepseek-ai/dsh-storage-domain";
import Tools from "@deepseek-ai/dsh-tools";
import { AccessManager } from "../../packages/plugins/access/dist/index.js";
import { AuditJournal } from "../../packages/plugins/audit/dist/index.js";
const artifacts = new URL(
  "../../.artifacts/office-content-tests/",
  import.meta.url,
);
await mkdir(artifacts, { recursive: true });
await build({
  entryPoints: [
    "packages/plugins/office/src/content/service.ts",
    "packages/plugins/office/src/content/model.ts",
    "packages/plugins/office/src/content/tools.ts",
  ],
  outdir: artifacts.pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*"],
});
const { ContentService } = await import(new URL("service.js", artifacts));
const toolPlugin = await import(new URL("tools.js", artifacts));
const { applyOperations, editInput, parse } = await import(
  new URL("model.js", artifacts)
);
const members = new Map(
  [
    ["a", "org-a"],
    ["b", "org-a"],
    ["c", "org-b"],
  ].map(([principalId, organizationId]) => [
    principalId,
    {
      organizationId,
      principalId,
      principalKind: "human",
      role: "owner",
      state: "active",
      revision: "1",
    },
  ]),
);
const actor = (p = "a") => ({
  principalId: p,
  organizationId: members.get(p).organizationId,
  sessionId: "session-" + p,
  requestId: "request-" + p,
  resolvedBy: "fixture",
});
const identity = {
  id: "fixture",
  resolve: async (input) => ({ ...actor(), sessionId: input?.sessionId }),
  membership: (o, p) =>
    members.get(p)?.organizationId === o ? members.get(p) : undefined,
};
async function boot(root) {
  const ctx = new Context();
  ctx.provide("workdshIdentity", identity);
  await ctx.plugin(Storage);
  await ctx.plugin(JsonStorage, { root });
  await ctx.plugin(StorageDomain, { backend: "json" });
  await ctx.plugin(AuditJournal);
  await ctx.plugin(AccessManager);
  for (const p of ["a", "b", "c"])
    await ctx.workdshAccess.bindSession(actor(p), {
      sessionId: "session-" + p,
      workspaceId: "workspace",
    });
  const fiber = await ctx.plugin(ContentService);
  const sections = new Map();
  ctx.provide("systemPrompt", {
    tools() {},
    section(value) {
      sections.set(value.name, value);
      return () => sections.delete(value.name);
    },
    getSectionOrder() {
      return 0;
    },
  });
  await ctx.plugin(Tools);
  const toolFiber = await ctx.plugin(toolPlugin);
  return { ctx, fiber, toolFiber, sections, s: ctx.workdshOfficeContent };
}
const block = (text) => ({ type: "paragraph", runs: [{ text, marks: [] }] });
const create = async (s) =>
  s.open(actor(), {
    source: "new",
    title: "共享文档",
    operationId: "create-1",
  });
const change = (s, op, text) => ({
  documentId: s.documentId,
  baseRevision: s.revision,
  operationId: op,
  operations: [
    {
      op: "document.replaceBlock",
      blockId: s.state.blockIds[0],
      expectedText: s.state.blocks[s.state.blockIds[0]].runs
        .map((r) => r.text)
        .join(""),
      block: block(text),
    },
  ],
});

test("Office native tools, atomic batches, replay before CAS, leases, ownership and cold restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-content-"));
  let h;
  try {
    h = await boot(root);
    const { ctx } = h;
    for (const name of [
      "content_open",
      "content_read",
      "content_capabilities",
      "content_edit",
      "content_present",
    ])
      assert.ok(ctx.tools.get(name));
    assert.ok(ctx.tools.get("content_export"));
    assert.throws(() => toolPlugin.apply(ctx), /already registered/);
    const exec = {
      agent: { id: "session-a" },
      signal: new AbortController().signal,
      callId: "test-call",
    };
    const first = await ctx.tools.get("content_open").execute(
      {
        input: { source: "new", title: "共享文档", operationId: "create-1" },
      },
      exec,
    );
    const replay = await create(h.s);
    assert.equal(replay.documentId, first.documentId);
    await assert.rejects(
      h.s.open(actor(), {
        source: "new",
        title: "changed",
        operationId: "create-1",
      }),
      { code: "IDEMPOTENCY_MISMATCH" },
    );
    const input = change(first, "batch-1", "第一段 😀 中文");
    const receipt = await ctx.tools
      .get("content_edit")
      .execute({ input }, exec);
    assert.equal(receipt.revision, 1);
    await h.s.edit(
      actor(),
      change(
        await h.s.read(actor(), first.documentId),
        "batch-2",
        "第二次修改",
      ),
    );
    assert.deepEqual(
      await h.s.edit(actor(), input),
      receipt,
      "old successful payload replays even after revision changes",
    );
    await assert.rejects(
      h.s.edit(actor(), { ...input, operationId: "new-stale" }),
      { code: "REVISION_CONFLICT" },
    );
    await assert.rejects(
      h.s.edit(actor(), {
        ...input,
        operations: [{ ...input.operations[0], block: block("wrong replay") }],
      }),
      { code: "IDEMPOTENCY_MISMATCH" },
    );
    let current = await h.s.read(actor(), first.documentId);
    await assert.rejects(
      h.s.edit(actor(), {
        ...change(current, "bad-batch", "must not persist"),
        operations: [
          ...change(current, "bad-batch", "must not persist").operations,
          { op: "document.removeBlock", blockId: "missing", expectedText: "" },
        ],
      }),
      { code: "TARGET_NOT_FOUND" },
    );
    assert.deepEqual(await h.s.read(actor(), first.documentId), current);
    const grant = await h.s.lease(
      actor(),
      first.documentId,
      "browser-a",
      "acquire",
    );
    await assert.rejects(
      h.s.edit(actor(), change(current, "ai-blocked", "AI overwrite")),
      { code: "HUMAN_EDITING" },
    );
    await assert.rejects(
      h.s.lease(actor(), first.documentId, "browser-b", "acquire"),
      { code: "HUMAN_EDITING" },
    );
    await h.s.editHuman(
      actor(),
      change(current, "human-1", "用户修改，AI 必须读到"),
      { token: grant.lease.token, clientId: "browser-a" },
    );
    await h.s.lease(
      actor(),
      first.documentId,
      "browser-a",
      "release",
      grant.lease.token,
    );
    current = await ctx.tools
      .get("content_read")
      .execute({ documentId: first.documentId }, exec);
    assert.equal(
      current.state.blocks[current.state.blockIds[0]].runs[0].text,
      "用户修改，AI 必须读到",
    );
    await h.s.edit(actor(), change(current, "ai-after-human", "AI 接着写"));
    for (const p of ["b", "c"])
      await assert.rejects(h.s.read(actor(p), first.documentId), {
        code: "FORBIDDEN",
      });
    await assert.rejects(
      h.s.read({ ...actor(), sessionId: "unbound" }, first.documentId),
      { code: "FORBIDDEN" },
    );
    members.get("a").state = "suspended";
    await assert.rejects(h.s.read(actor(), first.documentId), {
      code: "FORBIDDEN",
    });
    members.get("a").state = "active";
    assert.equal((await h.s.pending(actor())).length, 1, "creation automatically requests the right-hand editor");
    const presentation = await h.s.present(actor(), first.documentId);
    assert.equal((await h.s.pending(actor())).length, 1);
    assert.equal((await h.s.pending(actor("b"))).length, 0);
    await h.s.acknowledge(actor(), {
      ...presentation,
      clientId: "browser-a",
      appliedRevision: 4,
    });
    assert.equal((await h.s.pending(actor())).length, 0);
    const reopenedEdit = change(await h.s.read(actor(), first.documentId), "reveal-after-ack", "AI追加后重新打开");
    const reopenedReceipt = await h.s.edit(actor(), reopenedEdit);
    const reopenedRequest = (await h.s.pending(actor()))[0];
    assert.ok(reopenedRequest, "A fresh AI commit requests the sidebar again after the first ACK");
    assert.notEqual(reopenedRequest.requestId, presentation.requestId);
    assert.equal(reopenedRequest.revision, reopenedReceipt.revision);
    assert.equal((await h.s.pending(actor("b"))).length, 0, "Reveal remains scoped to the calling Session");
    await h.s.acknowledge(actor(), {...reopenedRequest, clientId: "browser-a", appliedRevision: reopenedReceipt.revision});
    await h.s.edit(actor(), reopenedEdit);
    assert.equal((await h.s.pending(actor())).length, 0, "Idempotent replay does not reveal the sidebar again");
    const oldLease = await h.s.lease(
      actor(),
      first.documentId,
      "browser-a",
      "acquire",
    );
    await h.s.editHuman(actor(), change(await h.s.read(actor(), first.documentId), "human-no-reveal", "人工保存不重开右栏"), {token: oldLease.lease.token, clientId: "browser-a"});
    assert.equal((await h.s.pending(actor())).length, 0, "Human autosave does not request presentation");
    const before = await h.s.read(actor(), first.documentId);
    await h.ctx.fiber.dispose();
    h = await boot(root);
    const restored = await h.s.read(actor(), first.documentId);
    assert.deepEqual(restored.state, before.state);
    assert.equal(restored.revision, before.revision);
    assert.notEqual(restored.generation, before.generation);
    await assert.rejects(
      h.s.editHuman(actor(), change(restored, "old-generation", "bad"), {
        token: oldLease.lease.token,
        clientId: "browser-a",
      }),
      { code: "LEASE_EXPIRED" },
    );
    assert.deepEqual(
      await h.s.edit(actor(), input),
      receipt,
      "receipt survives restart",
    );
    await h.s.edit(actor(), change(restored, "after-restart", "恢复后继续"));
    const old = h.s;
    assert.ok(h.sections.has("workdsh:office-authoring"));
    await h.fiber.dispose();
    assert.equal(h.sections.has("workdsh:office-authoring"), false, "Office disposal removes its writing guide");
    assert.equal(
      h.ctx.tools.get("content_read"),
      undefined,
      "service disposal unregisters dependent tools",
    );
    await assert.rejects(old.read(actor(), first.documentId), {
      code: "UNAVAILABLE",
    });
  } finally {
    members.get("a").state = "active";
    await h?.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("Office reducer preserves unaffected IDs and rejects unknown fields, invalid marks and partial failure", () => {
  const initial = {
    modelVersion: 1,
    blockIds: ["one"],
    blocks: {
      one: {
        blockId: "one",
        type: "paragraph",
        runs: [
          { runId: "run-a", text: "hello", marks: [] },
          { runId: "run-b", text: "中文😀", marks: ["bold"] },
        ],
      },
    },
  };
  let i = 0;
  const result = applyOperations(
    initial,
    [
      {
        op: "document.replaceBlock",
        blockId: "one",
        expectedText: "hello中文😀",
        block: {
          type: "heading",
          level: 2,
          runs: [
            { text: "hello", marks: [] },
            { text: "中文😀改", marks: ["bold"] },
          ],
        },
      },
    ],
    () => `new-${++i}`,
  );
  assert.equal(result.state.blocks.one.runs[0].runId, "run-a");
  assert.notEqual(result.state.blocks.one.runs[1].runId, "run-b");
  assert.equal(initial.blocks.one.type, "paragraph");
  const valid = {
    documentId: "doc",
    baseRevision: 0,
    operationId: "op",
    operations: [
      {
        op: "document.insertBlocks",
        afterBlockId: "one",
        blocks: [{ ...block("x"), clientRef: "x" }],
      },
    ],
  };
  assert.throws(() => parse(editInput, { ...valid, actor: "spoof" }));
  assert.throws(() =>
    parse(editInput, {
      ...valid,
      operations: [{ op: "arbitrary.eval", code: "x" }],
    }),
  );
  assert.throws(() => parse(editInput, { ...valid, operationId: "__proto__" }));
});


test("Rich paragraph and run formatting survive a full Host cold start", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-rich-cold-"));
  let h;
  try {
    h = await boot(root);
    const original = await create(h.s);
    const input = change(original, "rich", "富格式冷启动");
    input.operations[0].block.style = {alignment:"center",lineHeight:1.5,indent:1};
    input.operations[0].block.list = {type:"ordered",depth:0,start:3};
    input.operations[0].block.runs[0].style = {fontFamily:"宋体",fontSize:18,color:"#ad2121",backgroundColor:"#fff2a8"};
    await h.s.edit(actor(),input);
    const before = await h.s.read(actor(),original.documentId);
    await h.ctx.fiber.dispose();
    h = await boot(root);
    const after = await h.s.read(actor(),original.documentId);
    assert.deepEqual(after.state,before.state);
    assert.equal(after.revision,before.revision);
  } finally {await h?.ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
});

test("Imported semantic DOCX copy is atomic, authorized and reopens without replacing human edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-import-"));
  const h = await boot(root);
  try {
    const input = {source:"import", title:"文件编辑副本", operationId:"source-docx-hash", blocks: [{type:"heading",level:1,runs:[{text:"导入标题",marks:["bold"],style:{fontSize:18,color:"#224466"}}]}, block("导入正文") ]};
    const imported = await h.s.open(actor(), input);
    assert.equal(imported.state.blockIds.length, 2);
    assert.equal(imported.state.blocks[imported.state.blockIds[0]].runs[0].text, "导入标题");
    assert.equal((await h.s.pending(actor())).length,0,"File tab owns display; no duplicate live tab");
    await assert.rejects(h.s.read(actor("b"), imported.documentId), {code:"FORBIDDEN"});
    const lease = await h.s.lease(actor(),imported.documentId,"import-browser","acquire");
    await h.s.editHuman(actor(),change(imported,"import-human-edit","已编辑标题"),{token:lease.lease.token,clientId:"import-browser"});
    const reopened = await h.s.open(actor(),input);
    assert.equal(reopened.documentId,imported.documentId);
    assert.equal(reopened.state.blocks[reopened.state.blockIds[0]].runs[0].text,"已编辑标题");
    await assert.rejects(h.s.open(actor(),{...input,blocks:[block("变更来源")]}),{code:"IDEMPOTENCY_MISMATCH"});
    const before = (await h.s.list(actor())).length;
    await assert.rejects(h.s.open(actor(),{...input,operationId:"bad-import",blocks:[{...block("bad"),style:{color:"red"}}]}),{code:"INVALID_INPUT"});
    assert.equal((await h.s.list(actor())).length,before,"Invalid import leaves no empty orphan copy");
  } finally {await h.ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
});

test("Office Host unload revokes tools and writing guide, and reinstall preserves saved documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-unload-"));
  const h = await boot(root);
  try {
    const initial = await create(h.s);
    await h.s.edit(actor(), change(initial, "before-unload", "卸载插件后仍保留的文档"));
    const before = await h.s.read(actor(), initial.documentId);
    const names = ["content_open", "content_read", "content_capabilities", "content_edit", "content_present", "content_export"];
    for (const name of names) assert.ok(h.ctx.tools.get(name));
    assert.ok(h.sections.has("workdsh:office-authoring"));
    await h.toolFiber.dispose();
    for (const name of names) assert.equal(h.ctx.tools.get(name), undefined);
    assert.equal(h.sections.has("workdsh:office-authoring"), false);
    await h.fiber.dispose();
    assert.equal(h.ctx.workdshOfficeContent, undefined);
    const restoredFiber = await h.ctx.plugin(ContentService);
    try {
      await h.ctx.plugin(toolPlugin);
      for (const name of names) assert.ok(h.ctx.tools.get(name));
      const after = await h.ctx.workdshOfficeContent.read(actor(), initial.documentId);
      assert.deepEqual(after.state, before.state);
      assert.equal(after.revision, before.revision);
    } finally {await restoredFiber.dispose();}
  } finally {await h.ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
});

test("Tables and embedded images share tools, human leases, atomic validation and cold persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-rich-content-"));
  let h = await boot(root);
  try {
    const first = await create(h.s);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=";
    const table = {type:"table",runs:[],table:{rows:[{cells:[{colspan:2,rowspan:1,colwidth:[100,140],header:true,paragraphs:[block("汇总")] }]},{cells:[{colspan:1,rowspan:1,paragraphs:[block("门店A")]},{colspan:1,rowspan:1,paragraphs:[block("待填")] }]}]}};
    const image = {type:"image",runs:[],image:{src:png,width:240,height:180,alignment:"center",alt:"说明图"}};
    const exec = {agent:{id:"session-a"},signal:new AbortController().signal,callId:"rich-tool"};
    await h.ctx.tools.get("content_edit").execute({input:{documentId:first.documentId,baseRevision:0,operationId:"rich-insert",operations:[{op:"document.insertBlocks",afterBlockId:first.state.blockIds[0],blocks:[{...table,clientRef:"table"},{...image,clientRef:"image"}]}]}},exec);
    let saved = await h.ctx.tools.get("content_read").execute({documentId:first.documentId},exec);
    const key = saved.state.blockIds[1], imageKey=saved.state.blockIds[2];
    assert.deepEqual(saved.state.blocks[key].table,table.table);
    const bad=structuredClone(table);bad.table.rows[1].cells.pop();
    await assert.rejects(h.s.edit(actor(),{documentId:first.documentId,baseRevision:saved.revision,operationId:"bad-grid",operations:[{op:"document.removeBlock",blockId:imageKey,expectedText:"说明图"},{op:"document.replaceBlock",blockId:key,expectedText:"汇总\n门店A\t待填",block:bad}]}),{code:"INVALID_INPUT"});
    assert.deepEqual(h.s.projectForAgent(await h.s.read(actor(),first.documentId)),saved,"failed batch retains image and revision");
    const lease=await h.s.lease(actor(),first.documentId,"rich-browser","acquire");
    const updated=structuredClone(table);updated.table.rows[1].cells[1].paragraphs=[block("人工修改")];
    const input={documentId:first.documentId,baseRevision:saved.revision,operationId:"rich-human",operations:[{op:"document.replaceBlock",blockId:key,expectedText:"汇总\n门店A\t待填",block:updated}]};
    await assert.rejects(h.s.edit(actor(),input),{code:"HUMAN_EDITING"});
    await h.s.editHuman(actor(),input,{token:lease.lease.token,clientId:"rich-browser"});
    await h.s.lease(actor(),first.documentId,"rich-browser","release",lease.lease.token);
    saved=await h.s.read(actor(),first.documentId);
    assert.equal(saved.state.blocks[key].table.rows[1].cells[1].paragraphs[0].runs[0].text,"人工修改");
    const invalidImage={...image,image:{...image.image,src:"https://external.test/image.png"}};
    await assert.rejects(h.s.edit(actor(),{documentId:first.documentId,baseRevision:saved.revision,operationId:"bad-image",operations:[{op:"document.replaceBlock",blockId:imageKey,expectedText:"说明图",block:invalidImage}]}),{code:"INVALID_INPUT"});
    await h.ctx.fiber.dispose();h=await boot(root);
    assert.deepEqual((await h.s.read(actor(),first.documentId)).state,saved.state);
  } finally {await h.ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
});

test("AI image references copy across authorized documents and reject changed or unauthorized sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "office-image-reference-"));
  const h = await boot(root);
  try {
    const doc = await create(h.s);
    const src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ZkAAAAASUVORK5CYII=";
    const image = {type: "image", runs: [], image: {src, width: 100, height: 100, alt: "图片"}};
    await h.s.edit(actor(), {documentId: doc.documentId, baseRevision: doc.revision, operationId: "seed-image", operations: [{op: "document.insertBlocks", afterBlockId: null, blocks: [{...image, clientRef: "image"}]}]});
    const snapshot = await h.s.read(actor(), doc.documentId);
    const exec = {agent: {id: "session-a"}, signal: new AbortController().signal, callId: "image-ref"};
    const projected = await h.ctx.tools.get("content_read").execute({documentId: doc.documentId}, exec);
    const imageId = snapshot.state.blockIds.find(id => snapshot.state.blocks[id].type === "image");
    const reference = projected.state.blocks[imageId].image.src;
    assert.match(reference, /^office-image:[^:]+:[^:]+:[a-f0-9]{64}$/);
    assert.equal(snapshot.state.blocks[imageId].image.src, src);
    const input = {documentId: doc.documentId, baseRevision: snapshot.revision, operationId: "reuse-image", operations: [{op: "document.insertBlocks", afterBlockId: imageId, blocks: [{...image, image: {...image.image, src: reference, alignment: "right"}, clientRef: "copy"}]}]};
    const receipt = await h.ctx.tools.get("content_edit").execute({input}, exec);
    assert.deepEqual(await h.s.editForAgent(actor(), input), receipt);
    assert.equal((await h.s.read(actor(), doc.documentId)).state.blocks[receipt.ids.copy].image.src, src);
    await assert.rejects(h.s.editForAgent(actor("c"), input), /./);
    await assert.rejects(h.s.editForAgent(actor(), {...input, operationId: "bad-hash", operations: [{...input.operations[0], blocks: [{...input.operations[0].blocks[0], image: {...image.image, src: reference.slice(0, -1) + (reference.endsWith("0") ? "1" : "0")}}]}]}), /图片引用/);
    const other = await h.s.open(actor(), {source: "new", title: "另一文档", operationId: "other-document"});
    const copied = await h.ctx.tools.get("content_edit").execute({input: {...input, documentId: other.documentId, baseRevision: other.revision, operationId: "cross-document-image", operations: [{...input.operations[0], afterBlockId: null}]}}, exec);
    assert.equal((await h.s.read(actor(), other.documentId)).state.blocks[copied.ids.copy].image.src, src);
    assert.equal((await h.s.read(actor(), doc.documentId)).revision, receipt.revision, "copy does not edit source");
    const foreign = await h.s.open(actor("c"), {source: "new", title: "跨组织来源", operationId: "foreign-source"});
    await h.s.edit(actor("c"), {documentId: foreign.documentId, baseRevision: foreign.revision, operationId: "foreign-seed", operations: [{op: "document.insertBlocks", afterBlockId: null, blocks: [{...image, clientRef: "foreign"}]}]});
    const foreignProjection = h.s.projectForAgent(await h.s.read(actor("c"), foreign.documentId));
    const foreignRef = Object.values(foreignProjection.state.blocks).find(b => b.type === "image").image.src;
    await assert.rejects(h.s.editForAgent(actor(), {...input, operationId: "unauthorized-source", operations: [{...input.operations[0], blocks: [{...image, image: {...image.image, src: foreignRef}, clientRef: "forbidden"}]}]}), {code: "FORBIDDEN"});
    assert.equal((await h.s.read(actor(), doc.documentId)).revision, receipt.revision);
    const workspaceActor = {...actor(), sessionId: "session-a-other-workspace"};
    await h.ctx.workdshAccess.bindSession(workspaceActor, {sessionId: workspaceActor.sessionId, workspaceId: "other-workspace"});
    const workspaceDoc = await h.s.open(workspaceActor, {source: "new", title: "另工作区来源", operationId: "workspace-source"});
    await h.s.edit(workspaceActor, {documentId: workspaceDoc.documentId, baseRevision: workspaceDoc.revision, operationId: "workspace-seed", operations: [{op: "document.insertBlocks", afterBlockId: null, blocks: [{...image, clientRef: "workspace-image"}]}]});
    const workspaceRef = Object.values(h.s.projectForAgent(await h.s.read(workspaceActor, workspaceDoc.documentId)).state.blocks).find(b => b.type === "image").image.src;
    await assert.rejects(h.s.editForAgent(actor(), {...input, operationId: "workspace-forbidden", operations: [{...input.operations[0], blocks: [{...image, image: {...image.image, src: workspaceRef}, clientRef: "workspace-copy"}]}]}), {code: "FORBIDDEN"});
    const legacyRef = reference.replace(`office-image:${doc.documentId}:`, "office-image:");
    assert.deepEqual(await h.s.editForAgent(actor(), {...input, operations: [{...input.operations[0], blocks: [{...input.operations[0].blocks[0], image: {...input.operations[0].blocks[0].image, src: legacyRef}}]}]}), receipt);

    await h.s.edit(actor(), {documentId: doc.documentId, baseRevision: receipt.revision, operationId: "remove-source", operations: [{op: "document.removeBlock", blockId: imageId, expectedText: "图片"}]});
    await assert.rejects(h.s.editForAgent(actor(), {...input, operationId: "removed-source"}), /来源图片/);
    assert.equal((await h.s.read(actor(), other.documentId)).state.blocks[copied.ids.copy].image.src, src, "target retains independent bytes after source removal");
  } finally {
    await h.ctx.fiber.dispose();
    await rm(root, {recursive: true, force: true});
  }
});
