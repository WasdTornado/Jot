import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 官网演示复用同仓库编辑器，回归用例需要读取 Web 目录外的模板。
export default defineConfig({
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
});
