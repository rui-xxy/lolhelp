import './styles/index.css';

const root = document.getElementById('app');

// 最小页面：标题 + 说明 + 按钮 + 状态展示区
root.innerHTML = `
  <div class="container">
    <h1>LOL 助手</h1>
    <p class="hint">第 2 阶段 · IPC 三层结构打通验证</p>
    <button id="btn-status">获取应用状态</button>
    <pre id="status-output">点击按钮，通过 IPC 向主进程请求应用状态…</pre>
  </div>
`;

const btn = document.getElementById('btn-status') as HTMLButtonElement;
const output = document.getElementById('status-output') as HTMLPreElement;

btn.addEventListener('click', async () => {
  btn.disabled = true;
  output.textContent = '请求中…';
  try {
    // window.lolHelper 由 preload 暴露 → 内部 ipcRenderer.invoke → 主进程 handler
    const status = await window.lolHelper.app.getStatus();
    output.textContent = JSON.stringify(status, null, 2);
  } catch (err) {
    output.textContent = `请求失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    btn.disabled = false;
  }
});
