// Bundelt de extensie naar dist/ met esbuild.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const shared = { bundle: true, format: 'iife', target: 'firefox109', sourcemap: true };
await build({ ...shared, entryPoints: ['extension/background/background.js'], outfile: 'dist/background/background.js' });
await build({ ...shared, entryPoints: ['extension/content/content.js'], outfile: 'dist/content/content.js' });
await build({ ...shared, entryPoints: ['extension/options/options.js'], outfile: 'dist/options/options.js' });
await cp('extension/manifest.json', 'dist/manifest.json');
await cp('extension/options/options.html', 'dist/options/options.html');
await cp('extension/icons', 'dist/icons', { recursive: true });
await cp('extension/_locales', 'dist/_locales', { recursive: true });
console.log('Build OK → dist/');
