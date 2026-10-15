/**
 * access 域 Host 半边共用的本地小工具：存储记录读取、HTTP 请求/响应、错误描述。
 *
 * 这些函数只服务于本模块的三个 Host 服务（资源授权、授权基线、授权判定点），
 * 不含业务判定，也不引入新的服务或第二套真源。
 * @module workdsh-plugin-access/host/records
 */
import { readdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

/** 一条存储记录：文件名 + 解析后的内容（`record` 包裹形态会被解开）。 */
export interface StoredRecord {
  readonly file: string;
  readonly record: Readonly<Record<string, any>>;
}

/**
 * 读取单个 JSON 记录文件。解析失败或不存在都返回 `null`（调用方按「没有这条记录」处理）。
 * @param file - 文件路径。
 * @returns 记录内容。
 */
export function readRecordFile(file: string): Readonly<Record<string, any>> | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed?.record ?? parsed ?? null;
  } catch {
    return null;
  }
}

/**
 * 列出一个 per-record 存储目录下的全部 JSON 记录。
 * @param dir - 目录路径；不存在时返回空数组（目录缺失不是错误）。
 * @returns 记录列表。
 */
export function listRecords(dir: string): StoredRecord[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: StoredRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const record = readRecordFile(join(dir, name));
    if (record) out.push({ file: name, record });
  }
  return out;
}

/** 存储后端接受的 key 形态：`/^[a-zA-Z0-9_-]+$/`。 */
export function pathSafe(value: unknown): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** 统一的错误描述格式，用于日志与响应体。 */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * 读取并解析 JSON 请求体。
 * @param request - HTTP 请求。
 * @returns 解析后的对象；超限、坏 JSON 或流错误时为 `null`。
 */
export function readJsonBody(request: IncomingMessage): Promise<Record<string, any> | null> {
  return new Promise((resolve) => {
    let raw = '';
    let tooLarge = false;
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        tooLarge = true;
        request.destroy();
      }
    });
    request.on('end', () => {
      if (tooLarge) return resolve(null);
      try {
        resolve(raw === '' ? {} : JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    request.on('error', () => resolve(null));
  });
}

/**
 * 回写 JSON 响应。所有 Host 路由共用同一形状，避免各处自行拼装头。
 * @param response - HTTP 响应。
 * @param status - 状态码。
 * @param payload - 响应体。
 */
export function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

/** 解析请求 URL；畸形 URL 退回根路径，绝不让解析异常冒到请求线程外。 */
export function requestUrl(request: IncomingMessage, base: string): URL {
  try {
    return new URL(request.url ?? '/', base);
  } catch {
    return new URL('/', base);
  }
}

/** 逗号分隔配置项的解析：去空白、丢空项。 */
export function parseCsv(value: string): string[] {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}
