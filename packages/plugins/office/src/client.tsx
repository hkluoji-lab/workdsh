import type {} from "@deepseek-ai/dsh-client-ui-input-trigger/client";
import { officeInputSources } from "./input.js";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client";
import { OfficeDocument } from "./OfficeDocument.js";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import { downloadDocument } from "./live/docx.js";
import type { OfficeSnapshot } from "workdsh-contracts/office";
import { DocumentPage } from "./live/DocumentPage.js";
import {
  createDocumentModel,
  type Rpc,
  type OfficeClient,
} from "./live/model.js";
declare module "@deepseek-ai/dsh-client-ui-sidebar-right/client" {
  interface SidebarRightTabParamsMap {
    "workdsh-office-live": { documentId?: string; requestId?: string };
  }
}
export const name = "workdsh-office-client";
declare const __WORKDSH_WORD_ONLY__: boolean;
export const inject = [
  "slots",
  "documentPreviews",
  "sidebarRightTabs",
  "sidebarRight",
  "sessions",
  "uiConversation",
  "inputTriggers",
];
export function apply(ctx: Context): void {
  ctx.effect(() =>
    ctx.documentPreviews.register({
      id: "workdsh-office",
      extensions: typeof __WORKDSH_WORD_ONLY__ !== "undefined" && __WORKDSH_WORD_ONLY__ ? ["docx"] : ["xlsx", "docx", "pptx"],
      title: () => "Office 浏览器编辑",
      loading: "bytes-complete",
    }),
  );
  ctx.slots.inject("sidebar.right.tab.document", () =>
    ctx.slots.register(
      { name: "sidebar.right.tab.document", key: "workdsh-office", inject: () => ({office}) },
      OfficeDocument,
    ),
  );
  const lifetime = new AbortController();
  const rpc: Rpc = async <T,>(
    sessionId: string,
    request: unknown,
    signal?: AbortSignal,
  ): Promise<T> => {
    const response = await fetch("/api/workdsh-office", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, request }),
      signal: AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]),
    });
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(
        `${result.error?.code ?? "UNAVAILABLE"}: ${result.error?.message ?? "Office 暂时不可用。"}`,
      );
    return result.value as T;
  };
  const activeDocuments = new Map<string, ReturnType<typeof createDocumentModel>>();
  const office: OfficeClient = {
    importDocument: (sessionId, input, signal) => rpc(sessionId, {endpoint: "open", input}, signal),
    list: (sessionId, signal) => rpc(sessionId, { endpoint: "list" }, signal),
    download: async (sessionId, documentId) => {
      const current = activeDocuments.get(sessionId + ":" + documentId);
      if (current) await current.download();
      else await downloadDocument(await rpc<OfficeSnapshot>(sessionId, {endpoint: "read", documentId}));
    },
    open: (sessionId, documentId) => ctx.sidebarRight.openTabIn(sessionId as never, "workdsh-office-live", {params: {documentId}}),
    createDocument: (options) => {
      const model = createDocumentModel(options, rpc), key = options.sessionId + ":" + options.documentId;
      return {...model, attach: element => {
        activeDocuments.set(key, model);
        const dispose = model.attach(element);
        return () => {dispose(); if (activeDocuments.get(key) === model) activeDocuments.delete(key);};
      }};
    },
  };
  for (const source of officeInputSources(office, () => {
    const sessions = ctx.sessions as unknown as ISessions;
    const id = sessions.list.getSnapshot().current;
    return id ? String(id) : undefined;
  })) ctx.effect(() => ctx.inputTriggers.registerSource(source));
  ctx.effect(() =>
    ctx.sidebarRightTabs.register({
      id: "workdsh-office-live",
      kind: "workdsh-office-live",
      title: () => "文档 · 实时编辑",
      guide: [
        {
          order: 45,
          title: () => "文档",
          description: () => "查看并编辑 AI 正在编写的工作副本",
        },
      ],
    }),
  );
  ctx.slots.inject("sidebar.right.pane.tab", () =>
    ctx.slots.register(
      {
        name: "sidebar.right.pane.tab",
        key: "workdsh-office-live",
        inject: () => ({ office }),
      },
      DocumentPage,
    ),
  );
  ctx.effect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const seen = new Set<string>();
    const sessions = ctx.sessions as unknown as ISessions;
    async function poll() {
      const sessionId = sessions.list.getSnapshot().current;
      try {
        if (sessionId && document.visibilityState !== "hidden") {
          const requests = await rpc<
            { documentId: string; requestId: string }[]
          >(String(sessionId), { endpoint: "pending" });
          if (
            lifetime.signal.aborted ||
            sessions.list.getSnapshot().current !== sessionId
          )
            return;
          for (const request of requests)
            if (!seen.has(request.requestId)) {
              await ctx.sidebarRight.openTabIn(sessionId, "workdsh-office-live", {
                params: {
                  documentId: request.documentId,
                  requestId: request.requestId,
                },
              });
              seen.add(request.requestId);
            }
        }
      } catch {
        /* Unbound Sessions/temporarily unavailable Host do not affect the conversation. */
      } finally {
        if (!lifetime.signal.aborted)
          timer = setTimeout(
            poll,
            document.visibilityState === "hidden" ? 5000 : 500,
          );
      }
    }
    void poll();
    return () => {
      lifetime.abort();
      clearTimeout(timer);
    };
  });
}
