import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Flag, LoaderCircle, Skull, Swords, UserRound, X } from 'lucide-react';
import type { AssistChampionGuide, MatchParticipantSummary, MatchTimeline } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { LeagueArtImage } from './LeagueArtImage';
import { EventTimeline } from './EventTimeline';
import { ObjectiveIcon, RiftMap, riftMapSupported, type RiftMapPoint } from './RiftMap';
import { multiKillLabel } from './matchEventModel';
import {
  buildCast,
  buildFacts,
  buildFocusSummary,
  buildGoldSeries,
  buildingName,
  buildMoments,
  buildPhases,
  buildStoryEvents,
  damageSourceBadge,
  damageSourceLabel,
  groupDamage,
  objectiveLabel,
  participantIdOf,
  sideName,
  storyTime,
  type DamageDealer,
  type Side,
  type StoryCast,
  type StoryEvent,
  type StoryMoment,
} from './matchStoryModel';

// 「事件」：把一局比赛讲成一个故事。
// 顶上是局势图（经济差 + 每一波交战 + 资源），扫一眼就知道这局是怎么赢的、哪里翻的盘；
// 左边按对线期 / 中期 / 后期把交战、拿龙、推塔串起来，每一段都有比分；
// 右边是小地图和详情：点一次击杀能看到这个人是被谁、用什么技能打死的。

type TypeFilter = 'all' | 'kill' | 'objective' | 'building';

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'kill', label: '击杀' },
  { key: 'objective', label: '野怪资源' },
  { key: 'building', label: '推塔' },
];

const MOMENT_BADGES: Record<StoryMoment['type'], string> = {
  teamfight: '团战',
  skirmish: '交锋',
  pick: '击杀',
  objective: '资源',
  push: '推进',
};

interface Props {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  timeline: MatchTimeline | null;
  loading: boolean;
  error?: string;
  queueId: number;
  gameDuration: number;
}

interface Selection {
  momentId: string;
  eventKey?: string;
}

function nameOf(player?: MatchParticipantSummary): string {
  if (!player) return '';
  return player.gameName || (player.riotId || player.summonerName || '').split('#')[0] || player.championName;
}

function mapIdOf(queueId: number): number | null {
  if (queueId === 450 || queueId === 2400) return 12;
  if ([400, 420, 430, 440, 480, 490, 700, 1900].includes(queueId)) return 11;
  return null;
}

