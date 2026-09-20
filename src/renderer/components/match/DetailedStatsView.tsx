import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, ChevronDown, Crown, Focus, Search, Sparkles, Swords, Trophy, X } from 'lucide-react';
import type { MatchParticipantSummary } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { MatchRoster } from './MatchRoster';
import { MatchPerformanceSummary } from './MatchPerformanceSummary';
import { metricBar, metricHasBar, participantLabel, shortParticipantLabel, type StatsDisplayValue, type StatsGroup, type StatsMetric } from './matchStatsModel';

interface DetailedStatsViewProps {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  groups: StatsGroup[];
  readValue: (metric: StatsMetric, player: MatchParticipantSummary) => StatsDisplayValue;
  formatValue: (metric: StatsMetric, value: StatsDisplayValue) => string;
  formatDelta: (metric: StatsMetric, value: number) => string;
  groupIcon: (title: string) => ReactNode;
}

const CATEGORY_LABELS: Record<string, string> = {
  '承受与资源': '承伤与资源',
  '伤害、治疗与控制': '伤害与辅助',
  '地图资源与推进': '地图与推进',
  '信号与对局状态': '信号与状态',
  '更多原始统计': '其他统计',
};

const COMBAT_ICONS = { kda: Swords, largestKillingSpree: Crown, largestMultiKill: Sparkles, timeCCingOthers: Focus, firstBlood: Trophy };

