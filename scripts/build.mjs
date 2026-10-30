import { analyticsEndpoint } from './analytics-config.mjs';
const statisticsEndpoint = analyticsEndpoint();
import { ensureSparkle } from './sparkle.mjs';
import { buildAppIcon } from './build-icons.mjs';
import { build } from '../Web/node_modules/esbuild/lib/main.js';
import { mkdir, cp, copyFile, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = path.join(root, 'dist/Build.noindex/Jot.app');
await rm(app, {recursive:true, force:true});
const sparkle = await ensureSparkle();
const contents = path.join(app, 'Contents');
const resources = path.join(contents, 'Resources');
await mkdir(resources, { recursive: true });
await mkdir(path.join(contents, 'MacOS'), { recursive: true });
await mkdir(path.join(contents, 'Frameworks'), { recursive: true });
execFileSync('ditto',[path.join(sparkle,'Sparkle.framework'),path.join(contents,'Frameworks/Sparkle.framework')]);
const bundled = await build({ entryPoints: [path.join(root, 'Web/src/main.ts')], bundle: true, format: 'iife', target: 'safari17', metafile: true, outfile: path.join(resources, 'editor.js') });
// 按实际进入编辑器的包收集许可证，保留开源作者的版权声明。
const packages = new Set();
for (const input of Object.keys(bundled.metafile.inputs)) {
  const parts = input.split('/node_modules/');
  if (parts.length < 2) continue;
  const tail = parts.at(-1).split('/');
  const name = tail[0].startsWith('@') ? tail.slice(0, 2).join('/') : tail[0];
  packages.add(path.resolve(parts.slice(0, -1).join('/node_modules/'), 'node_modules', name));
}
const notices = [];
for (const directory of [...packages].sort()) {
  const info = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const names = (await readdir(directory)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  if (!names.length) throw Error(`缺少依赖许可证：${info.name}`);
  notices.push(`${info.name} ${info.version}\n${(await Promise.all(names.map(name => readFile(path.join(directory, name), 'utf8')))).join('\n')}`);
}
await writeFile(path.join(resources, 'ThirdPartyLicenses.txt'), notices.join('\n\n----------------------------------------\n\n'));
// 版本号来自应用配置，避免设置面板沿用旧的静态文案。
const appVersion = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(root, 'Native/App/Info.plist')], { encoding: 'utf8' }).trim();
await writeFile(path.join(resources, 'index.html'), (await readFile(path.join(root, 'Web/index.html'), 'utf8')).replaceAll('__APP_VERSION__', appVersion));
await copyFile(path.join(root, 'Web/src/style.css'), path.join(resources, 'style.css'));
await copyFile(path.join(root, 'Web/src/appearance.css'), path.join(resources, 'appearance.css'));
// 字体与许可随应用离线打包，使用时不下载资源，也不注册系统字体。
await cp(path.join(root, 'Web/assets'), path.join(resources, 'assets'), { recursive: true });
await copyFile(path.join(root, 'Native/App/Info.plist'), path.join(contents, 'Info.plist'));
if (statisticsEndpoint) execFileSync('plutil', ['-insert', 'JotAnalyticsURL', '-string', statisticsEndpoint, path.join(contents, 'Info.plist')]);
await buildAppIcon(path.join(root, 'Assets/AppIcon/Jot.svg'), path.join(resources, 'JotLightStack.icns'));
const sources = [];
for (const dir of ['Native/Core', 'Native/App']) for (const name of await readdir(path.join(root, dir))) {
  if (name.endsWith('.swift')) sources.push(path.join(root, dir, name));
}
const env = { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' };
const sdk = execFileSync('xcrun', ['--show-sdk-path'], { env, encoding: 'utf8' }).trim();
const architectures = process.env.JOTLET_UNIVERSAL === '1' ? ['arm64','x86_64'] : [process.arch === 'arm64' ? 'arm64' : 'x86_64'];
const binaries=[];
for(const architecture of architectures) {
 const output=path.join(root, '.build', `TotNotes-${architecture}`); binaries.push(output);
 execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', `${architecture}-apple-macos14.0`, '-sdk', sdk,
  '-F', sparkle, '-framework', 'Sparkle', '-Xlinker', '-rpath', '-Xlinker', '@executable_path/../Frameworks',
  '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'Carbon', ...sources, '-o', output], {env,stdio:'inherit'});
}
execFileSync('lipo',['-create',...binaries,'-output',path.join(contents,'MacOS/TotNotes')]);
await copyFile(path.join(sparkle,'LICENSE'),path.join(resources,'Sparkle-LICENSE.txt'));
// 公开发行需要 Developer ID；本机预览保留临时签名，不伪装为已公证发行版。
const identity=process.env.JOTLET_SIGN_IDENTITY || '-';
if(identity !== '-') {
 const framework=path.join(contents,'Frameworks/Sparkle.framework/Versions/B');
 for(const target of ['XPCServices/Downloader.xpc','XPCServices/Installer.xpc','Autoupdate','Updater.app']) {
  execFileSync('codesign',['--force','--sign',identity,'--options','runtime','--timestamp',path.join(framework,target)],{stdio:'inherit'});
 }
 execFileSync('codesign',['--force','--sign',identity,'--options','runtime','--timestamp',path.join(contents,'Frameworks/Sparkle.framework')],{stdio:'inherit'});
}
execFileSync('codesign',['--force','--sign',identity,...(identity==='-'?[]:['--options','runtime','--timestamp']),app],{stdio:'inherit'});
execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
console.log(`已构建：${app}`);