export function MatchEventsView({ participants, targetPuuid, timeline, loading, error, queueId, gameDuration }: Props) {
  const [focusPuuid, setFocusPuuid] = useState(targetPuuid);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [onlyFocus, setOnlyFocus] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  // 点了顶部某条事实之后，在局势图上插一面小旗标出那个时间点。
  const [pinned, setPinned] = useState<{ key: string; time: number } | null>(null);
  const [guides, setGuides] = useState<Record<number, AssistChampionGuide>>({});
  const asideRef = useRef<HTMLElement>(null);
  const momentRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => { setFocusPuuid(targetPuuid); }, [targetPuuid]);

  const cast = useMemo(() => buildCast(participants), [participants]);
  const storyEvents = useMemo(() => buildStoryEvents(timeline, cast), [cast, timeline]);
  const moments = useMemo(() => buildMoments(storyEvents, cast), [cast, storyEvents]);
  const gold = useMemo(() => buildGoldSeries(timeline, cast), [cast, timeline]);
  const duration = useMemo(() => {
    const lastFrame = timeline?.frames.at(-1)?.timestamp ?? 0;
    const lastEvent = storyEvents.at(-1)?.event.timestamp ?? 0;
    const fromMatch = gameDuration > 100_000 ? gameDuration : gameDuration * 1000;
    return Math.max(1, lastFrame, lastEvent, fromMatch);
  }, [gameDuration, storyEvents, timeline]);
  const phases = useMemo(() => buildPhases(moments, storyEvents, duration), [duration, moments, storyEvents]);
  const facts = useMemo(() => buildFacts(storyEvents, moments, gold, cast), [cast, gold, moments, storyEvents]);
  const focusId = participantIdOf(participants, focusPuuid);
  const focusPlayer = cast.player(focusId);
  const summary = useMemo(() => buildFocusSummary(focusId, storyEvents, moments), [focusId, moments, storyEvents]);
  const winner: Side = participants.find((player) => player.win)?.teamId === 200 ? 'red' : participants.some((player) => player.win) ? 'blue' : 'neutral';
  const mapId = mapIdOf(queueId);

  const visibleMoments = useMemo(() => {
    const keep = (item: StoryEvent) => (typeFilter === 'all' || item.kind === typeFilter) && (!onlyFocus || item.involved.includes(focusId));
    return moments
      .map((moment) => ({ moment, events: moment.events.filter(keep) }))
      .filter((entry) => entry.events.length > 0);
  }, [focusId, moments, onlyFocus, typeFilter]);

  const counts = useMemo(() => {
    const scoped = storyEvents.filter((item) => !onlyFocus || item.involved.includes(focusId));
    return {
      all: scoped.length,
      kill: scoped.filter((item) => item.kind === 'kill').length,
      objective: scoped.filter((item) => item.kind === 'objective').length,
      building: scoped.filter((item) => item.kind === 'building').length,
    } as Record<TypeFilter, number>;
  }, [focusId, onlyFocus, storyEvents]);

  const selectedMoment = selection ? moments.find((moment) => moment.id === selection.momentId) ?? null : null;
  const selectedEvent = selection?.eventKey ? selectedMoment?.events.find((item) => item.key === selection.eventKey) ?? null : null;

  // 选中的事件被筛掉了就收起详情。
  useEffect(() => {
    if (selection && !visibleMoments.some((entry) => entry.moment.id === selection.momentId)) setSelection(null);
  }, [selection, visibleMoments]);

  const dealers = useMemo(() => (selectedEvent?.kind === 'kill' ? groupDamage(selectedEvent.event.victimDamageReceived) : []), [selectedEvent]);

  // 伤害来源里要显示技能图标，按需拉一下这些英雄的技能资料。
  useEffect(() => {
    const ids = [...new Set(dealers.map((dealer) => cast.player(dealer.participantId)?.championId ?? 0).filter((id) => id > 0 && !guides[id]))];
    if (!ids.length) return undefined;
    let cancelled = false;
    void Promise.all(ids.map((id) => window.lolHelper.assist.getChampionGuide(id).catch(() => null))).then((loaded) => {
      if (cancelled) return;
      const found = loaded.filter((guide): guide is AssistChampionGuide => Boolean(guide));
      if (found.length) setGuides((current) => ({ ...current, ...Object.fromEntries(found.map((guide) => [guide.championId, guide])) }));
    });
    return () => { cancelled = true; };
  }, [cast, dealers, guides]);

  const select = (next: Selection | null, scroll = false, keepPin = false) => {
    setSelection(next);
    if (!keepPin) setPinned(null);
    asideRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (next && scroll) {
      window.requestAnimationFrame(() => {
        momentRefs.current.get(next.momentId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }
  };

  const mapPoints = useMemo<RiftMapPoint[]>(() => {
    if (!riftMapSupported(mapId)) return [];
    const scope = visibleMoments.flatMap((entry) => entry.events.map((item) => ({ item, moment: entry.moment })));
    return scope.flatMap(({ item, moment }): RiftMapPoint[] => {
      const position = item.event.position;
      if (!position) return [];
      if (item.kind === 'building' && moment.id !== selection?.momentId) return [];
      const active = selection ? (selection.eventKey ? item.key === selection.eventKey : moment.id === selection.momentId) : false;
      const inMoment = selection ? moment.id === selection.momentId : false;
      const state: RiftMapPoint['state'] = !selection ? 'idle' : active ? 'active' : inMoment ? 'idle' : 'dim';
      const killer = cast.player(item.actorId);
      const victim = cast.player(item.victimId);
      const mark: RiftMapPoint['mark'] = item.kind !== 'kill' ? 'objective'
        : item.victimId === focusId ? 'focus-death'
          : item.actorId === focusId ? 'focus-kill' : 'kill';
      const label = item.kind === 'kill'
        ? `${storyTime(item.event.timestamp)} ${killer ? nameOf(killer) : '防御塔 / 小兵'} 击杀 ${nameOf(victim) || '对手'}`
        : `${storyTime(item.event.timestamp)} ${sideName(item.side)} ${item.kind === 'objective' ? `拿下${objectiveLabel(item)}` : `推掉${buildingName(item.event)}`}`;
      return [{ key: `${moment.id}|${item.key}`, x: position.x, y: position.y, tone: item.side, mark, event: item.event, label, state }];
    }).sort((a, b) => (a.state === 'active' ? 1 : 0) - (b.state === 'active' ? 1 : 0));
  }, [cast, focusId, mapId, selection, visibleMoments]);

  if (!timeline) {
    return (
      <div className="mev-empty">
        {loading ? <LoaderCircle className="mev-spin" aria-hidden="true" /> : <Flag aria-hidden="true" />}
        <strong>{loading ? '读取时间线…' : '无时间线数据'}</strong>
        {!loading && error && <span>{error}</span>}
      </div>
    );
  }

  const teams: Array<{ side: Side; players: MatchParticipantSummary[] }> = [
    { side: 'blue', players: participants.filter((player) => player.teamId === 100) },
    { side: 'red', players: participants.filter((player) => player.teamId === 200) },
  ].filter((team) => team.players.length > 0) as Array<{ side: Side; players: MatchParticipantSummary[] }>;

  return (
    <div className="mev" onKeyDown={(event) => { if (event.key === 'Escape' && selection) select(null); }}>
      <section className={`mev-top${riftMapSupported(mapId) ? ' has-map' : ''}`}>
        <header className="mev-top__head">
          <strong>局势</strong>
          <div className="mev-facts" role="group" aria-label="这局的关键节点，点一下在下面定位">
            {facts.map((fact) => (
              <button
                key={fact.key}
                type="button"
                className={`mev-fact is-${fact.side}${pinned?.key === fact.key ? ' is-active' : ''}`}
                title={`${fact.label}：${fact.value} · ${fact.meta}\n点一下在局势图和故事线里定位`}
                onClick={() => {
                  if (pinned?.key === fact.key) {
                    select(null);
                    return;
                  }
                  select(fact.momentId ? { momentId: fact.momentId } : null, true, true);
                  setPinned({ key: fact.key, time: fact.time });
                }}
              >
                <span className="mev-fact__label">{fact.label}</span>
                <span className="mev-fact__value">
                  <b>{fact.value}</b>
                  <small>{fact.meta}</small>
                </span>
              </button>
            ))}
          </div>
        </header>
        <div className="mev-top__main">
          <EventTimeline
            duration={duration}
            gold={gold}
            moments={moments}
            selectedMomentId={selection?.momentId ?? null}
            pinnedTime={pinned?.time ?? null}
            focusId={focusId}
            focusName={nameOf(focusPlayer)}
            onSelect={(momentId, eventKey) => select({ momentId, eventKey }, true)}
          />
        </div>
        {riftMapSupported(mapId) && (
          <div className="mev-map">
            <RiftMap
              mapId={mapId}
              points={mapPoints}
              onPick={(key) => {
                const [momentId, eventKey] = key.split('|');
                select({ momentId, eventKey }, true);
              }}
            />
            <div className="mev-map__legend" aria-hidden="true">
              <span title="蓝方拿到的击杀"><i className="is-blue" />蓝方</span>
              <span title="红方拿到的击杀"><i className="is-red" />红方</span>
              <span title={`${nameOf(focusPlayer) || '当前视角的玩家'}阵亡的位置`}><i className="is-focus-death" />阵亡</span>
            </div>
          </div>
        )}
      </section>

      <div className="mev-body">
        <div className="mev-story">
          <div className="mev-filter">
            <div className="mev-filter__types" role="group" aria-label="事件类型">
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={typeFilter === filter.key}
                  onClick={() => setTypeFilter(filter.key)}
                >
                  {filter.label}
                  <small>{counts[filter.key]}</small>
                </button>
              ))}
            </div>
            {focusPlayer && (
              <button
                type="button"
                className="mev-filter__focus"
                aria-pressed={onlyFocus}
                title={onlyFocus ? '显示所有人的事件' : `只看 ${nameOf(focusPlayer)} 参与的事件`}
                onClick={() => setOnlyFocus((value) => !value)}
              >
                <GameIcon src={focusPlayer.championAvatar} alt="" size={18} rounded />
                只看 {nameOf(focusPlayer)}
              </button>
            )}
          </div>

          <div className="mev-boundary">
            <time>0:00</time>
            <span>对局开始</span>
          </div>

          {phases.map((phase) => {
            const entries = visibleMoments.filter((entry) => entry.moment.phase === phase.key);
            return (
              <Fragment key={phase.key}>
                <div className="mev-phase">
                  <div className="mev-phase__name">
                    <strong>{phase.label}</strong>
                    <span>{storyTime(phase.start)} – {storyTime(phase.end)}</span>
                  </div>
                  <div className="mev-phase__score">
                    <Score label="击杀" blue={phase.kills.blue} red={phase.kills.red} />
                    {(phase.dragons.blue + phase.dragons.red > 0) && <Score label="小龙" blue={phase.dragons.blue} red={phase.dragons.red} />}
                    {(phase.towers.blue + phase.towers.red > 0) && <Score label="推塔" blue={phase.towers.blue} red={phase.towers.red} />}
                  </div>
                </div>
                {entries.length === 0 && <p className="mev-quiet">无事件</p>}
                {entries.map(({ moment, events }) => (
                  <MomentCard
                    key={moment.id}
                    moment={moment}
                    events={events}
                    cast={cast}
                    focusId={focusId}
                    selection={selection}
                    onSelect={(next) => select(next)}
                    nodeRef={(node) => { if (node) momentRefs.current.set(moment.id, node); else momentRefs.current.delete(moment.id); }}
                  />
                ))}
              </Fragment>
            );
          })}

          <div className={`mev-boundary is-end is-${winner}`}>
            <time>{storyTime(duration)}</time>
            <span>对局结束{winner !== 'neutral' && <> · <b>{sideName(winner)}获胜</b></>}</span>
          </div>
        </div>

        <aside className="mev-side" ref={asideRef}>
          <div className="mev-who" role="group" aria-label="切换查看谁的视角">
            <div className="mev-who__teams">
            {teams.map((team) => (
              <div key={team.side} className={`mev-who__team is-${team.side}`}>
                {team.players.map((player) => (
                  <button
                    key={player.puuid}
                    type="button"
                    aria-pressed={player.puuid === focusPuuid}
                    title={`${player.riotId || nameOf(player)} · ${player.championName}`}
                    onClick={() => setFocusPuuid(player.puuid)}
                  >
                    <GameIcon src={player.championAvatar} alt="" size={22} rounded />
                  </button>
                ))}
              </div>
            ))}
            </div>
          </div>


          {selectedEvent ? (
            <EventDetail
              item={selectedEvent}
              moment={selectedMoment as StoryMoment}
              cast={cast}
              dealers={dealers}
              guides={guides}
              onClose={() => select(selectedMoment ? { momentId: selectedMoment.id } : null)}
            />
          ) : selectedMoment ? (
            <MomentDetail moment={selectedMoment} cast={cast} onPick={(eventKey) => select({ momentId: selectedMoment.id, eventKey })} onClose={() => select(null)} />
          ) : focusPlayer ? (
            <FocusPanel player={focusPlayer} summary={summary} cast={cast} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Score({ label, blue, red }: { label: string; blue: number; red: number }) {
  return (
    <span className="mev-score" title={`${label}：蓝方 ${blue}，红方 ${red}`}>
      <small>{label}</small>
      <b className={`is-blue${blue > red ? ' is-ahead' : ''}`}>{blue}</b>
      <i>:</i>
      <b className={`is-red${red > blue ? ' is-ahead' : ''}`}>{red}</b>
    </span>
  );
}

function MomentCard({ moment, events, cast, focusId, selection, onSelect, nodeRef }: {
  moment: StoryMoment;
  events: StoryEvent[];
  cast: StoryCast;
  focusId: number;
  selection: Selection | null;
  onSelect: (next: Selection | null) => void;
  nodeRef: (node: HTMLElement | null) => void;
}) {
  const selected = selection?.momentId === moment.id;
  const big = moment.type === 'teamfight' || moment.type === 'skirmish';
  const involved = moment.events.some((item) => item.involved.includes(focusId));
  const className = [
    'mev-moment',
    `is-${moment.type}`,
    `is-${moment.winner}`,
    big ? 'is-big' : 'is-small',
    selected ? 'is-selected' : '',
    involved ? 'is-involved' : '',
    moment.ace ? 'is-ace' : '',
  ].filter(Boolean).join(' ');

  return (
    <article className={className} ref={nodeRef}>
      <time className="mev-moment__time">{storyTime(moment.start)}</time>
      <span className="mev-moment__node" aria-hidden="true" />
      <div className="mev-moment__card">
        {big && (
          <button
            type="button"
            className="mev-moment__head"
            aria-pressed={selected && !selection?.eventKey}
            onClick={() => onSelect(selected && !selection?.eventKey ? null : { momentId: moment.id })}
          >
            <span className="mev-moment__badge">{moment.ace ? '团灭' : MOMENT_BADGES[moment.type]}</span>
            <strong>{moment.title}</strong>
            <span className="mev-moment__score">
              <b className="is-blue">{moment.kills.blue}</b>
              <i>:</i>
              <b className="is-red">{moment.kills.red}</b>
            </span>
            {moment.end > moment.start && <small>{storyTime(moment.start)}–{storyTime(moment.end)}</small>}
          </button>
        )}
        <div className="mev-moment__rows">
          {events.map((item) => (
            <EventRow
              key={item.key}
              item={item}
              cast={cast}
              focusId={focusId}
              showTime={big}
              selected={selection?.eventKey === item.key}
              onClick={() => onSelect(selection?.eventKey === item.key ? null : { momentId: moment.id, eventKey: item.key })}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function Avatar({ player, focus, size = 26 }: { player?: MatchParticipantSummary; focus: boolean; size?: number }) {
  if (!player) return <i className="mev-avatar is-unknown" style={{ width: size, height: size }}><Skull aria-hidden="true" /></i>;
  return (
    <span className={`mev-avatar is-${player.teamId === 200 ? 'red' : 'blue'}${focus ? ' is-focus' : ''}`} title={`${nameOf(player)} · ${player.championName}`}>
      <GameIcon src={player.championAvatar} alt="" size={size} rounded />
    </span>
  );
}

function EventRow({ item, cast, focusId, showTime, selected, onClick }: {
  item: StoryEvent;
  cast: StoryCast;
  focusId: number;
  showTime: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const killer = cast.player(item.actorId);
  const victim = cast.player(item.victimId);
  const focusDied = item.kind === 'kill' && item.victimId === focusId;
  const focusScored = item.kind === 'kill' && (item.actorId === focusId || item.assistIds.includes(focusId));
  const className = [
    'mev-row',
    `is-${item.kind}`,
    `is-${item.side}`,
    selected ? 'is-selected' : '',
    focusDied ? 'is-focus-death' : focusScored ? 'is-focus-kill' : '',
  ].filter(Boolean).join(' ');

  if (item.kind === 'kill') {
    const assists = item.assistIds.map((id) => cast.player(id)).filter(Boolean) as MatchParticipantSummary[];
    const bounty = item.event.shutdownBounty ?? 0;
    return (
      <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
        {showTime && <time>{storyTime(item.event.timestamp)}</time>}
        <span className="mev-row__actor">
          <Avatar player={killer} focus={item.actorId === focusId} />
          <b>{killer ? nameOf(killer) : '防御塔 / 小兵'}</b>
        </span>
        <span className="mev-row__verb" aria-hidden="true"><LeagueArtImage name="kills.png" /></span>
        <span className="mev-row__victim">
          <Avatar player={victim} focus={item.victimId === focusId} />
          <b>{nameOf(victim) || '对手'}</b>
        </span>
        <span className="mev-row__extra">
          {item.multi >= 2 && <em className="mev-tag is-multi">{multiKillLabel(item.event)}</em>}
          {bounty > 0 && <em className="mev-tag is-bounty" title="终结了对方的连杀赏金">终结 {bounty}</em>}
          {assists.length > 0 && (
            <span className="mev-row__assists" title={`助攻：${assists.map(nameOf).join('、')}`}>
              {assists.map((player) => <Avatar key={player.puuid} player={player} focus={player === cast.player(focusId)} size={18} />)}
            </span>
          )}
        </span>
      </button>
    );
  }

  const taker = cast.player(item.actorId);
  const what = item.kind === 'objective' ? `拿下${objectiveLabel(item)}` : `推掉${buildingName(item.event)}`;
  return (
    <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
      {showTime && <time>{storyTime(item.event.timestamp)}</time>}
      <span className={`mev-row__art is-${item.side}`}><ObjectiveIcon event={item.event} side={item.side} /></span>
      <span className="mev-row__what">
        <b className={`is-${item.side}`}>{sideName(item.side)}</b>
        {what}
      </span>
      <span className="mev-row__extra">
        {taker && <Avatar player={taker} focus={item.actorId === focusId} size={20} />}
      </span>
    </button>
  );
}

function MomentDetail({ moment, cast, onPick, onClose }: { moment: StoryMoment; cast: StoryCast; onPick: (eventKey: string) => void; onClose: () => void }) {
  const sides: Array<'blue' | 'red'> = ['blue', 'red'];
  const kills = moment.events.filter((item) => item.kind === 'kill');
  const firstKill = kills[0];
  // 这一波里击杀算 2 分、助攻 1 分，挑出前两名。
  const tally = new Map<number, { id: number; kills: number; assists: number }>();
  kills.forEach((item) => {
    if (item.actorId > 0) {
      const row = tally.get(item.actorId) ?? { id: item.actorId, kills: 0, assists: 0 };
      row.kills += 1;
      tally.set(item.actorId, row);
    }
    item.assistIds.forEach((id) => {
      const row = tally.get(id) ?? { id, kills: 0, assists: 0 };
      row.assists += 1;
      tally.set(id, row);
    });
  });
  const stars = [...tally.values()]
    .sort((a, b) => (b.kills * 2 + b.assists) - (a.kills * 2 + a.assists))
    .filter((row) => row.kills * 2 + row.assists >= 3)
    .slice(0, 2);
  return (
    <section className="mev-detail">
      <header className="mev-detail__head">
        <div>
          <small>{MOMENT_BADGES[moment.type]} · {storyTime(moment.start)}{moment.end > moment.start ? `–${storyTime(moment.end)}` : ''}</small>
          <strong>{moment.title}</strong>
        </div>
        <button type="button" aria-label="收起" title="收起" onClick={onClose}><X /></button>
      </header>
      <div className="mev-detail__teams">
        {sides.map((side) => {
          const ids = [...new Set(moment.events.filter((item) => item.kind === 'kill').flatMap((item) => item.involved).filter((id) => cast.sideOf(id) === side))];
          return (
            <div key={side} className={`mev-detail__team is-${side}`}>
              <span>{sideName(side)} <b>{moment.kills[side]}</b> 杀</span>
              <div>{ids.map((id) => <Avatar key={id} player={cast.player(id)} focus={false} size={22} />)}</div>
            </div>
          );
        })}
      </div>
      {stars.length > 0 && (
        <div className="mev-detail__block">
          <h4>这一波打得最好的</h4>
          <ul className="mev-people">
            {stars.map((star) => (
              <li key={star.id}>
                <Avatar player={cast.player(star.id)} focus={false} size={24} />
                <span>{nameOf(cast.player(star.id))}<small>{cast.player(star.id)?.championName}</small></span>
                <b>{star.kills} 杀 {star.assists} 助</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      {firstKill && (
        <button type="button" className="mev-detail__next" onClick={() => onPick(firstKill.key)}>
          从第一次击杀开始看 · {storyTime(firstKill.event.timestamp)}
        </button>
      )}
    </section>
  );
}

function EventDetail({ item, moment, cast, dealers, guides, onClose }: {
  item: StoryEvent;
  moment: StoryMoment;
  cast: StoryCast;
  dealers: DamageDealer[];
  guides: Record<number, AssistChampionGuide>;
  onClose: () => void;
}) {
  const killer = cast.player(item.actorId);
  const victim = cast.player(item.victimId);
  const assists = item.assistIds.map((id) => cast.player(id)).filter(Boolean) as MatchParticipantSummary[];
  const total = dealers.reduce((sum, dealer) => sum + dealer.total, 0);
  const back = moment.type === 'teamfight' || moment.type === 'skirmish';

  if (item.kind !== 'kill') {
    return (
      <section className="mev-detail">
        <header className="mev-detail__head">
          <div>
            <small>{item.kind === 'objective' ? '野怪资源' : '推塔'} · {storyTime(item.event.timestamp)}</small>
            <strong>{sideName(item.side)}{item.kind === 'objective' ? `拿下${objectiveLabel(item)}` : `推掉${buildingName(item.event)}`}</strong>
          </div>
          <button type="button" aria-label="收起" title="收起" onClick={onClose}><X /></button>
        </header>
        <div className={`mev-objective is-${item.side}`}>
          <span className="mev-objective__art"><ObjectiveIcon event={item.event} side={item.side} /></span>
          <div>
            {killer ? <><Avatar player={killer} focus={false} size={28} /><b>{nameOf(killer)}</b><small>最后一击</small></> : <small>由小兵或其他单位完成</small>}
          </div>
        </div>
        {assists.length > 0 && (
          <div className="mev-detail__block">
            <h4>一起参与</h4>
            <div className="mev-detail__avatars">{assists.map((player) => <Avatar key={player.puuid} player={player} focus={false} size={24} />)}</div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mev-detail">
      <header className="mev-detail__head">
        <div>
          <small>{back ? '交战中的一次击杀' : '击杀'} · {storyTime(item.event.timestamp)}</small>
          <strong>{killer ? nameOf(killer) : '防御塔 / 小兵'} 击杀 {nameOf(victim) || '对手'}</strong>
        </div>
        <button type="button" aria-label="收起" title="收起" onClick={onClose}><X /></button>
      </header>

      <div className={`mev-duel is-${item.side}`}>
        <div className={`mev-duel__side is-${item.side}`}>
          <Avatar player={killer} focus={false} size={40} />
          <b>{killer ? nameOf(killer) : '防御塔 / 小兵'}</b>
          <small>{killer?.championName ?? '击杀'}</small>
        </div>
        <span className="mev-duel__mark" aria-hidden="true"><Swords /></span>
        <div className="mev-duel__side is-victim">
          <Avatar player={victim} focus={false} size={40} />
          <b>{nameOf(victim) || '对手'}</b>
          <small>{victim?.championName ?? '阵亡'}</small>
        </div>
      </div>

      <div className="mev-detail__tags">
        {item.multi >= 2 && <em className="mev-tag is-multi">{multiKillLabel(item.event)}</em>}
        {(item.event.shutdownBounty ?? 0) > 0 && <em className="mev-tag is-bounty">终结赏金 {item.event.shutdownBounty}</em>}
        {(item.event.bounty ?? 0) > 0 && <em className="mev-tag">赏金 {item.event.bounty}</em>}
        {assists.length === 0 && item.actorId > 0 && <em className="mev-tag">单杀</em>}
      </div>

      {assists.length > 0 && (
        <div className="mev-detail__block">
          <h4>助攻</h4>
          <div className="mev-detail__avatars">
            {assists.map((player) => (
              <span key={player.puuid} className="mev-detail__mate"><Avatar player={player} focus={false} size={24} />{nameOf(player)}</span>
            ))}
          </div>
        </div>
      )}

      <div className="mev-detail__block">
        <h4>
          {nameOf(victim) || '对手'} 死前受到的伤害
          {total > 0 && <small>{Math.round(total).toLocaleString('zh-CN')}</small>}
        </h4>
        {dealers.length === 0 ? (
          <p className="mev-detail__hint">无伤害明细</p>
        ) : (
          <>
            <div className="mev-dmg-strip" aria-hidden="true">
              {dealers.map((dealer) => {
                const player = cast.player(dealer.participantId);
                return <i key={`${dealer.participantId}-${dealer.name}`} className={`is-${player ? (player.teamId === 200 ? 'red' : 'blue') : 'neutral'}`} style={{ flexGrow: dealer.total }} title={`${player ? nameOf(player) : dealer.name} ${Math.round(dealer.total / total * 100)}%`} />;
              })}
            </div>
            <div className="mev-dmg">
              {dealers.map((dealer, index) => (
                <DamageDealerRow key={`${dealer.participantId}-${dealer.name}`} dealer={dealer} total={total} cast={cast} guides={guides} open={index === 0} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function DamageDealerRow({ dealer, total, cast, guides, open }: {
  dealer: DamageDealer;
  total: number;
  cast: StoryCast;
  guides: Record<number, AssistChampionGuide>;
  open: boolean;
}) {
  const player = cast.player(dealer.participantId);
  const guide = player ? guides[player.championId] : undefined;
  const share = total > 0 ? dealer.total / total * 100 : 0;
  return (
    <details className={`mev-dmg__dealer is-${player ? (player.teamId === 200 ? 'red' : 'blue') : 'neutral'}`} open={open}>
      <summary>
        {player ? <Avatar player={player} focus={false} size={26} /> : <i className="mev-avatar is-unknown"><UserRound aria-hidden="true" /></i>}
        <b>{player ? nameOf(player) : dealer.name}</b>
        <span className="mev-dmg__bar"><i style={{ width: `${share}%` }} /></span>
        <em>{Math.round(dealer.total).toLocaleString('zh-CN')}</em>
        <small>{Math.round(share)}%</small>
      </summary>
      <div className="mev-dmg__sources">
        {dealer.sources.map((source) => {
          const sourceShare = dealer.total > 0 ? source.damage / dealer.total * 100 : 0;
          return (
            <div key={source.key} className="mev-dmg__source" title={String(source.sample.spellName || source.sample.name || damageSourceLabel(source.key))}>
              <AbilityIcon sourceKey={source.key} guide={guide} />
              <span>{abilityLabel(source.key, guide)}</span>
              <span className="mev-dmg__bar is-thin"><i style={{ width: `${sourceShare}%` }} /></span>
              <em>{Math.round(source.damage).toLocaleString('zh-CN')}</em>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function abilityLabel(key: string, guide?: AssistChampionGuide): string {
  if (key === 'P') return guide?.passive?.name ? `被动 · ${guide.passive.name}` : '被动';
  if (['Q', 'W', 'E', 'R'].includes(key)) {
    const spell = guide?.spells.find((item) => item.key === key);
    return spell?.name ? `${key} · ${spell.name}` : `${key} 技能`;
  }
  return damageSourceLabel(key);
}

function AbilityIcon({ sourceKey, guide }: { sourceKey: string; guide?: AssistChampionGuide }) {
  const [failed, setFailed] = useState(false);
  const icon = sourceKey === 'P' ? guide?.passive?.icon : ['Q', 'W', 'E', 'R'].includes(sourceKey) ? guide?.spells.find((item) => item.key === sourceKey)?.icon : undefined;
  useEffect(() => { setFailed(false); }, [icon]);
  if (icon && !failed) return <img className="mev-ability" src={icon} alt="" aria-hidden="true" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return <i className="mev-ability is-text">{damageSourceBadge(sourceKey)}</i>;
}

function FocusPanel({ player, summary, cast }: { player: MatchParticipantSummary; summary: ReturnType<typeof buildFocusSummary>; cast: StoryCast }) {
  const side = player.teamId === 200 ? 'red' : 'blue';
  const people = (rows: Array<{ id: number; count: number }>) => rows.slice(0, 4).map((row) => {
    const other = cast.player(row.id);
    return (
      <li key={row.id}>
        {other ? <Avatar player={other} focus={false} size={24} /> : <i className="mev-avatar is-unknown"><Skull aria-hidden="true" /></i>}
        <span>{other ? nameOf(other) : '防御塔 / 小兵'}<small>{other?.championName}</small></span>
        <b>× {row.count}</b>
      </li>
    );
  });
  return (
    <section className="mev-detail mev-focus">
      <header className={`mev-focus__head is-${side}`}>
        <Avatar player={player} focus size={40} />
        <div>
          <strong>{nameOf(player)} 的这一局</strong>
          <span>{player.championName} · 时间线里记了 <b>{summary.kills}</b> 杀 <b>{summary.deaths}</b> 死 <b>{summary.assists}</b> 助攻</span>
        </div>
      </header>
      <dl className="mev-focus__stats">
        <div><dt>团战参与</dt><dd>{summary.fights.total ? <>{summary.fights.joined}<small>/{summary.fights.total}</small></> : '—'}</dd></div>
        <div><dt>首次阵亡</dt><dd>{summary.firstDeath === null ? '没死过' : storyTime(summary.firstDeath)}</dd></div>
        <div><dt>野怪资源</dt><dd>{summary.objectives}</dd></div>
        <div><dt>单杀</dt><dd>{summary.soloKills}</dd></div>
      </dl>
      {summary.killedBy.length > 0 && (
        <div className="mev-detail__block">
          <h4>被谁击杀</h4>
          <ul className="mev-people is-danger">{people(summary.killedBy)}</ul>
        </div>
      )}
      {summary.killed.length > 0 && (
        <div className="mev-detail__block">
          <h4>击杀了谁</h4>
          <ul className="mev-people">{people(summary.killed)}</ul>
        </div>
      )}
    </section>
  );
}

