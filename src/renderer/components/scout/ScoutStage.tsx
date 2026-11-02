import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ScoutLanterns, type LanternMode } from './ScoutLanterns';
import type { ScoutFeed } from './scoutFeed';
import type { ScoutHit } from '../../../shared/api';

// 雷达页的舞台：后面是灯海，左边是那句话，右上是寻到几位，右下是正在翻看的名字。
// 没开始时整块铺满页面（hero），开始以后收成顶部一条（band），结果从下面长出来。

const pad2 = (value: number) => String(Math.max(0, value)).padStart(2, '0');

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
}

function Elapsed({ startedAt, finishedAt, running }: { startedAt: number | null; finishedAt: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!startedAt) return null;
  return <>{formatElapsed((running ? now : finishedAt ?? now) - startedAt)}</>;
}

// 正在翻看的人：名字飞快地换，不经过 React；找到时停在金色的名字上
function Ticker({ feed, running, seeding, seedName }: { feed: ScoutFeed; running: boolean; seeding: boolean; seedName: string }) {
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let pending = '';
    let holdUntil = 0;
    let timer = 0;
    const flush = () => {
      timer = 0;
      if (!pending || performance.now() < holdUntil) return;
      if (nameRef.current) nameRef.current.textContent = pending;
      if (boxRef.current) boxRef.current.dataset.state = 'look';
    };
    return feed.subscribe((events) => {
      if (!events) {
        pending = '';
        if (nameRef.current) nameRef.current.textContent = '';
        return;
      }
      for (const event of events) {
        const name = event.profile?.riotId;
        if (!name) continue;
        if (event.state === 'matched') {
          holdUntil = performance.now() + 1800;
          if (nameRef.current) nameRef.current.textContent = name;
          if (boxRef.current) boxRef.current.dataset.state = 'found';
          pending = '';
          window.setTimeout(flush, 1850);
        } else if (event.state === 'checked') {
          pending = name;
        }
      }
      if (!timer) timer = window.setTimeout(flush, 90);
    });
  }, [feed]);

  if (!running) return null;
  return (
    <span ref={boxRef} className="sx-ticker" data-state="look" aria-hidden="true">
      <i />
      <span ref={nameRef}>{seeding ? seedName : ''}</span>
    </span>
  );
}

function useDepth(feed: ScoutFeed): number {
  const [depth, setDepth] = useState(0);
  const maxRef = useRef(0);
  useEffect(() => {
    maxRef.current = 0;
    setDepth(0);
    return feed.subscribe((events) => {
      if (!events) {
        maxRef.current = 0;
        setDepth(0);
        return;
      }
      let max = maxRef.current;
      for (const event of events) {
        if ((event.state === 'checked' || event.state === 'matched') && event.depth > max) max = event.depth;
      }
      if (max > maxRef.current) {
        maxRef.current = max;
        setDepth(max);
      }
    });
  }, [feed]);
  return depth;
}

interface ScoutStageProps {
  feed: ScoutFeed;
  layout: 'hero' | 'band';
  mode: LanternMode;
  running: boolean;
  seeding: boolean;
  seedName: string;
  hits: ScoutHit[];
  found: number;
  goal: number;
  batchFound: number;
  batchGoal: number;
  checked: number;
  startedAt: number | null;
  finishedAt: number | null;
  status?: ReactNode;
  statusTone?: 'error' | 'quiet';
  summary?: string;
  activeKey?: string | null;
  glowKey?: string | null;
  onPick: (hit: ScoutHit) => void;
  onHover: (key: string | null) => void;
  query: ReactNode;
  actions: ReactNode;
}

export function ScoutStage({
  feed,
  layout,
  mode,
  running,
  seeding,
  seedName,
  hits,
  found,
  goal,
  batchFound,
  batchGoal,
  checked,
  startedAt,
  finishedAt,
  status,
  statusTone,
  summary,
  activeKey,
  glowKey,
  onPick,
  onHover,
  query,
  actions,
}: ScoutStageProps) {
  const depth = useDepth(feed);
  const queryRef = useRef<HTMLDivElement | null>(null);
  const slots = Math.max(1, Math.min(50, batchGoal));
  const lit = Math.min(slots, batchFound);
  const showMeter = layout === 'band';

  return (
    <section className="sx-stage" data-layout={layout} data-mode={mode}>
      <ScoutLanterns
        feed={feed}
        mode={mode}
        hits={hits}
        showPins={layout === 'band'}
        clearRef={queryRef}
        activeKey={activeKey}
        glowKey={glowKey}
        onPick={onPick}
        onHover={onHover}
        className="sx-stage__field"
      />

      <div ref={queryRef} className="sx-stage__query">
        {query}
        <div className="sx-stage__foot">
          {actions}
          {status ? (
            <span className="sx-status" data-tone={statusTone}>{status}</span>
          ) : startedAt && (running || checked > 0) ? (
            <span className="sx-stats">
              <span>看过 <b>{checked.toLocaleString('zh-CN')}</b> 人</span>
              {depth > 0 && <span>隔 <b>{depth}</b> 层</span>}
              <span><b><Elapsed startedAt={startedAt} finishedAt={finishedAt} running={running} /></b></span>
            </span>
          ) : null}
        </div>
      </div>

      {showMeter && (
        <div className="sx-meter" aria-label={`寻到 ${found} 位，目标 ${goal} 位`}>
          <div className="sx-meter__count">
            <strong key={found}>{pad2(found)}</strong>
            <span>/ {goal}</span>
          </div>
          <span className="sx-meter__slots" style={{ '--cols': Math.min(slots, 25) } as CSSProperties} aria-hidden="true">
            {Array.from({ length: slots }, (_, index) => (
              <i key={index} data-on={index < lit ? 'true' : undefined} data-next={running && index === lit ? 'true' : undefined} />
            ))}
          </span>
        </div>
      )}

      {showMeter && <Ticker feed={feed} running={running} seeding={seeding} seedName={seedName} />}
      {showMeter && !running && summary && <span className="sx-ticker" data-state="done">{summary}</span>}
    </section>
  );
}
