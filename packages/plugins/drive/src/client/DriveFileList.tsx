import * as React from 'react';
import type { DriveFileKind, DriveTreeEntry } from 'workdsh-contracts/drive';

export type DriveMenuState = { entry: DriveTreeEntry; x: number; y: number };

const tileIcon = (entry: DriveTreeEntry): string => {
  if (entry.kind === 'folder') return '📁';
  const kind = entry.file?.kind;
  return kind === 'image' ? '🖼' : kind === 'video' ? '🎬' : kind === 'audio' ? '🎵' : kind === 'archive' ? '🗜' : kind === 'document' ? '📄' : '📦';
};
const kindLabel: Record<DriveFileKind, string> = { document: '文档', image: '图片', video: '视频', audio: '音频', archive: '压缩包', other: '文件' };
const sizeLabel = (bytes: number): string => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

export function DriveFileList({ entries, onOpen, onMenu }: { entries: readonly DriveTreeEntry[]; onOpen: (entry: DriveTreeEntry) => void; onMenu: (event: React.MouseEvent, entry: DriveTreeEntry) => void }) {
  if (!entries.length) return <div className="wd-drive-empty"><div><h2>这里还没有文件</h2><p>上传文件，或让对话产物自动归档到这里。</p></div></div>;
  return <div className="wd-drive-grid">{entries.map(entry => <div key={entry.id} className="wd-drive-tile" data-kind={entry.kind === 'folder' ? 'folder' : entry.file?.kind} onClick={() => onOpen(entry)}>
    <button className="wd-drive-tile-more" aria-label={`${entry.name} 更多操作`} onClick={event => { event.stopPropagation(); onMenu(event, entry); }}>•••</button>
    <div className="wd-drive-tile-icon">{tileIcon(entry)}</div>
    <div className="wd-drive-tile-name">{entry.name}</div>
    <div className="wd-drive-tile-meta">{entry.kind === 'folder' ? '文件夹' : `${kindLabel[entry.file?.kind ?? 'other']} · ${sizeLabel(entry.file?.byteLength ?? 0)}`}</div>
  </div>)}</div>;
}

export const driveSizeLabel = sizeLabel;
