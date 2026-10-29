import {mkdir,rm,readFile,writeFile,copyFile,cp,readdir} from 'node:fs/promises';
import {build} from '../Web/node_modules/esbuild/lib/main.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(root,'dist/site');
await rm(output,{recursive:true,force:true});await mkdir(output+'/assets',{recursive:true});
const canonical='https://wasdtornado.github.io/Jot/';
const version=execFileSync('plutil',['-extract','CFBundleShortVersionString','raw','-o','-',path.join(root,'Native/App/Info.plist')],{encoding:'utf8'}).trim();
const previewName=`Jot-${version}-preview.dmg`;
let html=await readFile(path.join(root,'Website/explore/orbit.html'),'utf8');
html=html.replaceAll('../assets/','assets/').replaceAll('../site.js','site.js').replaceAll('../demo/','demo/').replaceAll('assets/jot.png','assets/jot.svg').replaceAll('../download.html','download.html').replaceAll('../install.css','install.css').replaceAll('../themes.css','themes.css').replaceAll('../themes.js','themes.js').replaceAll('../window-motion.html','window-motion.html');
html=html.replace('<title>Jot — 让念头落脚，让自己轻一点</title>','<title>Jot 随记 — 轻量 macOS 菜单栏便签与待办</title>');
html=html.replace(/<meta name="description"[^>]*>/,'<meta name="description" content="Jot 随记是一款轻量 macOS 菜单栏便签应用。七页彩色便签、八种主题、离线中文手写字体、Markdown 待办、本机自动保存与应用内更新。">');
html=html.replace('</head>',`<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:title" content="Jot 随记 — 让念头落脚"><meta property="og:description" content="七页彩色便签，本机保存，随手记下待办和灵感。"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${canonical}assets/jot.svg"><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication',name:'Jot',operatingSystem:'macOS 14+',applicationCategory:'ProductivityApplication',url:canonical,description:'轻量菜单栏便签与待办，七页独立保存，支持 Markdown 快捷输入。'})}</script></head>`);
html=html.replace('<a href="../compare.html">设计方案对比 ↗</a>','<a href="https://github.com/WasdTornado/Jot">GitHub · 源码与版本 ↗</a>');
await writeFile(output+'/index.html',html);
await copyFile(path.join(root,'Website/install.css'),output+'/install.css');
await cp(path.join(root,'Website/assets/install'),output+'/assets/install',{recursive:true});
for(const file of ['themes.css','themes.js','window-motion.html','window-motion.css','window-motion.js']) await copyFile(path.join(root,'Website',file),path.join(output,file));
for(const file of ['theme-font.woff2','theme-font-OFL.txt','theme-cat.svg','theme-leaf.svg']) await copyFile(path.join(root,'Website/assets',file),path.join(output,'assets',file));
const downloadPage=(await readFile(path.join(root,'Website/download.html'),'utf8')).replaceAll('explore/explore.css','explore.css').replaceAll('explore/orbit.css','orbit.css').replaceAll('explore/orbit.html','index.html');
await writeFile(output+'/download.html',downloadPage);
for(const file of ['explore.css','orbit.css','orbit.js'])await copyFile(path.join(root,'Website/explore',file),path.join(output,file));
await copyFile(path.join(root,'Website/site.js'),output+'/site.js');
// 官网直接构建当前应用界面，只有原生桥替换为独立的内存演示。
const demo=path.join(output,'demo');
await mkdir(demo,{recursive:true});
const bundled=await build({entryPoints:[path.join(root,'Website/demo.ts')],bundle:true,format:'iife',target:'safari17',metafile:true,outfile:path.join(demo,'demo.js')});
const appHTML=(await readFile(path.join(root,'Web/index.html'),'utf8')).replaceAll('__APP_VERSION__',version)
 .replace('src="editor.js"','src="demo.js"').replace('</head>','<link rel="stylesheet" href="demo.css"></head>');
await writeFile(path.join(demo,'index.html'),appHTML);
// 动效稿的工具图标直接取自应用，保持尺寸之外的路径也完全一致。
let motionHTML=await readFile(path.join(root,'Website/window-motion.html'),'utf8');
let actions=appHTML.match(/<div class="footer-actions">([\s\S]*?)<\/div>/)[1];
for(const [from,to] of [['skins-button','motion-skins'],['format-button','motion-format'],['help-button','motion-help'],['notes-button','more']]) actions=actions.replace(`id="${from}"`,`id="${to}"`);
actions=actions.replaceAll('<button ','<button disabled ').replace(/ aria-(expanded|controls)="[^"]*"/g,'');
for(const id of ['i-keyboard','i-more']) {
 const symbol=appHTML.match(new RegExp(`<symbol id="${id}"[^>]*>([\\s\\S]*?)</symbol>`))[1];
 actions=actions.replace(`<use href="#${id}"/>`,symbol);
}
actions=actions.replace(/<svg(?![^>]*viewBox)/g,'<svg viewBox="0 0 24 24"');
motionHTML=motionHTML.replace(/<!-- APP_FOOTER_START -->[\s\S]*?<!-- APP_FOOTER_END -->/,`<div class="footer-actions">${actions}</div>`);
await writeFile(path.join(output,'window-motion.html'),motionHTML);

for(const file of ['style.css','appearance.css']) await copyFile(path.join(root,'Web/src',file),path.join(demo,file));
await copyFile(path.join(root,'Website/demo.css'),path.join(demo,'demo.css'));
await cp(path.join(root,'Web/assets'),path.join(demo,'assets'),{recursive:true});
const packages=new Set();
for(const input of Object.keys(bundled.metafile.inputs)) {
 const parts=input.split('/node_modules/');if(parts.length<2)continue;
 const tail=parts.at(-1).split('/');const name=tail[0].startsWith('@')?tail.slice(0,2).join('/'):tail[0];
 packages.add(path.resolve(parts.slice(0,-1).join('/node_modules/'),'node_modules',name));
}
const notices=[];
for(const directory of [...packages].sort()) {
 const info=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
 const licenses=(await readdir(directory)).filter(name=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
 if(!licenses.length)throw Error(`缺少依赖许可证：${info.name}`);
 notices.push(`${info.name} ${info.version}\n${(await Promise.all(licenses.map(file=>readFile(path.join(directory,file),'utf8')))).join('\n')}`);
}
await writeFile(path.join(demo,'ThirdPartyLicenses.txt'),notices.join('\n\n'));
await copyFile(path.join(root,'Website/assets/jot.svg'),output+'/assets/jot.svg');
await copyFile(path.join(root,'Website/appcast.xml'),output+'/appcast.xml');
await writeFile(output+'/.nojekyll','');
await writeFile(output+'/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${canonical}sitemap.xml\n`);
await writeFile(output+'/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${canonical}</loc></url><url><loc>${canonical}download.html</loc></url></urlset>`);
// 下载包仅进入网站构建产物，不混入源码；缺少本地产物时保留线上下载地址。
await mkdir(output+'/downloads',{recursive:true});
for(const file of [previewName,'SHA256SUMS.txt']) {
 try { await copyFile(path.join(root,`dist/release-${version}`,file),path.join(output,'downloads',file)); }
 catch(error) { if(error.code!=='ENOENT') throw error; }
}
console.log(output);
