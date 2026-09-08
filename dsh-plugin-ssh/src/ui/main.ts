import { ErrorHintTracker } from './error-hint.ts'
import { confirmAction } from './confirm.ts'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { installAi } from './ai.ts'
import { installEditor } from './editor.ts'

const root = document.getElementById('ssh-root')!
interface Target { name: string; host: string; port: number; username: string; fingerprint?: string }
interface Row { name: string; directory: boolean; size: number; modified: number }
interface Session { hints: ErrorHintTracker; hint?: string; decoder: TextDecoder; id: string; target: Target; path: string; rows: Row[]; term: Terminal; fit: FitAddon; socket: WebSocket; element: HTMLDivElement; connected: boolean; listing: number; observer: ResizeObserver }
const sessions = new Map<string, Session>()
let active = '', targets: Target[] = [], dialogEpoch = 0
try { const stored: unknown = JSON.parse(localStorage.getItem('dsh-ssh-targets') ?? '[]'); if (Array.isArray(stored)) targets = stored.filter(t => t && typeof t.host === 'string' && typeof t.username === 'string' && Number.isInteger(t.port)).slice(0, 100) } catch { /* Empty host list after invalid saved data. */ }
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
async function api<T>(op: string, data: unknown): Promise<T> {
  const response = await fetch('/ssh-workbench/' + op, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error ?? '请求失败')
  return result
}
root.innerHTML = `<header class="topbar"><button id="return" title="返回 Harness" class="brand">DSH <b>SSH</b></button><div class="global-nav"><button id="terminal-nav" class="selected">⌘ <span>终端</span></button><button id="hosts">▤ <span>连接中心</span></button><button id="commands">ϟ <span>快捷命令</span></button><button id="models">✧ <span>模型服务</span></button></div><nav id="sessions"></nav><button id="add" class="icon" title="新建连接">＋</button><button id="ai" class="ai-toggle">✧ AI</button></header>
<div class="shell-body"><nav class="rail"><button data-action="terminal-nav" title="终端">⌘</button><button data-action="files-toggle" title="文件">▱</button><button data-action="hosts" title="连接中心">▤</button><button data-action="transfers-toggle" title="传输管理">⇅</button><div class="rail-spacer"></div><button data-action="return" title="返回 Harness">↩</button></nav><div class="workspace"><div class="toolbar"><span id="breadcrumb">SSH <em>/</em> 终端工作区</span><div class="toolbar-actions"><button id="files-toggle">▱ 文件</button><button id="transfers-toggle">⇅ 传输</button><button id="ask-selection">✧ 询问选区 <kbd>⌘ J</kbd></button></div></div><main class="files-hidden"><aside class="file-panel"><div class="panel-heading">文件 <span>SFTP</span></div><form id="path-form"><input id="path" aria-label="远程目录" placeholder="远程目录"><button title="前往目录">↵</button></form><div class="file-actions"><button id="up">↑ 上级</button><button id="refresh">↻ 刷新</button><label class="button">↑ 上传<input id="upload" type="file" multiple hidden></label></div><div id="files"></div></aside><section class="terminal-workspace"><div class="connection-bar"><span id="connection-label">未连接</span><span id="connection-state">SSH</span></div><div id="error-hint" class="error-hint" role="status" hidden><span id="error-hint-text"></span><button id="error-hint-ask">✧ 询问 AI</button><button id="error-hint-dismiss" aria-label="忽略提示">×</button></div><section id="terminals"><div id="empty"><div class="empty-symbol">⌘</div><h2>终端</h2><p>连接主机，开始工作。</p><button id="empty-connect" class="primary">＋ 新建 SSH 连接</button></div></section><div class="terminal-bottom"><span>选中终端内容，按 <kbd>⌘ / Ctrl + J</kbd> 询问 AI</span><span id="session-count">0 个会话</span></div></section><aside class="transfers" hidden><div class="panel-heading">⇅ 传输管理 <div><button id="transfers-clear" class="clear-records" disabled title="清理已结束的记录，保留服务器文件">清理记录</button><button id="transfers-close" title="关闭传输面板">×</button></div></div><div id="transfers"></div></aside></main><section id="host-page" class="page" hidden><div class="page-heading"><h2>连接中心</h2><button id="host-add" class="primary">＋ 添加主机</button></div><div class="host-toolbar"><span id="host-count"></span><input id="host-search" placeholder="搜索名称、地址、用户名" aria-label="搜索主机"></div><div id="host-list"></div></section></div></div><footer><span id="status">未连接</span><span>DSH SSH <span class="footer-dot">●</span></span></footer><dialog id="dialog"></dialog>`
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const status = (text: string) => { el('status').textContent = text }
const dialog = el<HTMLDialogElement>('dialog')
const editor = installEditor(api, () => active)
const ai = installAi(() => {
  const s = sessions.get(active); if (!s?.connected) return undefined
  return { id: s.id, label: `${s.target.username}@${s.target.host}:${s.target.port}`, command: (text: string, execute: boolean) => {
    if(active!==s.id || !s.connected || s.socket.readyState!==WebSocket.OPEN) throw new Error('SSH 会话已断开或切换')
    s.term.paste(text)
    if(execute) {
      s.hints.begin();s.hint=undefined;renderHint()
      s.socket.send(JSON.stringify({type:'input',data:'\r'}))
    }
    s.term.focus()
  }, context: () => {
    if (s.term.hasSelection()) return s.term.getSelection()
    const buffer = s.term.buffer.active, lines: string[] = []
    for (let i = Math.max(0, buffer.length - 120); i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    return lines.join('\n')
  } }
})
function saved(): void { localStorage.setItem('dsh-ssh-targets', JSON.stringify(targets)) }
function tabs(): void {
  el('sessions').innerHTML = [...sessions.values()].map(s => `<div class="session ${s.id === active ? 'active' : ''}"><button data-select="${s.id}"><i class="${s.connected ? 'online' : ''}"></i>${esc(s.target.name || s.target.host)}</button><button data-close="${s.id}" aria-label="关闭 ${esc(s.target.name)}">×</button></div>`).join('')
}
function renderHint():void {const hint=sessions.get(active)?.hint;el('error-hint').hidden=!hint;el('error-hint-text').textContent=hint??''}
function select(id: string): void {
  showWorkspace(); active = id; const s = sessions.get(id)
  for (const entry of sessions.values()) entry.element.hidden = entry.id !== id
  el('empty').hidden = sessions.size > 0; tabs(); ai.refresh(); editor.refresh(); renderHint()
  if (s) { el<HTMLInputElement>('path').value = s.path; files(s); s.fit.fit(); s.term.focus(); status(`${s.target.username}@${s.target.host}:${s.target.port} · ${s.connected ? '已连接' : '已断开'}`) }
  else { el('files').textContent = ''; status('未连接') }
  el('breadcrumb').textContent = `${s?.target.name || s?.target.host || 'SSH'} / 终端工作区`; el('connection-label').textContent=s ? `${s.target.username}@${s.target.host}:${s.target.port}` : '未连接'; el('connection-state').textContent=s?.connected?'● SSH 已连接':'SSH'; el('session-count').textContent=`${sessions.size} 个会话`;
}
function files(s: Session): void {
  if (active !== s.id) return
  el('files').innerHTML = s.rows.sort((a,b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)).map((r,i) => `<div class="file"><button data-file="${i}"><span>${r.directory ? '▸' : '≡'}</span><span>${esc(r.name)}</span></button>${r.directory ? '' : `<button data-download="${i}" title="下载 ${esc(r.name)}" aria-label="下载 ${esc(r.name)}">↓</button>`}</div>`).join('') || '<p class="muted">空目录</p>'
}
async function list(s: Session, path = s.path): Promise<void> {
  const generation = ++s.listing
  try { const rows = await api<Row[]>('list', { id: s.id, path }); if (generation !== s.listing) return; s.path = path; s.rows = rows; if (active === s.id) { el<HTMLInputElement>('path').value = path; files(s) } }
  catch (error) { if (active === s.id) status(String(error)) }
}
function form(target?: Target, edit = false, direct = false): void {
  const epoch = ++dialogEpoch
  dialog.innerHTML = `<form id="connect-form"><h2>${edit ? '编辑主机' : target ? '连接主机' : '添加主机'}</h2><label>名称<input name="name" value="${esc(target?.name ?? '')}"></label><div class="pair"><label>地址<input name="host" required value="${esc(target?.host ?? '')}"></label><label>端口<input name="port" type="number" min="1" max="65535" value="${target?.port ?? 22}" required></label></div><label>用户名<input name="username" value="${esc(target?.username ?? '')}" required></label><label>密码<input name="password" type="password" autocomplete="off"></label><details><summary>使用私钥</summary><label>私钥内容<textarea name="privateKey" spellcheck="false"></textarea></label><label>私钥口令<input name="passphrase" type="password" autocomplete="off"></label></details><label><input name="remember" type="checkbox" style="width:auto"> 记住密码</label><p id="password-state" class="muted"></p><p class="muted">密码在本机加密保存，私钥不保存。</p><div id="fingerprint"></div><p id="form-error" role="alert"></p><div class="buttons"><button type="button" id="cancel">取消</button><button id="connect-button">${edit ? '保存' : '连接'}</button></div></form>`
  let verified = target?.fingerprint ?? '', signature = target ? JSON.stringify([target.host,target.port,target.username]) : '', busy = false
  let hasPassword = false
  el('cancel').onclick = () => { dialog.close(); dialog.innerHTML = '' }
  el('connect-form').onsubmit = async e => {
    e.preventDefault(); if (busy) return
    const f = e.currentTarget as HTMLFormElement, d = new FormData(f)
    const t: Target = { name: String(d.get('name')), host: String(d.get('host')).trim(), port: Number(d.get('port')), username: String(d.get('username')).trim() }
    const sig = JSON.stringify([t.host,t.port,t.username]); busy = true; el<HTMLButtonElement>('connect-button').disabled = true; el('form-error').textContent = ''
    try {
      const password=String(d.get('password')), remember=d.get('remember')==='on'
      if(edit) {
        const same = !!target && target.host===t.host && target.port===t.port && target.username===t.username
        if(same)t.fingerprint=target.fingerprint
        if(remember && password)await api('password-save',{...t,password})
        else if(!remember)await api('password-delete',t)
        else if(!same && hasPassword)throw new Error('连接地址或用户名已变化，请重新填写密码')
        if(target && !same)await api('password-delete',target)
        targets=targets.filter(v=>v!==target && !(v.host===t.host&&v.port===t.port&&v.username===t.username));targets.push(t);saved();renderHosts();dialog.close();dialog.innerHTML='';return
      }
      if (!verified || signature !== sig) {
        const result = await api<{ fingerprint: string }>('probe', t)
        if (!dialog.open || epoch !== dialogEpoch) return
        verified = result.fingerprint; signature = sig
        const old = targets.find(v => v.host === t.host && v.port === t.port)?.fingerprint
        el('fingerprint').innerHTML = `<p>${old && old !== verified ? '⚠ 主机指纹已变化，请向管理员核实。' : old === verified ? '主机指纹一致' : '请核对主机指纹'}</p><code>${esc(verified)}</code>`
        el('connect-button').textContent = old && old !== verified ? '接受新指纹并连接' : '确认指纹并连接'
        return
      }
      const result = await api<{ id: string; path: string }>('connect', { ...t, fingerprint: verified, password: String(d.get('password')), useSavedPassword: hasPassword && signature===sig, privateKey: String(d.get('privateKey')), passphrase: String(d.get('passphrase')) })
      if (!dialog.open || epoch !== dialogEpoch) { await api('close', { id: result.id }); return }
      let passwordWarning=''
      try {
        if(remember && password)await api('password-save',{...t,password})
        else if(!remember && hasPassword)await api('password-delete',t)
      }catch{passwordWarning='已连接，但密码保存或清除失败，请在编辑中重试'}
      t.fingerprint = verified
      targets = targets.filter(v => !(v.host === t.host && v.port === t.port && v.username === t.username)); targets.push(t)
      try { saved() } catch { status('主机信息未能保存') }
      const element = document.createElement('div'); element.className = 'terminal'; el('terminals').append(element)
      const term = new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: 'Menlo, Consolas, monospace', scrollback: 5000, theme: { background: '#111416', foreground: '#ced6cc' } })
      const fit = new FitAddon(); term.loadAddon(fit); term.open(element)
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ssh-workbench/terminal?id=${encodeURIComponent(result.id)}`); socket.binaryType = 'arraybuffer'
      const observer = new ResizeObserver(() => { if (!element.hidden) fit.fit() }); observer.observe(element)
      const s: Session = { hints:new ErrorHintTracker(), decoder:new TextDecoder(), observer, id: result.id, target: t, path: result.path, rows: [], term, fit, socket, element, connected: true, listing: 0 }; sessions.set(s.id,s)
      socket.onmessage = e => { if (e.data instanceof ArrayBuffer) {const bytes=new Uint8Array(e.data);term.write(bytes);const hint=s.hints.feed(s.decoder.decode(bytes,{stream:true}));if(hint){s.hint=hint;if(active===s.id)renderHint()}} }
      socket.onopen = () => { fit.fit(); socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })) }
      socket.onclose = () => { s.connected = false; term.writeln('\r\n\x1b[31mSSH 已断开\x1b[0m'); tabs(); if (active === s.id) status('SSH 已断开，请重新连接') }
      socket.onerror = () => status('终端连接失败')
      term.onData(data => { if(/[\r\n]/.test(data)){s.hints.begin();s.hint=undefined;if(active===s.id)renderHint()} if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data })) })
      term.onResize(({cols,rows}) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows })) })
      dialog.close(); dialog.innerHTML = ''; select(s.id); await list(s); if(passwordWarning)status(passwordWarning)
    } catch (error) { if (dialog.open && epoch === dialogEpoch) {el('form-error').textContent = String(error);if(!edit){verified='';el('connect-button').textContent='重新核对指纹'}} }
    finally { busy = false; const b = document.getElementById('connect-button') as HTMLButtonElement | null; if (b && epoch === dialogEpoch) b.disabled = false }
  }
  dialog.showModal()
  if(target)void api<{saved:boolean}>('password-status',target).then(result=>{
    if(!dialog.open || epoch!==dialogEpoch)return
    hasPassword=result.saved
    dialog.querySelector<HTMLInputElement>('[name=remember]')!.checked=hasPassword
    el('password-state').textContent=hasPassword?'已保存密码；留空沿用，取消勾选并保存可清除。':''
    if(direct && hasPassword && target.fingerprint)el<HTMLFormElement>('connect-form').requestSubmit()
  }).catch(()=>{if(dialog.open && epoch===dialogEpoch)el('password-state').textContent='无法读取已保存密码'})
}
el('add').onclick = () => form()
function showWorkspace(): void { document.querySelector('main')!.hidden=false; el('host-page').hidden=true; el('terminal-nav').classList.add('selected');el('hosts').classList.remove('selected') }
function renderHosts(): void {
  const query=el<HTMLInputElement>('host-search').value.toLowerCase();el('host-count').textContent=`全部主机 ${targets.length}`
  el('host-list').innerHTML=`<table><thead><tr><th>主机名称</th><th>连接地址</th><th>用户</th><th>状态</th><th>操作</th></tr></thead><tbody>${targets.map((t,i)=>({t,i})).filter(({t})=>[t.name,t.host,t.username].join(' ').toLowerCase().includes(query)).map(({t,i})=>{const live=[...sessions.values()].find(s=>s.connected&&s.target.host===t.host&&s.target.port===t.port&&s.target.username===t.username);return `<tr><td><span class="host-icon">▤</span>${esc(t.name||t.host)}</td><td class="mono">${esc(t.host)}:${t.port}</td><td>${esc(t.username)}</td><td>${live?'● 已连接':'未连接'}</td><td><button data-host-connect="${i}" ${live?`data-live="${live.id}"`:''}>${live?'打开':'连接'}</button><button data-host-edit="${i}">编辑</button><button data-host-delete="${i}" aria-label="删除主机">×</button></td></tr>`}).join('')}</tbody></table>${targets.length?'':'<div class="empty-hosts">暂无主机 · 点击「添加主机」建立连接</div>'}`
}
el('hosts').onclick=()=>{document.querySelector('main')!.hidden=true;el('host-page').hidden=false;el('hosts').classList.add('selected');el('terminal-nav').classList.remove('selected');el('breadcrumb').textContent='SSH / 连接中心';renderHosts()}
el('host-search').oninput=renderHosts
el('host-list').onclick=async e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-host-connect],[data-host-delete],[data-host-edit]');if(!b)return;if(b.dataset.live){select(b.dataset.live);return}const i=Number(b.dataset.hostConnect??b.dataset.hostDelete??b.dataset.hostEdit),t=targets[i];if(!t)return;if(b.dataset.hostDelete!==undefined){if(await confirmAction(`删除主机 ${t.name||t.host}？`)){await api('password-delete',t);targets.splice(i,1);saved();renderHosts()}}else form(t,b.dataset.hostEdit!==undefined,b.dataset.hostConnect!==undefined)}
el('host-add').onclick=el('empty-connect').onclick=()=>form()
el('terminal-nav').onclick=()=>select(active)
el('return').onclick=()=>window.parent.postMessage({type:'dsh-ssh-close'},location.origin)
el('models').onclick=()=>{++dialogEpoch;dialog.innerHTML='<h2>模型服务</h2><p>使用 Harness 中已配置的模型。返回 Harness，打开「设置 → 模型」添加服务。</p><div class="buttons"><button id="model-back">返回 Harness</button><button id="cancel">关闭</button></div>';el('cancel').onclick=()=>dialog.close();el('model-back').onclick=()=>{dialog.close();el('return').click()};dialog.showModal()}
el('commands').onclick=()=>{++dialogEpoch;const commands=['pwd','uptime','df -h','free -h','docker ps'];dialog.innerHTML='<h2>快捷命令</h2><p class="muted">插入当前终端，按 Enter 执行。</p>'+commands.map(c=>`<button class="saved-host mono" data-command="${c}">${c}<span>插入 ↗</span></button>`).join('')+'<div class="buttons"><button id="cancel">关闭</button></div>';dialog.querySelectorAll<HTMLElement>('[data-command]').forEach(b=>b.onclick=()=>{const s=sessions.get(active);if(!s?.connected){status('请先连接主机');return}s.term.paste(b.dataset.command!);dialog.close();select(s.id)});el('cancel').onclick=()=>dialog.close();dialog.showModal()}
el('files-toggle').onclick=()=>{const main=document.querySelector('main')!,wasHidden=main.hidden;showWorkspace();if(wasHidden)main.classList.remove('files-hidden');else main.classList.toggle('files-hidden')}
el('ai').addEventListener('click',showWorkspace,{capture:true})
el('transfers-toggle').onclick=()=>{showWorkspace();const panel=document.querySelector<HTMLElement>('.transfers')!;panel.hidden=!panel.hidden;if(!panel.hidden)document.querySelector<HTMLElement>('.ai-panel')!.hidden=true}
function refreshRecordActions() {
  el<HTMLButtonElement>('transfers-clear').disabled = !el('transfers').querySelector('[data-finished]')
}
function finishRecord(task: HTMLElement) {
  task.dataset.finished = 'true'
  const remove = document.createElement('button')
  remove.textContent = '删除记录'
  remove.title = '仅删除传输记录，保留服务器文件'
  remove.onclick = () => { task.remove(); refreshRecordActions() }
  task.append(remove)
  refreshRecordActions()
}
el('transfers-clear').onclick = () => {
  el('transfers').querySelectorAll('[data-finished]').forEach(task => task.remove())
  refreshRecordActions()
}
el('transfers-close').onclick=()=>{document.querySelector<HTMLElement>('.transfers')!.hidden=true}
document.querySelector('.rail')!.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(b)el(b.dataset.action!).click()})
el('ask-selection').onclick=()=>{showWorkspace();if(document.querySelector<HTMLElement>('.ai-panel')!.hidden)el('ai').click();el<HTMLInputElement>('ai-context-enabled').checked=true;el('ai-context-refresh').click();el('ai-question').focus()}
window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='j'){e.preventDefault();el('ask-selection').click()}})
el('sessions').onclick = async e => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return
  if (button.dataset.select) select(button.dataset.select)
  if (button.dataset.close) { const id = button.dataset.close, s = sessions.get(id); if (!s) return; if (!(await editor.canClose(id))) return; if (!(await confirmAction(`关闭 ${s.target.name || s.target.host}？终端与进行中的传输将断开。`))) return; s.socket.close(); await api('close',{id}).catch(() => {}); s.observer.disconnect(); s.term.dispose(); s.element.remove(); sessions.delete(id); select([...sessions.keys()][0] ?? '') }
}
dialog.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-host]'); if (b) { const t = targets[Number(b.dataset.host)]; dialog.close(); if(t) form(t) } })
dialog.addEventListener('cancel', () => { ++dialogEpoch; dialog.innerHTML = '' })
el('path-form').onsubmit = e => { e.preventDefault(); const s = sessions.get(active); if(s) void list(s,el<HTMLInputElement>('path').value) }
el('refresh').onclick = () => { const s = sessions.get(active); if(s) void list(s) }
el('up').onclick = () => { const s = sessions.get(active); if(s) void list(s,s.path.split('/').slice(0,-1).join('/') || '/') }
el('files').onclick = async e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-file],[data-download]'), s = sessions.get(active); if(!b || !s) return
  const row = s.rows[Number(b.dataset.file ?? b.dataset.download)]; if(!row) return
  const path = s.path.replace(/\/$/,'') + '/' + row.name
  if(row.directory) { await list(s,path); return }
  if (b.dataset.download === undefined) { try { await editor.open(s.id,path) } catch(error) { status(String(error)) }; return }
  // Bounded browser download; large streaming-to-disk is a later native adapter.
  if(row.size > 32 * 1024 * 1024) { status('当前下载上限为 32 MB'); return }
  document.querySelector<HTMLElement>('.transfers')!.hidden=false; document.querySelector<HTMLElement>('.ai-panel')!.hidden=true
  const task = document.createElement('div'); task.className='task'; task.textContent = `↓ ${row.name} · 下载中`; el('transfers').prepend(task)
  try { const res = await fetch('/ssh-workbench/download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:s.id,path})}); if(!res.ok) throw new Error('下载失败'); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=row.name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); task.textContent=`↓ ${row.name} · 已下载` } catch { task.textContent=`↓ ${row.name} · 下载失败` }
  finishRecord(task)
}
el<HTMLInputElement>('upload').onchange = e => {
  const input = e.target as HTMLInputElement, s = sessions.get(active); if(!s?.connected) { status('请先连接主机'); input.value=''; return }
  document.querySelector<HTMLElement>('.transfers')!.hidden=false; document.querySelector<HTMLElement>('.ai-panel')!.hidden=true
  for(const file of Array.from(input.files ?? [])) {
    const path = s.path.replace(/\/$/,'')+'/'+file.name
    const task = document.createElement('div'); task.className='task'; task.innerHTML=`<b>↑ ${esc(file.name)}</b><small>${esc(s.target.host)} · ${esc(path)}</small><progress max="100" value="0"></progress><span>上传中</span><button>取消</button>`; el('transfers').prepend(task)
    const xhr = new XMLHttpRequest(); xhr.open('POST',`/ssh-workbench/upload?id=${encodeURIComponent(s.id)}&path=${encodeURIComponent(path)}`)
    const label=task.querySelector('span')!, cancel=task.querySelector('button')!
    const end=(text:string) => { label.textContent=text; cancel.remove(); finishRecord(task) }
    xhr.upload.onprogress = ev => { if(ev.lengthComputable) task.querySelector('progress')!.value=ev.loaded/ev.total*100 }
    xhr.onload = () => { if(xhr.status===200) { end('已完成'); void list(s) } else { let msg='上传失败'; try { msg=(JSON.parse(xhr.responseText) as {error:string}).error } catch {} end(msg) } }
    xhr.onerror=()=>end('上传失败'); xhr.onabort=()=>end('已取消'); cancel.onclick=()=>xhr.abort(); xhr.send(file)
  }
  input.value=''
}
new ResizeObserver(() => { const s=sessions.get(active); if(s) s.fit.fit() }).observe(el('terminals'))
window.addEventListener('beforeunload',()=>{for(const s of sessions.values()) s.socket.close()})

el('ai').click()

el('error-hint-dismiss').onclick=()=>{const s=sessions.get(active);if(s)s.hint=undefined;renderHint()}
el('error-hint-ask').onclick=()=>{el('ask-selection').click();el<HTMLTextAreaElement>('ai-context').value=sessions.get(active)?.hints.context()??'';el<HTMLTextAreaElement>('ai-question').value='请分析刚才的终端报错，解释原因并给出修正命令。';el('ai-question').focus()}
