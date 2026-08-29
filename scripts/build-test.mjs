import { rm } from 'node:fs/promises';
import path from 'node:path';
import { runTsc } from './run-tsc.mjs';

const root = process.cwd();
await rm(path.join(root, 'build-test'), { recursive: true, force: true });
if (!runTsc('tsconfig.test.json')) process.exit(1);
