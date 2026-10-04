// Monta a prévia local com esbuild (sem Vite), trocando o banco pelos dados de exemplo
import { build } from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '../..');
const saida = path.join(raiz, 'test/preview/dist');
mkdirSync(saida, { recursive: true });

const trocarBanco = {
  name: 'trocar-banco',
  setup(b) {
    b.onResolve({ filter: /lib\/dados\.js$/ }, () => ({ path: path.join(raiz, 'test/preview/dados.mock.js') }));
    b.onResolve({ filter: /lib\/supabase\.js$/ }, () => ({ path: 'supabase-falso', namespace: 'falso' }));
    b.onLoad({ filter: /.*/, namespace: 'falso' }, () => ({ contents: 'export const configurado = true; export const supabase = null;', loader: 'js' }));
  },
};

await build({
  entryPoints: [path.join(raiz, 'src/main.jsx')],
  bundle: true, outfile: path.join(saida, 'app.js'), format: 'esm', jsx: 'automatic',
  nodePaths: ['/opt/npm-tools/node_modules'], loader: { '.json': 'json' },
  define: { 'process.env.NODE_ENV': '"development"' }, plugins: [trocarBanco], logLevel: 'warning',
});
const html = readFileSync(path.join(raiz, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.jsx"></script>', '<script type="module" src="./app.js"></script>')
  .replace('href="/favicon.svg"', 'href="./favicon.svg"').replace('</head>', '<link rel="stylesheet" href="./app.css" /></head>');
writeFileSync(path.join(saida, 'index.html'), html);
cpSync(path.join(raiz, 'public/favicon.svg'), path.join(saida, 'favicon.svg'));
console.log('prévia montada em', saida);