export function DetailedStatsView({ participants, targetPuuid, groups, readValue, formatValue, formatDelta, groupIcon }: DetailedStatsViewProps) {
  const [focusPuuid, setFocusPuuid] = useState(targetPuuid);
  const [comparePuuid, setComparePuuid] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('战斗');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const focus = participants.find((player) => player.puuid === focusPuuid) ?? participants[0];
  const compare = participants.find((player) => player.puuid === comparePuuid);
  const visibleGroups = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return category === '全部' ? groups : groups.filter((group) => group.title === category);
    return groups.map((group) => ({ ...group, metrics: group.metrics.filter((metric) => `${metric.label} ${metric.rawKey ?? metric.key}`.toLocaleLowerCase().includes(search)) })).filter((group) => group.metrics.length > 0);
  }, [groups, query, category]);

  useEffect(() => {
    setFocusPuuid(targetPuuid);
    setComparePuuid(null);
    setPicking(false);
    setExpandedKey(null);
  }, [targetPuuid]);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [category, query]);

  if (!focus) return <div className="md-stats__empty">暂无可用的详细统计数据</div>;

  return (
    <div className={`md-stats match-analytics${compare ? ' is-comparing' : ''}`}  onKeyDown={(event) => { if (event.key === 'Escape') setPicking(false); }}>
      <header className="md-stats__header">
        <div className="md-stats__toolbar">
          <div className="md-stats__identity">
            <GameIcon src={focus.championAvatar} alt="" size={52} rounded />
            <div><strong title={participantLabel(focus)}>{participantLabel(focus)}</strong><small>{picking ? '在下方选择一位玩家进行对比' : `${focus.teamId === 100 ? '蓝方' : focus.teamId === 200 ? '红方' : '当前玩家'} · 对局表现`}</small></div>
          </div>
          <button type="button" className={`md-control${picking || compare ? ' is-active' : ''}`} aria-pressed={picking || Boolean(compare)} onClick={() => setPicking((value) => !value)}>
            <ArrowLeftRight aria-hidden="true" />{picking ? '取消选择' : compare ? '更换对比' : '对比玩家'}
          </button>
          {compare && <div className="md-stats__comparison"><GameIcon src={compare.championAvatar} alt="" size={24} rounded /><span title={participantLabel(compare)}>{shortParticipantLabel(compare)}</span><button type="button" aria-label="退出双人对比" onClick={() => { setComparePuuid(null); setPicking(false); }}><X /></button></div>}
          <label className="md-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索指标" aria-label="搜索统计指标" />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X /></button>}</label>
        </div>
        <MatchRoster showcase participants={participants} selectedPuuids={[focus.puuid]} comparePuuid={compare?.puuid} label={picking ? '选择对比玩家' : '切换观察玩家'} onPick={(player) => {
          if (picking && player.puuid !== focus.puuid) setComparePuuid(player.puuid);
          else if (!picking) { setFocusPuuid(player.puuid); if (player.puuid === comparePuuid) setComparePuuid(null); }
          setPicking(false);
          setExpandedKey(null);
        }} />
      </header>
      <div className="md-stats__workspace">
        <nav className="md-stats__categories" aria-label="统计分类">
          {['全部', ...groups.map((group) => group.title)].map((title) => (
            <button key={title} type="button" className={!query && category === title ? 'is-active' : ''} aria-pressed={!query && category === title} title={title} onClick={() => { setCategory(title); setQuery(''); setExpandedKey(null); }}>
              {groupIcon(title)}<span>{CATEGORY_LABELS[title] ?? title}</span>
            </button>
          ))}
        </nav>
        <div className="md-stats__content" ref={contentRef}>
          <div className="md-stats__overview-heading"><div><span>MATCH PERFORMANCE</span><h2>对局表现</h2></div><p>核心数据总览 · 全场表现对比</p></div>
          <MatchPerformanceSummary participants={participants} focus={focus} compare={compare} onCompare={() => setPicking(true)} />
          {visibleGroups.map((group) => (
            <section className="md-stats__section" key={group.title}>
              <div className="md-stats__section-heading"><h3>{CATEGORY_LABELS[group.title] ?? group.title}</h3><span>{group.metrics.length} 项指标</span></div>
              <div className="md-stats__column-head">
                <span className="md-stats__metric-heading">指标</span>
                <span className="md-player-heading"><GameIcon src={focus.championAvatar} alt="" size={24} rounded /><span><b title={participantLabel(focus)}>{shortParticipantLabel(focus)}</b><small>当前</small></span></span>
                {!compare && <span className="md-stat__rank-heading" title="按数值从高到低排列，相同数值并列；不代表表现优劣">数值排序</span>}
                {compare ? <><span className="md-player-heading is-compare"><GameIcon src={compare.championAvatar} alt="" size={24} rounded /><span><b title={participantLabel(compare)}>{shortParticipantLabel(compare)}</b><small>对比</small></span></span><span className="md-stats__delta-heading" title="当前玩家数值减去对比玩家数值">差值</span></> : <span title="以零为起点，与全场最大绝对值比较；包含负值时以中线为零点">全场数值参照</span>}
                <span />
              </div>
              {group.metrics.map((metric) => {
                const rows = participants.map((player) => { const value = readValue(metric, player); return { player, value, numeric: metricHasBar(metric, value) ? value : null }; });
                const values = rows.flatMap((row) => row.numeric === null ? [] : [row.numeric]);
                const current = rows.find((row) => row.player.puuid === focus.puuid) ?? rows[0];
                const other = compare ? rows.find((row) => row.player.puuid === compare.puuid) : undefined;
                const expanded = expandedKey === metric.key;
                const comparable = current.numeric !== null;
                const rank = current.numeric === null ? null : values.filter((value) => value > (current.numeric as number)).length + 1;
                const Emblem = COMBAT_ICONS[metric.key as keyof typeof COMBAT_ICONS];
                const delta = other && current.numeric !== null && other.numeric !== null ? formatDelta(metric, current.numeric - other.numeric) : null;
                const sorted = comparable ? [...rows].sort((a, b) => (b.numeric ?? -Infinity) - (a.numeric ?? -Infinity)) : rows;
                const renderBar = (value: number | null, isCompare = false) => {
                  const bar = metricBar(value, values);
                  return <span className={`md-meter${isCompare ? ' is-compare' : ''}${bar.signed ? ' is-signed' : ''}`} aria-hidden="true"><i style={{ left: `${bar.left}%`, width: `${bar.width}%` }} /></span>;
                };
                return (
                  <article className={`md-stat${expanded ? ' is-expanded' : ''}`} key={metric.key}>
                    <button type="button" className="md-stat__row" aria-expanded={expanded} aria-label={`${metric.label}，当前 ${formatValue(metric, current.value)}${other ? `，对比 ${formatValue(metric, other.value)}，差值 ${delta ?? '不适用'}` : ''}，${expanded ? '收起' : '展开'}全场对比`} onClick={() => setExpandedKey(expanded ? null : metric.key)}>
                      <span className="md-stat__label" title={metric.description ?? metric.label}><span className="md-stat__emblem" aria-hidden="true">{Emblem ? <Emblem /> : groupIcon(group.title)}</span><span>{metric.label}</span></span>
                      <span className="md-stat__number is-current"><strong>{formatValue(metric, current.value)}</strong>{compare && comparable && renderBar(current.numeric)}</span>
                      {!compare && <span className="md-stat__rank">{rank !== null ? <><b>{rank}</b><small>/ {values.length}</small></> : '—'}</span>}
                      {other ? <>
                        <span className="md-stat__number md-stat__other"><strong>{formatValue(metric, other.value)}</strong>{other.numeric !== null && renderBar(other.numeric, true)}</span>
                        <span className="md-stat__delta" title="当前玩家减去对比玩家">{delta ?? '—'}</span>
                      </> : <span className="md-stat__visual">{comparable ? <>{renderBar(current.numeric)}<small className="md-stat__reference">{values.every((value) => value === current.numeric) ? '全场相同' : values.some((value) => value < 0) ? `${formatValue(metric, Math.min(...values))} ~ ${formatValue(metric, Math.max(...values))}` : `全场最高 ${formatValue(metric, Math.max(...values))}`}</small></> : <span className="md-stat__text-values">—</span>}</span>}
                      <ChevronDown aria-hidden="true" className={expanded ? 'is-open' : ''} />
                    </button>
                    {expanded && <div className="md-stat__expanded">
                      <div className="md-stat__expanded-head"><span>全场对比</span>{other && current.numeric !== null && other.numeric !== null && <span>差值 {formatDelta(metric, current.numeric - other.numeric)}</span>}</div>
                      <div className="md-stat__players">
                        {sorted.map((row) => <div className={`md-stat__player${row.player.puuid === focus.puuid ? ' is-focus' : ''}${row.player.puuid === compare?.puuid ? ' is-compare' : ''}`} key={row.player.puuid}>
                          <GameIcon src={row.player.championAvatar} alt="" size={26} rounded />
                          <span title={participantLabel(row.player)}>{shortParticipantLabel(row.player)}</span>
                          {row.numeric !== null ? renderBar(row.numeric, row.player.puuid === compare?.puuid) : <span />}
                          <strong>{formatValue(metric, row.value)}</strong>
                        </div>)}
                      </div>
                    </div>}
                  </article>
                );
              })}
            </section>
          ))}
          {!visibleGroups.length && <div className="md-stats__empty">没有匹配的指标<button className="md-control" type="button" onClick={() => setQuery('')}>清空搜索</button></div>}
        </div>
      </div>
    </div>
  );
}
