import * as React from 'react';
import { useEffect } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { LibraryClient } from './management.js';
import { libraryPickerRequestedEvent } from './selection-events.js';

type Props = PropsRuntime<'conversation.input.left'> & {
  management: LibraryClient;
  openLibrary: () => void;
  openPicker: (sessionId: string, draft: string, draftRev: number) => void;
};

const css = `.wd-library-picker-trigger{display:flex;align-items:center;gap:7px;height:36px;padding:0 9px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary,#aaa);font:inherit;cursor:pointer}.wd-library-picker-trigger:hover{background:var(--dsw-alias-bg-layer-3,#363636);color:#eee}.wd-library-picker-trigger .icon{display:grid;place-items:center;width:23px;height:23px;border-radius:7px;background:#177c58;color:#fff}`;

export function LibraryPicker({ sessionId, useInput, openPicker }: Props) {
  const draft = useInput(state => state.draft);
  const draftRev = useInput(state => state.draftRev);
  const launch = () => openPicker(String(sessionId), draft, draftRev);
  useEffect(() => {
    const show = () => launch();
    window.addEventListener(libraryPickerRequestedEvent, show);
    return () => window.removeEventListener(libraryPickerRequestedEvent, show);
  }, [draft, draftRev, sessionId]);
  return <><style>{css}</style><button type="button" className="wd-library-picker-trigger" aria-label="从资料库添加到对话" onClick={launch}><span className="icon">📚</span><span>资料库</span></button></>;
}
