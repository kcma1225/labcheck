import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = await mkdtemp(join(tmpdir(), 'workspace-tests-'));
try {
  const outfile = join(dir, 'regressions.mjs');
  await build({ entryPoints: ['tests/regressions.ts'], outfile, bundle: true, platform: 'node', format: 'esm' });
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', outfile, 'tests/adapters.ts', 'tests/theme.mjs', 'tests/markdown-edit.ts', 'tests/home.mjs'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
