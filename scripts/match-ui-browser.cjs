const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.openBrowser = async function openBrowser(url, output) {
  const executable = process.env.MATCH_UI_BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  if (!executable) throw new Error('Set MATCH_UI_BROWSER to an installed Chromium browser executable');
  const profile = fs.mkdtempSync(path.join(output, 'browser-profile-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'];
  if (process.env.MATCH_UI_PROXY) args.unshift(`--proxy-server=${process.env.MATCH_UI_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-4000); });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let retry = 0; retry < 100 && !fs.existsSync(portFile); retry++) { if (child.exitCode !== null) throw new Error(`Browser exited ${child.exitCode}: ${stderr}`); await sleep(100); }
    if (!fs.existsSync(portFile)) throw new Error(`Browser debug endpoint unavailable: ${stderr}`);
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let serial = 0; const pending = new Map(); const consoleErrors = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
      else if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(JSON.stringify(message.params.exceptionDetails));
      else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
    });
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    await page('Page.enable'); await page('Runtime.enable');
    await page('Emulation.setDeviceMetricsOverride', { width: 1180, height: 800, deviceScaleFactor: 1, mobile: false });
    await page('Page.navigate', { url });
    return {
      consoleErrors,
      webContents: { executeJavaScript: async (expression) => {
        const response = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
        return response.result.value;
      }, capturePage: async () => { const image = await page('Page.captureScreenshot', { format: 'png' }); return { toPNG: () => Buffer.from(image.data, 'base64') }; } },
      setContentSize: (width, height) => page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
      close: async () => {
        try { await send('Browser.close'); } catch {} finally { socket.close(); child.kill(); await sleep(150); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
      },
    };
  } catch (error) { socket?.close(); child.kill(); throw error; }
};
