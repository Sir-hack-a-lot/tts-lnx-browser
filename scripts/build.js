// Bundelt de extensie naar dist/ met esbuild.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const shared = { bundle: true, format: 'iife', target: 'firefox109', sourcemap: true };
await build({ ...shared, entryPoints: ['extension/background/background.js'], outfile: 'dist/background/background.js' });
await build({ ...shared, entryPoints: ['extension/content/content.js'], outfile: 'dist/content/content.js' });
await build({ ...shared, entryPoints: ['extension/options/options.js'], outfile: 'dist/options/options.js' });
// De viewer is een module-pagina (pdf.js is ESM); de worker kopiëren we los.
await build({
  bundle: true, format: 'esm', target: 'firefox109', sourcemap: true,
  entryPoints: ['extension/viewer/viewer.js'], outfile: 'dist/viewer/viewer.js',
});
await cp('extension/viewer/viewer.html', 'dist/viewer/viewer.html');
await cp('extension/viewer/viewer.css', 'dist/viewer/viewer.css');
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'dist/viewer/pdf.worker.min.mjs');
await cp('extension/manifest.json', 'dist/manifest.json');
await cp('extension/options/options.html', 'dist/options/options.html');
await cp('extension/icons', 'dist/icons', { recursive: true });
await cp('extension/_locales', 'dist/_locales', { recursive: true });
console.log('Build OK → dist/');
