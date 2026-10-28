import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export const sparkleVersion='2.10.1';
export const sparkleRoot=path.join(root,'.build',`Sparkle-${sparkleVersion}`);
const checksum='1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27';
export async function ensureSparkle() {
 const archive=path.join(root,'.build',`Sparkle-${sparkleVersion}.tar.xz`);
 await mkdir(path.dirname(archive),{recursive:true});
 if(!existsSync(archive)) execFileSync('curl',['--fail','--location','--retry','2','https://github.com/sparkle-project/Sparkle/releases/download/'+sparkleVersion+'/Sparkle-'+sparkleVersion+'.tar.xz','--output',archive],{stdio:'inherit'});
 if(createHash('sha256').update(await readFile(archive)).digest('hex')!==checksum)throw Error('Sparkle 下载校验失败，已停止构建');
 if(!existsSync(path.join(sparkleRoot,'.verified'))) {
  await mkdir(sparkleRoot,{recursive:true});execFileSync('tar',['-xf',archive,'-C',sparkleRoot]);await writeFile(path.join(sparkleRoot,'.verified'),checksum);
 }
 return sparkleRoot;
}
