import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { AssistChampionGuide, MatchParticipantSummary, MatchTimeline, MatchTimelineEvent, PlayerRuneSummary } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { BuildSkillMatrix } from './BuildSkillMatrix';
import { LaneDuel } from './LaneDuel';
import { timelineTicks } from './eventTimelineModel';
import {
  buildLaneDuel,
  buildMilestones,
  buildRunePage,
  buildSkillPlan,
  buildTime,
  groupTrips,
  isPowerSpike,
  reconcilePurchases,
  RUNE_TREE_NAMES,
  type BuildMilestone,
  type BuildPurchase,
  type BuildSale,
} from './matchBuildModel';

// 「构建」：这个人这局是怎么出装、怎么点技能、带的什么符文。
// 最想知道的是「我的装备什么时候成型，比对面快还是慢」，所以放在最上面，
// 和对位的人画在同一条时间轴上比；下面是技能主副升、符文、每一次回家买了什么。

const POSITION_NAMES: Record<string, string> = {
  TOP: '上单', JUNGLE: '打野', MIDDLE: '中单', MID: '中单', BOTTOM: '下路', UTILITY: '辅助', SUPPORT: '辅助',
};

interface Props {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  timeline: MatchTimeline | null;
  loading: boolean;
  gameDuration: number;
}

function nameOf(player?: MatchParticipantSummary): string {
  if (!player) return '';
  return player.gameName || (player.riotId || player.summonerName || '').split('#')[0] || player.championName;
}

function idOf(participants: MatchParticipantSummary[], player: MatchParticipantSummary): number {
  return player.participantId || participants.indexOf(player) + 1;
}

function ledgerFor(events: MatchTimelineEvent[], participants: MatchParticipantSummary[], player?: MatchParticipantSummary) {
  if (!player) return null;
  const { purchases, sales } = reconcilePurchases(events, idOf(participants, player), player.items.filter((item) => item.id > 0).map((item) => item.id));
  return { purchases, sales, milestones: buildMilestones(player, purchases) };
}

