import * as React from 'react';
import type { ReactNode } from 'react';

/** Shared presentation only. No runtime services or domain state. */
export const tokens = { canvas: '#121212', sidebar: '#202020', card: '#242424', selected: '#3a3a3a', border: '#343434', text: '#e7e7e7', secondary: '#a5a5a5' } as const;
const paths = {
  panel: 'M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 4v16',
  search: 'M16 16l5 5M18 10a8 8 0 11-16 0 8 8 0 0116 0',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M7 10l5 5 5-5',
  task: 'M6 19l-3 2V9a9 9 0 119 9H6zM12 5v8M8 9h8',
  assistant: 'M9 3h6M12 1v2M7 6h10a3 3 0 013 3v9a3 3 0 01-3 3H7a3 3 0 01-3-3V9a3 3 0 013-3zM9 10h.01M15 10h.01M8 17a4 4 0 018 0',
  project: 'M8 9l8-4M8 12l8 6M8 11a3 3 0 11-6 0 3 3 0 016 0M21 4a3 3 0 11-6 0 3 3 0 016 0M21 19a3 3 0 11-6 0 3 3 0 016 0',
  experts: 'M5 4h12a4 4 0 014 4v6a7 7 0 01-14 0v-3H5a3 3 0 010-6M13 11a2 2 0 11-4 0 2 2 0 014 0M19 11a2 2 0 11-4 0 2 2 0 014 0M11 17h5',
  skills: 'M8 5L2 12l6 7M16 5l6 7-6 7M14 3l-4 18',
  connectors: 'M9 15l6-6M9 6l2-2a4 4 0 016 6l-2 2M15 18l-2 2a4 4 0 01-6-6l2-2',
  library: 'M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1',
  automation: 'M5 3L2 6M19 3l3 3M6 19l-2 3M18 19l2 3M12 8v5l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0',
  apps: 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z',
  more: 'M3 3h6v6H3zM17 2v8M13 6h8M6 14l4 7H2zM21 18a4 4 0 11-8 0 4 4 0 018 0',
  settings: 'M9 3l1-2h4l1 2 3 2 2 0 2 4-1 2v3l1 2-2 4h-2l-3 2h-6l-3-2H4l-2-4 1-2v-3L2 9l2-4h2zM16 12a4 4 0 11-8 0 4 4 0 018 0',
  folder: 'M3 5h6l2 3h10v12H3z',
  close: 'M6 6l12 12M18 6L6 18',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable={false}><path d={paths[name]} /></svg>;
}
export function NavItem({ label, icon, active, disabled, reason, onClick, compact = false }: { label: string; icon: IconName; active?: boolean; disabled?: boolean; reason?: string; onClick?: () => void; compact?: boolean }) {
  return <button type="button" className={`wd-nav-item${active ? ' is-active' : ''}`} disabled={disabled} title={disabled ? reason : label} onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined}>
    <span className="wd-icon-slot"><Icon name={icon} /></span>
    {!compact && <span>{label}</span>}
    {!compact && disabled && <small>待开放</small>}
  </button>;
}
export function IconButton({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return <button type="button" className="wd-icon-button" title={label} aria-label={label} onClick={onClick}><Icon name={icon} /></button>;
}
export function NavGroup({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return <details className="wd-nav-group" open><summary>{label}{count === undefined ? '' : ` (${count})`}<Icon name="chevron" size={12} /></summary>{children}</details>;
}
export const navigationCss = `
.wd-sidebar{height:100%;min-width:0;background:${tokens.sidebar};color:${tokens.text};font:14px/22px "PingFang SC","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid ${tokens.border}}
.wd-sidebar *{box-sizing:border-box}.wd-sidebar button,.wd-sidebar input{font:inherit;color:inherit}
.wd-sidebar button{cursor:pointer}.wd-sidebar :focus-visible{outline:2px solid #ddd;outline-offset:-2px}
.wd-sidebar .wd-top-tools{height:46px;display:flex;align-items:center;justify-content:flex-end;padding:0 14px;gap:8px;flex:none}
.wd-icon-button{border:0;background:transparent;width:32px;height:32px;display:inline-grid;place-items:center;color:#aaa;border-radius:6px;flex:none}
.wd-sidebar .wd-brand-row{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;margin-bottom:20px;flex:none}
.wd-sidebar .wd-brand-row strong{font-size:18px;font-weight:600}.wd-sidebar .wd-discover{background:#343434;border:0;border-radius:18px;padding:4px 10px;display:flex;gap:3px;align-items:center;font-size:12px;color:#aaa}
.wd-sidebar .wd-main-nav{padding:0 10px;flex:none}.wd-nav-item{width:100%;display:flex;align-items:center;gap:4px;border:0;background:transparent;border-radius:8px;min-height:36px;margin:0 0 2px;padding:6px 8px;text-align:left;white-space:nowrap}
.wd-icon-slot{width:26px;display:inline-flex;align-items:center;flex:none;color:#b9b9b9}.wd-nav-item.is-active{background:${tokens.selected};font-weight:500}.wd-nav-item small{margin-left:auto;color:#a5a5a5;font-size:10px;font-weight:400}.wd-nav-item:disabled{cursor:not-allowed}.wd-sidebar button:hover:not(:disabled){background:#383838}
.wd-sidebar .wd-list-scroll{overflow:auto;min-height:0;flex:1;padding:0 10px 20px;scrollbar-width:thin}.wd-nav-group{margin-top:26px}.wd-nav-group summary{list-style:none;display:flex;align-items:center;gap:6px;color:#a5a5a5;font-size:12px;padding:0 10px 12px;cursor:pointer}.wd-nav-group summary::-webkit-details-marker{display:none}.wd-nav-group:not([open]) summary svg{transform:rotate(-90deg)}
.wd-sidebar .wd-task-row{border:0;background:transparent;border-radius:6px;width:100%;display:flex;align-items:center;text-align:left;gap:8px;padding:8px 10px;min-height:36px}.wd-task-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wd-task-row.is-active{background:#343434}.wd-sidebar .wd-help{font-size:12px;line-height:20px;color:#a5a5a5;padding:0 10px;margin:0}.wd-sidebar .wd-filter{margin:0 12px 12px;display:flex;gap:4px}.wd-filter input{min-width:0;width:100%;background:#292929;border:1px solid #454545;border-radius:6px;padding:6px 8px}.wd-sidebar .wd-footer{padding:12px 10px;flex:none}.wd-sidebar.is-collapsed .wd-top-tools{padding:0;justify-content:center}.wd-sidebar.is-collapsed .wd-main-nav{padding:0 8px}.wd-sidebar.is-collapsed .wd-footer{padding:8px}.wd-sidebar.is-collapsed .wd-nav-item{justify-content:center;padding:6px}.wd-sidebar.is-collapsed .wd-icon-slot{width:auto}
.wd-modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.68);backdrop-filter:blur(2px)}
.wd-settings-modal{width:min(560px,calc(100vw - 32px));border:1px solid #444;border-radius:20px;background:#202020;color:${tokens.text};box-shadow:0 24px 80px rgba(0,0,0,.5);overflow:hidden}.wd-settings-modal header{display:flex;align-items:flex-start;justify-content:space-between;padding:28px 30px 18px}.wd-settings-modal h2{font-size:24px;line-height:32px;margin:3px 0 0}.wd-eyebrow{font-size:10px;letter-spacing:.18em;color:#777}.wd-modal-intro{margin:0;padding:0 30px 22px;color:#aaa;line-height:24px}.wd-setting-list{margin:0 30px;border:1px solid #3b3b3b;border-radius:12px;overflow:hidden}.wd-setting-list>div{display:flex;align-items:center;gap:14px;padding:16px}.wd-setting-list>div+div{border-top:1px solid #383838}.wd-setting-list svg{color:#aaa;flex:none}.wd-setting-list span{display:flex;flex-direction:column;gap:2px}.wd-setting-list strong{font-size:14px}.wd-setting-list small{color:#8f8f8f;font-size:12px}.wd-modal-note{margin:20px 30px 0;color:#888;font-size:12px;line-height:20px}.wd-settings-modal footer{display:flex;justify-content:flex-end;gap:10px;margin-top:26px;padding:18px 30px;border-top:1px solid #343434}.wd-button{border-radius:9px;padding:9px 16px;border:1px solid #464646}.wd-button-secondary{background:transparent;color:#ddd}.wd-button-primary{background:#eee;color:#171717;border-color:#eee;font-weight:600}.wd-button:hover{filter:brightness(1.08)}
@media(max-width:560px){.wd-sidebar .wd-nav-item,.wd-sidebar .wd-task-row,.wd-sidebar .wd-icon-button{min-height:44px}.wd-sidebar .wd-brand-row{margin-bottom:8px}.wd-sidebar .wd-main-nav{padding:0 6px}}
.wd-sidebar .wd-settings-modal .wd-button{flex:0 0 auto;width:auto}.wd-sidebar .wd-settings-modal .wd-button-secondary{background:transparent;color:#ddd}.wd-sidebar .wd-settings-modal .wd-button-primary{min-width:196px;background:#eee;color:#171717;border-color:#eee;font-weight:600}.wd-sidebar .wd-settings-modal .wd-button-primary:hover:not(:disabled){background:#fff;color:#111}
`;

export { Modal, modalCss, type ModalProps } from './components/Modal.js';
