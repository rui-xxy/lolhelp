import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// index.html 已移到 src/renderer/，需显式把 renderer 的 root 指过去
// （plugin-vite 默认 root=项目根，会找不到 index.html）
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  // react()：让 Vite 识别/编译 .tsx（React 19 JSX 自动运行时）
  // tailwindcss()：v4 官方 Vite 插件，自动处理 @import "tailwindcss" 与 class 名扫描
  plugins: [react(), tailwindcss()],
  // shadcn 组件源码用 @/ 别名 import（@/lib/utils、@/components/ui/*）。
  // @ 指向 src/renderer（因为 root 是 src/renderer）。
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
});
