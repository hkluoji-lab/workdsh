export const modalCss = `
.wd-dialog-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.68)}
.wd-dialog{position:relative;box-sizing:border-box;width:min(720px,calc(100vw - 48px));max-height:calc(100dvh - 48px);overflow:auto;scrollbar-width:thin;scrollbar-color:#454545 transparent;border:1px solid #343434;border-radius:16px;background:#202020;color:#e7e7e7;box-shadow:0 24px 72px #0008;outline:none;font:14px/22px "PingFang SC","Microsoft YaHei",sans-serif;animation:wd-dialog-enter .16s ease-out}
.wd-dialog *{box-sizing:border-box}
.wd-dialog button{font:inherit;white-space:nowrap}
.wd-dialog>.wd-dialog-close{position:absolute;z-index:2;right:16px;top:16px;width:32px;height:32px;min-height:32px;padding:0;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#a5a5a5;cursor:pointer}
.wd-dialog-close svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
.wd-dialog-close:hover{background:#383838;color:#eee}.wd-dialog-close:focus-visible{outline:2px solid #eee;outline-offset:2px}
@keyframes wd-dialog-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.wd-dialog{animation:none}}
@media(max-width:640px){.wd-dialog-backdrop{padding:12px}.wd-dialog{width:calc(100vw - 24px);max-height:calc(100dvh - 24px);height:auto;border-radius:12px}.wd-dialog>.wd-dialog-close{right:8px;top:8px;width:44px;height:44px;min-height:44px}}
`;
