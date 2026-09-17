import type { Project, ProjectActivity, ProjectAssetRef, ProjectConfig, ProjectConfigRevision, ProjectSnapshot, ProjectTaskLink, ProjectTemplate, ProjectWorkItem } from 'workdsh-contracts/projects';

const path='/api/workdsh-projects', storageKey='workdsh.projects.local.v1';
const templates:readonly ProjectTemplate[]=[
  {id:'product',name:'产品需求全流程',description:'从需求规划、PRD 到研发测试验收',instruction:'围绕产品目标维护需求、计划、任务、资产和决策记录。'},
  {id:'research',name:'市场调研与竞品分析',description:'深度调研、竞品拆解、报告评审',instruction:'引用可核验资料，区分事实、推断与建议，持续沉淀研究资产。'},
  {id:'knowledge',name:'团队知识库',description:'持续沉淀 SOP、经验和 FAQ',instruction:'优先复用项目资产，输出可维护、可追溯的团队知识。'},
  {id:'delivery',name:'项目交付',description:'管理客户需求、计划、风险和周报',instruction:'跟踪交付范围、负责人、时间、风险和验收证据。'},
  {id:'bugs',name:'Bug 跟踪/测试验收',description:'持续跟踪 Bug、测试用例和验收',instruction:'问题必须关联复现步骤、负责人、优先级、状态和验证证据。'},
];
type State={projects:Project[];snapshots:Record<string,ProjectSnapshot>};
const empty=():State=>({projects:[],snapshots:{}});
const read=():State=>{try{return JSON.parse(localStorage.getItem(storageKey)??'') as State}catch{return empty()}};
const write=(state:State)=>localStorage.setItem(storageKey,JSON.stringify(state));
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const local={
  templates:async()=>templates,
  list:async(query='')=>{const needle=query.trim().toLowerCase();return read().projects.filter(x=>x.status==='active'&&(!needle||`${x.name} ${x.description}`.toLowerCase().includes(needle)))},
  create:async(name:string,description='',templateId?:string)=>{const state=read(),template=templates.find(x=>x.id===templateId),createdAt=now(),projectId=id(),configId=id();const project:Project={id:projectId,name:name.trim()||'未命名项目',description:description||template?.description||'',...(template?{templateId:template.id}:{}),owner:{organizationId:'local-personal',ownerPrincipalId:'local-user',scope:'personal'},status:'active',configRevisionId:configId,createdAt,updatedAt:createdAt};const config:ProjectConfigRevision={id:configId,projectId,number:1,instruction:template?.instruction??'',capabilities:[],createdBy:'local-user',createdAt};const activity:ProjectActivity={id:id(),projectId,kind:'project',text:`创建了项目「${project.name}」`,actorId:'local-user',createdAt};const snapshot:ProjectSnapshot={project,config,workItems:[],assets:[],tasks:[],activity:[activity]};write({projects:[project,...state.projects],snapshots:{...state.snapshots,[projectId]:snapshot}});return snapshot},
  get:async(projectId:string)=>{const row=read().snapshots[projectId];if(!row)throw new Error('项目不存在');return row},
};
async function invoke<T>(endpoint:string,payload:unknown,signal?:AbortSignal):Promise<T>{const timeout=AbortSignal.timeout(1200);const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint,payload}),signal:signal?AbortSignal.any([signal,timeout]):timeout});const result=await response.json() as {ok?:boolean;value?:T;error?:{message?:string}};if(!result.ok)throw new Error(result.error?.message??'项目操作失败。');return result.value as T;}
const saveSnapshot=(snapshot:ProjectSnapshot)=>{const state=read(),project=snapshot.project;write({projects:[project,...state.projects.filter(x=>x.id!==project.id)],snapshots:{...state.snapshots,[project.id]:snapshot}});return snapshot};
const remoteOr=<T>(remote:()=>Promise<T>,fallback:()=>Promise<T>)=>remote().catch(fallback);
export function createProjectClient(lifetime?:AbortSignal){return{
  templates:()=>remoteOr(()=>invoke<readonly ProjectTemplate[]>('templates',{},lifetime),local.templates),
  list:(query='')=>remoteOr(()=>invoke<readonly Project[]>('list',{query},lifetime),()=>local.list(query)),
  create:(name:string,description='',templateId?:string)=>remoteOr(()=>invoke<ProjectSnapshot>('create',{name,description,templateId},lifetime),()=>local.create(name,description,templateId)),
  get:(projectId:string)=>remoteOr(()=>invoke<ProjectSnapshot>('get',{projectId},lifetime),()=>local.get(projectId)),
  archive:(projectId:string)=>remoteOr(()=>invoke<Project>('archive',{projectId},lifetime),async()=>{const snapshot=await local.get(projectId),project={...snapshot.project,status:'archived' as const,updatedAt:now()};saveSnapshot({...snapshot,project});return project}),
  updateConfig:(projectId:string,config:ProjectConfig,expectedRevisionId:string)=>remoteOr(()=>invoke<ProjectConfigRevision>('update-config',{projectId,config,expectedRevisionId},lifetime),async()=>{const snapshot=await local.get(projectId);if(snapshot.config.id!==expectedRevisionId)throw new Error('内容已更新，请刷新后重试');const revision:ProjectConfigRevision={...config,id:id(),projectId,number:snapshot.config.number+1,createdBy:'local-user',createdAt:now()};const project={...snapshot.project,configRevisionId:revision.id,updatedAt:revision.createdAt};saveSnapshot({...snapshot,project,config:revision});return revision}),
  addWorkItem:(projectId:string,title:string)=>remoteOr(()=>invoke<ProjectWorkItem>('add-work-item',{projectId,title},lifetime),async()=>{const snapshot=await local.get(projectId),createdAt=now(),item:ProjectWorkItem={id:id(),projectId,title,status:'todo',priority:'none',tags:[],revision:id(),createdAt,updatedAt:createdAt};saveSnapshot({...snapshot,workItems:[...snapshot.workItems,item]});return item}),
  updateWorkItem:(projectId:string,item:Pick<ProjectWorkItem,'id'|'title'|'status'|'assignee'|'priority'|'tags'>,expectedRevision:string)=>remoteOr(()=>invoke<ProjectWorkItem>('update-work-item',{projectId,item,expectedRevision},lifetime),async()=>{const snapshot=await local.get(projectId),old=snapshot.workItems.find(x=>x.id===item.id);if(!old||old.revision!==expectedRevision)throw new Error('内容已更新，请刷新后重试');const next:ProjectWorkItem={...old,...item,revision:id(),updatedAt:now()};saveSnapshot({...snapshot,workItems:snapshot.workItems.map(x=>x.id===next.id?next:x)});return next}),
  addAsset:(projectId:string,asset:Omit<ProjectAssetRef,'id'|'projectId'|'createdAt'>)=>remoteOr(()=>invoke<ProjectAssetRef>('add-asset',{projectId,asset},lifetime),async()=>{const snapshot=await local.get(projectId),existing=snapshot.assets.find(x=>x.assetId===asset.assetId&&x.revisionId===asset.revisionId);if(existing)return existing;const ref:ProjectAssetRef={...asset,id:id(),projectId,createdAt:now()};saveSnapshot({...snapshot,assets:[...snapshot.assets,ref]});return ref}),
  removeAsset:(projectId:string,refId:string)=>remoteOr(()=>invoke<void>('remove-asset',{projectId,refId},lifetime),async()=>{const snapshot=await local.get(projectId);saveSnapshot({...snapshot,assets:snapshot.assets.filter(x=>x.id!==refId)})}),
  linkTask:(projectId:string,sessionId:string,title:string,workItemId?:string)=>remoteOr(()=>invoke<ProjectTaskLink>('link-task',{projectId,sessionId,title,workItemId},lifetime),async()=>{const snapshot=await local.get(projectId),task:ProjectTaskLink={id:id(),projectId,sessionId,title,configRevisionId:snapshot.config.id,...(workItemId?{workItemId}:{}),createdAt:now()};saveSnapshot({...snapshot,tasks:[task,...snapshot.tasks]});return task}),
  postMessage:(projectId:string,text:string)=>remoteOr(()=>invoke<ProjectActivity>('post-message',{projectId,text},lifetime),async()=>{const snapshot=await local.get(projectId),event:ProjectActivity={id:id(),projectId,kind:'message',text,actorId:'local-user',createdAt:now()};saveSnapshot({...snapshot,activity:[event,...snapshot.activity]});return event}),
};}
export type ProjectClient=ReturnType<typeof createProjectClient>;
