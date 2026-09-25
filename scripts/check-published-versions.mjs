import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const expected = '0.1.7-alpha.2';
const entries = [...lock.matchAll(/^  '?(@deepseek-ai\/dsh[^@\s']*)@([^\s:'(]+)(?:[^\n]*):$/gm)];
assert.ok(entries.length > 0, 'DSH lockfile entries must exist');
for (const [, name, version] of entries) {
  assert.equal(version, expected, `${name} version mismatch`);
  assert.equal(pkg.pnpm.overrides[name], expected, `${name} missing exact override`);
}
const resolved = new Set(entries.map(([, name]) => name));
for (const name of Object.keys(pkg.pnpm.overrides).filter(name => name.startsWith('@deepseek-ai/dsh'))) {
  assert.ok(resolved.has(name), `${name} override has no resolved lock entry (retired or renamed package)`);
}
// Cordis and the companion packages the 0.1.7-alpha.2 family ships against must stay
// on the release that dsh 0.1.7-alpha.2 was published with. The official packages
// declare them as tilde ranges (~4.0.4, ~1.0.5, ~1.0.9, ~1.1.6), so a floating range
// would silently resolve to a set this baseline was never verified against.
const companions = {
  cordis: '4.0.4',
  'cordis-plugin-group': '1.0.4',
  'cordis-plugin-include': '1.0.9',
  'cordis-plugin-loader': '1.0.5',
  'cordis-plugin-timer': '1.1.6',
  schemastery: '3.18.4',
};
for (const [name, version] of Object.entries(companions)) {
  const found = [...lock.matchAll(new RegExp(`^  '?@deepseek-ai/${name}@([^\\s:'(]+)(?:[^\\n]*):$`, 'gm'))];
  assert.ok(found.length > 0, `@deepseek-ai/${name} lock entry missing`);
  assert.deepEqual([...new Set(found.map(m => m[1]))], [version], `@deepseek-ai/${name} must resolve to ${version} only`);
  assert.equal(pkg.pnpm.overrides[`@deepseek-ai/${name}`], version, `@deepseek-ai/${name} missing exact override`);
}
console.log(`PASS: ${entries.length} DSH lock entries pinned to ${expected}; Cordis 4.0.4 only`);
