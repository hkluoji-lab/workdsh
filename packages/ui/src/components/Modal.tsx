import * as React from 'react';
import { useEffect, useRef, type ReactNode } from 'react';

export type ModalProps = {
  readonly open: boolean;
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onClose: () => void;
};

/** Shared accessible dialog shell. Domain plugins own dialog content and actions. */
export function Modal({ open, label, children, className = '', onClose }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialog.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); dialog.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.documentElement.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="wd-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} className={`wd-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="wd-dialog-close" aria-label="关闭" onClick={onClose}><span aria-hidden>×</span></button>
        {children}
      </div>
    </div>
  );
}

export const modalCss = `
.wd-dialog-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:28px;background:rgba(0,0,0,.76)}
.wd-dialog{position:relative;width:min(1120px,calc(100vw - 56px));max-height:calc(100vh - 56px);overflow:auto;border:1px solid #313131;border-radius:28px;background:#202020;color:#e8e8e8;box-shadow:0 28px 90px rgba(0,0,0,.66);outline:none}
.wd-dialog-close{position:absolute;z-index:2;right:28px;top:28px;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:10px;background:#2d2d2d;color:#aaa;cursor:pointer}
.wd-dialog-close span{font-size:34px;font-weight:200;line-height:1;transform:translateY(-1px)}
.wd-dialog-close:hover{background:#383838;color:#eee}.wd-dialog-close:focus-visible{outline:2px solid #eee;outline-offset:2px}
@media(max-width:640px){.wd-dialog-backdrop{padding:0}.wd-dialog{width:100vw;max-height:100vh;height:100vh;border:0;border-radius:0}.wd-dialog-close{right:16px;top:16px}}
`;
