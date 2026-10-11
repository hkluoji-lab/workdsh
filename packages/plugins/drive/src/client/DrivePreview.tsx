import * as React from 'react';
import { useEffect, useState } from 'react';
import type { DriveClient } from './management.js';
import { driveSizeLabel } from './DriveFileList.js';

/** 预览输入：主区由 DriveTreeEntry 构建，侧栏由 tab params 构建。 */
export interface DrivePreviewInput {
  readonly fileId: string;
  readonly revisionId?: string;
  readonly name: string;
  readonly kind: string;
  readonly mediaType?: string;
  readonly byteLength?: number;
  readonly source?: string;
  readonly sessionId?: string;
  readonly folderPath?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

const sourceLabel = (source?: string): string => source === 'ai-generated' || source === 'user-upload' || source === 'tool-output' ? ({ 'ai-generated': 'AI 生成', 'user-upload': '用户上传', 'tool-output': '工具输出' } as const)[source] : source || '未知来源';
const kindLabel = (kind?: string): string => ({ document: '文档', image: '图片', video: '视频', audio: '音频', archive: '压缩包', other: '文件' }[kind ?? ''] ?? kind ?? '文件');

export function DrivePreview({ management, input, onClose }: { management: DriveClient; input: DrivePreviewInput; onClose?: () => void }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    setError(''); setText(''); setBusy(true); setUrl(old => { if (old) URL.revokeObjectURL(old); return ''; });
    let active = true;
    const run = async () => {
      try {
        const bytes = await management.readBytes(input.fileId, input.revisionId);
        if (!active) return;
        if (input.kind === 'image') setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: input.mediaType || 'image/png' })));
        else if (input.kind === 'document') setText(new TextDecoder().decode(bytes));
        else if (input.kind === 'video') setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: input.mediaType || 'video/mp4' })));
        else if (input.kind === 'audio') setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: input.mediaType || 'audio/mpeg' })));
        else setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: input.mediaType || 'application/octet-stream' })));
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : '读取文件失败。'); }
      finally { if (active) setBusy(false); }
    };
    void run();
    return () => { active = false; };
  }, [management, input.fileId, input.revisionId, input.kind, input.mediaType]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const download = async () => {
    setError('');
    try {
      const bytes = await management.readBytes(input.fileId, input.revisionId);
      const objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: input.mediaType || 'application/octet-stream' }));
      const link = document.createElement('a'); link.href = objectUrl; link.download = input.name; link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '下载失败。'); }
  };
  const meta = <div className="wd-drive-preview-meta">
    <div><span>名称</span><b>{input.name}</b></div>
    <div><span>类型</span><b>{kindLabel(input.kind)}</b></div>
    {input.byteLength != null ? <div><span>大小</span><b>{driveSizeLabel(input.byteLength)}</b></div> : null}
    <div><span>来源</span><b>{sourceLabel(input.source)}</b></div>
    {input.sessionId ? <div><span>关联会话</span><b>{input.sessionId}</b></div> : null}
    {input.updatedAt ? <div><span>更新时间</span><b>{new Date(input.updatedAt).toLocaleString()}</b></div> : null}
  </div>;
  return <section className="wd-drive-preview">
    <header className="wd-drive-preview-header">
      {onClose ? <button onClick={onClose}>← 返回列表</button> : null}
      <strong>{input.name}</strong>
      <span>{kindLabel(input.kind)} · {sourceLabel(input.source)}</span>
      <span className="spacer" />
      <button onClick={download}>下载</button>
    </header>
    <div className="wd-drive-preview-body">
      {busy ? <div className="wd-drive-state">正在读取文件…</div>
        : error ? <div className="wd-drive-state error">{error}</div>
        : url && (input.kind === 'image' || input.kind === 'video' || input.kind === 'audio') ? (input.kind === 'image' ? <img src={url} alt={input.name} /> : input.kind === 'video' ? <video src={url} controls /> : <audio src={url} controls />)
        : text ? <pre>{text}</pre>
        : url ? <div className="wd-drive-preview-meta-wrap">{meta}<button onClick={download}>下载文件</button></div>
        : meta}
    </div>
  </section>;
}
