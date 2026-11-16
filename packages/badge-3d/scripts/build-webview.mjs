// Baut die WebView-Seite als eine einzige HTML-Datei (three.js eingebettet, offline) und legt sie
// als TypeScript-Modul in die App: apps/app/src/web3d/medal-html.generated.ts
// Aufruf: pnpm --filter @best-badges/badge-3d build:webview
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const res = await build({
  entryPoints: [new URL('../webview/entry.ts', import.meta.url).pathname],
  bundle: true, minify: true, format: 'iife', target: 'safari16', write: false, legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}canvas{display:block;width:100vmin;height:100vmin;margin:0 auto;touch-action:none}</style>
</head><body><canvas id="c"></canvas><script>${js}</script></body></html>`;
const out = new URL('../../../apps/app/src/web3d/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('medal-html.generated.ts', out),
  `// GENERIERT von packages/badge-3d/scripts/build-webview.mjs – nicht von Hand bearbeiten.\nexport const MEDAL_HTML = ${JSON.stringify(html)};\n`);
console.log(`WebView-Seite geschrieben (${(html.length / 1024).toFixed(0)} KB).`);
