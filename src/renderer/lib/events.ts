// 渲染进程内的跨页面事件名。设置被某一页改动后广播，其他页面据此重新读取。
export const SETTINGS_CHANGED_EVENT = 'lolhelp:settings-changed';

export function broadcastSettingsChanged(source: string): void {
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: { source } }));
}
