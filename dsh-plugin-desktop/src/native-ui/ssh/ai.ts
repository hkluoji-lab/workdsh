interface AiSession { id: string; label: string; context: () => string }
interface Turn { role: 'user' | 'assistant'; text: string }
/** Per-SSH-session conversations; no terminal content leaves the app before Send. */
export function installAi(getSession: () => AiSession | undefined): { refresh: () => void } {
  const panel = document.createElement('aside'); panel.className = 'ai-panel'; panel.hidden = true
  panel.innerHTML = `<div class="file-actions"><b>AI</b><button id="ai-clear">清空</button><button id="ai-hide">×</button></div><small id="ai-target"></small><select id="ai-model" aria-label="模型"></select><button id="ai-model-settings">模型设置</button><div id="ai-history"></div><form id="ai-form"><label><input id="ai-context-enabled" type="checkbox">附带终端内容</label><details><summary>查看发送内容</summary><textarea id="ai-context" rows="6" aria-label="发送的终端上下文"></textarea><button type="button" id="ai-context-refresh">更新选区／最近输出</button></details><textarea id="ai-question" required maxlength="8000" placeholder="询问当前主机…" rows="3"></textarea><div class="buttons"><button type="button" id="ai-stop">停止</button><button id="ai-send">发送</button></div><p id="ai-error" role="status"></p></form>`
  document.querySelector('main')!.append(panel)
  const q = <T extends HTMLElement>(id: string) => panel.querySelector<T>('#'+id)!
  const conversations = new Map<string, Turn[]>(), running = new Map<string, AbortController>()
  const model = q<HTMLSelectElement>('ai-model'), context = q<HTMLTextAreaElement>('ai-context')
  let shown = ''
  function refresh(): void {
    const s = getSession(); q('ai-target').textContent = s?.label ?? '请先连接主机'
    if (shown !== s?.id) { context.value = ''; q<HTMLInputElement>('ai-context-enabled').checked = false; q<HTMLTextAreaElement>('ai-question').value = ''; q('ai-error').textContent = ''; shown = s?.id ?? '' }
    q<HTMLButtonElement>('ai-send').disabled = !s || running.has(s.id) || !model.value
    q<HTMLButtonElement>('ai-stop').disabled = !s || !running.has(s.id)
    q<HTMLButtonElement>('ai-clear').disabled = !!s && running.has(s.id)
    const history = q('ai-history'); history.replaceChildren()
    for (const turn of conversations.get(s?.id ?? '') ?? []) { const row = document.createElement('div'); row.className='ai-turn'; const label=document.createElement('b'); label.textContent=turn.role==='user'?'你':'AI'; const text=document.createElement('pre'); text.textContent=turn.text; row.append(label,text); history.append(row) }
    history.scrollTop=history.scrollHeight
  }
  document.getElementById('ai')!.onclick = async () => {
    panel.hidden = !panel.hidden; refresh()
    if(panel.hidden) return
    try {
      const res=await fetch('/desktop/ssh/models',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
      if(!res.ok) throw new Error()
      const providers=await res.json() as Array<{id:string;name:string;models:Array<{id:string;name:string}>}>
      const previous=model.value; model.replaceChildren()
      for(const p of providers) for(const m of p.models) { const option=document.createElement('option'); option.value=JSON.stringify([p.id,m.id]); option.textContent=p.name+' / '+m.name; model.append(option) }
      if([...model.options].some(o=>o.value===previous)) model.value=previous
      if(!model.options.length) q('ai-error').textContent='请在模型设置中配置服务'
      refresh()
    } catch { q('ai-error').textContent='无法读取模型服务'; refresh() }
  }
  q('ai-hide').onclick=()=>{panel.hidden=true}
  q('ai-model-settings').onclick=()=>window.parent.postMessage({type:'dsh-ssh-model-settings'},location.origin)
  q('ai-context-refresh').onclick=()=>{context.value=getSession()?.context().slice(-24000) ?? ''}
  q<HTMLInputElement>('ai-context-enabled').onchange=e=>{if((e.target as HTMLInputElement).checked) context.value=getSession()?.context().slice(-24000) ?? ''}
  q('ai-clear').onclick=()=>{const s=getSession();if(s&&!running.has(s.id)){conversations.delete(s.id);refresh()}}
  q('ai-stop').onclick=()=>{const s=getSession();if(s) running.get(s.id)?.abort()}
  q('ai-form').onsubmit=async e=>{
    e.preventDefault();const s=getSession(), input=q<HTMLTextAreaElement>('ai-question'), question=input.value.trim()
    if(!s||!question||!model.value||running.has(s.id))return
    const [provider,selectedModel]=JSON.parse(model.value) as [string,string]
    const previous=conversations.get(s.id)??[], history=previous.slice(-12).map(t=>({...t,text:t.text.slice(-8000)}))
    // Retain only a bounded history; the current terminal snapshot is sent once and remains editable.
    while(history.reduce((n,t)=>n+t.text.length,0)>48000)history.shift()
    const assistant:Turn={role:'assistant',text:''}; conversations.set(s.id,[...previous.slice(-18),{role:'user',text:question},assistant])
    const call=new AbortController();running.set(s.id,call);input.value='';q('ai-error').textContent='';refresh()
    try {
      const res=await fetch('/desktop/ssh/ai',{method:'POST',headers:{'content-type':'application/json'},signal:call.signal,body:JSON.stringify({id:s.id,provider,model:selectedModel,question,context:q<HTMLInputElement>('ai-context-enabled').checked?context.value.slice(-24000):'',history})})
      if(!res.ok){const data=await res.json() as {error?:string};throw new Error(data.error??'AI 请求失败')}
      if(!res.body)throw new Error('未收到响应')
      const reader=res.body.getReader(), decoder=new TextDecoder();let pending='',done=false
      while(true){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});let newline:number;while((newline=pending.indexOf('\n'))>=0){const event=JSON.parse(pending.slice(0,newline)) as {text?:string;error?:string;done?:boolean};pending=pending.slice(newline+1);if(event.error)throw new Error(event.error);if(event.text)assistant.text+=event.text;if(event.done)done=true}if(getSession()?.id===s.id)refresh()}
      if(!done)throw new Error('响应中断')
    }catch(error){if(getSession()?.id===s.id)q('ai-error').textContent=call.signal.aborted?'已停止':String(error)}
    finally{running.delete(s.id);if(getSession()?.id===s.id)refresh()}
  }
  model.onchange=()=>{conversations.clear();refresh()}
  window.addEventListener('beforeunload',()=>{for(const call of running.values())call.abort()})
  return {refresh}
}
