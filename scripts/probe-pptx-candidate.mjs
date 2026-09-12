// Browser engine probe; native editor UI is a separate acceptance gate.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const out = path.resolve('.artifacts/pptx-candidate');
const fixture = process.argv[2];
if (!fixture) throw new Error('Pass a read-only PPTX fixture path');
await mkdir(out, { recursive: true });
const original = await readFile(fixture);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = `import { PptxHandler } from 'pptx-viewer-core';
window.probe = async bytes => {
 const handler = new PptxHandler();
 const data = await handler.load(new Uint8Array(bytes).buffer);
 const counts = slides => slides.reduce((r,s) => { for(const e of s.elements) r[e.type]=(r[e.type]||0)+1; return r; }, {});
 const target = data.slides[0].elements.find(e => typeof e.text === 'string' && e.text.length);
 if(!target) throw new Error('No editable text');
 const old = target.text;
 target.text = 'WorkDSH browser roundtrip verified';
 target.textSegments = undefined;
 const output = await handler.save(data.slides);
 const reopened = await new PptxHandler().load(output.buffer.slice(output.byteOffset, output.byteOffset+output.byteLength));
 return {slidesBefore:data.slides.length,slidesAfter:reopened.slides.length,countsBefore:counts(data.slides),countsAfter:counts(reopened.slides),editPersisted:reopened.slides[0].elements.some(e=>e.text===target.text),warnings:handler.getCompatibilityWarnings(),output:Array.from(output),originalTitle:old};
};`;
const bundle = await build({stdin:{contents:source,resolveDir:out},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'});
const browser = await chromium.launch({headless:true});
let result;
try {
 const page = await browser.newPage(); const errors=[],network=[];
 page.on('pageerror', e=>errors.push(e.message));
 await page.route('**/*',r=>{network.push(r.request().url());return r.abort();});
 await page.setContent('<html><body>Browser PPTX engine probe</body></html>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const data = await page.evaluate(bytes=>window.probe(bytes),Array.from(original));
 await writeFile(path.join(out,'edited-copy.pptx'),Buffer.from(data.output));delete data.output;delete data.originalTitle;
 result={version:'3.14.3',...data,errors,externalRequests:network.length,originalUnchanged:hash(original)===hash(await readFile(fixture)),nativeUI:'NOT TESTED',visualFidelity:'NOT TESTED'};
} catch(e) { result={version:'3.14.3',failure:e.message};process.exitCode=1; }
finally {await browser.close();}
await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(!result.editPersisted||!result.originalUnchanged)process.exitCode=1;
