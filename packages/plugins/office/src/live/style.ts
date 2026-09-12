export const officeCss = `
.wd-office-live{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;white-space:normal;line-height:1.4;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-fg-default,#20242c);background:var(--dsw-bg-default,#f4f5f7);font-size:13px}
.wd-office-live .wd-office-docpicker,.wd-office-live .wd-office-toolbar,.wd-office-live .wd-office-format{display:flex;align-items:center;gap:8px;padding:5px 12px;min-height:34px;flex-shrink:0;border-bottom:1px solid var(--dsw-border-default,#dde1e7);background:var(--dsw-bg-elevated,#fff)}
.wd-office-live .wd-office-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:40px}
.wd-office-live .wd-office-status{margin-left:auto;font-size:12px;color:var(--dsw-fg-muted,#697386);white-space:nowrap}
.wd-office-live button,.wd-office-live select{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-border-default,#d4d9e1);border-radius:5px;padding:3px 9px;min-height:28px;cursor:pointer}
.wd-office-live button:hover:enabled{background:var(--dsw-bg-hover,#edf3ff)}
.wd-office-live button:disabled,.wd-office-live select:disabled{opacity:.45;cursor:default}
.wd-office-live .tiptap-toolbar{height:44px;max-height:44px;min-width:0;flex:0 0 44px;display:flex;align-items:center;gap:4px;box-sizing:border-box;flex-shrink:0;max-width:100%;min-height:44px;padding:4px 8px;background:var(--dsw-bg-elevated,#fff);border-bottom:1px solid var(--dsw-border-default,#dde1e7);overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
.wd-office-live .wd-office-ribbon fieldset,.wd-office-live .wd-office-ribbon-row{display:contents;border:0;margin:0;padding:0;min-width:0}
.wd-office-live .wd-office-toolgroup,.wd-office-live .tiptap-toolbar-group{display:flex;align-items:center;gap:2px;flex:0 0 auto;padding-right:6px;border-right:1px solid var(--dsw-border-default,#e5e7eb)}
.wd-office-live .wd-office-toolgroup:last-child{border-right:0}
.wd-office-live .wd-office-ribbon button,.wd-office-live .wd-office-ribbon select{border:0;border-radius:6px;height:32px;min-height:32px;padding:4px 6px;flex:0 0 auto;box-sizing:border-box;font-size:13px}
.wd-office-live .wd-office-ribbon button{display:inline-flex;align-items:center;justify-content:center;min-width:32px}
.wd-office-live .tiptap-button-icon{width:18px;height:18px;flex-shrink:0}
.wd-office-live .wd-office-ribbon button:hover:enabled,.wd-office-live .wd-office-ribbon select:hover:enabled{background:#f1f2f5}
.wd-office-live .wd-office-ribbon :is(button,select,input):focus-visible{outline:2px solid #6685dd;outline-offset:-2px}
.wd-office-live button[aria-pressed=true]{color:#3159b9;background:#edf1fc;border-color:transparent}
.wd-office-live .wd-office-toolgroup select[aria-label="字体"]{width:108px}.wd-office-live .wd-office-toolgroup select[aria-label="字号"]{width:48px}.wd-office-live .wd-office-toolgroup select[aria-label="段落样式"]{width:80px}
.wd-office-live .wd-office-color{display:flex;align-items:center;gap:0;padding:0 2px;min-height:32px;box-sizing:border-box}
.wd-office-live .wd-office-color input{width:16px;height:20px;cursor:pointer;border:0;padding:0;background:transparent}
.wd-office-live .wd-office-color button{min-width:26px;padding:4px}
.wd-office-live fieldset:disabled .wd-office-color{opacity:.45}
.wd-office-live .wd-office-viewtools{display:flex;align-items:center;gap:2px;flex:0 0 auto;padding-right:6px;border-right:1px solid #e5e7eb}
.wd-office-live .wd-office-count{margin-left:auto;color:var(--dsw-fg-muted,#697386);font-size:12px}
.wd-office-live .wd-office-search{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px;flex-shrink:0;background:var(--dsw-bg-elevated,#fff);border-bottom:1px solid var(--dsw-border-default,#dde1e7)}
.wd-office-live .wd-office-search input{font:inherit;min-width:80px;width:130px;background:transparent;color:inherit;border:1px solid var(--dsw-border-default,#d4d9e1);border-radius:5px;padding:5px 8px}
.wd-office-live .wd-office-writing ul{list-style:disc;padding-left:28px;margin:8px 0 16px}.wd-office-live .wd-office-writing ol{list-style:decimal;padding-left:28px;margin:8px 0 16px}.wd-office-live .wd-office-writing li{display:list-item}.wd-office-live .wd-office-writing li p{margin-bottom:6px}
.wd-office-live .wd-office-docpicker select{flex:1;min-width:0;border:0}
.wd-office-live .wd-office-paper-scroll{flex:1;overflow:auto;padding:24px;min-height:0;background:var(--dsw-bg-subtle,#edf0f4)}
.wd-office-live .wd-office-paper{background:#fff;color:#222b39;max-width:794px;min-height:850px;margin:0 auto;padding:52px 56px;box-shadow:0 2px 10px #00000012;box-sizing:border-box}
.wd-office-live .wd-office-writing{outline:none;white-space:pre-wrap;overflow-wrap:anywhere;font-family:system-ui,sans-serif;font-size:16px;line-height:1.85;min-height:700px}
.wd-office-live .wd-office-writing p{margin:0 0 12px}.wd-office-live .wd-office-writing h1{font-size:30px;line-height:1.4;margin:28px 0 18px}.wd-office-live .wd-office-writing h2{font-size:24px;margin:24px 0 14px}.wd-office-live .wd-office-writing h3{font-size:20px;margin:20px 0 12px}
.wd-office-live .wd-office-problem{padding:8px 12px;color:#9b3824;background:#fff2e9;flex-shrink:0}
.wd-office-live .wd-office-import-note{padding:6px 12px;font-size:12px;line-height:1.6;background:#fff7e6;color:#6d531a;flex-shrink:0;border-bottom:1px solid #eadfc5}
.wd-office-live .wd-office-empty{margin:auto;padding:32px;max-width:430px;line-height:1.8}
@media(max-width:900px){.wd-office-live .wd-office-paper-scroll{padding:12px}.wd-office-live .wd-office-paper{padding:32px 24px}.wd-office-live .wd-office-title{max-width:160px}}
`;
