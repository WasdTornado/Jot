import { lstat, mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--qa' || !/^[a-z0-9][a-z0-9-]*$/.test(args[1]))) {
  throw Error('用法：node scripts/launch.mjs [--qa 验收名称]，名称仅使用小写字母、数字和连字符');
}
const running = spawnSync('pgrep', ['-x', 'TotNotes'], { encoding: 'utf8' });
if (running.status === 0) throw Error('请先从随记菜单正常退出，保存完便签后再更新；不会强制结束进程。');
if (running.status !== 1) throw Error('无法确认随记是否仍在运行，已停止更新。');

const installed = path.join(homedir(), 'Applications/Jot.app');
// 旧安装使用相同应用标识，首次更名时沿用它，避免留下重复入口。
const legacy = path.join(homedir(), 'Applications/TotNotes.app');
if (!(await lstat(installed).catch(error => { if (error.code !== 'ENOENT') throw error; }))) {
  const old = await lstat(legacy).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (old) {
    if (old.isSymbolicLink() || !old.isDirectory()) throw Error('旧应用路径不是普通目录，已停止迁移。');
    const oldIdentifier = execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(legacy, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
    if (oldIdentifier !== 'local.totnotes.core') throw Error('旧应用位置属于其他应用，已停止迁移。');
    await rename(legacy, installed);
  }
}
const existing = await lstat(installed).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (existing) {
  if (existing.isSymbolicLink() || !existing.isDirectory()) throw Error('应用目标路径不是普通目录，已停止更新。');
  const identifier = execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(installed, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  if (identifier !== 'local.totnotes.core') throw Error('目标位置已有其他应用，已停止更新。');
}

await import('./build.mjs');
await mkdir(path.dirname(installed), { recursive: true });
// 从用户应用目录运行，避免 WKWebView 读取桌面工程资源时触发系统文件夹授权。
// 完整替换应用包，避免覆盖复制遗留框架文件破坏签名；用户数据位于独立目录。
const staging = await mkdtemp(path.join(path.dirname(installed), '.jot-install-'));
try {
  const stagedApp = path.join(staging, 'Jot.app');
  execFileSync('ditto', [path.join(root, 'dist/Build.noindex/Jot.app'), stagedApp]);
  execFileSync('codesign', ['--verify', '--deep', '--strict', stagedApp], { stdio: 'inherit' });
  await rm(installed, { recursive: true, force: true });
  await rename(stagedApp, installed);
} finally { await rm(staging, { recursive: true, force: true }); }
const env = { ...process.env };
delete env.TOT_NOTES_DATA_DIR;
const openArgs = [];
if (args.length) {
  const data = path.join(homedir(), 'Library/Application Support/TotNotesQA', args[1], 'notes');
  await mkdir(data, { recursive: true });
  openArgs.push('--env', `TOT_NOTES_DATA_DIR=${data}`);
  console.log(`独立验收数据：${data}`);
}
execFileSync('open', [...openArgs, installed], { env, cwd: homedir(), stdio: 'inherit' });
console.log(`已启动：${installed}`);
