import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const expected = '0.2.2-rc.5';
// No exceptions: every dsh-scope package published 0.2.2-rc.5 (verified on the
// registry). Retired packages with no 0.2.2-rc.5 release are dropped from the
// override set instead of being pinned.
const exceptions = {};
const entries = [...lock.matchAll(/^  '?(@deepseek-ai\/dsh[^@\s']*)@([^\s:'(]+)(?:[^\n]*):$/gm)];
assert.ok(entries.length > 0, 'DSH lockfile entries must exist');
for (const [, name, version] of entries) {
  const want = exceptions[name] ?? expected;
  assert.equal(version, want, `${name} version mismatch`);
  assert.equal(pkg.pnpm.overrides[name], want, `${name} missing exact override`);
}
const resolved = new Set(entries.map(([, name]) => name));
for (const name of Object.keys(pkg.pnpm.overrides).filter(name => name.startsWith('@deepseek-ai/dsh'))) {
  assert.ok(resolved.has(name), `${name} override has no resolved lock entry (retired or renamed package)`);
}
// Cordis and the companion packages the 0.2.2-rc.5 family ships against must stay
// on the release that dsh 0.2.2-rc.5 was published with. The 0.2.2-rc cycle moved
// these onto the 4.1.0 family (4.1.0, 1.1.0, 1.1.0, 1.1.0, 1.2.0, 3.19.0), so a
// floating range would silently resolve to a set this baseline was never verified
// against.
const companions = {
  cordis: '4.1.0',
  'cordis-plugin-group': '1.1.0',
  'cordis-plugin-include': '1.1.0',
  'cordis-plugin-loader': '1.1.0',
  'cordis-plugin-timer': '1.2.0',
  schemastery: '3.19.0',
};
for (const [name, version] of Object.entries(companions)) {
  const found = [...lock.matchAll(new RegExp(`^  '?@deepseek-ai/${name}@([^\\s:'(]+)(?:[^\\n]*):$`, 'gm'))];
  assert.ok(found.length > 0, `@deepseek-ai/${name} lock entry missing`);
  assert.deepEqual([...new Set(found.map(m => m[1]))], [version], `@deepseek-ai/${name} must resolve to ${version} only`);
  assert.equal(pkg.pnpm.overrides[`@deepseek-ai/${name}`], version, `@deepseek-ai/${name} missing exact override`);
}
console.log(`PASS: ${entries.length} DSH lock entries pinned to ${expected}; Cordis 4.1.0 family only`);