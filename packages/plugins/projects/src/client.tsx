import * as React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ProjectSnapshot } from 'workdsh-contracts/projects';
import { createProjectClient } from './client/management.js'; import { ProjectsPanel } from './client/ProjectsPanel.js';
export const name='workdsh-projects-client'; export const inject=['slots','layout','sessions','workspaces','conversation'];
export function apply(ctx:Context){const lifetime=new AbortController();ctx.effect(()=>()=>lifetime.abort(),'workdsh.projects.client');const management=createProjectClient(lifetime.signal),sessions=ctx.sessions as unknown as ISessions;
const startTask=async(snapshot:ProjectSnapshot,prompt:string)=>{const state=sessions.list.getSnapshot(),current=state.current?state.byId[state.current]:undefined,workspaces=ctx.workspaces.list.getSnapshot().items,workspace=workspaces.find(x=>x.sessionIds.includes(state.current!))??workspaces.find(x=>x.path===current?.cwd)??workspaces[0];if(!workspace)throw new Error('请先选择工作空间。');const sessionId=await sessions.create({workspaceId:workspace.workspaceId,cwd:workspace.path});await management.linkTask(snapshot.project.id,String(sessionId),prompt.slice(0,80)||snapshot.project.name);
const invoke=async(path:string,endpoint:string,payload:unknown)=>fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint,payload})});
if(snapshot.assets.length)await invoke('/api/workdsh-library','set-task-selection',{sessionId:String(sessionId),nodeIds:snapshot.assets.map(x=>x.nodeId)}).catch(()=>undefined);
const connectors=snapshot.config.capabilities.filter(x=>x.kind==='connector').map(x=>x.id);if(connectors.length)await invoke('/api/workdsh-connectors','set-selection',{sessionId:String(sessionId),connectorIds:connectors}).catch(()=>undefined);
const skill=snapshot.config.capabilities.find(x=>x.kind==='skill');const context=snapshot.config.instruction.trim()?`\n\n项目指令（修订 ${snapshot.config.number}）：\n${snapshot.config.instruction.trim()}`:'';const draft=`${skill?`/${skill.id} `:''}${prompt}${context}`;sessions.open(sessionId);ctx.layout.selectPanel(null);for(let attempt=0;attempt<40;attempt++){await new Promise(r=>setTimeout(r,attempt?25:150));const scope=sessions.scope(sessionId);if(scope){try{scope.conversation.input.for(scope).setDraft(draft);return;}catch{}}}};
ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'workdsh-projects',inject:()=>({management,startTask})},ProjectsPanel));}
