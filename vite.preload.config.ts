import { defineConfig } from 'vite';

// 入口文件是 src/preload/index.ts，rollup 默认按入口文件名生成 index.js。
// main 进程在 main/index.ts 里用 path.join(__dirname, 'preload.js') 加载 preload，
// 且 main 产物也生成 index.js 会同名覆盖。这里强制 preload 产物名为 preload.js。
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'preload.js',
      },
    },
  },
});
