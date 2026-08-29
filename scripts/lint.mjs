import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['src', 'scripts', 'e2e'];
const failures = [];
const placeholderPattern = new RegExp(`\b${['TO', 'DO'].join('')}\b|\b${['FIX', 'ME'].join('')}\b|lorem ipsum`, 'i');

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.(ts|mjs|py|css|html)$/.test(file)) {
      if (path.normalize(file) === path.normalize(path.join('scripts', 'lint.mjs'))) continue;
      const text = await readFile(file, 'utf8');
      if (placeholderPattern.test(text)) failures.push(`${file}: unfinished placeholder`);
      if (/[ \t]+$/m.test(text)) failures.push(`${file}: trailing whitespace`);
      if (/dangerouslySetInnerHTML/.test(text)) failures.push(`${file}: disallowed unsafe HTML API`);
      for (const [index, line] of text.split('\n').entries()) {
        if (/\.innerHTML\s*=/.test(line) && !line.includes('safe-html:')) {
          failures.push(`${file}:${index + 1}: review unsafe HTML assignment`);
        }
      }
    }
  }
}
for (const root of roots) await walk(root);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Custom lint checks passed.');