export function MatchBuildView({ participants, targetPuuid, timeline, loading, gameDuration }: Props) {
  const [focusPuuid, setFocusPuuid] = useState(targetPuuid);
  const [guide, setGuide] = useState<AssistChampionGuide | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setFocusPuuid(targetPuuid); }, [targetPuuid]);

  const focus = participants.find((player) => player.puuid === focusPuuid) ?? participants[0];
  const rival = useMemo(() => {
    if (!focus || !POSITION_NAMES[focus.teamPosition]) return undefined;
    return participants.find((player) => player.teamId !== focus.teamId && player.teamPosition === focus.teamPosition);
  }, [focus, participants]);

  useEffect(() => {
    const championId = focus?.championId ?? 0;
    setGuide(null);
    if (!championId) return undefined;
    let cancelled = false;
    void window.lolHelper.assist.getChampionGuide(championId)
      .then((loaded) => { if (!cancelled) setGuide(loaded); })
      .catch(() => { if (!cancelled) setGuide(null); });
    return () => { cancelled = true; };
  }, [focus?.championId]);

  const events = useMemo(() => timeline?.frames.flatMap((frame) => frame.events ?? []) ?? [], [timeline]);
  const duration = useMemo(() => {
    const lastFrame = timeline?.frames.at(-1)?.timestamp ?? 0;
    const fromMatch = gameDuration > 100_000 ? gameDuration : gameDuration * 1000;
    return Math.max(60_000, lastFrame, fromMatch);
  }, [gameDuration, timeline]);

  const mine = useMemo(() => ledgerFor(events, participants, focus), [events, focus, participants]);
  const theirs = useMemo(() => ledgerFor(events, participants, rival), [events, rival, participants]);
  const trips = useMemo(() => (mine ? groupTrips(mine.purchases, mine.sales) : []), [mine]);
  const duel = useMemo(() => (focus && rival ? buildLaneDuel(timeline, idOf(participants, focus), idOf(participants, rival)) : null), [focus, participants, rival, timeline]);
  const skillPlan = useMemo(() => buildSkillPlan(focus ? events.filter((event) => event.participantId === idOf(participants, focus)) : []), [events, focus, participants]);

  if (!focus) return <div className="bd-empty is-page">这场对局没有出装数据</div>;

  const pick = (player: MatchParticipantSummary) => {
    setFocusPuuid(player.puuid);
    rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const hasTimeline = Boolean(timeline);
  const teams = [100, 200].map((teamId) => participants.filter((player) => player.teamId === teamId)).filter((team) => team.length > 0);
  const side = focus.teamId === 200 ? 'red' : 'blue';
  const splash = focus.championSplashUrl ? { '--bd-splash': `url(${JSON.stringify(focus.championSplashUrl)})` } as CSSProperties : undefined;
  const trinket = focus.items.find((item) => item.slot === 6 && item.id > 0);

  return (
    <div className="bd" ref={rootRef}>
      <nav className="bd-roster" aria-label="选择查看谁的出装">
        {teams.map((team, teamIndex) => (
          <div key={team[0].teamId} className={`bd-roster__team is-${team[0].teamId === 200 ? 'red' : 'blue'}`}>
            <span>{team[0].teamId === 200 ? '红方' : '蓝方'}</span>
            {team.map((player) => (
              <button
                key={player.puuid}
                type="button"
                aria-pressed={player.puuid === focus.puuid}
                className={player.puuid === rival?.puuid ? 'is-rival' : undefined}
                title={`${player.riotId || nameOf(player)} · ${player.championName}${player.puuid === rival?.puuid ? ' · 对位' : ''}`}
                onClick={() => pick(player)}
              >
                <GameIcon src={player.championAvatar} alt="" size={32} rounded />
              </button>
            ))}
            {teamIndex === 0 && teams.length > 1 && <i className="bd-roster__vs" aria-hidden="true">VS</i>}
          </div>
        ))}
      </nav>

      <header className={`bd-hero is-${side}`} style={splash}>
        <span className="bd-hero__avatar">
          <GameIcon src={focus.championAvatar} alt="" size={52} rounded />
          {focus.champLevel > 0 && <small>{focus.champLevel}</small>}
        </span>
        <div className="bd-hero__who">
          <strong title={focus.riotId || nameOf(focus)}>{nameOf(focus)}{focus.tagLine && <small>#{focus.tagLine}</small>}</strong>
          <span>
            <em className={`is-${side}`}>{side === 'red' ? '红方' : '蓝方'}</em>
            {POSITION_NAMES[focus.teamPosition] && <> · {POSITION_NAMES[focus.teamPosition]}</>}
            {focus.championName && <> · {focus.championName}</>}
            <> · <b className={focus.win ? 'is-win' : 'is-loss'}>{focus.win ? '胜利' : '失败'}</b></>
          </span>
        </div>
        <HeroBuild player={focus} milestones={mine?.milestones ?? []} />
        <dl className="bd-hero__stats">
          <div><dt>KDA</dt><dd>{focus.kills}<i>/</i><em>{focus.deaths}</em><i>/</i>{focus.assists}</dd></div>
          <div><dt>金币</dt><dd>{Math.round(focus.gold || 0).toLocaleString('zh-CN')}</dd></div>
          <div><dt>补刀</dt><dd>{focus.cs ?? 0}</dd></div>
        </dl>
      </header>

      <section className="bd-card bd-race-card">
        <header className="bd-card__head">
          <h3>装备成型</h3>
        </header>
        {!hasTimeline || !mine?.milestones.some(isPowerSpike) ? (
          <>
            <FinalRow milestones={mine?.milestones ?? []} trinket={trinket} />
            <p className="bd-empty">
              {loading
                ? <><LoaderCircle className="bd-spin" aria-hidden="true" />读取时间线…</>
                : '无时间线数据'}
            </p>
          </>
        ) : (
          <>
            <ItemRace
              duration={duration}
              lanes={[
                { key: 'focus', player: focus, milestones: (mine?.milestones ?? []).filter(isPowerSpike), tone: 'focus' },
                ...(rival && theirs ? [{ key: 'rival', player: rival, milestones: theirs.milestones.filter(isPowerSpike), tone: 'rival' as const }] : []),
              ]}
            />
            {rival && theirs && <RaceVerdict mine={mine?.milestones ?? []} theirs={theirs.milestones} rivalName={nameOf(rival)} />}
          </>
        )}
      </section>

      {rival && duel && (
        <section className="bd-card">
          <header className="bd-card__head">
            <h3>对线</h3>
          </header>
          <LaneDuel duel={duel} duration={duration} rivalName={nameOf(rival)} />
        </section>
      )}

      <div className="bd-pair">
        <section className="bd-card">
          <header className="bd-card__head">
            <h3>技能加点</h3>
          </header>
          {hasTimeline
            ? <BuildSkillMatrix plan={skillPlan} spells={guide?.spells ?? []} />
            : <p className="bd-empty">{loading ? '正在读取时间线…' : '无时间线数据'}</p>}
        </section>
        <section className="bd-card">
          <header className="bd-card__head">
            <h3>符文与召唤师技能</h3>
          </header>
          <RunePanel player={focus} />
        </section>
      </div>

      <section className="bd-card">
        <header className="bd-card__head">
          <h3>每次回家买了什么</h3>
          <div className="bd-legend" aria-hidden="true">
            <span><i className="is-final" />最后留在身上</span>
            <span><i className="is-combined" />后来合成了</span>
            <span><i className="is-consumed" />用掉了</span>
            <span><i className="is-sold" />卖掉了</span>
          </div>
        </header>
        {!hasTimeline
          ? <p className="bd-empty">{loading ? '正在读取时间线…' : '无时间线数据'}</p>
          : trips.length === 0
            ? <p className="bd-empty">无购买记录</p>
            : (
              <ol className="bd-trips">
                {trips.map((trip) => (
                  <li key={trip.key} className="bd-trip">
                    <header>
                      <b>{trip.label}</b>
                      <time>{buildTime(trip.time)}</time>
                    </header>
                    <div className="bd-trip__items">
                      {trip.purchases.map((item) => <PurchaseIcon key={item.key} item={item} />)}
                      {trip.sales.map((sale) => <SaleIcon key={sale.key} sale={sale} />)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
      </section>
    </div>
  );
}

function ItemIcon({ icon, name, size = 32 }: { icon: string; name: string; size?: number }) {
  return icon ? <GameIcon src={icon} alt={name} size={size} /> : <span className="bd-item__blank" style={{ width: size, height: size }} aria-hidden="true" />;
}

function PurchaseIcon({ item }: { item: BuildPurchase }) {
  const state = item.final ? 'final' : item.fate;
  const note = item.final ? '最后留在身上'
    : item.fate === 'combined' ? `${item.endTime !== undefined ? `${buildTime(item.endTime)} ` : ''}合成进了 ${item.intoName ?? '别的装备'}`
      : item.fate === 'consumed' ? `${item.endTime !== undefined ? `${buildTime(item.endTime)} ` : ''}用掉了`
        : item.fate === 'sold' ? `${item.endTime !== undefined ? `${buildTime(item.endTime)} ` : ''}卖掉了`
          : '';
  return (
    <span className={`bd-item is-${state}`} title={`${item.name} · ${buildTime(item.time)} 买${note ? `\n${note}` : ''}`} tabIndex={0}>
      <ItemIcon icon={item.icon} name={item.name} />
    </span>
  );
}

function SaleIcon({ sale }: { sale: BuildSale }) {
  return (
    <span className="bd-item is-sale" title={`${sale.name} · ${buildTime(sale.time)} 卖掉`} tabIndex={0}>
      <ItemIcon icon={sale.icon} name={sale.name} />
      <em>卖</em>
    </span>
  );
}

/** 卡片里的最终出装：按装备栏顺序摆，大件右上角的序号和下面的成型时间轴对应。 */
function HeroBuild({ player, milestones }: { player: MatchParticipantSummary; milestones: BuildMilestone[] }) {
  const slots = Array.from({ length: 6 }, (_, slot) => player.items.find((item) => item.slot === slot && item.id > 0));
  const trinket = player.items.find((item) => item.slot === 6 && item.id > 0);
  const milestoneOf = (slot: number, id: number) => milestones.find((item) => item.key === `${slot}-${id}`);
  return (
    <div className="bd-hero__build" aria-label="最终出装">
      {slots.map((item, slot) => {
        if (!item) return <span key={slot} className="bd-hero__slot is-empty" aria-hidden="true" />;
        const milestone = milestoneOf(slot, item.id);
        const when = milestone?.time !== null && milestone?.time !== undefined ? ` · ${buildTime(milestone.time)}${milestone.upgradedFrom ? `（由${milestone.upgradedFrom}升级）` : ' 做出来'}` : '';
        return (
          <span key={slot} className={`bd-hero__slot is-${milestone?.role ?? 'core'}`} title={`${item.name}${when}`}>
            <ItemIcon icon={item.icon} name={item.name} size={30} />
            {milestone && milestone.order > 0 && <b>{milestone.order}</b>}
          </span>
        );
      })}
      {trinket && <span className="bd-hero__slot is-trinket" title={trinket.name}><ItemIcon icon={trinket.icon} name={trinket.name} size={24} /></span>}
    </div>
  );
}

function FinalRow({ milestones, trinket }: { milestones: BuildMilestone[]; trinket?: { id: number; name: string; icon: string } }) {
  return (
    <div className="bd-final">
      {milestones.map((item) => (
        <span key={item.key} className={`bd-final__item is-${item.role}`} title={item.name}>
          <ItemIcon icon={item.icon} name={item.name} size={40} />
          {item.order > 0 && <b>{item.order}</b>}
        </span>
      ))}
      {trinket && <span className="bd-final__item is-trinket" title={trinket.name}><ItemIcon icon={trinket.icon} name={trinket.name} size={30} /></span>}
    </div>
  );
}

interface RaceLane {
  key: string;
  player: MatchParticipantSummary;
  milestones: BuildMilestone[];
  tone: 'focus' | 'rival';
}

const ICON = 32;
const GAP = 4;

/** 两条泳道共用一条时间轴：上面是自己，下面是对位；图标按做出来的时间摆，挤在一起时往右让开，用细线连回真实时间点。 */
function ItemRace({ duration, lanes }: { duration: number; lanes: RaceLane[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = trackRef.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ticks = useMemo(() => timelineTicks(duration), [duration]);
  const layout = (milestones: BuildMilestone[]) => {
    const timed = milestones.filter((item) => item.time !== null);
    const xs = timed.map((item) => (item.time as number) / duration * width);
    const placed = xs.map((x) => Math.max(ICON / 2, x));
    for (let index = 1; index < placed.length; index += 1) placed[index] = Math.max(placed[index], placed[index - 1] + ICON + GAP);
    for (let index = placed.length - 1; index >= 0; index -= 1) {
      const limit = index === placed.length - 1 ? width - ICON / 2 : placed[index + 1] - ICON - GAP;
      placed[index] = Math.min(placed[index], limit);
    }
    return timed.map((item, index) => ({ item, x: xs[index], placed: placed[index] }));
  };

  return (
    <div className={`bd-race${lanes.length > 1 ? ' has-rival' : ''}`}>
      <div className="bd-race__names">
        {lanes.map((lane) => (
          <span key={lane.key} className={`bd-race__who is-${lane.tone}`}>
            <GameIcon src={lane.player.championAvatar} alt="" size={24} rounded />
            <b title={nameOf(lane.player)}>{lane.tone === 'rival' ? `对位 ${nameOf(lane.player)}` : nameOf(lane.player)}</b>
          </span>
        ))}
      </div>
      <div className="bd-race__track" ref={trackRef}>
        <div className="bd-race__axis" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={tick} style={{ left: `${tick / duration * 100}%` }} className={index === 0 ? 'is-first' : index === ticks.length - 1 ? 'is-last' : undefined}>
              {buildTime(tick)}
            </span>
          ))}
        </div>
        {width > 0 && lanes.map((lane) => (
          <div key={lane.key} className={`bd-race__lane is-${lane.tone}`}>
            {layout(lane.milestones).map(({ item, x, placed }) => (
              <span
                key={item.key}
                className={`bd-race__item is-${item.role} ${placed >= x ? 'is-right' : 'is-left'}${Math.abs(placed - x) > 1 ? ' is-shifted' : ''}`}
                style={{ '--x': `${x}px`, '--px': `${placed}px` } as CSSProperties}
                title={`${item.name} · ${buildTime(item.time as number)} ${item.upgradedFrom ? `由${item.upgradedFrom}升级` : '做出来'}${item.order ? `（第 ${item.order} 件大件）` : ''}`}
              >
                <i className="bd-race__dot" aria-hidden="true" />
                <i className="bd-race__stem" aria-hidden="true" />
                <span className="bd-race__icon">
                  <ItemIcon icon={item.icon} name={item.name} size={ICON} />
                  {item.order > 0 && <b>{item.order}</b>}
                </span>
                <time>{buildTime(item.time as number)}</time>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RaceVerdict({ mine, theirs, rivalName }: { mine: BuildMilestone[]; theirs: BuildMilestone[]; rivalName: string }) {
  const core = (list: BuildMilestone[]) => list.filter((item) => item.role === 'core' && item.time !== null);
  const a = core(mine);
  const b = core(theirs);
  const count = Math.min(a.length, b.length, 4);
  if (count === 0) return null;
  return (
    <div className="bd-verdict" aria-label={`和 ${rivalName} 比装备成型时间`}>
      {Array.from({ length: count }, (_, index) => {
        const diff = (b[index].time as number) - (a[index].time as number);
        const faster = diff > 0;
        const even = Math.abs(diff) < 10_000;
        return (
          <span key={index} className={`bd-verdict__chip ${even ? 'is-even' : faster ? 'is-ahead' : 'is-behind'}`}>
            <small>第 {index + 1} 件大件</small>
            <b>{even ? '差不多' : `${faster ? '快' : '慢'} ${buildTime(Math.abs(diff))}`}</b>
          </span>
        );
      })}
    </div>
  );
}

function RuneIcon({ rune, size }: { rune: PlayerRuneSummary; size: number }) {
  return rune.icon ? <GameIcon src={rune.icon} alt={rune.name} size={size} rounded /> : <span className="bd-item__blank is-round" style={{ width: size, height: size }} aria-hidden="true" />;
}

function RunePanel({ player }: { player: MatchParticipantSummary }) {
  const page = buildRunePage(player);
  const augments = (player.augments ?? []).filter((augment) => augment.id > 0);
  return (
    <div className="bd-runes">
      {page.keystone ? (
        <>
          <div className={`bd-runes__tree is-${page.primaryTree}`}>
            <span className="bd-runes__keystone" title={page.keystone.name}><RuneIcon rune={page.keystone} size={44} /></span>
            <div>
              <span className="bd-runes__tag">{RUNE_TREE_NAMES[page.primaryTree]}</span>
              <strong>{page.keystone.name}</strong>
              <div className="bd-runes__minor">
                {page.primary.map((rune) => <span key={rune.id} title={rune.name}><RuneIcon rune={rune} size={26} /></span>)}
              </div>
            </div>
          </div>
          {page.secondaryTree && (
            <div className={`bd-runes__tree is-secondary is-${page.secondaryTree}`}>
              <span className="bd-runes__tag">{RUNE_TREE_NAMES[page.secondaryTree]}</span>
              <div className="bd-runes__minor">
                {page.secondary.map((rune) => <span key={rune.id} title={rune.name}><RuneIcon rune={rune} size={26} /></span>)}
              </div>
            </div>
          )}
        </>
      ) : <p className="bd-empty">无符文数据</p>}

      {augments.length > 0 && (
        <div className="bd-runes__augments">
          <span className="bd-runes__label">强化符文</span>
          <div>
            {augments.map((augment) => (
              <span key={augment.id} className={`bd-augment is-${augment.rarity ?? 'silver'}`} title={augment.name}>
                <RuneIcon rune={augment} size={28} />
                <em>{augment.name}</em>
              </span>
            ))}
          </div>
        </div>
      )}

      {player.spells.length > 0 && (
        <div className="bd-runes__spells">
          <span className="bd-runes__label">召唤师技能</span>
          {player.spells.map((spell) => (
            <span key={`${spell.slot}-${spell.id}`} className="bd-spell" title={spell.name}>
              <GameIcon src={spell.icon} alt="" size={26} />
              <em>{spell.name}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
