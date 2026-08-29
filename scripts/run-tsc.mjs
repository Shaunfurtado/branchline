import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function runTsc(config = 'tsconfig.json') {
  const root = process.cwd();
  const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const result = spawnSync(process.execPath, [tscBin, '-p', config], { stdio: 'inherit', cwd: root });
  return result.status === 0;
}
