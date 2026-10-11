import * as React from 'react';
import { useRef } from 'react';

export function DriveUploader({ onFiles, busy }: { onFiles: (files: readonly File[]) => Promise<void>; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} className="wd-drive-upload" type="file" multiple style={{ display: 'none' }} onChange={event => { void onFiles(event.currentTarget.files ? Array.from(event.currentTarget.files) : []); event.currentTarget.value = ''; }} />
    <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? '上传中…' : '上传文件'}</button>
  </>;
}
