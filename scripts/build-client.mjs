import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(root, '.build');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const packageId = packageJson.name;

await mkdir(buildDir, { recursive: true });

execFileSync(
  resolve(root, 'node_modules/.bin/tailwindcss'),
  [
    '-c',
    resolve(root, 'tailwind.config.cjs'),
    '-i',
    resolve(root, 'src/styles.css'),
    '-o',
    resolve(buildDir, 'tailwind.css'),
    '--minify',
  ],
  { cwd: root, stdio: 'inherit' },
);

const tailwindCss = await readFile(resolve(buildDir, 'tailwind.css'), 'utf8');

await build({
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  external: ['react', 'react-dom', 'react-dom/client'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  entryPoints: [resolve(root, 'src/client.tsx')],
  outfile: resolve(buildDir, 'client.main.cjs'),
  define: {
    'process.env.NODE_ENV': '"production"',
    __DSHBM_TAILWIND_CSS__: JSON.stringify(tailwindCss),
  },
});

function wrapBundle(code) {
  const header = [
    'window.__ModuleLoader__.load({',
    `  id: ${JSON.stringify(packageId)},`,
    '  factory: (require) => {',
    '    var module = { exports: {} };',
    '    var exports = module.exports;',
  ].join('\n');
  const footer = ['', '    return module.exports;', '  },', '});'].join('\n');
  return `${header}\n${code.trimEnd()}\n${footer}\n`;
}

const main = await readFile(resolve(buildDir, 'client.main.cjs'), 'utf8');
await writeFile(resolve(root, 'client.js'), wrapBundle(main), 'utf8');
console.log('built client.js');
