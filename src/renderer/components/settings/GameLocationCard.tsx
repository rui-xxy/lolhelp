// 游戏安装位置卡片：自动识别不到客户端时的手动兜底入口（放「关于与游戏目录」页）。
// 选择的路径持久化到应用设置（gameInstallRoot），主进程发现中心会优先用它定位 LCU。

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, LoaderCircle, RotateCw } from 'lucide-react';

export function GameLocationCard() {
  const [manual, setManual] = useState<string | undefined>();
  const [detected, setDetected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.lolHelper.db
      .getSettings()
      .then((settings) => setManual(settings.gameInstallRoot))
      .catch(() => undefined);
    void window.lolHelper.config
      .detectRoots()
      .then((roots) => setDetected(Array.isArray(roots) ? roots : []))
      .catch(() => undefined);
  }, []);

  const choose = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await window.lolHelper.config.selectRoot();
      if (picked) {
        await window.lolHelper.db.updateSettings({ gameInstallRoot: picked });
        setManual(picked);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置失败');
    } finally {
      setBusy(false);
    }
  }, []);

  const resetToAuto = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await window.lolHelper.db.updateSettings({ gameInstallRoot: undefined });
      setManual(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }, []);

  const effective = manual ?? detected[0];

  return (
    <section className="st-section">
      <header className="st-section__head">
        <h3>游戏安装位置</h3>
      </header>
      <div className="st-group">
        <div className="st-row">
          <div className="st-row__label">
            <b>{manual ? '手动指定的目录' : detected[0] ? '自动识别的目录' : '安装位置'}</b>
            <span className="st-path">{effective ?? '还没识别到 —— 启动客户端试试，或手动选择一次（会一直记住）'}</span>
          </div>
          <div className="st-row__control st-row__control--actions">
            <button type="button" className="as-btn as-btn--sm" onClick={() => void choose()} disabled={busy}>
              {busy ? <LoaderCircle className="as-spin" size={14} /> : <FolderOpen size={14} />}
              <span>选择目录</span>
            </button>
            {manual && (
              <button
                type="button"
                className="as-btn as-btn--sm as-btn--ghost"
                onClick={() => void resetToAuto()}
                disabled={busy}
              >
                <RotateCw size={14} />
                <span>恢复自动</span>
              </button>
            )}
          </div>
        </div>
        {error && <div className="st-warn">{error}</div>}
      </div>
    </section>
  );
}
