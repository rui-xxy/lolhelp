import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, RotateCcw, X } from 'lucide-react';
import { GameIcon } from '../match/GameIcon';
import { getHistoryDayKey } from '../match/MatchActivityNavigator';
import { HistoryDayHead, buildHistoryDayRecords } from '../match/HistoryDayHead';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { ScoutFriendButton } from './ScoutFriendButton';
import { getRankMain, getRankSub } from './ScoutHitCard';
import {
  dropMatchBriefs,
  formatDuration,
  formatPlayedAt,
  loadMatchBriefs,
  peekMatchBriefs,
  summarizeMatchBriefs,
} from './matchBriefs';
import type { PlayerMatchBriefMate, PlayerMatchBriefResult, ScoutHit } from '../../../shared/api';

// 高手雷达 → 点卡片弹出的战绩速览。
// 列表沿用战绩页左侧列表的样式（按天分组的时间轴 + 当天微光），但只请求一页「大概战绩」，
// 行本身不可点；只有点名字才会打开完整战绩页。

interface ScoutMatchPeekProps {
  hit: ScoutHit;
  index: number;
  region: string;
  onClose: () => void;
  onOpenHistory: (riotId: string, region?: string) => void;
}

function splitRiotId(riotId: string): [string, string] {
  const at = riotId.lastIndexOf('#');
  if (at <= 0) return [riotId, ''];
  return [riotId.slice(0, at), riotId.slice(at)];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// 简化版的战绩页聚焦效果：视口上部所在的那一天亮起来，越靠近还能继续滚动的边缘越淡。
function paintFocus(container: HTMLElement) {
  const entries = Array.from(container.querySelectorAll<HTMLElement>('.match-history-entry'));
  if (entries.length === 0) return;
  const box = container.getBoundingClientRect();
  // 在最顶上时聚焦线贴近顶部（最新的一天亮着），往下滚再移到 30% 的位置
  const focusY = box.top + Math.min(box.height * 0.3, 150, 24 + container.scrollTop);
  let focusDay = entries[0].dataset.historyDayKey ?? '';
  let nearest = Number.POSITIVE_INFINITY;
  const rects = entries.map((entry) => entry.getBoundingClientRect());
  rects.forEach((rect, index) => {
    const distance = focusY < rect.top ? rect.top - focusY : focusY > rect.bottom ? focusY - rect.bottom : 0;
    if (distance < nearest) {
      nearest = distance;
      focusDay = entries[index].dataset.historyDayKey ?? '';
    }
  });

  const fadeZone = Math.max(48, Math.min(110, box.height * 0.22));
  const topFade = clamp01(container.scrollTop / fadeZone);
  const bottomFade = clamp01((container.scrollHeight - container.clientHeight - container.scrollTop) / fadeZone);
  const center = box.top + box.height / 2;

  entries.forEach((entry, index) => {
    const rect = rects[index];
    const mid = rect.top + rect.height / 2;
    const topEdge = 1 - topFade * (1 - clamp01((mid - box.top) / fadeZone));
    const bottomEdge = 1 - bottomFade * (1 - clamp01((box.bottom - mid) / fadeZone));
    const edge = Math.min(topEdge, bottomEdge);
    const eased = edge * edge * (3 - 2 * edge);
    const centerRatio = Math.max(0, 1 - Math.abs(mid - center) / Math.max(1, box.height * 0.46));
    const focus = entry.dataset.historyDayKey === focusDay ? 1 : 0.16;
    const set = (name: string, value: string) => entry.style.setProperty(name, value);
    set('--history-row-opacity', ((0.46 + eased * 0.54) * (0.7 + focus * 0.3)).toFixed(3));
    set('--history-row-brightness', (0.79 + eased * 0.08 + centerRatio * 0.015 + focus * 0.185).toFixed(3));
    set('--history-row-saturation', (0.68 + eased * 0.1 + focus * 0.24).toFixed(3));
    set('--history-row-ambient', `${(0.35 + centerRatio * 0.55 + focus * 5.8).toFixed(2)}%`);
    set('--history-day-focus', focus.toFixed(3));
    set('--history-day-glow-percent', `${(1.1 + focus * 7.9).toFixed(2)}%`);
    set('--history-day-glow-opacity', (0.05 + focus * 0.95).toFixed(3));
    set('--history-day-shadow-percent', `${(focus * 4.4).toFixed(2)}%`);
    set('--history-day-rail-percent', `${(6 + focus * 44).toFixed(2)}%`);
    set('--history-day-rail-shadow-percent', `${(focus * 19).toFixed(2)}%`);
    set('--history-day-node-percent', `${(18 + focus * 66).toFixed(2)}%`);
    set('--history-day-stamp-opacity', (0.42 + focus * 0.58).toFixed(3));
  });
}

function PeekSkeleton() {
  return (
    <div className="scout-peek__skeleton" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} style={{ '--i': index } as CSSProperties}>
          <i />
          <b />
          <em />
        </span>
      ))}
    </div>
  );
}

