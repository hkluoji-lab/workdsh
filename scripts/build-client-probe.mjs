import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
const clientResult = await build({
  entryPoints: [fileURLToPath(new URL('../packages/bundle/src/client/index.ts', import.meta.url))], bundle: true, write: false,
  format: 'cjs', platform: 'browser', target: 'es2022', external: ['react'],
});
// Compile owned feature modules into one artifact; the official loader owns runtime loading.
writeFileSync(new URL('../packages/bundle/dist/client.js', import.meta.url),
  `window.__ModuleLoader__.load({id: "workdsh-bundle", factory: function(require) {
const module = { exports: {} };
${clientResult.outputFiles[0].text}
return module.exports;
}});
`);

// The distributable bundle composes the skills Host source at build time. The
// separately versioned feature package remains the source owner without adding
// a private workspace dependency to the installable tarball.
const hostResult = await build({
  entryPoints: [fileURLToPath(new URL('../packages/bundle/src/probe.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-skill', 'yaml'],
});
writeFileSync(new URL('../packages/bundle/dist/probe.js', import.meta.url), hostResult.outputFiles[0].text);
