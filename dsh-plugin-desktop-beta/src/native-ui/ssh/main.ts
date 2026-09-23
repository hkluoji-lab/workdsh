import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { installAi } from './ai.ts'
import { installEditor } from './editor.ts'

const root = document.getElementById('ssh-root')!
interface Target { name: string; host: string; port: number; username: string; fingerprint?: string }
interface Row { name: string; directory: boolean; size: number; modified: number }
interface Session { id: string; target: Target; path: string; rows: Row[]; term: Terminal; fit: FitAddon; socket: WebSocket; element: HTMLDivElement; connected: boolean; listing: number; observer: ResizeObserver }
const sessions = new Map<string, Session>()
let active = '', targets: Target[] = [], dialogEpoch = 0
try { const stored: unknown = JSON.parse(localStorage.getItem('dsh-ssh-targets') ?? '[]'); if (Array.isArray(stored)) targets = stored.filter(t => t && typeof t.host === 'string' && typeof t.username === 'string' && Number.isInteger(t.port)).slice(0, 100) } catch { /* Empty host list after invalid saved data. */ }
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
async function api<T>(op: string, data: unknown): Promise<T> {
  const response = await fetch('/desktop/ssh/' + op, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error ?? '请求失败')
  return result
}
root.innerHTML = `<header><b>WorkDSH</b><nav id="sessions"></nav><button id="add">＋ 连接</button><button id="hosts">主机</button><button id="ai">AI</button></header><main><aside><form id="path-form"><input id="path" aria-label="远程目录" placeholder="连接后查看目录"><button>前往</button></form><div class="file-actions"><button id="up">上级</button><button id="refresh">刷新</button><label class="button">上传<input id="upload" type="file" multiple hidden></label></div><div id="files"></div></aside><section id="terminals"><div id="empty">添加 SSH 连接</div></section><aside class="transfers"><h3>传输</h3><div id="transfers"></div></aside></main><footer><span id="status">未连接</span><span>SSH / SFTP</span></footer><dialog id="dialog"></dialog>`
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const status = (text: string) => { el('status').textContent = text }
const dialog = el<HTMLDialogElement>('dialog')
const editor = installEditor(api, () => active)
const ai = installAi(() => {
  const s = sessions.get(active); if (!s?.connected) return undefined
  return { id: s.id, label: `${s.target.username}@${s.target.host}`, context: () => {
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
function select(id: string): void {
  active = id; const s = sessions.get(id)
  for (const entry of sessions.values()) entry.element.hidden = entry.id !== id
  el('empty').hidden = sessions.size > 0; tabs(); ai.refresh(); editor.refresh()
  if (s) { el<HTMLInputElement>('path').value = s.path; files(s); s.fit.fit(); s.term.focus(); status(`${s.target.username}@${s.target.host}:${s.target.port} · ${s.connected ? '已连接' : '已断开'}`) }
  else { el('files').textContent = ''; status('未连接') }
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
function form(target?: Target): void {
  const epoch = ++dialogEpoch
  dialog.innerHTML = `<form id="connect-form"><h2>${target ? '连接主机' : '添加主机'}</h2><label>名称<input name="name" value="${esc(target?.name ?? '')}"></label><div class="pair"><label>地址<input name="host" required value="${esc(target?.host ?? '')}"></label><label>端口<input name="port" type="number" min="1" max="65535" value="${target?.port ?? 22}" required></label></div><label>用户名<input name="username" value="${esc(target?.username ?? '')}" required></label><label>密码<input name="password" type="password" autocomplete="off"></label><details><summary>使用私钥</summary><label>私钥内容<textarea name="privateKey" spellcheck="false"></textarea></label><label>私钥口令<input name="passphrase" type="password" autocomplete="off"></label></details><p class="muted">仅保存主机信息与指纹。密码和私钥不保存。</p><div id="fingerprint"></div><p id="form-error" role="alert"></p><div class="buttons"><button type="button" id="cancel">取消</button><button id="connect-button">核对指纹</button></div></form>`
  let verified = '', signature = '', busy = false
  el('cancel').onclick = () => { dialog.close(); dialog.innerHTML = '' }
  el('connect-form').onsubmit = async e => {
    e.preventDefault(); if (busy) return
    const f = e.currentTarget as HTMLFormElement, d = new FormData(f)
    const t: Target = { name: String(d.get('name')), host: String(d.get('host')).trim(), port: Number(d.get('port')), username: String(d.get('username')).trim() }
    const sig = JSON.stringify([t.host,t.port,t.username]); busy = true; el<HTMLButtonElement>('connect-button').disabled = true; el('form-error').textContent = ''
    try {
      if (!verified || signature !== sig) {
        const result = await api<{ fingerprint: string }>('probe', t)
        if (!dialog.open || epoch !== dialogEpoch) return
        verified = result.fingerprint; signature = sig
        const old = targets.find(v => v.host === t.host && v.port === t.port)?.fingerprint
        el('fingerprint').innerHTML = `<p>${old && old !== verified ? '⚠ 主机指纹已变化，请向管理员核实。' : old === verified ? '主机指纹一致' : '请核对主机指纹'}</p><code>${esc(verified)}</code>`
        el('connect-button').textContent = old && old !== verified ? '接受新指纹并连接' : '确认指纹并连接'
        return
      }
      const result = await api<{ id: string; path: string }>('connect', { ...t, fingerprint: verified, password: String(d.get('password')), privateKey: String(d.get('privateKey')), passphrase: String(d.get('passphrase')) })
      if (!dialog.open || epoch !== dialogEpoch) { await api('close', { id: result.id }); return }
      t.fingerprint = verified
      targets = targets.filter(v => !(v.host === t.host && v.port === t.port && v.username === t.username)); targets.push(t)
      try { saved() } catch { status('主机信息未能保存') }
      const element = document.createElement('div'); element.className = 'terminal'; el('terminals').append(element)
      const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, Consolas, monospace', scrollback: 5000, theme: { background: '#111713', foreground: '#d2ddce' } })
      const fit = new FitAddon(); term.loadAddon(fit); term.open(element)
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/desktop/ssh/terminal?id=${encodeURIComponent(result.id)}`); socket.binaryType = 'arraybuffer'
      const observer = new ResizeObserver(() => { if (!element.hidden) fit.fit() }); observer.observe(element)
      const s: Session = { observer, id: result.id, target: t, path: result.path, rows: [], term, fit, socket, element, connected: true, listing: 0 }; sessions.set(s.id,s)
      socket.onmessage = e => { if (e.data instanceof ArrayBuffer) term.write(new Uint8Array(e.data)) }
      socket.onopen = () => { fit.fit(); socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })) }
      socket.onclose = () => { s.connected = false; term.writeln('\r\n\x1b[31mSSH 已断开\x1b[0m'); tabs(); if (active === s.id) status('SSH 已断开，请重新连接') }
      socket.onerror = () => status('终端连接失败')
      term.onData(data => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data })) })
      term.onResize(({cols,rows}) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows })) })
      dialog.close(); dialog.innerHTML = ''; select(s.id); await list(s)
    } catch (error) { if (dialog.open && epoch === dialogEpoch) el('form-error').textContent = String(error) }
    finally { busy = false; const b = document.getElementById('connect-button') as HTMLButtonElement | null; if (b && epoch === dialogEpoch) b.disabled = false }
  }
  dialog.showModal()
}
el('add').onclick = () => form()
el('hosts').onclick = () => {
  ++dialogEpoch
  dialog.innerHTML = `<h2>主机</h2>${targets.map((t,i) => `<button class="saved-host" data-host="${i}">${esc(t.name || t.host)}<small>${esc(t.username)}@${esc(t.host)}:${t.port}</small></button>`).join('') || '<p>暂无保存的主机</p>'}<button id="cancel">关闭</button>`
  el('cancel').onclick = () => dialog.close(); dialog.showModal()
}
el('sessions').onclick = async e => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return
  if (button.dataset.select) select(button.dataset.select)
  if (button.dataset.close) { const id = button.dataset.close, s = sessions.get(id); if (!s) return; if (!editor.canClose(id)) return; if (!confirm(`关闭 ${s.target.name || s.target.host}？终端与进行中的传输将断开。`)) return; s.socket.close(); await api('close',{id}).catch(() => {}); s.observer.disconnect(); s.term.dispose(); s.element.remove(); sessions.delete(id); select([...sessions.keys()][0] ?? '') }
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
  const task = document.createElement('p'); task.textContent = `↓ ${row.name} · 下载中`; el('transfers').prepend(task)
  try { const res = await fetch('/desktop/ssh/download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:s.id,path})}); if(!res.ok) throw new Error('下载失败'); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=row.name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); task.textContent=`↓ ${row.name} · 已下载` } catch { task.textContent=`↓ ${row.name} · 下载失败` }
}
el<HTMLInputElement>('upload').onchange = e => {
  const input = e.target as HTMLInputElement, s = sessions.get(active); if(!s?.connected) { status('请先连接主机'); input.value=''; return }
  for(const file of Array.from(input.files ?? [])) {
    const path = s.path.replace(/\/$/,'')+'/'+file.name
    const task = document.createElement('div'); task.className='task'; task.innerHTML=`<b>↑ ${esc(file.name)}</b><small>${esc(s.target.host)} · ${esc(path)}</small><progress max="100" value="0"></progress><span>上传中</span><button>取消</button>`; el('transfers').prepend(task)
    const xhr = new XMLHttpRequest(); xhr.open('POST',`/desktop/ssh/upload?id=${encodeURIComponent(s.id)}&path=${encodeURIComponent(path)}`)
    const label=task.querySelector('span')!, cancel=task.querySelector('button')!
    const end=(text:string) => { label.textContent=text; cancel.remove() }
    xhr.upload.onprogress = ev => { if(ev.lengthComputable) task.querySelector('progress')!.value=ev.loaded/ev.total*100 }
    xhr.onload = () => { if(xhr.status===200) { end('已完成'); void list(s) } else { let msg='上传失败'; try { msg=(JSON.parse(xhr.responseText) as {error:string}).error } catch {} end(msg) } }
    xhr.onerror=()=>end('上传失败'); xhr.onabort=()=>end('已取消'); cancel.onclick=()=>xhr.abort(); xhr.send(file)
  }
  input.value=''
}
new ResizeObserver(() => { const s=sessions.get(active); if(s) s.fit.fit() }).observe(el('terminals'))
window.addEventListener('beforeunload',()=>{for(const s of sessions.values()) s.socket.close()})