function PeekBody({
  puuid,
  region,
}: {
  puuid: string;
  region: string;
}) {
  const [result, setResult] = useState<PlayerMatchBriefResult | null>(() => peekMatchBriefs(puuid, region));
  const [attempt, setAttempt] = useState(0);
  // 打开时缓存里已经有结果（悬停预取过）就不再请求；重试靠 attempt 触发
  const hadCacheRef = useRef(result !== null && !result.error);
  const listRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (attempt === 0 && hadCacheRef.current) return;
    let cancelled = false;
    void loadMatchBriefs(puuid, region).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [puuid, region, attempt]);

  const matches = result?.matches ?? [];
  const summary = useMemo(() => summarizeMatchBriefs(matches), [matches]);
  const dayRecords = useMemo(() => buildHistoryDayRecords(matches), [matches]);
  const dayGroups = useMemo(() => {
    const groups: Array<{ dayKey: string; indexes: number[] }> = [];
    matches.forEach((match, index) => {
      const dayKey = getHistoryDayKey(match.gameCreation);
      const last = groups[groups.length - 1];
      if (last && last.dayKey === dayKey) last.indexes.push(index);
      else groups.push({ dayKey, indexes: [index] });
    });
    return groups;
  }, [matches]);
  const mates = useMemo(() => {
    const map = new Map<string, PlayerMatchBriefMate>();
    for (const mate of result?.mates ?? []) map.set(mate.puuid, mate);
    return map;
  }, [result]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || matches.length === 0) return;
    paintFocus(list);
    const observer = new ResizeObserver(() => paintFocus(list));
    observer.observe(list);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [matches]);

  const handleScroll = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (listRef.current) paintFocus(listRef.current);
    });
  };

  const retry = () => {
    dropMatchBriefs(puuid, region);
    setResult(null);
    setAttempt((value) => value + 1);
  };

  const loading = result === null;
  const form = matches;

  return (
    <>
      <section className="scout-peek__summary" data-loading={loading ? 'true' : undefined}>
        <div className="scout-peek__rate">
          <strong>{loading || summary.games === 0 ? '--' : summary.winRate}<small>%</small></strong>
          <span>
            <b>近 {loading ? '--' : summary.games} 场胜率</b>
            <em>{loading ? '读取中…' : `${summary.wins} 胜 ${summary.losses} 负`}</em>
          </span>
        </div>
        <dl className="scout-peek__kda">
          <dt>KDA</dt>
          <dd>{loading || summary.games === 0 ? '--' : summary.kda.toFixed(1)}</dd>
        </dl>
        <div className="scout-peek__form" aria-label="胜负走势（左新右旧）">
          {loading
            ? Array.from({ length: 20 }, (_, index) => <i key={index} />)
            : form.map((match, index) => (
                <i
                  key={match.gameId}
                  data-result={match.win ? 'win' : 'loss'}
                  style={{ '--i': index } as CSSProperties}
                  title={`${match.championName} · ${match.win ? '胜' : '负'} · ${match.kills}/${match.deaths}/${match.assists}`}
                />
              ))}
        </div>
        {summary.topChampions.length > 0 && (
          <div className="scout-peek__champs">
            <span>常用</span>
            {summary.topChampions.map((champion) => (
              <span
                key={champion.championId}
                className="scout-peek__champ"
                title={`${champion.championName} · ${champion.games} 场 ${champion.wins} 胜`}
              >
                <GameIcon src={champion.championAvatar} alt={champion.championName} size={22} rounded />
                <b>{champion.games}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="scout-peek__list match-history-focus-viewport scrollbar-none"
      >
        {loading ? (
          <PeekSkeleton />
        ) : result?.error ? (
          <div className="scout-peek__state">
            <p>{result.error}</p>
            <button type="button" onClick={retry}>
              <RotateCcw className="size-3.5" />
              重试
            </button>
          </div>
        ) : matches.length === 0 ? (
          <div className="scout-peek__state">
            <p>最近没有对局记录</p>
          </div>
        ) : (
          <div className="match-history-stream">
            {dayGroups.map((group) => (
              <section key={group.dayKey} className="match-history-day">
              <HistoryDayHead dayKey={group.dayKey} record={dayRecords.get(group.dayKey)} />
              {group.indexes.map((index) => {
              const match = matches[index];
              const dayKey = getHistoryDayKey(match.gameCreation);
              const startsDay = index === 0 || getHistoryDayKey(matches[index - 1].gameCreation) !== dayKey;
              const endsDay = index === matches.length - 1 || getHistoryDayKey(matches[index + 1].gameCreation) !== dayKey;
              const rowMates = match.mates.map((id) => mates.get(id)).filter((mate): mate is PlayerMatchBriefMate => Boolean(mate));
              return (
                <div
                  key={match.gameId}
                  data-history-day-key={dayKey}
                  data-result={match.win ? 'win' : 'loss'}
                  style={match.championSplashUrl ? ({ '--match-splash': `url("${match.championSplashUrl}")` } as CSSProperties) : undefined}
                  className={`match-history-entry ${startsDay ? 'match-history-entry--day-start' : ''} ${endsDay ? 'match-history-entry--day-end' : ''}`}
                >
                  <div className="match-history-gutter" aria-hidden="true">
                    <span className="match-history-gutter__node" />
                  </div>
                  <div
                    className={`match-result-card ${match.win ? 'match-result-card--win' : 'match-result-card--loss'} scout-peek__row`}
                    title={`${match.queueName} · ${match.win ? '胜利' : '失败'} · ${match.championName} · ${match.kills}/${match.deaths}/${match.assists} · KDA ${match.kda.toFixed(1)} · ${formatDuration(match.gameDuration)}`}
                  >
                    <GameIcon
                      src={match.championAvatar}
                      alt={match.championName}
                      size={30}
                      rounded
                      className={`match-result-avatar ${match.win ? 'match-result-avatar--win' : 'match-result-avatar--loss'}`}
                    />
                    <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="match-result-mode">{match.queueName}</span>
                          <span className="match-result-badge">
                            <i aria-hidden="true" />
                            <span>{match.win ? '胜' : '负'}</span>
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 tabular-nums">
                          <span className="match-result-kda">
                            {match.kills}/{match.deaths}/{match.assists}
                          </span>
                        </div>
                      </div>
                      {rowMates.length > 0 && (
                        <div className="match-result-mates ml-1 flex shrink-0 items-center">
                          {rowMates.slice(0, 2).map((mate) => (
                            <span key={mate.puuid} className="match-result-mate-item" title={`常一起玩：${mate.riotId} · 一起 ${mate.count} 场`}>
                              <ProfileIcon
                                iconId={mate.profileIconId}
                                src={mate.profileIconUrl}
                                alt={mate.riotId}
                                title=""
                                size={20}
                                className="match-result-mate-avatar size-5 rounded-full object-cover"
                              />
                            </span>
                          ))}
                          {rowMates.length > 2 && <span className="match-result-mate-more">+{rowMates.length - 2}</span>}
                        </div>
                      )}
                    </div>
                    <div className="match-result-meta">
                      <div className="match-result-time">
                        <div className="match-result-time-value">{formatPlayedAt(match.gameCreation)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function ScoutMatchPeek({ hit, index, region, onClose, onOpenHistory }: ScoutMatchPeekProps) {
  const { profile } = hit;
  const riotId = profile.riotId || '未知玩家';
  const [gameName, tagLine] = splitRiotId(riotId);
  const rank = profile.rank;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="scout-peek" aria-label={`${riotId} 的战绩速览`}>
      <header className="scout-peek__head">
        <div className="scout-peek__kicker">
          <span>战绩速览</span>
          <em>{String(index + 1).padStart(2, '0')}</em>
          <button type="button" className="scout-peek__close" onClick={onClose} aria-label="关闭速览" title="关闭（Esc）">
            <X className="size-4" />
          </button>
        </div>
        <div className="scout-peek__who" key={profile.puuid}>
          <span className="scout-peek__avatar">
            <ProfileIcon iconId={profile.profileIconId} src={profile.profileIconUrl} alt={riotId} size={46} />
          </span>
          <div className="scout-peek__ident">
            <button
              type="button"
              className="scout-peek__id"
              onClick={() => profile.riotId && onOpenHistory(profile.riotId, region)}
              disabled={!profile.riotId}
              title="打开完整战绩"
            >
              <strong>{gameName}</strong>
              {tagLine && <em>{tagLine}</em>}
              <ArrowUpRight className="scout-peek__id-icon" aria-hidden="true" />
            </button>
            <span className="scout-peek__rank">
              {rank ? <RankEmblem rank={rank} size={22} variant="mini" /> : null}
              <span>{rank ? `${getRankMain(rank)} · ${getRankSub(rank)}` : '未定级'}</span>
              <i aria-hidden="true" />
              <span>指定英雄 {hit.totalChampionGames} 场</span>
            </span>
          </div>
          <ScoutFriendButton riotId={profile.riotId} variant="pill" />
        </div>
      </header>
      <div className="scout-peek__body" key={`${region}|${profile.puuid}`}>
        <PeekBody puuid={profile.puuid} region={region} />
      </div>
    </aside>
  );
}
