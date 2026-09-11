import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverPresets, copyComposition, COMPOSITION_FILE } from '@deepseek-ai/dsh-agent-presets';

test('published preset discovery and copying preserve resources without overwriting or escaping roots', async () => {
 const root=await mkdtemp(join(tmpdir(),'workdsh-presets-'));
 try {
  const sourceRoot=join(root,'system'), userRoot=join(root,'user');
  await mkdir(join(sourceRoot,'baseline','skills','sample'),{recursive:true});
  await mkdir(userRoot);
  await writeFile(join(sourceRoot,'baseline',COMPOSITION_FILE),'[]\n');
  await writeFile(join(sourceRoot,'baseline','skills','sample','SKILL.md'),'# Sample\nFixture only.\n');
  const roots=[{path:sourceRoot,trust:'system'},{path:userRoot,trust:'user'}];
  const base=import.meta.url;
  const [baseline]=await discoverPresets(roots,base);
  assert.equal(baseline.id,'baseline');assert.equal(baseline.broken,undefined);
  await copyComposition(roots,baseline,'workdsh-a','WorkDSH A');
  await copyComposition(roots,baseline,'workdsh-b','WorkDSH B');
  let rows=await discoverPresets(roots,base);
  assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id==='workdsh-a').name,'WorkDSH A');
  assert.equal(await readFile(join(userRoot,'workdsh-a','skills','sample','SKILL.md'),'utf8'),'# Sample\nFixture only.\n');
  await assert.rejects(copyComposition(roots,baseline,'workdsh-a'));
  await assert.rejects(copyComposition(roots,baseline,'../escape'));
  await writeFile(join(userRoot,'workdsh-a','skills','sample','SKILL.md'),'Changed A');
  assert.equal(await readFile(join(userRoot,'workdsh-b','skills','sample','SKILL.md'),'utf8'),'# Sample\nFixture only.\n');
  await mkdir(join(userRoot,'broken'));
  await writeFile(join(userRoot,'broken',COMPOSITION_FILE),'not: a-plugin-list\n');
  rows=await discoverPresets(roots,base);
  assert.ok(rows.find(r=>r.id==='broken').broken,'invalid composition remains visible with reason');
 } finally {await rm(root,{recursive:true,force:true})}
});
