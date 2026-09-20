import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const output = path.resolve('.ui-review');
await fs.mkdir(output, { recursive: true });
const fixture = path.resolve('scripts/fixtures/matchAnalytics.fixture.tsx').replaceAll('\\', '/');
const server = await createServer({
  configFile: path.resolve('vite.renderer.config.mts'),
  cacheDir: path.resolve('.ui-review/node_modules/.vite'),
  optimizeDeps: { entries: [fixture] },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{ name: 'match-ui-review-page', configureServer(vite) {
    vite.middlewares.use('/__match-ui__', async (_request, response) => {
      const html = await vite.transformIndexHtml('/__match-ui__', `<html lang="zh-CN"><head><meta charset="UTF-8"><title>Match analytics UI fixture</title></head><body><div id="root"></div><script type="module" src="/@fs/${fixture}"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
let child;
try {
  await server.listen();
  const address = server.httpServer.address();
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key];

  child = spawn(process.execPath, [path.resolve('scripts/match-ui-smoke.cjs'), `http://127.0.0.1:${address.port}/__match-ui__`, output], { env, stdio: 'inherit' });
  const timeout = setTimeout(() => child.kill(), 85000);
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code) => resolve(code ?? 1)); });
  clearTimeout(timeout);
  console.log(`UI smoke process exit: ${exit}`);
  process.exitCode = exit;
} finally {
  await server.close();
}
