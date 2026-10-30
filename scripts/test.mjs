import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundled = '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';
const node = process.env.TOT_NOTES_NODE || (existsSync(bundled) ? bundled : process.execPath);
const env = { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' };
for (const [command, args] of [
  [node, ['Web/node_modules/typescript/bin/tsc', '--noEmit', '--project', 'Web/tsconfig.json']],
  [node, ['Web/node_modules/vitest/vitest.mjs', 'run', '--root', 'Web']],
  [node, ['--test', 'Analytics/worker.test.mjs']],
  ['xcrun', ['swift', 'test']],
  [node, ['scripts/test-native-recovery.mjs']],
]) execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });
console.log('核心自动化检查通过。');
