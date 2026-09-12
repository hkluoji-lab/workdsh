import {z} from 'zod';
import {PptxHandler,type PptxSlide} from 'pptx-viewer-core';
import {OfficeError} from '../content/model.js';
const id=z.string().min(1).max(200).refine(v=>!['__proto__','prototype','constructor'].includes(v));
const slide=z.object({id,nativeId:z.string().optional(),slideNumber:z.number().int().positive(),elements:z.array(z.record(z.string(),z.unknown())).max(200)}).passthrough();
const schema=z.object({provider:z.literal('pptx-react'),id,title:z.string().min(1).max(2000),bytes:z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(12*1024*1024),slides:z.array(slide).min(1).max(50)}).strict();
export type NativeDeck=z.infer<typeof schema>;
export function parsePresentation(input:unknown):NativeDeck{
 const deck=schema.parse(structuredClone(input));
 if(new Set(deck.slides.map(s=>s.id)).size!==deck.slides.length)throw new OfficeError('INVALID_INPUT','幻灯片 ID 重复。');
 return deck;
}
const encode=(b:Uint8Array)=>Buffer.from(b).toString('base64');
export async function createPresentation(title:string):Promise<NativeDeck>{
 const {handler,data,createSlide}=await PptxHandler.create({title});
 data.slides.push(createSlide().addText(title,{x:60,y:180,width:840,height:100,fontSize:40,fontFamily:'Microsoft YaHei',color:'#172554',bold:true}).build());
 const stable=data.slides.map(s=>s.id);const bytes=encode(await handler.save(data.slides));
 return parsePresentation({provider:'pptx-react',id:crypto.randomUUID(),title,bytes,slides:data.slides.map((s,i)=>({...s,id:stable[i],nativeId:s.id}))});
}
const ops=z.discriminatedUnion('op',[
 z.object({op:z.literal('presentation.replaceDeck'),deck:z.unknown()}).strict(),
 z.object({op:z.literal('presentation.insertSlides'),afterSlideId:id.nullable(),slides:z.array(slide).min(1).max(50)}).strict(),
 z.object({op:z.literal('presentation.updateSlide'),slideId:id,patch:z.object({elements:z.array(z.record(z.string(),z.unknown())).max(200).optional(),name:z.string().max(2000).optional(),backgroundColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),notes:z.string().max(20000).optional()}).strict().refine(p=>Object.keys(p).length>0)}).strict(),
 z.object({op:z.literal('presentation.removeSlide'),slideId:id}).strict(),
 z.object({op:z.literal('presentation.moveSlide'),slideId:id,afterSlideId:id.nullable()}).strict(),
]);
export async function applyPresentation(input:unknown,batch:unknown):Promise<NativeDeck>{
 let deck=parsePresentation(input);
 const index=(key:string)=>{const i=deck.slides.findIndex(s=>s.id===key);if(i<0)throw new OfficeError('INVALID_INPUT','幻灯片不存在。');return i};
 const after=(key:string|null)=>key===null?0:index(key)+1;
 for(const op of z.array(ops).min(1).max(100).parse(batch)){
  if(op.op==='presentation.replaceDeck'){const next=parsePresentation(op.deck);if(next.id!==deck.id)throw new OfficeError('INVALID_INPUT','文档 ID 不能改变。');deck=next;}
  if(op.op==='presentation.insertSlides')deck.slides.splice(after(op.afterSlideId),0,...op.slides);
  if(op.op==='presentation.updateSlide')Object.assign(deck.slides[index(op.slideId)]!,op.patch);
  if(op.op==='presentation.removeSlide')deck.slides.splice(index(op.slideId),1);
  if(op.op==='presentation.moveSlide'){if(op.slideId===op.afterSlideId)throw new OfficeError('INVALID_INPUT','幻灯片不能移到自己之后。');const s=deck.slides.splice(index(op.slideId),1)[0]!;deck.slides.splice(after(op.afterSlideId),0,s);}
 }
 deck=parsePresentation(deck);
 const handler=new PptxHandler();await handler.load(Uint8Array.from(Buffer.from(deck.bytes,'base64')).buffer);
 deck.slides.forEach((s,i)=>{s.slideNumber=i+1});
 const coreSlides=deck.slides.map(s=>({...s,id:s.nativeId??s.id})) as unknown as PptxSlide[];
 deck.bytes=encode(await handler.save(coreSlides));
 deck.slides=parsePresentation({...deck,slides:coreSlides.map((s,i)=>({...s,id:deck.slides[i]!.id,nativeId:s.id}))}).slides;
 return parsePresentation(deck);
}
