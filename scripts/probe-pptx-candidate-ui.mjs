// Isolated UI acceptance probe. User fixture is read-only.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const out=path.resolve('.artifacts/pptx-candidate');
const fixture=process.argv[2];
if(!fixture)throw new Error('Pass read-only PPTX fixture');
const input=await readFile(fixture), hash=b=>createHash('sha256').update(b).digest('hex');
const source=`import {createPptxViewer} from 'pptx-vanilla-viewer';
window.start=bytes=>{window.viewer=createPptxViewer(document.getElementById('host'),{source:new Uint8Array(bytes),editable:true,showToolbar:true,showThumbnails:true,autosave:false,onLoad:()=>window.loaded=true,onError:e=>window.loadError=String(e)});};`;
const bundle=await build({stdin:{contents:source,resolveDir:out},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',outdir:out,loader:{'.wasm':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],network=[];let result={version:'2.16.4'};
try{
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(r.request().url()==='http://pptx-ui.invalid/')return r.fulfill({contentType:'text/html',body:'<style>html,body,#host{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="host"></div>'});network.push(r.request().url());return r.abort();});
 await page.goto('http://pptx-ui.invalid/');
 for(const f of bundle.outputFiles){if(f.path.endsWith('.js'))await page.addScriptTag({content:f.text});if(f.path.endsWith('.css'))await page.addStyleTag({content:f.text});}
 await page.evaluate(bytes=>window.start(bytes),Array.from(input));
 await page.waitForFunction(()=>window.loaded||window.loadError,{},{timeout:30000});
 const loadError=await page.evaluate(()=>window.loadError);if(loadError)throw new Error(loadError);
 await page.getByRole('button',{name:'Back to presentation',exact:true}).click();
 await page.screenshot({path:path.join(out,'ui-first.png')});
 await page.locator('[data-pptx-element][aria-label="店铺实施环境调研"]').dblclick();
 const edit = page.locator('[contenteditable="true"]:visible');
 await edit.first().fill('WorkDSH inline edit verified');
 await page.keyboard.press('Escape');
 const afterEdit=await page.evaluate(()=>JSON.stringify(window.viewer.getSlides()));
 await page.evaluate(()=>window.viewer.undo());
 const undo=!(await page.evaluate(()=>JSON.stringify(window.viewer.getSlides()))).includes('WorkDSH inline edit verified');
 await page.evaluate(()=>window.viewer.redo());
 const redo=(await page.evaluate(()=>JSON.stringify(window.viewer.getSlides()))).includes('WorkDSH inline edit verified');
 const saved=await page.evaluate(async()=>Array.from(await window.viewer.save()));
 await writeFile(path.join(out,'ui-edited-copy.pptx'),Buffer.from(saved));
 await page.evaluate(async bytes=>window.viewer.loadFile(new Uint8Array(bytes)),saved);
 const persisted=(await page.evaluate(()=>JSON.stringify(window.viewer.getSlides()))).includes('WorkDSH inline edit verified');
 result={...result,inlineChanged:afterEdit.includes('WorkDSH inline edit verified'),undo,redo,persisted};
 await writeFile(path.join(out,'ui-dom.html'),await page.content());
 result={...result,slideCount:await page.evaluate(()=>window.viewer.getSlideCount()),rendered:true,errors,externalRequests:network.length,requestUrls:network,originalUnchanged:hash(input)===hash(await readFile(fixture)),directEditing:result.persisted?'PASSED':'FAILED',visualFidelity:'PENDING'};
}catch(e){result={...result,failure:e.message,errors,externalRequests:network.length,requestUrls:network};process.exitCode=1;}
finally{await browser.close();}
await writeFile(path.join(out,'ui-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
