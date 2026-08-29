import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runTsc } from './run-tsc.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
if (!runTsc('tsconfig.json')) process.exit(1);
await cp(path.join(root, 'public'), dist, { recursive: true });
await mkdir(path.join(dist, 'styles'), { recursive: true });
await cp(path.join(root, 'src', 'styles'), path.join(dist, 'styles'), { recursive: true });
const html = await readFile(path.join(root, 'index.html'), 'utf8');
await writeFile(path.join(dist, 'index.html'), html.replace('/src/main.ts', '/src/main.js'));
await writeFile(path.join(dist, '404.html'), html.replace('/src/main.ts', '/src/main.js'));
console.log('Built BRANCHLINE into dist/.');
