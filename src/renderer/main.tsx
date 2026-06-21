import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FriendPanel } from './components/FriendPanel';
import './styles/index.css';

// React 入口：把 <App /> 挂到 index.html 的 <div id="app">。
// StrictMode 开发期双调组件帮助发现副作用问题，生产构建自动移除。
const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('找不到 #app 挂载点，检查 index.html');
}

const isFriendPanelWindow = new URLSearchParams(window.location.search).get('panel') === 'friends';

createRoot(rootElement).render(
  <StrictMode>
    {isFriendPanelWindow ? (
      <div className="h-screen border-l border-app-border bg-app-surface">
        <FriendPanel onFriendClick={(riotId) => window.lolHelper.window.searchFriend(riotId)} />
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
);
