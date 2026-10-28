import {ensureSparkle} from './sparkle.mjs';
import {readdirSync,mkdtempSync,rmSync,mkdirSync,cpSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const temp = mkdtempSync(path.join(tmpdir(),'jotlet-recovery-'));
const env = {...process.env, DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer',TOT_NOTES_DATA_DIR:path.join(temp,'notes')};
try {
 const sparkle=await ensureSparkle();
 const sources = ['Native/Core','Native/App'].flatMap(dir=>readdirSync(dir).filter(file=>file.endsWith('.swift')&&file!=='main.swift').map(file=>path.join(dir,file)));
 const app=path.join(temp,'RecoveryCheck.app'), executable=path.join(app,'Contents/MacOS/RecoveryCheck');
 mkdirSync(path.dirname(executable),{recursive:true});mkdirSync(path.join(app,'Contents/Resources'),{recursive:true});
 cpSync('Web/index.html',path.join(app,'Contents/Resources/index.html'));
 execFileSync('xcrun',['swiftc','-F',sparkle,'-framework','Sparkle','-Xlinker','-rpath','-Xlinker',sparkle,...sources,'Tests/AppHarness/main.swift','-o',executable],{env,stdio:'inherit'});
 execFileSync(executable,[],{env,stdio:'inherit'});
} finally {rmSync(temp,{recursive:true,force:true});}
