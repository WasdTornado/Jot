import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 构建专用依赖单独锁定，不进入网页编辑器或应用运行资源。
const require = createRequire(new URL('../Assets/AppIcon/package.json', import.meta.url));
const { Resvg } = require('@resvg/resvg-js');

/** 保留 SVG 的渐变、透明边缘和投影，使网站与系统图标来自同一原稿。 */
export async function renderAppIcon(source, destination, pixels = 1024) {
  const renderer = new Resvg(await readFile(source), {fitTo:{mode:'width',value:pixels}});
  await writeFile(destination, renderer.render().asPng());
}

/** 从正式矢量原稿生成 macOS 全尺寸图标。 */
export async function buildAppIcon(source, destination) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'jotlet-icon-'));
  const iconset = path.join(temporary, 'Jot.iconset');
  try {
    await mkdir(iconset);
    for (const size of [16,32,128,256,512]) {
      for (const scale of [1,2]) {
        const pixels = size * scale;
        const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
        await renderAppIcon(source, path.join(iconset,name), pixels);
      }
    }
    execFileSync('iconutil', ['-c','icns',iconset,'-o',destination], {stdio:'inherit'});
  } finally { await rm(temporary, {recursive:true,force:true}); }
}
