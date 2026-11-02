import { cp, mkdir } from 'node:fs/promises';

// Only browser assets belong on Pages; never publish tooling or Worker files.
await mkdir('dist', { recursive: true });
for (const entry of ['index.html', 'hubData.json', 'css', 'js', 'assets']) {
  await cp(entry, `dist/${entry}`, { recursive: true });
}
console.log('Built GitHub Pages assets in dist/');
