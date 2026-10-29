import {build} from '../Web/node_modules/esbuild/lib/main.js';
import {cp,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(root,'dist/taste-site');
await mkdir(output,{recursive:true});
// 对比稿独立构建，不覆盖现有官网发布目录。
await cp(path.join(root,'Website/taste'),output,{recursive:true,filter:src=>!src.endsWith('.ts')});
await build({entryPoints:[path.join(root,'Website/taste/demo.ts')],outfile:path.join(output,'demo.js'),bundle:true,minify:true,format:'iife',target:['safari17']});
console.log(output);
