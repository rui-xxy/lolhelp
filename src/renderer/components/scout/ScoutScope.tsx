import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { GameIcon } from '../match/GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import { ScoutRadar, type ScoutRadarFeed, type ScoutRadarMode } from './ScoutRadar';
import type { ScoutProgress } from '../../../shared/api';

// 高手雷达顶部的「瞄准镜」：左边扫描盘，中间读数，右边实时扫描记录。

export interface ScoutLogEntry {
  key: string;
  state: 'checked' | 'matched';
  name: string;
  iconId?: number;
  iconUrl?: string;
  championName?: string;
  championAvatar?: string;
  kda?: number;
}

type ScopePhase = ScoutProgress['phase'] | 'idle';

const PHASES: Record<ScopePhase, { code: string; text: string }> = {
  idle: { code: 'STANDBY', text: '待命' },
  seeding: { code: 'SEEDING', text: '正在解析种子，建立关系网' },
  scanning: { code: 'SCANNING', text: '沿对局关系向外扩散，逐个筛选候选' },
  done: { code: 'COMPLETE', text: '扫描完成' },
  aborted: { code: 'HALTED', text: '扫描已停止' },
  error: { code: 'FAULT', text: '扫描遇到问题' },
};

const pad2 = (value: number) => String(Math.max(0, value)).padStart(2, '0');

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

// 用时单独成组件，每秒只刷新自己
function Elapsed({ startedAt, finishedAt, running }: { startedAt: number | null; finishedAt: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!startedAt) return <>--:--</>;
  return <>{formatElapsed((running ? now : finishedAt ?? now) - startedAt)}</>;
}

interface ScoutScopeProps {
  feed: ScoutRadarFeed;
  running: boolean;
  phase: ScoutProgress['phase'] | null;
  hitsTotal: number;
  batchHits: number;
  batchTarget: number;
  checked: number;
  queueRemaining: number;
  startedAt: number | null;
  finishedAt: number | null;
  summary: string;
  log: ScoutLogEntry[];
  actions?: ReactNode;
}

export function ScoutScope({
  feed,
  running,
  phase,
  hitsTotal,
  batchHits,
  batchTarget,
  checked,
  queueRemaining,
  startedAt,
  finishedAt,
  summary,
  log,
  actions,
}: ScoutScopeProps) {
  const scopePhase: ScopePhase = running ? (phase === 'seeding' ? 'seeding' : 'scanning') : phase ?? 'idle';
  const radarMode: ScoutRadarMode = running ? 'running' : scopePhase === 'idle' ? 'idle' : 'done';
  const phaseInfo = PHASES[scopePhase];
  const statusText = running
    ? phaseInfo.text
    : scopePhase === 'idle'
      ? '从种子召唤师的对局出发逐层扩散，锁定近期用指定英雄打出高 KDA 的玩家'
      : summary || phaseInfo.text;
  const slots = Math.max(1, Math.min(50, batchTarget));
  const filled = Math.min(slots, batchHits);

  return (
    <section className="scout-scope" data-state={radarMode} data-phase={scopePhase}>
      <ScoutRadar feed={feed} mode={radarMode} className="scout-scope__radar" />

      <div className="scout-scope__hud">
        <div className="scout-scope__status">
          <span className="scout-phase" data-phase={scopePhase}>
            <i aria-hidden="true" />
            {phaseInfo.code}
          </span>
          <span className="scout-scope__status-text" title={statusText}>
            {statusText}
            {running && <i className="scout-caret" aria-hidden="true" />}
          </span>
          {actions && <span className="scout-scope__actions">{actions}</span>}
        </div>

        <div className="scout-scope__readout">
          <div className="scout-scope__count">
            <strong key={hitsTotal} aria-label={`已锁定 ${hitsTotal} 人`}>{pad2(hitsTotal)}</strong>
            <span>
              <b>已锁定</b>
              <em>LOCKED</em>
            </span>
          </div>
          <dl className="scout-scope__stats">
            <div>
              <dt>已扫描<em>SCANNED</em></dt>
              <dd>{checked}</dd>
            </div>
            <div>
              <dt>待扩散<em>QUEUE</em></dt>
              <dd>{queueRemaining}</dd>
            </div>
            <div>
              <dt>用时<em>ELAPSED</em></dt>
              <dd><Elapsed startedAt={startedAt} finishedAt={finishedAt} running={running} /></dd>
            </div>
          </dl>
        </div>

        <div className="scout-scope__slots" aria-label={`本批进度 ${filled}/${slots}`}>
          <span className="scout-scope__slot-track" style={{ '--slots': slots } as CSSProperties}>
            {Array.from({ length: slots }, (_, index) => (
              <i
                key={index}
                className={index < filled ? 'is-filled' : running && index === filled ? 'is-next' : undefined}
              />
            ))}
          </span>
          <small>本批 {filled}/{slots}</small>
        </div>
      </div>

      <div className="scout-scope__log">
        <header>
          <i aria-hidden="true" />
          实时记录
          <em>LIVE</em>
        </header>
        {log.length === 0 ? (
          <p className="scout-scope__log-empty">{running ? '正在接收信号…' : '暂无信号'}</p>
        ) : (
          <ol>
            {log.map((entry) => (
              <li key={entry.key} data-state={entry.state}>
                <i aria-hidden="true" />
                <ProfileIcon iconId={entry.iconId} src={entry.iconUrl} alt={entry.name} size={18} className="scout-scope__log-avatar" />
                <span className="scout-scope__log-name">{entry.name}</span>
                {entry.championAvatar && (
                  <GameIcon src={entry.championAvatar} alt={entry.championName ?? ''} title={entry.championName} size={16} rounded />
                )}
                <b>{typeof entry.kda === 'number' ? entry.kda.toFixed(1) : '--'}</b>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
