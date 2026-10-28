import {mkdir,rm,readFile,writeFile,copyFile} from 'node:fs/promises';
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
html=html.replaceAll('../assets/','assets/').replaceAll('../app.js','app.js').replaceAll('assets/jot.png','assets/jot.svg').replaceAll('../download.html','download.html').replaceAll('../install.css','install.css');
html=html.replace('<title>Jot — 让念头落脚，让自己轻一点</title>','<title>Jot 随记 — 轻量 macOS 菜单栏便签与待办</title>');
html=html.replace(/<meta name="description"[^>]*>/,'<meta name="description" content="Jot 随记是一款轻量 macOS 菜单栏便签应用。七页彩色便签、Markdown 快捷输入、待办清单、本机自动保存与应用内更新。">');
html=html.replace('</head>',`<link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:title" content="Jot 随记 — 让念头落脚"><meta property="og:description" content="七页彩色便签，本机保存，随手记下待办和灵感。"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${canonical}assets/jot.svg"><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication',name:'Jot',operatingSystem:'macOS 14+',applicationCategory:'ProductivityApplication',url:canonical,description:'轻量菜单栏便签与待办，七页独立保存，支持 Markdown 快捷输入。'})}</script></head>`);
html=html.replace('<a href="../compare.html">设计方案对比 ↗</a>','<a href="https://github.com/WasdTornado/Jot">GitHub · 源码与版本 ↗</a>');
await writeFile(output+'/index.html',html);
await copyFile(path.join(root,'Website/install.css'),output+'/install.css');
const downloadPage=(await readFile(path.join(root,'Website/download.html'),'utf8')).replaceAll('explore/explore.css','explore.css').replaceAll('explore/orbit.css','orbit.css').replaceAll('explore/orbit.html','index.html');
await writeFile(output+'/download.html',downloadPage);
for(const file of ['explore.css','orbit.css','orbit.js'])await copyFile(path.join(root,'Website/explore',file),path.join(output,file));
await copyFile(path.join(root,'Website/app.js'),output+'/app.js');
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
