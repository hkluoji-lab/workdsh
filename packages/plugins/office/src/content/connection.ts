import type { Context } from "@deepseek-ai/cordis";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";
import { z } from "zod";
import { id, editInput, openInput, parse, OfficeError } from "./model.js";
export const name = "workdsh-office-connection";
export const inject = ["connection", "workdshOfficeContent", "workdshIdentity"];
const endpoint = z.discriminatedUnion("endpoint", [
  z.object({ endpoint: z.literal("open"), input: openInput }).strict(),
  z.object({ endpoint: z.literal("read"), documentId: id }).strict(),
  z.object({ endpoint: z.literal("list") }).strict(),
  z.object({ endpoint: z.literal("pending") }).strict(),
  z
    .object({
      endpoint: z.literal("edit"),
      input: editInput,
      lease: z.object({ token: id, clientId: id }).strict(),
    })
    .strict(),
  z
    .object({
      endpoint: z.literal("lease"),
      documentId: id,
      clientId: id,
      action: z.enum(["acquire", "renew", "release"]),
      token: id.optional(),
    })
    .strict(),
  z
    .object({
      endpoint: z.literal("ack"),
      documentId: id,
      requestId: id,
      clientId: id,
      appliedRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export function apply(ctx: Context) {
  const lifetime = new AbortController(),
    pending = new Set<Promise<Response>>();
  const connection = (ctx as Context & { connection: HostConnectionHandle })
    .connection;
  const unregister = connection.fetch.register({
    path: "/api/workdsh-office",
    methods: ["POST"],
    requestBody: "buffered",
    fetch(request) {
      const action = (async () => {
        const signal = AbortSignal.any([request.signal, lifetime.signal]);
        try {
          signal.throwIfAborted();
          if (Number(request.headers.get("content-length")) > 150000)
            throw new OfficeError("LIMIT_REACHED", "请求过大。");
          const text = await request.text();
          if (new TextEncoder().encode(text).length > 150000)
            throw new OfficeError("LIMIT_REACHED", "请求过大。");
          const envelope = parse(
            z.object({ sessionId: id, request: endpoint }).strict(),
            JSON.parse(text),
          );
          const actor = await ctx.workdshIdentity.resolve(
              { sessionId: envelope.sessionId },
              signal,
            ),
            r = envelope.request,
            s = ctx.workdshOfficeContent;
          let value: unknown;
          switch (r.endpoint) {
            case "open":
              value = await s.open(actor, r.input, signal);
              break;
            case "read":
              value = await s.read(actor, r.documentId, signal);
              break;
            case "list":
              value = await s.list(actor, signal);
              break;
            case "pending":
              value = await s.pending(actor, signal);
              break;
            case "edit":
              value = await s.editHuman(actor, r.input, r.lease, signal);
              break;
            case "lease":
              value = await s.lease(
                actor,
                r.documentId,
                r.clientId,
                r.action,
                r.token,
                signal,
              );
              break;
            case "ack":
              value = await s.acknowledge(actor, r, signal);
              break;
          }
          return Response.json(
            { ok: true, value },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const code =
            error instanceof OfficeError
              ? error.code
              : lifetime.signal.aborted || request.signal.aborted
                ? "CANCELLED"
                : "INVALID_REQUEST";
          return Response.json(
            {
              ok: false,
              error: {
                code,
                message:
                  error instanceof OfficeError
                    ? error.message
                    : "请求未完成，请核对操作结果后重试。",
              },
            },
            { headers: { "cache-control": "no-store" } },
          );
        }
      })();
      pending.add(action);
      void action.then(
        () => pending.delete(action),
        () => pending.delete(action),
      );
      return action;
    },
  });
  ctx.effect(
    () => async () => {
      lifetime.abort();
      await unregister();
      await Promise.allSettled([...pending]);
    },
    "workdshOffice.connection",
  );
}
