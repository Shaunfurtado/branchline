import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const required = [
  'dist/index.html',
  'dist/404.html',
  'dist/src/main.js',
  'dist/src/webmcp/registry.js',
  'dist/src/webmcp/definitions.js',
  'dist/styles/global.css',
  'dist/favicon.svg',
  'dist/og-card.svg',
  'dist/_headers',
];

const failures = [];
for (const file of required) {
  try { await access(path.join(root, file)); }
  catch { failures.push(`Missing ${file}`); }
}

async function walk(dir) {
  const entries = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) entries.push(...await walk(full));
    else entries.push(full);
  }
  return entries;
}

const files = await walk(path.join(root, 'dist'));
let bytes = 0;
let jsBytes = 0;
for (const file of files) {
  const size = (await stat(file)).size;
  bytes += size;
  if (file.endsWith('.js')) jsBytes += size;
  if (/webmcp_mock|__branchlineNativeTools/.test(await readFile(file, 'utf8').catch(() => ''))) {
    failures.push(`Test-only WebMCP harness leaked into ${path.relative(root, file)}`);
  }
}
const registry = await readFile(path.join(root, 'dist/src/webmcp/registry.js'), 'utf8').catch(() => '');
if (!registry.includes('document.modelContext.registerTool')) failures.push('Native registerTool call missing from production registry.');
const html = await readFile(path.join(root, 'dist/index.html'), 'utf8').catch(() => '');
if (html.includes('/src/main.ts')) failures.push('Production HTML still references TypeScript entrypoint.');
if (!html.includes('/src/main.js')) failures.push('Production HTML does not reference compiled JavaScript.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Production build verified: ${files.length} files, ${(bytes / 1024).toFixed(1)} KiB total, ${(jsBytes / 1024).toFixed(1)} KiB JavaScript.`);
