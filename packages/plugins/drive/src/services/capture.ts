import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-tool-present/types';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
import type { ActorContext } from 'workdsh-contracts';

const MAX_PRESENTED_BYTES = 100 * 1024 * 1024;

const imageExtension: Readonly<Record<string, string>> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp', 'image/avif': '.avif',
};

/**
 * 自动归档两路事件到网盘：
 * 1. user/message 中的图片/文件附件（Host 已存储，只登记引用）；
 * 2. deliverables/presented 呈现文件（fs 读字节 → 附件保存 → 登记）。
 * 捕获失败只记录，不阻塞事件流；receipts 幂等防重放重复登记。
 */
export function registerDriveCapture(ctx: Context): void {
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message') void captureUserMessage(ctx, session, event.data);
    else if (event.type === 'deliverables/presented') void capturePresented(ctx, session, event.data);
  });
}

async function actor(ctx: Context, session: Session): Promise<ActorContext> {
  return ctx.workdshIdentity.resolve({ sessionId: String(session.id) });
}

async function captureUserMessage(ctx: Context, session: Session, message: UserMessage): Promise<void> {
  const content = message?.content;
  if (!content?.length) return;
  for (const block of content) {
    try {
      if (block.type === 'image') {
        const ref = block.attachment;
        const extension = imageExtension[ref.mediaType] ?? '.img';
        await ctx.workdshDrive.saveReference(await actor(ctx, session), {
          name: `图片-${ref.attachmentId.slice(-12)}${extension}`,
          attachmentId: ref.attachmentId,
          byteLength: ref.bytes,
          mediaType: ref.mediaType,
          sessionId: String(session.id),
          operationId: `user-${session.id}-${ref.attachmentId}`,
        });
      } else if (block.type === 'file') {
        const ref = block.attachment;
        await ctx.workdshDrive.saveReference(await actor(ctx, session), {
          name: ref.name || `附件-${ref.attachmentId.slice(-12)}`,
          attachmentId: ref.attachmentId,
          byteLength: ref.bytes,
          mediaType: 'application/octet-stream',
          sessionId: String(session.id),
          operationId: `user-${session.id}-${ref.attachmentId}`,
        });
      }
    } catch (cause) {
      console.error(`[workdsh-drive] user/message 附件归档失败: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

async function capturePresented(ctx: Context, session: Session, presented: { turn: number; callId: string; files: readonly { path: string }[] }): Promise<void> {
  const files = presented.files;
  if (!files?.length) return;
  const current = await actor(ctx, session);
  for (const [index, file] of files.entries()) {
    try {
      const target = await ctx.fs.resolve(file.path);
      const bytes = await ctx.fs.readBytes(target, undefined, MAX_PRESENTED_BYTES);
      if (!bytes.byteLength) continue;
      await ctx.workdshDrive.save(current, {
        name: basenameOf(file.path),
        bytes,
        source: 'tool-output',
        sessionId: String(session.id),
        operationId: `present-${session.id}-${presented.turn}-${presented.callId}-${index}`,
      });
    } catch (cause) {
      // 相对路径解析失败或文件不可读时跳过，不中断整批捕获。
      console.error(`[workdsh-drive] 呈现文件归档失败(${file.path}): ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

const basenameOf = (path: string): string => {
  const normalized = path.split(/[\\/]/).filter(Boolean);
  return normalized.length ? normalized[normalized.length - 1]! : 'deliverable';
};
