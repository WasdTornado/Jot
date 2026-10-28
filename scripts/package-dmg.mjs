import {ensureSparkle} from './sparkle.mjs';
import {mkdir,rm,writeFile,copyFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const preview=process.argv.includes('--preview');
if(!preview && !process.env.JOTLET_SIGN_IDENTITY?.startsWith('Developer ID Application:'))throw Error('正式发行必须配置 Developer ID Application；本机预览请显式传入 --preview');
if(!preview && !process.env.JOTLET_NOTARY_PROFILE)throw Error('正式发行必须配置 JOTLET_NOTARY_PROFILE');
const version=execFileSync('plutil',['-extract','CFBundleShortVersionString','raw','-o','-','Native/App/Info.plist'],{encoding:'utf8'}).trim();
const tag=`v${version}${preview?'-preview':''}`;
// 打包前核对实际构建产物，避免把旧版本或单架构应用标为通用安装包。
const builtVersion=execFileSync('plutil',['-extract','CFBundleShortVersionString','raw','-o','-','dist/Jot.app/Contents/Info.plist'],{encoding:'utf8'}).trim();
if(builtVersion!==version)throw Error('安装包版本与源码不一致，请先重新构建');
const architectures=execFileSync('lipo',['-archs','dist/Jot.app/Contents/MacOS/TotNotes'],{encoding:'utf8'}).trim().split(/\s+/);
if(!['arm64','x86_64'].every(arch=>architectures.includes(arch)))throw Error('请先使用 JOTLET_UNIVERSAL=1 node scripts/build.mjs 构建双架构应用');
execFileSync('codesign',['--verify','--deep','--strict','dist/Jot.app'],{stdio:'inherit'});

const output=path.join(root,'dist',`release-${version}`), staging=path.join(root,'.build/dmg-staging');
await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});await mkdir(output,{recursive:true});
execFileSync('ditto',['dist/Jot.app',path.join(staging,'Jot.app')]);
execFileSync('ln',['-s','/Applications',path.join(staging,'Applications')]);
await writeFile(path.join(staging,'安装说明.txt'),`Jot ${version}\n\n将 Jot.app 拖入 Applications。需要 macOS 14 或更新系统，支持 Apple 芯片和 Intel。\n\n${preview?'这是未完成 Apple Developer ID 公证的预览版，macOS 可能阻止首次打开。请勿用于大规模正式分发。':'此版本已完成 Developer ID 签名和 Apple 公证。'}\n便签仅保存在本机。更新前请正常退出旧版；应用内“检查更新”会验证下载签名。\n`);
if(!preview) {
 const zip=path.join(root,'.build/notarize.zip');execFileSync('ditto',['-c','-k','--keepParent','dist/Jot.app',zip]);
 execFileSync('xcrun',['notarytool','submit',zip,'--keychain-profile',process.env.JOTLET_NOTARY_PROFILE,'--wait'],{stdio:'inherit'});
 execFileSync('xcrun',['stapler','staple',path.join(staging,'Jot.app')],{stdio:'inherit'});
}
const name=`Jot-${version}${preview?'-preview':''}.dmg`, dmg=path.join(output,name);
execFileSync('hdiutil',['create','-volname','Jot','-srcfolder',staging,'-ov','-format','UDZO',dmg],{stdio:'inherit'});
if(!preview) {
 execFileSync('codesign',['--sign',process.env.JOTLET_SIGN_IDENTITY,'--timestamp',dmg],{stdio:'inherit'});
 execFileSync('xcrun',['notarytool','submit',dmg,'--keychain-profile',process.env.JOTLET_NOTARY_PROFILE,'--wait'],{stdio:'inherit'});
 execFileSync('xcrun',['stapler','staple',dmg],{stdio:'inherit'});
}
const releaseNotes=await readFile(path.join(root,'Website/releases',`${version}.html`),'utf8');
await writeFile(path.join(output,name.replace('.dmg','.html')),releaseNotes);
// 先生成独立可下载的安装包；预览构建无需访问发布者的私钥。
await writeFile(path.join(output,'SHA256SUMS.txt'),`${createHash('sha256').update(await readFile(dmg)).digest('hex')}  ${name}\n`);
if(!preview || process.argv.includes('--sign-updates')) {
const sparkle=await ensureSparkle();
execFileSync(path.join(sparkle,'bin/generate_appcast'),['--account','jotlet-updates','--download-url-prefix',(process.env.JOTLET_UPDATE_DOWNLOAD_URL || `https://github.com/WasdTornado/Jot/releases/download/${tag}/`),'--embed-release-notes',output],{stdio:'inherit'});
await copyFile(path.join(output,'appcast.xml'),'Website/appcast.xml');
}
console.log(dmg);
