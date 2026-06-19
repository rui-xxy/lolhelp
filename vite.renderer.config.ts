import { defineConfig } from 'vite';
import path from 'node:path';

// index.html 已移到 src/renderer/，需显式把 renderer 的 root 指过去
// （plugin-vite 默认 root=项目根，会找不到 index.html）
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
});
