export const modalCss = `
.wd-dialog-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:28px;background:rgba(0,0,0,.76)}
.wd-dialog{position:relative;width:min(1120px,calc(100vw - 56px));max-height:calc(100vh - 56px);overflow:auto;border:1px solid #313131;border-radius:28px;background:#202020;color:#e8e8e8;box-shadow:0 28px 90px rgba(0,0,0,.66);outline:none}
.wd-dialog-close{position:absolute;z-index:2;right:28px;top:28px;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:10px;background:#2d2d2d;color:#aaa;cursor:pointer}
.wd-dialog-close span{font-size:34px;font-weight:200;line-height:1;transform:translateY(-1px)}
.wd-dialog-close:hover{background:#383838;color:#eee}.wd-dialog-close:focus-visible{outline:2px solid #eee;outline-offset:2px}
@media(max-width:640px){.wd-dialog-backdrop{padding:0}.wd-dialog{width:100vw;max-height:100vh;height:100vh;border:0;border-radius:0}.wd-dialog-close{right:16px;top:16px}}
`;
