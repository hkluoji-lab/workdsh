/* Standalone, offline product prototype. All connections, AI responses and commands are simulated. */
(() => {
  'use strict';
  const paths = {
    terminal:'M4 5h16v14H4z M7 9l3 3-3 3 M13 15h4',
    server:'M4 3h16v7H4z M4 14h16v7H4z M7 6h.01 M7 17h.01 M11 6h6 M11 17h6',
    spark:'m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z',
    layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
    clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
    book:'M4 3h13a3 3 0 0 1 3 3v15H6a2 2 0 0 1-2-2z M4 17h16 M8 7h8 M8 11h5',
    chevron:'m9 5 7 7-7 7',
    down:'m6 9 6 6 6-6',
    plus:'M12 5v14 M5 12h14',
    close:'m6 6 12 12 M6 18 18 6',
    search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    folder:'M3 6h7l2 3h9v11H3z',
    file:'M5 3h9l5 5v13H5z M14 3v6h5 M9 13h6 M9 17h6',
    shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6',
    check:'m5 12 4 4L19 6',
    arrow:'M12 19V5 M5 12l7-7 7 7',
    copy:'M9 9h12v12H9z M15 9V3H3v12h6',
    play:'m7 4 14 8-14 8z',
    stop:'M6 6h12v12H6z',
    split:'M3 4h18v16H3z M12 4v16',
    panel:'M3 4h18v16H3z M15 4v16',
    link:'m10 13 4-4 M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0 M13 17a4 4 0 0 0 5 0l5-5a4 4 0 0 0-5-5l-2 2',
    globe:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M2 12h20 M12 2c6 7 6 13 0 20-6-7-6-13 0-20',
    cpu:'M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
    cloud:'M5 18a4 4 0 0 1-1-8 7 7 0 0 1 13-3 5 5 0 0 1 2 11z',
    laptop:'M5 3h14v12H5z M2 19h20l-3-4H5z',
    bolt:'m13 2-9 12h7l-1 8 10-13h-7z',
    upload:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
    download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',
    star:'m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z',
    edit:'m15 3 6 6 M4 15 16 3l5 5L9 20l-6 1z',
    trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    refresh:'M20 7a9 9 0 1 0 1 8 M20 2v6h-6',
    info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
    list:'M9 6h12 M9 12h12 M9 18h12 M3 6h.01 M3 12h.01 M3 18h.01',
    branch:'M6 3v12a3 3 0 0 0 3 3h3 M18 3v5a4 4 0 0 1-4 4H6 M4 3h4 M16 3h4 M12 16l3 2-3 2',
    key:'M14 8a5 5 0 1 1-5 5l-7 7H1v-4l8-8 M16 5h.01',
    history:'M3 4v6h6 M3 10a9 9 0 1 1 0 5 M12 7v5l4 2',
    help:'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
  };
  const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.terminal}"/></svg>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const btn = (text, action, ico, cls='', extra='') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${ico?icon(ico):''}${text}</button>`;
  const ib = (label, action, ico, extra='') => `<button class="icon-btn" aria-label="${label}" title="${label}" data-action="${action}" ${extra}>${icon(ico)}</button>`;
  const badge = (text, cls='') => `<span class="badge ${cls}">${text}</span>`;
  const uid = () => crypto.randomUUID?.() || String(Date.now()) + Math.random();
  const redact = text => state.preferences.redact ? String(text).replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+|(?:api[_-]?key|password|token)\s*[:=]\s*[^\s]+/gi,'[已脱敏]') : String(text);
  const stamp = () => new Date().toLocaleTimeString('zh-CN',{hour12:false});
  const hosts = [
    {id:'h1',name:'production-app-01',address:'10.20.0.11',port:22,user:'deploy',group:'生产环境',env:'生产',favorite:true,os:'Ubuntu 22.04',auth:'key'},
    {id:'h2',name:'staging-api',address:'10.20.1.24',port:22,user:'ubuntu',group:'测试环境',env:'测试',favorite:true,os:'Ubuntu 24.04',auth:'key'},
    {id:'h3',name:'production-db',address:'10.20.0.21',port:22,user:'admin',group:'生产环境',env:'生产',favorite:false,os:'Debian 12',auth:'key'},
    {id:'h4',name:'dev-playground',address:'10.20.2.8',port:2222,user:'dev',group:'开发环境',env:'开发',favorite:false,os:'Ubuntu 24.04',auth:'password'},
    {id:'local',name:'本地终端',address:'localhost',port:0,user:'developer',group:'本机',env:'本地',favorite:false,os:'macOS · Zsh',auth:'local'}
  ];
  const models = [
    {id:'m1',name:'DeepSeek',protocol:'deepseek',endpoint:'https://api.deepseek.com',model:'deepseek-chat',tools:true,status:'tested'},
    {id:'m2',name:'本地 Ollama',protocol:'ollama',endpoint:'http://localhost:11434/v1',model:'qwen3:8b',tools:false,status:'tested'}
  ];
  const snippets = [
    {id:'n1',name:'查看磁盘占用',tag:'系统检查',command:'df -h',desc:'检查各挂载点的空间使用情况。'},
    {id:'n2',name:'检查 Nginx 配置',tag:'服务排障',command:'nginx -t',desc:'验证配置语法，不重启服务。'},
    {id:'n3',name:'查看服务日志',tag:'服务排障',command:'journalctl -u nginx -n 50 --no-pager',desc:'查看最近 50 条 Nginx 服务日志。'},
    {id:'n4',name:'容器运行状态',tag:'容器管理',command:'docker ps',desc:'列出当前运行中的容器及端口映射。'}
  ];
  const initialBlocks = () => [
    {id:uid(),command:'pwd && uptime',output:'/srv/app\n 10:24:08 up 42 days,  3:18,  1 user,  load average: 0.18, 0.24, 0.21',code:0,time:'10:24:08',duration:'0.08s'},
    {id:uid(),command:'docker ps',output:'CONTAINER ID   IMAGE           STATUS          PORTS\n8af7c21b903d   app-web:1.8.2   Up 3 hours      127.0.0.1:3000->3000/tcp\nc319d8a5f74e   redis:7-alpine  Up 42 days      6379/tcp',code:0,time:'10:24:16',duration:'0.12s'},
    {id:uid(),command:'sudo systemctl restart nginx',output:'Job for nginx.service failed because the control process exited\nwith error code.\nSee "systemctl status nginx.service" and\n"journalctl -xeu nginx.service" for details.',code:1,time:'10:24:32',duration:'0.34s'}
  ];
  const makeSession = id => ({hostId:id,connected:true,cwd:id==='local'?'~/Projects':'/srv/app',input:'',blocks:id==='h1'?initialBlocks():[],messages:[],draft:'',busy:false,mode:'chat',model:'m1',history:[],historyAt:-1,context:{host:true,commands:true,selection:true,files:false},selection:'',fileContext:'',configFixed:false,requestId:null});
  const state = {page:'workspace',hosts,models,snippets,defaultModel:'m1',active:'h1',sessions:{h1:makeSession('h1'),h2:makeSession('h2'),local:makeSession('local')},tabs:['h1','h2','local'],ai:true,files:false,split:false,transfer:null,hostFilter:'全部主机',hostSearch:'',featureFilter:'全部',featureSearch:'',snippetSearch:'',history:[],settingsTab:'appearance',preferences:{fontSize:12,autoPanel:true,redact:true,retain:'30'},termSearch:'',showSearch:false,filePath:'/etc/nginx/conf.d',modal:null,modelTest:null};
  const app = document.querySelector('#app');
  const current = () => state.sessions[state.active];
  const host = id => state.hosts.find(h=>h.id===id);
  const fileWorkspace = window.createFileWorkspace({state,current,host,esc,icon,btn,render,notify,openModal,closeModal,aiPanel,sendAI,runCommand});
  const model = id => state.models.find(m=>m.id===id);
  function notify(text){const t=document.querySelector('#toast');t.textContent=text;t.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove('visible'),2800);}
  function record(type,title,command='',hostId=state.active){state.history.unshift({id:uid(),type,title,command,hostId,time:stamp()});}
  function topbar(){return `<header class="product-topbar"><div class="top-launchers"><div class="traffic" aria-hidden="true"><i></i><i></i><i></i></div>${[['workspace','terminal','终端'],['hosts','server','连接中心'],['snippets','bolt','快捷命令'],['models','spark','模型服务']].map(([p,i,n])=>`<button class="top-launcher ${state.page===p?'active':''}" data-action="nav" data-page="${p}" aria-label="${n}" title="${n}">${icon(i)}<span>${n}</span></button>`).join('')}</div><div class="top-session-strip" role="tablist" aria-label="主机会话">${state.tabs.map(id=>`<div class="top-session ${state.active===id&&['workspace','files'].includes(state.page)?'active':''}"><button role="tab" aria-selected="${state.active===id&&['workspace','files'].includes(state.page)}" data-action="top-session" data-id="${id}"><span class="dot ${state.sessions[id].connected?'':'off'}"></span><span>${esc(host(id).name)}</span>${host(id).env==='生产'?'<small>PROD</small>':''}</button><button data-action="close-tab" data-id="${id}" aria-label="关闭 ${esc(host(id).name)}" class="top-session-close">×</button></div>`).join('')}${ib('新建会话','new-session','plus')}</div><div class="top-utilities">${ib('搜索与切换主机','top-search','search')}${btn('AI','top-ai','spark','sm subtle')}${ib('偏好设置','nav','settings','data-page="settings"')}</div></header>`;}
  function navbar(){return `<aside class="context-rail"><nav aria-label="工作区工具">${[['workspace','terminal','终端工作区'],['files','folder','文件工作区'],['history','history','会话记录']].map(([p,i,n])=>`<button class="nav-btn ${state.page===p?'active':''}" aria-label="${n}" title="${n}" data-action="nav" data-page="${p}">${icon(i)}</button>`).join('')}</nav><div class="rail-bottom">${ib('功能清单','nav','list','data-page="features"')}${ib('原型导览','guide','help')}</div></aside>`;}
  function render(preserve=false){
    let focus;
    if(preserve){const el=document.activeElement;if(el?.id)focus={id:el.id,start:el.selectionStart,end:el.selectionEnd};}
    const titles={files:'文件工作区',workspace:'终端工作区',hosts:'主机管理',models:'模型服务',snippets:'快捷命令',history:'会话记录',features:'功能清单',settings:'偏好设置'};
    const h=host(state.active);
    document.documentElement.style.setProperty('--terminal-size',state.preferences.fontSize+'px');
    app.innerHTML=`<div class="shell">${topbar()}
    <div class="shell-body ${state.page==='files'?'file-focus':''}">${navbar()}<main class="main">${['workspace','files'].includes(state.page)?`<div class="page-toolbar between"><div class="breadcrumb">${h&&['workspace','files'].includes(state.page)?esc(h.name):'个人工作空间'}<span class="slash">/</span><b>${titles[state.page]}</b></div><div class="toolbar-actions">${state.page==='workspace'?`${btn('文件','toggle-files','folder',state.files?'subtle sm':'sm')}${ib('搜索当前输出','toggle-search','search')}${ib('分屏布局演示','toggle-split','split')}${btn(`<span>AI 助手</span> <kbd>⌘ J</kbd>`,'toggle-ai','spark',state.ai?'subtle sm':'sm')}`:``}</div></div>`:''}
    ${({files:fileWorkspace.page,workspace:workspace,hosts:hostsPage,models:modelsPage,snippets:snippetsPage,history:historyPage,features:featuresPage,settings:settingsPage}[state.page])()}</main></div>
    <footer class="statusbar"><div class="flex">${icon('shield')}<span title="SSH、文件传输和 AI 均为模拟；刷新重置数据">原型 · 模拟数据</span><span class="optional muted">|</span><span class="optional">${state.tabs.length} 个会话</span></div><div class="flex"><span>${['workspace','files'].includes(state.page)&&h?esc(h.user+'@'+h.address):''}</span><span class="dot"></span></div></footer></div>`;
    if(focus){const el=document.getElementById(focus.id);if(el){el.focus();if(typeof focus.start==='number'&&el.setSelectionRange)el.setSelectionRange(focus.start,focus.end);}}
  }
  function renderOutput(text){if(!state.termSearch)return esc(text);const q=state.termSearch.toLowerCase(),str=String(text);let out='',last=0,at;while((at=str.toLowerCase().indexOf(q,last))!==-1){out+=esc(str.slice(last,at))+'<mark>'+esc(str.slice(at,at+q.length))+'</mark>';last=at+q.length;}return out+esc(str.slice(last));}
  function workspace(){
    const s=current(),h=host(state.active);
    return `<div class="work-layout ${!state.ai?'ai-hidden':''}"><section class="terminal-area" aria-label="模拟终端">
      <div class="session-tabs" role="tablist" aria-label="终端会话">${state.tabs.map(id=>`<button class="session-tab ${id===state.active?'active':''}" role="tab" aria-selected="${id===state.active}" data-action="open-host" data-id="${id}"><span class="dot ${state.sessions[id].connected?'':'off'}"></span>${esc(host(id).name)}<span class="tab-close" data-action="close-tab" data-id="${id}" role="button" aria-label="关闭 ${esc(host(id).name)}">×</span></button>`).join('')}<button class="session-add" data-action="new-session" aria-label="打开新会话">${icon('plus')}</button></div>
      ${!s?`<div class="empty-state"><h2>暂无会话</h2>${btn('选择主机','nav','server','primary','data-page="hosts"')}</div>`:`
      <div class="terminal-meta between"><div class="flex">${icon(h.id==='local'?'laptop':'server')}<span>${esc(h.user+'@'+h.address)}</span>${badge(h.env,h.env==='生产'?'amber':'green')}</div><span>${s.connected?'●  '+(h.id==='local'?'本地':'SSH · 24ms'):'○ 已断开'}</span></div>
      ${!s.connected?`<div class="offline-banner between"><span>连接已断开，历史输出已保留。</span>${btn('重新连接','reconnect','refresh','sm')}</div>`:''}
      ${state.showSearch?`<div class="search-row"><input id="term-search" aria-label="搜索终端输出" placeholder="搜索当前会话输出…" value="${esc(state.termSearch)}"><span class="small muted">${state.termSearch?s.blocks.reduce((n,b)=>n+((b.command+'\n'+b.output).toLowerCase().split(state.termSearch.toLowerCase()).length-1),0)+' 处匹配':'保留的输出'}</span>${ib('关闭搜索','toggle-search','close')}</div>`:''}
      <div class="terminal-scroll" id="terminal-scroll">
      ${s.blocks.map(b=>`<div class="command-block ${b.code!==0?'error':''}" id="block-${b.id}"><div class="prompt-line"><span class="prompt-arrow">❯</span><span class="prompt-path">${esc(s.cwd)}</span><span class="command-text">${renderOutput(b.command)}</span></div><pre class="term-output ${b.code!==0?'red':''}">${renderOutput(b.output)}</pre><div class="command-footer"><span>${b.code===null?'状态未知':b.code===0?'✓ exit 0':'× exit '+b.code} <span style="margin:0 8px;color:#455448">·</span> ${b.duration} <span style="margin:0 8px;color:#455448">·</span> ${b.time}${b.ai?' · AI 协助':''}</span>${b.code!==0?`<button data-action="analyze" data-id="${b.id}">${icon('spark')}分析错误</button>`:`<button style="background:none;border-color:transparent;color:#72886b" data-action="explain" data-id="${b.id}">${icon('spark')}解释</button>`}</div></div>`).join('')}
      <form id="terminal-form" class="term-input-wrap"><span class="prompt-arrow">❯</span><span class="prompt-path mono small">${esc(s.cwd)}</span><input id="terminal-input" aria-label="模拟终端命令输入" autocomplete="off" spellcheck="false" placeholder="${s.connected?'输入命令，或按 ⌘ J 呼唤 AI…':'连接断开，请先重新连接'}" value="${esc(s.input)}" ${!s.connected?'disabled':''}></form></div>
      ${state.split?`<div class="split-preview"><div class="between"><span class="muted">本地终端 · 只读预览</span>${ib('关闭分屏演示','toggle-split','close')}</div><span class="green">❯</span> ~/Projects <span style="color:#d7e4ca">git status --short</span><br><span style="color:#839d73">工作区干净。</span></div>`:''}
      ${state.files?filePanel():''}${state.transfer?transferPanel():''}
      <div class="terminal-hint"><span>询问选区 ${badge('⌘ / Ctrl + J')}</span><button class="text-btn" data-action="ask-selection">${icon('spark')}询问选中内容</button></div>
      <div class="resourcebar between"><div class="flex"><div class="mini-bars">${'<i></i>'.repeat(13)}</div><span>CPU <b>2.4%</b></span><span>MEM <b>1.8 / 8 GB</b></span><span class="optional">DISK <b>38%</b></span></div><button class="text-btn" data-action="monitor" style="font-size:9px">监控样例 ${icon('chevron')}</button></div>`}
    </section>${state.ai&&s?aiPanel():''}</div>`;
  }
  function aiPanel(){
    const s=current(),h=host(state.active),m=model(s.model);
    return `<aside class="ai-panel" aria-label="AI 助手"><div class="ai-head"><div class="flex"><span class="ai-symbol">${icon('spark')}</span><span class="title">AI 助手</span></div><div class="flex" style="gap:1px">${ib('新建当前主机对话','clear-chat','plus')}${ib('收起 AI 面板','toggle-ai','panel')}</div></div>
      <div class="ai-context"><div class="context-top"><span>${icon('link')} 仅关联当前会话</span><button class="text-btn" data-action="context" style="color:#acc397;padding:0">查看上下文 ${icon('chevron')}</button></div><div class="context-host">${icon('server')}<span>${esc(h.name)}</span>${h.env==='生产'?badge('生产','amber'):''}</div></div>
      <div class="ai-scroll" id="ai-scroll">${s.messages.length?s.messages.map(renderMessage).join(''):`<button class="ai-starter" data-action="quick" data-prompt="分析刚才的报错"><span class="flex">${icon('spark')}分析刚才的报错</span>${icon('chevron')}</button><button class="ai-starter" data-action="quick" data-prompt="查看当前服务器的磁盘占用"><span class="flex">${icon('cpu')}检查磁盘占用</span>${icon('chevron')}</button><button class="ai-starter" data-action="quick" data-prompt="解释上一条命令"><span class="flex">${icon('terminal')}解释上一条命令</span>${icon('chevron')}</button>`}
      ${s.busy?`<div class="thinking"><i></i><i></i><i></i><span style="margin-left:7px">正在生成…</span></div>`:''}</div>
      <div class="ai-compose">${s.selection?`<div class="between small green" style="margin-bottom:7px"><span>已引用选区 · ${s.selection.length} 字符</span>${ib('移除选区','clear-selection','close')}</div>`:''}<form id="ai-form" class="compose-box"><textarea id="ai-input" rows="2" placeholder="输入问题…" aria-label="向 AI 提问">${esc(s.draft)}</textarea><div class="compose-bottom"><div class="mode-switch" aria-label="AI 模式"><button type="button" class="${s.mode==='chat'?'active':''}" data-action="mode" data-mode="chat">问答</button><button type="button" class="${s.mode==='assist'?'active':''}" data-action="mode" data-mode="assist">协助 ${s.mode==='assist'?'':'↗'}</button></div>${s.busy?`<button type="button" class="send-button" data-action="stop-ai" aria-label="停止生成">${icon('stop')}</button>`:`<button type="submit" class="send-button" aria-label="发送问题">${icon('arrow')}</button>`}</div></form>
      <div class="model-choice"><select id="chat-model" aria-label="当前会话模型">${state.models.map(x=>`<option value="${x.id}" ${s.model===x.id?'selected':''}>${esc(x.name)} · ${esc(x.model)}</option>`).join('')}${!m?'<option value="">未配置模型</option>':''}</select><span>演示回答</span></div></div></aside>`;
  }
  function renderMessage(msg){
    if(msg.role==='user')return `<div class="message user">${msg.selection?`<div class="quote">${esc(msg.selection.slice(0,240))}${msg.selection.length>240?'…':''}</div>`:''}${esc(msg.text)}</div>`;
    return `<div class="message"><div class="author"><span class="ai-symbol" style="width:21px;height:21px">${icon('spark')}</span>AI<span class="muted tiny">· 模拟回答</span></div><div class="body">${msg.html}</div>${msg.command?`<div class="code-card"><div class="label"><span>${esc(msg.hostName)}</span><span>${msg.readonly?'诊断建议':'命令建议'}</span></div><pre>${esc(msg.command)}</pre><div class="code-actions">${btn('收藏','save-suggestion','star','sm',`data-command="${esc(msg.command)}"`)}${btn('复制','copy-command','copy','sm',`data-command="${esc(msg.command)}"`)}${btn('填入终端','fill-command','terminal','sm subtle',`data-command="${esc(msg.command)}" data-target="${msg.hostId}"`)}${current().mode==='assist'?btn('执行…','confirm-command','play','sm primary',`data-command="${esc(msg.command)}" data-target="${msg.hostId}"`):''}</div></div>`:''}${msg.result?`<div class="run-result">${icon('check')} ${esc(msg.result)}</div>`:''}</div>`;
  }
  function hostsPage(){
    const q=state.hostSearch.toLowerCase(),all=state.hosts.filter(h=>h.id!=='local'),list=all.filter(h=>(state.hostFilter==='全部主机'||state.hostFilter==='已收藏'&&h.favorite||h.env===state.hostFilter)&&[h.name,h.address,h.user,h.group,h.env].join(' ').toLowerCase().includes(q));
    return `<div class="page-scroll"><div class="page-heading"><h1>主机管理</h1>${btn('添加主机','new-host','plus','primary')}</div>
    <div class="filters"><div class="filter-pills">${['全部主机','已收藏','生产','测试','开发'].map(f=>`<button class="pill ${state.hostFilter===f?'active':''}" data-action="host-filter" data-value="${f}">${f}${f==='全部主机'?' '+all.length:''}</button>`).join('')}</div><div class="search-input">${icon('search')}<input id="host-search" aria-label="搜索主机" value="${esc(state.hostSearch)}" placeholder="搜索名称、IP、标签…"></div></div>
    <div class="table-wrap"><table class="host-table"><thead><tr><th style="width:30%">主机名称</th><th>连接地址</th><th class="hide-medium">环境</th><th class="hide-small">认证方式</th><th class="hide-mobile">状态</th><th>操作</th></tr></thead><tbody>${list.map(h=>`<tr><td><div class="flex"><div class="host-icon">${icon('server')}</div><div><div class="host-name">${esc(h.name)}</div><div class="tiny muted">${esc(h.group)}</div></div></div></td><td><div class="mono">${esc(h.address)}<span class="muted">:${h.port}</span></div><div class="tiny muted">${esc(h.user)}</div></td><td class="hide-medium">${badge(h.env,h.env==='生产'?'amber':'green')}</td><td class="hide-small muted">${icon(h.auth==='key'?'key':'lock')} ${h.auth==='key'?'私钥':'密码'}</td><td class="hide-mobile"><span class="flex small"><span class="dot ${state.sessions[h.id]?.connected?'':'off'}"></span>${state.sessions[h.id]?.connected?'已连接':'未连接'}</span></td><td><div class="actions">${btn(state.sessions[h.id]?.connected?'打开':'连接','connect-host','terminal','sm',`data-id="${h.id}"`)}${ib('编辑 '+h.name,'edit-host','edit',`data-id="${h.id}"`)}<button class="icon-btn star ${h.favorite?'on':''}" aria-label="${h.favorite?'取消收藏':'收藏'} ${esc(h.name)}" data-action="favorite" data-id="${h.id}">${icon('star')}</button></div></td></tr>`).join('')||`<tr><td colspan="6"><div class="empty-state"><h2>没有匹配的主机</h2><p>试试其他名称、IP 或环境标签。</p>${btn('清空筛选','clear-host-search','refresh','sm')}</div></td></tr>`}</tbody></table></div></div>`;
  }
  function modelsPage(){return `<div class="page-scroll"><div class="page-heading"><h1>模型服务</h1>${btn('添加模型服务','new-model','plus','primary')}</div>
    
    <div class="model-grid">${state.models.map(m=>`<article class="model-card ${m.id===state.defaultModel?'default':''}"><div class="between"><div class="flex"><span class="provider-logo ${m.protocol==='deepseek'?'blue':m.protocol==='anthropic'?'orange':''}">${m.protocol==='deepseek'?'D':m.protocol==='ollama'?'◎':m.protocol==='anthropic'?'A':'↗'}</span><div><h3>${esc(m.name)}</h3><span class="tiny muted">${m.protocol==='ollama'?'本地模型':m.protocol==='deepseek'?'DeepSeek API':'自定义接口'}</span></div></div>${badge(m.id===state.defaultModel?'默认服务':m.status==='tested'?'已测试':'未测试',m.id===state.defaultModel?'green':'')}</div><div class="endpoint">${esc(m.endpoint)}</div><div class="capabilities"><span>${icon('check')} 对话</span><span>${icon('check')} 流式输出</span><span class="${!m.tools?'muted':''}">${icon(m.tools?'check':'info')} ${m.tools?'工具调用':'仅问答 · 样例配置'}</span></div><div class="model-footer"><span class="mono">${esc(m.model)}</span><div class="flex" style="gap:4px">${m.id!==state.defaultModel?btn('设为默认','default-model',null,'sm',`data-id="${m.id}"`):''}${ib('编辑 '+m.name,'edit-model','settings',`data-id="${m.id}"`)}</div></div></article>`).join('')}
    </div>
    </div>`;}
  function snippetsPage(){
    const list=state.snippets.filter(n=>(n.name+n.command+n.tag).toLowerCase().includes(state.snippetSearch.toLowerCase()));
    return `<div class="page-scroll"><div class="page-heading"><h1>快捷命令</h1>${btn('新建快捷命令','new-snippet','plus','primary')}</div><div class="filters"><span class="muted small">${state.snippets.length} 条快捷命令</span><div class="search-input">${icon('search')}<input id="snippet-search" aria-label="搜索快捷命令" value="${esc(state.snippetSearch)}" placeholder="搜索命令或标签…"></div></div><div class="snippet-grid">${list.map(n=>`<article class="snippet-card"><div class="between"><h3>${esc(n.name)}</h3>${badge(esc(n.tag))}</div><pre>${esc(n.command)}</pre><p>${esc(n.desc)}</p><div class="between" style="margin-top:16px"><div>${ib('编辑 '+n.name,'edit-snippet','edit',`data-id="${n.id}"`)}${ib('删除 '+n.name,'delete-snippet','trash',`data-id="${n.id}"`)}</div>${btn('填入终端','fill-command','terminal','sm subtle',`data-command="${esc(n.command)}"`)}</div></article>`).join('')||'<div class="empty-state">没有匹配的快捷命令。</div>'}</div></div>`;
  }
  function historyPage(){
    const rows=state.history;
    return `<div class="page-scroll"><div class="page-heading"><h1>会话记录</h1>${btn('导出演示记录','export-history','download')}</div><p class="small muted">${rows.length} 条记录 · 刷新后清空</p>
    ${rows.length?rows.map(r=>`<div class="timeline-item"><div class="timeline-line">${icon(r.type==='ai'?'spark':r.type==='command'?'terminal':'check')}</div><div class="timeline-content"><div class="between"><h3>${esc(r.title)}</h3><span class="mono small muted">${r.time}</span></div><div class="tiny muted">${esc(host(r.hostId)?.name||'配置操作')} · ${r.type==='ai'?'AI 问答':r.type==='command'?'模拟执行':'工作空间'}</div>${r.command?`<pre>${esc(r.command)}</pre>`:''}</div>${host(r.hostId)?btn('返回会话','open-host','chevron','sm',`data-id="${r.hostId}"`):''}</div>`).join(''):`<div class="history-empty">${icon('history')}<h2 style="margin:12px 0 6px">暂无记录</h2>${btn('前往终端','nav','terminal','primary','data-page="workspace"')}</div>`}</div>`;
  }
  function featuresPage(){
    const fs=window.FEATURES,q=state.featureSearch.toLowerCase(),list=fs.filter(f=>(state.featureFilter==='全部'||f.priority===state.featureFilter)&&[f.id,f.name,f.module,f.detail].join(' ').toLowerCase().includes(q));
    return `<div class="page-scroll"><div class="page-heading"><h1>功能清单</h1><a class="btn" href="FEATURES.md" target="_blank">${icon('book')}完整需求文档</a></div><div class="feature-overview">${[['全部需求',fs.length],['P0 · 首版必需',fs.filter(f=>f.priority==='P0').length],['P1 · 下一阶段',fs.filter(f=>f.priority==='P1').length],['P2 · 后续扩展',fs.filter(f=>f.priority==='P2').length]].map(([l,n])=>`<div class="stat"><div class="num">${n.toString().padStart(2,'0')}</div><div class="label">${l}</div></div>`).join('')}</div><div class="filters"><div class="filter-pills">${['全部','P0','P1','P2'].map(p=>`<button class="pill ${state.featureFilter===p?'active':''}" data-action="feature-filter" data-value="${p}">${p}</button>`).join('')}</div><div class="search-input">${icon('search')}<input id="feature-search" value="${esc(state.featureSearch)}" aria-label="搜索功能需求" placeholder="搜索模块、功能或需求编号…"></div></div><div class="table-wrap"><table class="feature-table"><thead><tr><th>编号 / 模块</th><th>功能与范围</th><th>优先级</th><th>原型覆盖</th></tr></thead><tbody>${list.map(f=>`<tr data-action="feature-detail" data-id="${f.id}" tabindex="0" role="button" aria-label="查看 ${f.name}"><td><div class="req-id">${f.id}</div><div class="tiny muted">${f.module}</div></td><td><div class="req-title">${f.name}</div><div class="req-detail">${f.detail}</div></td><td>${badge(f.priority,f.priority==='P0'?'green':f.priority==='P1'?'amber':'')}</td><td><span class="small muted">${f.coverage}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty-state">没有匹配的需求。</td></tr>'}</tbody></table></div></div>`;
  }
  function settingsPage(){return `<div class="page-scroll"><div class="page-heading"><h1>偏好设置</h1>${btn('恢复默认','reset-prefs','refresh')}</div><div class="settings-layout"><nav class="settings-menu">${[['appearance','外观与终端'],['context','AI 与上下文'],['storage','数据与隐私']].map(([id,t])=>`<button data-action="settings-tab" data-value="${id}" class="${state.settingsTab===id?'active':''}">${t}</button>`).join('')}</nav><div>
    ${state.settingsTab==='appearance'?`<section class="settings-section"><h3>终端外观</h3><div class="setting-row"><div>深色 · 石墨</div>${badge('当前主题','green')}</div><div class="setting-row"><div>终端字号<p><span id="font-value">${state.preferences.fontSize}</span> px · 即时应用到模拟终端</p></div><input type="range" id="font-size" aria-label="终端字号" min="11" max="17" value="${state.preferences.fontSize}"></div><div class="setting-row"><div>默认展开 AI 面板<p>打开会话时自动展开。</p></div><button class="toggle ${state.preferences.autoPanel?'on':''}" role="switch" aria-checked="${state.preferences.autoPanel}" aria-label="默认展开 AI 面板" data-action="toggle-pref" data-key="autoPanel"></button></div></section><section class="settings-section"><h3>快捷键</h3>${[['唤起 / 收起 AI','⌘ / Ctrl + J'],['搜索终端输出','⌘ / Ctrl + F'],['发送 AI 问题','Enter'],['问题中换行','Shift + Enter'],['关闭弹窗','Esc']].map(([l,k])=>`<div class="setting-row"><span>${l}</span><kbd>${k}</kbd></div>`).join('')}</section>`:state.settingsTab==='context'?`<section class="settings-section"><h3>AI 上下文</h3><div class="setting-row"><div>自动脱敏<p>常见令牌与口令在发送预览中隐藏。</p></div><button class="toggle ${state.preferences.redact?'on':''}" role="switch" aria-checked="${state.preferences.redact}" aria-label="自动脱敏" data-action="toggle-pref" data-key="redact"></button></div><div class="setting-row"><div>上下文范围<p>每个会话单独选择主机信息、最近命令与选区。</p></div>${btn('查看当前会话','context','link','sm')}</div><div class="setting-row"><div>服务切换<p>更换服务不会自动重发消息。</p></div>${badge('始终开启','green')}</div></section><div class="review-note">SSH 凭据和模型密钥不加入上下文。</div>`:`<section class="settings-section"><h3>本地数据</h3><div class="setting-row"><div>历史保留期限<p>正式产品按此期限清理本地历史。</p></div><select id="history-retain" aria-label="历史保留期限">${[['7','7 天'],['30','30 天'],['90','90 天']].map(([v,t])=>`<option value="${v}" ${state.preferences.retain===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="setting-row"><div>原型数据<p>所有主机、密钥输入与对话均不持久保存。</p></div>${badge('仅内存','green')}</div><div class="setting-row"><div>导出本次记录<p>只导出模拟操作记录，不含任何密钥。</p></div>${btn('导出','export-history','download','sm')}</div></section><div class="review-note">原型不保存数据，请勿输入真实密钥。</div>`}</div></div></div>`;}
  function filePanel(){return `<div class="file-panel"><div class="file-head between"><span class="flex">${icon('folder')}远程文件 <span class="mono tiny muted">${esc(state.filePath)}</span></span><div class="flex" style="gap:2px">${btn('上传样例','upload-demo','upload','sm')}${ib('返回上级目录','file-up','arrow')}${ib('关闭文件面板','toggle-files','close')}</div></div>${(state.filePath==='/etc/nginx/conf.d'?[['app.conf','1.2 KB','10:21'],['default.conf','648 B','09:12']]:[['conf.d','目录','09:12'],['nginx.conf','2.3 KB','昨天']]).map(([name,size,time])=>`<button class="file-row" data-action="${size==='目录'?'file-dir':'file-open'}" data-name="${name}">${icon(size==='目录'?'folder':'file')}<span class="file-name">${name}</span><span class="mono">${size}</span><span class="mono">${time}</span>${icon('chevron')}</button>`).join('')}</div>`;}
  function transferPanel(){return `<div class="transfer-panel"><div class="between"><div class="flex">${icon('upload')}deployment-notes.txt<span class="tiny muted">${state.transfer.state==='running'?'上传到 /srv/app':state.transfer.state==='cancelled'?'已取消':'模拟传输完成'}</span></div>${state.transfer.state==='running'?btn('取消','cancel-transfer',null,'sm'):ib('关闭传输状态','close-transfer','close')}</div><div class="progress-track"><div class="progress-fill" style="width:${state.transfer.progress}%"></div></div><div class="tiny muted" style="margin-top:5px">${state.transfer.progress}% · 演示文件，不读取本机文件</div></div>`;}
  function openHost(id){if(!host(id))return;if(!state.sessions[id]){state.sessions[id]=makeSession(id);state.sessions[id].model=state.defaultModel;}if(!state.tabs.includes(id))state.tabs.push(id);state.active=id;state.page='workspace';state.ai=state.preferences.autoPanel;state.termSearch='';state.showSearch=false;state.files=false;render();}
  function scrollPanels(){for(const id of ['terminal-scroll','ai-scroll']){const el=document.getElementById(id);if(el)el.scrollTop=el.scrollHeight;}}
  function fillCommand(command,target){if(!current()){notify('请先打开一个终端会话。');return;}if(target&&target!==state.active){notify('这条建议属于另一台主机，请返回对应会话。');return;}if(!current().connected){notify('当前连接已断开，请先重新连接。');return;}state.page='workspace';current().input=command;render();document.getElementById('terminal-input')?.focus();scrollPanels();notify('已填入终端，尚未执行。');}
  function commandResult(command,s){
    const c=command.trim();
    if(c==='clear')return {clear:true};
    if(c==='pwd')return {output:s.cwd};
    if(c==='whoami')return {output:host(s.hostId).user};
    if(/^cd(?:\s|$)/.test(c)){const path=c.slice(2).trim()||'~';if(path.includes(';')||path.includes('&&'))return {output:'原型只演示单条 cd 指令。',code:1};s.cwd=path;return {output:''};}
    if(c.includes('nginx -t'))return s.configFixed?{output:'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful'}:{output:'nginx: [emerg] unexpected "}" in /etc/nginx/conf.d/app.conf:18\nnginx: configuration file /etc/nginx/nginx.conf test failed',code:1};
    if(c.includes('systemctl')&&(/restart|reload/.test(c)))return s.configFixed?{output:'nginx.service: configuration reloaded successfully.'}:{output:'Job for nginx.service failed because the control process exited\nwith error code. Run nginx -t to check the configuration.',code:1};
    if(c.includes('journalctl')||c.includes('systemctl status'))return {output:'Sep 08 10:24:32 app-01 nginx[18421]: unexpected "}" in app.conf:18\nSep 08 10:24:32 app-01 systemd[1]: nginx.service: Failed with result exit-code.'};
    if(c.includes('df -h'))return {output:'Filesystem      Size  Used  Avail  Use%  Mounted on\n/dev/vda1        80G   29G    48G   38%  /\ntmpfs           3.9G   12M   3.9G    1%  /run'};
    if(c.includes('docker ps'))return {output:'CONTAINER ID   IMAGE           STATUS       PORTS\n8af7c21b903d   app-web:1.8.2   Up 3 hours   127.0.0.1:3000->3000/tcp'};
    if(c==='ls'||c.startsWith('ls '))return {output:'app.conf   default.conf   logs/   releases/'};
    if(c.includes('free'))return {output:'              total        used        free\nMem:          7.8Gi       1.8Gi       4.2Gi\nSwap:         2.0Gi          0B       2.0Gi'};
    if(c==='help')return {output:'可演示命令：pwd、whoami、cd、ls、df -h、docker ps、nginx -t、\njournalctl -u nginx -n 50 --no-pager、sudo systemctl reload nginx、clear。\n所有命令均为本地模拟，不会执行系统操作。'};
    return {output:'[演示模式] 已记录输入，但该命令没有预置执行结果。\n输入 help 查看可演示命令；不会执行任何真实命令。',code:null};
  }
  function runCommand(command,ai=false,id=state.active){
    const s=state.sessions[id];if(!s?.connected){notify('连接不可用，命令未提交。');return;}const result=commandResult(command,s);
    s.input='';if(result.clear){s.blocks=[];render();return;}s.blocks.push({id:uid(),command,output:result.output||'',code:result.code===undefined?0:result.code,time:stamp(),duration:'0.12s',ai});s.history.push(command);s.historyAt=s.history.length;
    record('command',(ai?'AI 协助 · ':'手工操作 · ')+(result.code===null?'无预置结果':result.code?'执行失败':'模拟执行'),command,id);
    if(ai){s.messages.push({role:'assistant',html:result.code?'<p>配置检查失败，结果定位到 <strong>app.conf 第 18 行附近</strong>。需要查看相邻配置，确认是否缺少分号。</p>'+btn('查看配置与修改建议','file-open','file','sm subtle','data-name="app.conf"'):'<p>检查已完成。请结合目标环境确认下一步操作。</p>',result:result.code?'检查未通过 · exit 1':'模拟执行完成 · exit 0'});}
    render();scrollPanels();if(!ai&&id===state.active)document.getElementById('terminal-input')?.focus();
  }
  function sendAI(question,selection=''){
    const s=current();if(!s)return;if(s.busy){notify('正在生成，请先等待或停止。');return;}if(!model(s.model)){state.page='models';render();notify('先添加一个模型服务，问题草稿已保留。');return;}
    const id=state.active,h=host(id),requestId=uid(),m=model(s.model);
    const contextSnapshot={...s.context},lastBlock=s.blocks.at(-1);
    const quoted=contextSnapshot.selection?redact(selection||s.selection):'';
    s.messages.push({role:'user',text:question,selection:quoted});s.draft='';s.selection='';s.busy=true;s.requestId=requestId;state.ai=true;render();scrollPanels();
    record('ai',question,m.name+' · '+m.model,id);
    setTimeout(()=>{
      if(!state.sessions[id]||s.requestId!==requestId)return;
      s.busy=false;s.requestId=null;
      let html,command='',readonly=true;
      if(question.includes('模拟失败')){html='<p class="red">模型服务暂时不可用（模拟超时）。问题已保留，终端可以继续使用。</p><p>可重新提问，或前往模型设置检查服务。</p>'+btn('检查模型配置','nav','settings','sm','data-page="models"');}
      else if((!contextSnapshot.commands&&!quoted&&!contextSnapshot.files)||(!lastBlock&&!quoted&&!s.fileContext&&!/磁盘|空间/.test(question))){html='<p>本次未附带命令输出或选区，我还没有足够证据分析当前错误。你可以在“查看上下文”中选择需要分享的内容，也可以直接描述问题。</p>';}
      else if(/磁盘|空间/.test(question)){html='<p>先查看各挂载点的空间使用率，确认是整个磁盘空间不足，还是某个独立分区接近容量上限。</p><p>下面的命令只读取容量信息。</p>';command='df -h';}
      else if(/解释/.test(question)&&!(/文件|配置/.test(question)&&contextSnapshot.files&&s.fileContext)){const cmd=lastBlock?.command||'pwd';html=`<p><strong>${esc(cmd)}</strong></p><p>${cmd.includes('systemctl')?'这条命令以管理员权限请求 systemd 重启 Nginx。重启会影响现有服务，需要先确认配置有效。':'这是一条用于查看或操作当前环境的 Shell 命令。此原型提供预置解释，真实产品会结合完整命令和模型回答。'}</p>`;}
      else if(s.configFixed&&!(/文件/.test(question)&&contextSnapshot.files)){html='<p>配置修改已在演示会话中保存。下一步先验证配置语法，再决定是否重新加载服务。</p>';command='nginx -t';}
      else if(/配置|文件/.test(question)&&s.fileContext&&s.fileContext.includes('/srv/app/')){html='<p>已附带所选文件内容。</p><p>部署前建议核对端口占用、prod 环境对应的配置，以及日志目录写入权限。修改上传上限时，也要核对反向代理的请求大小限制。</p>';}
      else if(/配置|文件/.test(question)&&s.fileContext){html='<p>这段配置中 <strong>proxy_pass 行缺少结尾分号</strong>，解析器会在下一行的右花括号处报告错误。</p><p>可以先查看差异，保存前核对目标文件。</p>'+btn('查看修改差异','show-diff','edit','sm subtle');}
      else if(/unexpected/.test(quoted)||lastBlock?.command.includes('nginx -t')){html='<p>配置检查将问题定位到 <strong>app.conf 第 18 行附近</strong>。右花括号报错可能由前一行指令缺少分号引起，需要核对文件内容。</p>'+btn('查看配置与修改建议','file-open','file','sm subtle','data-name="app.conf"');}
      else{html='<p>刚才的 <strong>Nginx 重启失败</strong>了。现有输出只说明启动进程异常退出，还不能确定具体原因。</p><p>建议先检查配置语法，获得准确的文件位置与错误信息：</p><div class="evidence">'+icon('link')+'依据：当前会话的最近命令输出</div>';command='nginx -t';}
      s.messages.push({role:'assistant',html,command,readonly,hostId:id,hostName:h.name});
      if(state.active===id){render(true);scrollPanels();}
    },850);
  }
  let previousFocus=null;
  function openModal(title,subtitle,body,footer='',wide=false,type='generic'){
    previousFocus=document.activeElement;state.modal=type;app.inert=true;
    document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><div><h2 id="dialog-title">${title}</h2><p>${subtitle}</p></div>${ib('关闭弹窗','close-modal','close')}</div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}</section></div>`;
    const el=document.querySelector('.modal input:not([type=checkbox]),.modal textarea,.modal select')||document.querySelector('.modal button');
    el?.focus();
  }
  function closeModal(){document.querySelector('#modal-root').innerHTML='';app.inert=false;state.modal=null;state.modelTest=null;if(previousFocus?.isConnected)previousFocus.focus();else document.querySelector('.page-toolbar button, .nav-btn.active')?.focus();}
  function guide(){openModal('原型导览','所有操作使用模拟数据，刷新后重置。',`<div class="guide-steps"><div class="guide-step"><span class="step-num">01</span><h3>配置模型</h3><p>在模型服务页添加 API 或本地服务，体验成功和失败状态。</p>${btn('配置模型','guide-go',null,'sm','data-page="models"')}</div><div class="guide-step"><span class="step-num">02</span><h3>分析一次报错</h3><p>回到终端，点击 Nginx 错误下的“分析错误”。</p>${btn('进入终端','guide-go',null,'sm primary','data-page="workspace"')}</div><div class="guide-step"><span class="step-num">03</span><h3>确认命令</h3><p>将建议填入终端；切换协助模式体验具体操作确认。</p>${btn('查看功能明细','guide-go',null,'sm','data-page="features"')}</div></div>`,btn('开始体验','close-modal','chevron','primary'),true,'guide');}
  function hostForm(id){
    const h=id?host(id):{name:'',address:'',port:22,user:'',group:'开发环境',env:'开发',auth:'key'};
    openModal(id?'编辑主机':'添加一台主机','连接信息只用于本次原型演示，请勿填写真实凭据。',`<form id="host-form" data-id="${id||''}" class="form-grid"><label class="field full">主机名称<input name="name" required maxlength="60" placeholder="例如 staging-api" value="${esc(h.name)}"></label><label class="field">主机地址<input name="address" required placeholder="例如 10.20.1.24" value="${esc(h.address)}"></label><label class="field">端口<input name="port" type="number" required min="1" max="65535" value="${h.port}"></label><label class="field">用户名<input name="user" required placeholder="例如 ubuntu" value="${esc(h.user)}"></label><label class="field">环境<select name="env">${['开发','测试','生产'].map(v=>`<option ${v===h.env?'selected':''}>${v}</option>`).join('')}</select></label><label class="field full">分组<input name="group" value="${esc(h.group)}" placeholder="例如个人项目"></label><label class="field full">认证方式<select name="auth" id="host-auth"><option value="key" ${h.auth==='key'?'selected':''}>私钥文件</option><option value="password" ${h.auth==='password'?'selected':''}>密码 · 每次询问</option></select></label><label class="field full" id="auth-field">${h.auth==='password'?'演示密码':'私钥路径（演示）'}<input name="credential" type="${h.auth==='password'?'password':'text'}" placeholder="${h.auth==='password'?'不保存，仅作输入演示':'~/.ssh/id_ed25519'}"><span class="hint">原型不读取密钥文件，也不保存凭据输入。</span></label></form>`,btn('取消','close-modal',null)+`<button class="btn primary" type="submit" form="host-form">${icon('check')}保存主机</button>`,false,'host');
  }
  function connectHost(id){
    if(state.sessions[id]?.connected){openHost(id);return;}
    const h=host(id);openModal('确认主机身份','首次连接 · 指纹验证演示',`<div class="warning-box">连接前请核对服务器指纹。以下为原型样例，接受后仅打开模拟会话。</div><div class="detail-list">${detail('目标主机',h.name)}${detail('连接地址',h.user+'@'+h.address+':'+h.port)}${detail('环境',h.env)}${detail('密钥算法','ED25519')}${detail('SHA256 指纹','DEMO:53:q8:Wz:7p:4k:sample:not-a-real-fingerprint')}</div>`,btn('取消','close-modal',null)+btn('信任并连接样例','trust-connect','shield','primary',`data-id="${id}"`),false,'fingerprint');
  }
  const detail=(key,value)=>`<div class="detail-row"><span class="key">${key}</span><span class="value">${esc(value)}</span></div>`;
  function contextModal(){
    const s=current(),h=host(state.active),m=model(s.model);
    openModal('AI 上下文','选择本次发送的内容。',`<div class="detail-list">${detail('发送到',m?m.name+' · '+m.model:'未配置模型')}${detail('目标主机',h.user+'@'+h.address)}${detail('目录',s.cwd)}</div>${[['host','主机与当前目录',h.os+' · '+s.cwd],['commands','最近命令与输出',s.blocks.length+' 个命令块；正式产品按预算裁剪'],['selection','本次选中文本',s.selection?redact(s.selection.slice(0,150)):'暂无选区'],['files','明确选择的文件内容',s.fileContext?redact(s.fileContext.slice(0,130)):'尚未选择文件；不会自动读取目录']].map(([key,title,desc])=>`<label class="context-option"><input type="checkbox" name="context-${key}" ${s.context[key]?'checked':''}><div>${title}<div class="desc">${esc(desc)}</div></div></label>`).join('')}<div class="review-note">${icon('shield')} 凭据不会加入上下文。${state.preferences.redact?'自动脱敏已开启。':'自动脱敏已关闭，请检查分享内容。'}<br>原型不会向任何模型服务发送请求。</div>`,btn('取消','close-modal',null)+btn('保存上下文范围','save-context','check','primary'),false,'context');
  }
  function modelForm(id){
    const m=id?model(id):{name:'',protocol:'openai',endpoint:'',model:'',tools:true};state.modelTest=null;
    openModal(id?'编辑模型服务':'添加模型服务','原型不发送请求或保存密钥。',`<form id="model-form" data-id="${id||''}" class="form-grid"><label class="field full">服务名称<input name="name" required maxlength="60" value="${esc(m.name)}" placeholder="例如 我的 DeepSeek / 企业网关"></label><label class="field full">协议 / 服务预设<select name="protocol" id="model-protocol">${[['openai','OpenAI 兼容接口'],['deepseek','DeepSeek'],['anthropic','Anthropic 兼容接口'],['ollama','Ollama / 本地兼容接口']].map(([v,t])=>`<option value="${v}" ${m.protocol===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="field full">接口地址<input name="endpoint" type="url" required placeholder="https://your-gateway.example/v1" value="${esc(m.endpoint)}"><span class="hint">请填写提供商给出的接口根地址。</span></label><label class="field full">API Key <span class="tiny muted">原型可留空</span><input name="key" type="password" autocomplete="off" placeholder="仅作输入演示，不存储、不发送"></label><label class="field full">模型名称<input name="model" required placeholder="例如 deepseek-chat / qwen3:8b" value="${esc(m.model)}"></label><div class="field full"><span>能力测试（模拟）</span><div class="field-row"><select id="test-scenario" name="scenario" aria-label="模拟测试结果"><option value="success">连接成功 · 支持工具</option><option value="chat" ${!m.tools?'selected':''}>连接成功 · 仅支持问答</option><option value="auth">认证失败</option><option value="timeout">连接超时</option></select>${btn('测试连接','test-model','bolt')}</div><span class="hint">连接测试为模拟结果。</span><div id="model-test-result" role="status" aria-live="polite"></div></div></form>`,btn('取消','close-modal',null)+`<button class="btn primary" type="submit" form="model-form">${icon('check')}保存配置</button>`,false,'model');
  }
  function snippetForm(id,command=''){
    const n=id?state.snippets.find(x=>x.id===id):{name:'',tag:'个人收藏',command,desc:''};
    openModal(id?'编辑快捷命令':'保存一条快捷命令','使用时填入终端，不会直接执行。',`<form id="snippet-form" data-id="${id||''}" class="form-grid"><label class="field full">名称<input name="name" required value="${esc(n.name)}" placeholder="例如 检查 Nginx 配置"></label><label class="field full">命令<textarea name="command" required rows="3" class="mono">${esc(n.command)}</textarea></label><label class="field full">标签<input name="tag" value="${esc(n.tag)}"></label><label class="field full">说明<input name="desc" value="${esc(n.desc)}" placeholder="这条命令用于做什么"></label></form>`,btn('取消','close-modal',null)+`<button class="btn primary" type="submit" form="snippet-form">保存命令</button>`,false,'snippet');
  }
  function confirmCommand(command,target){
    if(target!==state.active||!current()?.connected){notify('目标会话已变化或断开，不能执行这条建议。');return;}
    const h=host(target),s=current();state.pendingCommand={command,target,session:s};
    openModal('确认执行','模拟执行',`<div class="warning-box">${h.env==='生产'?'你正在操作生产环境。':'请核对本次执行的目标。'}</div><div class="detail-list">${detail('目标',h.name+' · '+h.address)}${detail('工作目录',s.cwd)}${detail('原因','验证配置或执行当前 AI 建议')}</div><pre class="command-preview">${esc(command)}</pre>`,btn('取消','close-modal',null)+btn('确认模拟执行','execute-confirmed','play','primary'),false,'execute');
  }
  function fileText(){return `server {\n    listen 80;\n    server_name app.example.com;\n\n    location / {\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_pass http://127.0.0.1:3000${current().configFixed?';':''}\n    }\n}\n# 演示片段；生产报错行号包含此处未展示的配置。`;}
  function openFile(name='app.conf'){
    state.openFile={name,target:state.active,original:fileText()};
    openModal(name,host(state.active).name+' · '+state.filePath+'/'+name,`<div class="between small muted" style="margin-bottom:12px"><span>远程文本预览 · 样例</span>${badge('未保存的修改仅存在于原型')}</div><textarea id="file-editor" class="editor" aria-label="远程文件样例">${esc(fileText())}</textarea><div class="between" style="margin-top:12px">${btn('询问 AI','ask-file','spark','sm subtle')}${btn('查看修复差异','show-diff','branch','sm')}</div>`,btn('关闭','close-modal',null)+btn('保存样例修改','save-file','check','primary'),true,'file');
  }
  function showDiff(){
    openModal('检查配置修改','修改建议',`<div class="detail-list">${detail('主机',host(state.active).name)}${detail('目标文件','/etc/nginx/conf.d/app.conf')}${detail('修改原因','补全 proxy_pass 指令结尾分号')}${detail('备份计划','保存前保留 app.conf.bak（原型模拟）')}</div><pre class="diff">    location / {\n<span class="removed">−       proxy_pass http://127.0.0.1:3000</span><span class="added">+       proxy_pass http://127.0.0.1:3000;</span>    }</pre><div class="review-note">保存后先运行 nginx -t 验证。</div>`,btn('取消','close-modal',null)+btn('保存修复样例','apply-fix','check','primary'),true,'diff');
  }
  function exportHistory(){
    const content='# DSH Terminal · 原型演示记录\n\n仅包含模拟数据，不代表真实服务器执行记录。\n\n'+state.history.map(r=>`- ${r.time} | ${host(r.hostId)?.name||'配置'} | ${r.title}\n  ${r.command}`).join('\n\n');
    const blob=new Blob([content],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dsh-terminal-demo-history.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出演示记录。');
  }
  async function handleAction(el){
    const a=el.dataset.action,id=el.dataset.id,v=el.dataset.value;
    if(a==='top-session'){const wasFiles=state.page==='files';openHost(id);if(wasFiles){state.page='files';render();}}
    else if(a==='top-ai'){if(!current()){state.page='models';render();return;}if(state.page==='files'){fileWorkspace.showAI();}else{state.page='workspace';state.ai=true;render();document.getElementById('ai-input')?.focus();}}
    else if(a==='top-search'){state.page='hosts';render();document.getElementById('host-search')?.focus();}
    else if(a==='nav'){if(state.modal)closeModal();state.page=el.dataset.page;if(state.page==='workspace')state.ai=state.preferences.autoPanel;render();}
    else if(a==='guide')guide();
    else if(a==='guide-go'){closeModal();state.page=el.dataset.page;state.ai=true;render();}
    else if(a==='new-host')hostForm();
    else if(a==='edit-host')hostForm(id);
    else if(a==='connect-host')connectHost(id);
    else if(a==='trust-connect'){closeModal();openHost(id);current().connected=true;record('config','建立模拟连接');render();notify('模拟连接已建立。');}
    else if(a==='open-host')openHost(id);
    else if(a==='new-session'){state.page='hosts';render();}
    else if(a==='favorite'){host(id).favorite=!host(id).favorite;render();}
    else if(a==='host-filter'){state.hostFilter=v;render();}
    else if(a==='clear-host-search'){state.hostFilter='全部主机';state.hostSearch='';render();}
    else if(a==='close-tab'){
      const s=state.sessions[id];
      openModal('关闭这个会话？',host(id).name,`<p class="muted">关闭后会结束该模拟连接；未保存的文件草稿将被丢弃${s.busy?'，并停止本次 AI 生成':''}。已有演示活动仍可在会话记录中查看。</p>`,btn('取消','close-modal',null)+btn('关闭会话','confirm-close-tab','close','danger',`data-id="${id}"`),false,'close-tab');
    } else if(a==='confirm-close-tab'){
      state.sessions[id].requestId=null;fileWorkspace.closeHost(id);delete state.sessions[id];state.tabs=state.tabs.filter(t=>t!==id);if(state.active===id)state.active=state.tabs[0]||null;closeModal();render();
    } else if(a==='toggle-ai'){if(state.page==='files'){fileWorkspace.hideAI();return;}state.ai=!state.ai;render();if(state.ai)document.getElementById('ai-input')?.focus();}
    else if(a==='toggle-files'){state.page='files';render();}
    else if(a==='toggle-split'){state.split=!state.split;render();}
    else if(a==='toggle-search'){state.showSearch=!state.showSearch;state.termSearch='';render();document.getElementById('term-search')?.focus();}
    else if(a==='reconnect'){for(const msg of current().messages){if(msg.command){msg.html+='<p class="muted small">旧连接的命令建议已失效，请重新提问。</p>';msg.command='';}}current().connected=true;current().requestId=null;current().busy=false;current().messages.push({role:'assistant',html:'<p>已建立新的模拟连接。旧命令不会重放；执行前请重新检查当前环境。</p>'});record('config','显式重新连接');render();notify('已重新连接，未重放历史命令。');}
    else if(a==='disconnect'){current().connected=false;current().requestId=null;current().busy=false;closeModal();record('config','模拟网络断开');render();}
    else if(a==='monitor'){openModal('服务器概况','固定样例数据 · 不进行真实采集',`<div class="detail-list">${detail('主机',host(state.active).name)}${detail('CPU 使用率','2.4%')}${detail('内存','1.8 / 8 GB')}${detail('磁盘','29 / 80 GB · 38%')}${detail('采样时间','09-08 10:24:32（样例）')}</div><p class="small muted">也可以模拟连接中断，检查终端与 AI 的降级体验。</p>`,btn('模拟断开连接','disconnect','link','danger')+btn('关闭','close-modal',null),false,'monitor');}
    else if(a==='context'){if(current())contextModal();else notify('请先打开一个终端会话。');}
    else if(a==='save-context'){for(const k of Object.keys(current().context))current().context[k]=document.querySelector(`[name="context-${k}"]`).checked;closeModal();notify('上下文范围已更新，对下一次提问生效。');}
    else if(a==='clear-selection'){current().selection='';render();}
    else if(a==='ask-selection'){if(!current().selection){notify('请先在终端中选中一段文字。');return;}state.ai=true;current().draft='请解释这段内容';render();document.getElementById('ai-input')?.focus();}
    else if(a==='analyze'||a==='explain'){const b=current().blocks.find(b=>b.id===id);if(b)sendAI(a==='analyze'?'帮我分析这条命令的报错':'解释这条命令',b.command+'\n'+b.output);}
    else if(a==='quick')sendAI(el.dataset.prompt);
    else if(a==='mode'){const m=model(current().model);if(el.dataset.mode==='assist'&&!m?.tools){notify('当前模型样例仅支持问答，请选择支持工具的模型。');return;}current().mode=el.dataset.mode;render();if(current().mode==='assist')notify('已切换协助模式，每次执行前展示具体操作。');}
    else if(a==='clear-chat'){current().messages=[];current().requestId=null;current().busy=false;current().selection='';render();notify('已开始当前主机的新对话。');}
    else if(a==='stop-ai'){current().busy=false;current().requestId=null;current().messages.push({role:'assistant',html:'<p class="muted">已停止生成，没有提交新的服务器操作。</p>'});render();}
    else if(a==='fill-command')fillCommand(el.dataset.command,el.dataset.target);
    else if(a==='copy-command'){try{await navigator.clipboard.writeText(el.dataset.command);notify('命令已复制。');}catch{openModal('复制命令','浏览器未开放剪贴板，可手动选择复制。',`<textarea class="editor" aria-label="待复制命令">${esc(el.dataset.command)}</textarea>`,btn('关闭','close-modal',null));}}
    else if(a==='save-suggestion')snippetForm(null,el.dataset.command);
    else if(a==='confirm-command')confirmCommand(el.dataset.command,el.dataset.target);
    else if(a==='execute-confirmed'){const p=state.pendingCommand;if(state.active!==p.target||state.sessions[p.target]!==p.session||!p.session.connected){notify('会话已变化，请重新确认。');closeModal();return;}closeModal();runCommand(p.command,true,p.target);}
    else if(a==='new-model')modelForm();
    else if(a==='edit-model')modelForm(id);
    else if(a==='default-model'){state.defaultModel=id;render();notify('默认模型已更新，已有会话保持当前选择。');}
    else if(a==='test-model'){
      const f=document.getElementById('model-form');if(!f.reportValidity())return;
      const scenario=f.elements.scenario.value,signature=[f.elements.name.value,f.elements.protocol.value,f.elements.endpoint.value,f.elements.model.value,f.elements.key.value,scenario].join('|');
      state.modelTest={status:'testing',signature};el.disabled=true;const box=document.getElementById('model-test-result');box.innerHTML='<div class="small muted">正在模拟连接与能力测试…</div>';
      setTimeout(()=>{if(!document.getElementById('model-form')||state.modelTest?.signature!==signature)return;const ok=['success','chat'].includes(scenario);state.modelTest={status:ok?'passed':'failed',tools:scenario==='success',signature};box.innerHTML=ok?`<div class="success-box">${icon('check')} 模拟测试通过<br>对话 ✓ · 流式 ✓ · 工具调用 ${scenario==='success'?'✓':'不支持（仍可用于问答）'}</div>`:`<div class="error-box">${scenario==='auth'?'模拟认证失败：请检查 API Key 与服务权限。':'模拟连接超时：请检查地址及服务可达性。'}<br>配置草稿已保留，可调整后重新测试。</div>`;el.disabled=false;},650);
    }
    else if(a==='new-snippet')snippetForm();
    else if(a==='edit-snippet')snippetForm(id);
    else if(a==='delete-snippet'){openModal('删除快捷命令？','只影响本次演示列表。',`<p>${esc(state.snippets.find(n=>n.id===id).name)}</p>`,btn('取消','close-modal',null)+btn('删除','confirm-delete-snippet','trash','danger',`data-id="${id}"`));}
    else if(a==='confirm-delete-snippet'){state.snippets=state.snippets.filter(n=>n.id!==id);closeModal();render();notify('快捷命令已删除。');}
    else if(a==='file-open'){if(!current())return;openFile(el.dataset.name);}
    else if(a==='file-dir'){state.filePath='/etc/nginx/conf.d';render();}
    else if(a==='file-up'){state.filePath='/etc/nginx';render();}
    else if(a==='ask-file'){current().fileContext=document.getElementById('file-editor').value;current().context.files=true;closeModal();state.page='workspace';sendAI('请检查这段 Nginx 配置');}
    else if(a==='show-diff')showDiff();
    else if(a==='save-file'){const text=document.getElementById('file-editor').value;current().configFixed=/proxy_pass http:\/\/127\.0\.0\.1:3000;/.test(text);record('config','保存文件样例','/etc/nginx/conf.d/app.conf');closeModal();render();notify('样例修改已保存，尚未验证配置。');}
    else if(a==='apply-fix'){current().configFixed=true;record('config','接受配置修复样例','为 proxy_pass 添加分号；模拟备份 app.conf.bak');closeModal();state.page='workspace';current().messages.push({role:'assistant',html:'<p>修复样例已保存，并模拟保留了备份。下一步验证配置语法：</p>',command:'nginx -t',readonly:true,hostId:state.active,hostName:host(state.active).name});render();scrollPanels();notify('修改已保存到演示会话。');}
    else if(a==='upload-demo'){
      state.transfer={state:'running',progress:0};render();const t=state.transfer;
      const interval=setInterval(()=>{if(state.transfer!==t||t.state!=='running'){clearInterval(interval);return;}t.progress=Math.min(100,t.progress+20);if(t.progress===100){t.state='done';record('config','模拟上传完成','deployment-notes.txt → /srv/app');clearInterval(interval);}render(true);},550);
    } else if(a==='cancel-transfer'){state.transfer.state='cancelled';render();notify('模拟传输已取消。');}
    else if(a==='close-transfer'){state.transfer=null;render();}
    else if(a==='export-history')exportHistory();
    else if(a==='settings-tab'){state.settingsTab=v;render();}
    else if(a==='toggle-pref'){const k=el.dataset.key;state.preferences[k]=!state.preferences[k];render();notify('偏好已更新，仅对本次原型体验生效。');}
    else if(a==='reset-prefs'){state.preferences={fontSize:12,autoPanel:true,redact:true,retain:'30'};render();notify('已恢复默认偏好。');}
    else if(a==='feature-filter'){state.featureFilter=v;render();}
    else if(a==='feature-detail'){const f=window.FEATURES.find(f=>f.id===id);openModal(f.name,f.id+' · '+f.module,`<div class="flex">${badge(f.priority,f.priority==='P0'?'green':'amber')}${badge(f.coverage)}</div><h3 class="subheading">功能明细</h3><p class="small">${f.detail}</p><h3 class="subheading">验收条件</h3><p class="small green">${f.acceptance}</p><h3 class="subheading">异常与边界</h3><p class="small muted">${f.edge}</p><div class="review-note">对应页面：${f.page}<br>“可交互”表示本地模拟流程可体验，不代表真实产品能力已实现。</div>`,btn('关闭','close-modal',null));}
    else if(a==='close-modal'){
      if(state.modal==='file'&&document.getElementById('file-editor').value!==state.openFile.original){const text=document.getElementById('file-editor').value;state.unsavedFile=text;openModal('有未保存的样例修改','关闭将丢弃编辑内容。',`<p class="small muted">可以保留编辑或丢弃本次修改。</p>`,btn('继续编辑','resume-file',null)+btn('丢弃修改','discard-file','trash','danger'),false,'unsaved');return;}closeModal();
    } else if(a==='resume-file'){openFile(state.openFile.name);document.getElementById('file-editor').value=state.unsavedFile;}
    else if(a==='discard-file')closeModal();
  }
  document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el){e.preventDefault();handleAction(el);}});
  document.addEventListener('submit',e=>{
    e.preventDefault();const f=e.target;
    if(f.id==='terminal-form'){const command=current().input.trim();if(command)runCommand(command);}
    else if(f.id==='ai-form'){const q=current().draft.trim();if(q)sendAI(q);}
    else if(f.id==='host-form'){if(!f.reportValidity())return;const d=Object.fromEntries(new FormData(f));if(!d.name.trim()||!d.address.trim()||!d.user.trim()){notify('名称、地址和用户名不能只包含空格。');return;}const id=f.dataset.id||uid(),old=host(id);const entry={id,name:d.name.trim(),address:d.address.trim(),port:Number(d.port),user:d.user.trim(),group:d.group.trim()||d.env+'环境',env:d.env,auth:d.auth,favorite:old?.favorite||false,os:old?.os||'Linux · 演示'};if(old&&state.tabs.includes(id)&&['address','port','user','auth'].some(k=>old[k]!==entry[k])){notify('请先关闭此主机的已打开会话，再修改连接地址或认证配置。');return;}if(old)Object.assign(old,entry);else state.hosts.push(entry);closeModal();state.page='hosts';state.hostFilter='全部主机';state.hostSearch='';render();notify('主机配置已保存到演示列表。');}
    else if(f.id==='model-form'){
      if(!f.reportValidity())return;const d=Object.fromEntries(new FormData(f));if(!['http:','https:'].includes(new URL(d.endpoint).protocol)){notify('接口地址只接受 http 或 https。');return;}
      const signature=[d.name,d.protocol,d.endpoint,d.model,d.key,d.scenario].join('|');if(state.modelTest?.status!=='passed'||state.modelTest.signature!==signature){notify('请先完成一次通过的模拟连接测试。');return;}
      const id=f.dataset.id||uid(),old=model(id),entry={id,name:d.name.trim(),protocol:d.protocol,endpoint:d.endpoint.trim(),model:d.model.trim(),tools:state.modelTest.tools,status:'tested'};
      if(!entry.name||!entry.model){notify('服务名称和模型名称不能只包含空格。');return;}if(old)Object.assign(old,entry);else state.models.push(entry);closeModal();state.page='models';record('config','保存模型服务配置',entry.name+' · '+entry.model,null);render();notify('演示配置已保存；密钥输入未被保存。');
    } else if(f.id==='snippet-form'){if(!f.reportValidity())return;const d=Object.fromEntries(new FormData(f)),id=f.dataset.id||uid(),old=state.snippets.find(n=>n.id===id),entry={id,...d};if(old)Object.assign(old,entry);else state.snippets.push(entry);closeModal();render();notify('快捷命令已保存。');}
  });
  document.addEventListener('input',e=>{
    const el=e.target;
    if(el.id==='terminal-input')current().input=el.value;
    else if(el.id==='ai-input')current().draft=el.value;
    else if(el.id==='host-search'){state.hostSearch=el.value;render(true);}
    else if(el.id==='snippet-search'){state.snippetSearch=el.value;render(true);}
    else if(el.id==='feature-search'){state.featureSearch=el.value;render(true);}
    else if(el.id==='term-search'){state.termSearch=el.value;render(true);}
    else if(el.id==='font-size'){state.preferences.fontSize=Number(el.value);document.getElementById('font-value').textContent=el.value;document.documentElement.style.setProperty('--terminal-size',el.value+'px');}
    else if(el.closest('#model-form')){state.modelTest=null;const box=document.getElementById('model-test-result');if(box)box.innerHTML='';document.querySelector('[data-action="test-model"]').disabled=false;}
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(el.id==='chat-model'){const s=current();if(s.busy){el.value=s.model;notify('请先等待或停止当前生成，再切换模型。');return;}s.model=el.value;if(!model(el.value)?.tools)s.mode='chat';render();notify('已切换模型，历史消息未自动发送。');}
    else if(el.id==='history-retain'){state.preferences.retain=el.value;notify('已更新本次演示偏好。');}
    else if(el.id==='host-auth'){document.getElementById('auth-field').innerHTML=`${el.value==='password'?'演示密码':'私钥路径（演示）'}<input name="credential" type="${el.value==='password'?'password':'text'}" placeholder="${el.value==='password'?'不保存，仅作输入演示':'~/.ssh/id_ed25519'}"><span class="hint">原型不读取密钥文件，也不保存凭据输入。</span>`;}
    else if(el.id==='model-protocol'){const f=document.getElementById('model-form'),p={deepseek:['DeepSeek','https://api.deepseek.com','deepseek-chat'],ollama:['本地 Ollama','http://localhost:11434/v1','qwen3:8b'],anthropic:['Anthropic 兼容服务','https://your-provider.example','your-model-id'],openai:['自定义兼容服务','https://your-gateway.example/v1','your-model-id']}[el.value];f.elements.name.value=p[0];f.elements.endpoint.value=p[1];f.elements.model.value=p[2];state.modelTest=null;document.getElementById('model-test-result').innerHTML='';}
  });
  document.addEventListener('mouseup',()=>{const selection=window.getSelection();if(selection&&!selection.isCollapsed&&selection.anchorNode?.parentElement?.closest('#terminal-scroll')){const text=selection.toString().trim();if(text&&current())current().selection=text.slice(0,4000);}});
  document.addEventListener('keydown',e=>{
    if(state.modal){
      if(e.key==='Escape'){e.preventDefault();handleAction({dataset:{action:'close-modal'}});return;}
      if(e.key==='Tab'){const items=[...document.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled),.modal select:not(:disabled),.modal textarea:not(:disabled),.modal a[href]')].filter(el=>el.offsetParent!==null),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}return;
    }
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='j'){e.preventDefault();if(state.page==='files'){fileWorkspace.showAI();}else{state.page='workspace';state.ai=!state.ai;render();if(state.ai)document.getElementById('ai-input')?.focus();}}
    else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'&&state.page==='workspace'){e.preventDefault();state.showSearch=true;render();document.getElementById('term-search')?.focus();}
    else if(e.target.id==='ai-input'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();const q=current().draft.trim();if(q)sendAI(q);}
    else if(e.target.id==='terminal-input'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const s=current();s.historyAt=Math.max(0,Math.min(s.history.length,s.historyAt+(e.key==='ArrowUp'?-1:1)));s.input=s.history[s.historyAt]||'';e.target.value=s.input;}
    else if(e.target.id==='terminal-input'&&e.key==='Enter'&&e.isComposing)e.preventDefault();
    else if(e.target.matches('tr[data-action]')&&['Enter',' '].includes(e.key)){e.preventDefault();handleAction(e.target);}
  });
  render();
  const initialTerminal=document.getElementById('terminal-scroll');
  if(initialTerminal)initialTerminal.scrollTop=initialTerminal.scrollHeight;
})();
