import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AssistOverlayApp } from './components/assist/AssistOverlayApp';
import type { AssistOverlayName } from '../shared/api';
import './styles/index.css';

// React 入口：把 <App /> 挂到 index.html 的 <div id="app">。
// StrictMode 开发期双调组件帮助发现副作用问题，生产构建自动移除。
const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('找不到 #app 挂载点，检查 index.html');
}

const overlay = new URLSearchParams(window.location.search).get('overlay') as AssistOverlayName | null;
const overlayNames: AssistOverlayName[] = ['helper', 'match', 'spells'];
const safeOverlay = overlay && overlayNames.includes(overlay) ? overlay : null;

createRoot(rootElement).render(
  <StrictMode>
    {safeOverlay ? <AssistOverlayApp name={safeOverlay} /> : <App />}
  </StrictMode>,
);
