import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'privacy.html']) {
  await copyFile(resolve(root, file), resolve(output, file));
}
await build({
  entryPoints: [resolve(root, 'app.js')],
  outfile: resolve(output, 'app.js'),
  bundle: true,
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
});
console.log('Built static ALL-POST preview in dist/.');
