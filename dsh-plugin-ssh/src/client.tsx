import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { useEffect, useRef, useSyncExternalStore } from 'react'

export const inject = ['slots']

/** Additive slots: the existing Harness root and conversation stay mounted. */
export function apply(ctx: Context): void {
  let visible=false, mounted=false
  const listeners=new Set<()=>void>()
  const open=()=>{visible=true;mounted=true;for(const fn of listeners)fn()}
  const close=()=>{visible=false;for(const fn of listeners)fn()}
  const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}}
  function Launcher(){return <button type="button" onClick={open} title="SSH 工作区" style={{padding:'8px 12px',cursor:'pointer',border:'1px solid currentColor',borderRadius:6,background:'transparent',color:'inherit'}}>⌘ SSH</button>}
  function Surface(){
    const active=useSyncExternalStore(subscribe,()=>visible,()=>false),frame=useRef<HTMLIFrameElement>(null)
    useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;if(event.data?.type==='dsh-ssh-close'||event.data?.type==='dsh-ssh-model-settings')close()};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)},[])
    return mounted?<div hidden={!active} style={{position:'fixed',inset:0,zIndex:1000,background:'#141819'}}><iframe ref={frame} title="DSH SSH 工作区" src="/ssh-workbench/" style={{display:'block',width:'100%',height:'100%',border:0}} /></div>:null
  }
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'dsh-ssh'},Launcher))
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'dsh-ssh'},Surface))
  ctx.effect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();open()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},'ssh: shortcut')
}
