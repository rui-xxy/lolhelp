import { useCallback, useEffect, useState } from 'react';
import { FileText, FolderOpen, FolderSearch, RefreshCw } from 'lucide-react';
import type { AppStatus, LcuConnection, LolConfigState } from '../../../shared/api';

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function AboutSettings({
  state,
  busy,
  onDetect,
  onChoose,
  onReload,
}: {
  state: LolConfigState | null;
  busy: string | null;
  onDetect: () => void;
  onChoose: () => void;
  onReload: () => void;
}) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [connection, setConnection] = useState<LcuConnection | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const [appStatus, lcu] = await Promise.all([
        window.lolHelper.app.getStatus(),
        window.lolHelper.lcu.detectClient(),
      ]);
      setStatus(appStatus);
      setConnection(lcu);
    } catch (error) {
      setConnection({ found: false, connected: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const rows: Array<[string, string]> = status ? [
    ['助手', `${status.appName} ${status.appVersion}`],
    ['Electron', status.electronVersion],
    ['Chromium', status.chromeVersion],
    ['Node', status.nodeVersion],
    ['系统', `${status.platform} · ${status.arch}`],
  ] : [];

  return (
    <div className="st-sections">
      <section className="st-section">
        <header className="st-section__head">
          <h3>英雄联盟客户端</h3>
        </header>
        <div className="st-group">
          <div className="st-row">
            <div className="st-row__label st-row__label--status">
              <i data-on={connection?.connected ? 'true' : undefined} />
              <div>
                <b>
                  {connection?.connected
                    ? `已连接${connection.summonerName ? ` · ${connection.summonerName}` : ''}`
                    : connection?.found ? '找到了客户端，但连不上' : '没有检测到客户端'}
                </b>
                {connection?.error && <span>{connection.error}</span>}
              </div>
            </div>
            <div className="st-row__control">
              <button type="button" className="as-btn as-btn--sm" disabled={checking} onClick={() => void check()}>
                <RefreshCw className={checking ? 'as-spin' : undefined} />
                重新检测
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="st-section">
        <header className="st-section__head">
          <h3>游戏目录</h3>
        </header>
        <div className="st-group">
          <div className="st-row" data-wide="true">
            <div className="st-row__label st-row__label--status">
              <i data-on={state?.found ? 'true' : undefined} data-tone={state && !state.found ? 'bad' : undefined} />
              <div>
                <b className="st-path">{state?.rootPath || '还没有目录'}</b>
                <span>{state?.found ? '已找到配置文件' : '未找到配置文件'}</span>
              </div>
            </div>
            <div className="st-row__control st-row__control--actions">
              <button type="button" className="as-btn as-btn--sm" disabled={Boolean(busy)} onClick={onDetect}>
                <FolderSearch />
                自动查找
              </button>
              <button type="button" className="as-btn as-btn--sm" disabled={Boolean(busy)} onClick={onChoose}>
                <FolderOpen />
                选择文件夹
              </button>
              <button type="button" className="as-btn as-btn--sm as-btn--ghost" disabled={Boolean(busy)} onClick={onReload}>
                <RefreshCw className={busy === 'read' ? 'as-spin' : undefined} />
                重新读取
              </button>
            </div>
          </div>
          {(state?.files ?? []).map((file) => (
            <div key={file.key} className="st-file">
              <FileText />
              <div>
                <b>{file.label}</b>
                <span title={file.path}>{file.path}</span>
              </div>
              <em data-missing={file.exists ? undefined : 'true'}>
                {file.exists ? `${formatSize(file.size)} · ${formatTime(file.updatedAt)}` : '缺失'}
              </em>
            </div>
          ))}
        </div>
        {state?.warnings.length ? (
          <div className="st-warn">
            {state.warnings.slice(0, 3).map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
      </section>

      <section className="st-section">
        <header className="st-section__head">
          <h3>版本</h3>
        </header>
        <div className="st-group">
          {rows.length === 0 ? (
            <div className="st-row"><div className="st-row__label"><span>读取中…</span></div></div>
          ) : rows.map(([label, value]) => (
            <div key={label} className="st-row st-row--compact">
              <div className="st-row__label"><b>{label}</b></div>
              <div className="st-row__control"><span className="st-readonly st-num">{value}</span></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
