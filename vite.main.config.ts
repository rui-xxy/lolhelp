import { defineConfig } from 'vite';

// 入口文件是 src/main/index.ts，rollup 默认按入口文件名生成 index.js。
// 但 package.json 的 "main" 指向 .vite/build/main.js，且 preload 也会生成 index.js 造成同名覆盖。
// 这里强制 main 产物名为 main.js，与 package.json 对齐。
// 注意：不能用 build.lib.fileName，否则会覆盖 plugin-vite 注入的 lib.entry 导致入口丢失；
// 改用 rollupOptions.output.entryFileNames（与 preload 同机制，plugin-vite 的 lib 模式也会尊重它）。
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
});
