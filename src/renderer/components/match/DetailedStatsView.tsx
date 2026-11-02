import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ChevronDown, Coins, Crown, Eye, Flame, Landmark, Radio, Search, Shield, Sparkles, Swords, X, type LucideIcon } from 'lucide-react';
import type { MatchParticipantSummary } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import {
  buildDetailContext,
  buildDetailGroups,
  buildDetailSections,
  detailNumber,
  formatDetailValue,
  playerName,
  POSITION_NAMES,
  type DetailGroup,
  type DetailMetric,
  type DetailSectionKey,
  type DetailValue,
} from './detailedStatsModel';

// 「详尽表格」：十个人一字排开，每一行一项数据。
// 一眼要能看出三件事：这一项谁最高（金色）、我在哪（高亮的那一列）、两队谁占优（行名下的两色条）。
// 顶部先替正在看的这个人总结一句：几项核心数据全场排第几、这局拿了哪些「全场最高」。

const SECTION_ICONS: Record<DetailSectionKey, LucideIcon> = {
  combat: Swords,
  damage: Flame,
  tank: Shield,
  economy: Coins,
  vision: Eye,
  objectives: Landmark,
  casts: Radio,
  other: Sparkles,
};

// 顶部「全场排名」看的几项，按玩家最关心的顺序。
const STANDING_KEYS: Array<{ key: string; label: string }> = [
  { key: 'championDamage', label: '输出' },
  { key: 'totalDamageTaken', label: '承伤' },
  { key: 'gold', label: '经济' },
  { key: 'cs', label: '补刀' },
  { key: 'visionScore', label: '视野' },
  { key: 'killParticipation', label: '参团' },
];
// 「这局的亮点」不重复顶部那几项（以及由它们换算出来的分均、占比），也不拿花钱、等级这类不算本事的数凑数。
const HIGHLIGHT_SKIP = new Set([
  ...STANDING_KEYS.map((item) => item.key),
  'damagePerMinute', 'damageShare', 'takenShare', 'goldPerMinute', 'goldShare', 'csPerMinute', 'visionPerMinute',
  'champLevel', 'champExperience', 'goldSpent', 'totalDamageDealt', 'physicalDamageDealt', 'magicDamageDealt', 'trueDamageDealt',
  'kills', 'assists', 'bountyLevel',
]);

const MIX_NAMES = ['物理', '魔法', '真实'];

interface Column {
  player: MatchParticipantSummary;
  group: DetailGroup;
  groupStart: boolean;
}

interface Row {
  metric: DetailMetric;
  extra: boolean;
  values: DetailValue[];
  numbers: Array<number | null>;
  max: number;
  /** 这一行领先的列（金色）。 */
  lead: Set<number>;
  /** 前两队的合计，用来画两队占比条。 */
  split: [number, number] | null;
  empty: boolean;
  bars: boolean;
}

interface SectionRows {
  key: DetailSectionKey;
  title: string;
  rows: Row[];
}

interface Props {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  gameDuration: number;
}

export function DetailedStatsView({ participants, targetPuuid, gameDuration }: Props) {
  const [focusPuuid, setFocusPuuid] = useState(targetPuuid);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Partial<Record<DetailSectionKey, boolean>>>({});
  const [activeSection, setActiveSection] = useState<DetailSectionKey>('combat');
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const colRefs = useRef<Array<HTMLTableColElement | null>>([]);
  const sectionRefs = useRef(new Map<DetailSectionKey, HTMLTableRowElement>());
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const hoverCol = useRef<number | null>(null);
  // 点了导航之后，平滑滚动的这一小会儿别让滚动监听把高亮抢走（滚到底时尤其明显）。
  const spyLock = useRef(0);

  useEffect(() => {
    setFocusPuuid(targetPuuid);
  }, [targetPuuid]);

  // 搜索时把表格顶到工具条下面，从第一条结果开始看。
  useEffect(() => {
    const root = rootRef.current;
    const hero = root?.firstElementChild;
    if (!root || !(hero instanceof HTMLElement) || !query.trim()) return;
    const tableTop = hero.offsetHeight;
    if (root.scrollTop > tableTop) root.scrollTop = tableTop;
  }, [query]);

  const groups = useMemo(() => buildDetailGroups(participants), [participants]);
  const columns = useMemo<Column[]>(() => groups.flatMap((group) => group.players.map((player, index) => ({
    player,
    group,
    groupStart: index === 0,
  }))), [groups]);

  const sections = useMemo<SectionRows[]>(() => {
    const ctx = buildDetailContext(groups, gameDuration);
    const [first, second] = groups;
    const canSplit = Boolean(first && second && first.tone !== 'neutral');
    return buildDetailSections(participants).map((section) => ({
      key: section.key,
      title: section.title,
      rows: [...section.core.map((metric) => ({ metric, extra: false })), ...section.more.map((metric) => ({ metric, extra: true }))]
        .map(({ metric, extra }) => {
          const values = columns.map((column) => metric.read(column.player, ctx));
          const numbers = values.map((value) => detailNumber(metric, value));
          const finite = numbers.filter((value): value is number => value !== null);
          const max = finite.length ? Math.max(...finite) : 0;
          const min = finite.length ? Math.min(...finite) : 0;
          const best = metric.best ?? 'high';
          const lead = new Set<number>();
          if (finite.length > 1 && max !== min && metric.kind !== 'mix') {
            const target = best === 'high' ? max : best === 'low' ? min : null;
            if (target !== null && (best === 'low' || target > 0)) {
              numbers.forEach((value, index) => { if (value === target) lead.add(index); });
            }
          }
          let split: [number, number] | null = null;
          if (metric.team && canSplit) {
            const sum = (group: DetailGroup) => columns.reduce((total, column, index) => (
              column.group === group ? total + (numbers[index] ?? 0) : total
            ), 0);
            const a = sum(first);
            const b = sum(second);
            if (a + b > 0) split = [a, b];
          }
          const empty = metric.kind === 'text' || metric.kind === 'kda'
            ? values.every((value) => value === null || value === '')
            : finite.length === 0 || finite.every((value) => value === 0);
          return { metric, extra, values, numbers, max, lead, split, empty, bars: min >= 0 && max > 0 && metric.kind !== 'mix' };
        }),
    }));
  }, [columns, gameDuration, groups, participants]);

  const focusIndex = Math.max(0, columns.findIndex((column) => column.player.puuid === focusPuuid));
  const focusColumn = columns[focusIndex];
  const rivalIndex = useMemo(() => {
    if (!focusColumn) return -1;
    const position = focusColumn.player.teamPosition;
    if (!POSITION_NAMES[position] || focusColumn.group.tone === 'neutral') return -1;
    return columns.findIndex((column) => column.group !== focusColumn.group && column.player.teamPosition === position);
  }, [columns, focusColumn]);

  const search = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(() => sections.map((section) => {
    if (search) {
      const rows = section.rows.filter((row) => `${row.metric.label} ${row.metric.hint ?? ''} ${row.metric.key}`.toLocaleLowerCase().includes(search));
      return { ...section, rows, hiddenMore: 0, canCollapse: false };
    }
    const open = Boolean(expanded[section.key]);
    const core = section.rows.filter((row) => !row.extra && !row.empty);
    const more = section.rows.filter((row) => row.extra && !row.empty);
    return { ...section, rows: open ? [...core, ...more] : core, hiddenMore: open ? 0 : more.length, canCollapse: open && more.length > 0 };
  }).filter((section) => section.rows.length > 0 || section.hiddenMore > 0), [expanded, search, sections]);

  const rowByKey = useMemo(() => {
    const map = new Map<string, { row: Row; section: DetailSectionKey }>();
    sections.forEach((section) => section.rows.forEach((row) => map.set(row.metric.key, { row, section: section.key })));
    return map;
  }, [sections]);

  const standings = useMemo(() => STANDING_KEYS.flatMap(({ key, label }) => {
    const found = rowByKey.get(key);
    if (!found || found.row.empty) return [];
    const value = found.row.numbers[focusIndex];
    if (value === null) return [];
    const rank = 1 + found.row.numbers.filter((other) => other !== null && other > value).length;
    return [{ key, label, rank, text: formatDetailValue(found.row.metric, found.row.values[focusIndex]) }];
  }), [focusIndex, rowByKey]);

  const highlights = useMemo(() => {
    const game: Array<{ key: string; label: string; text: string; scope: 'game' | 'team'; tied: boolean }> = [];
    const team: typeof game = [];
    // 先看常用的数据，再看「更多」里的，这样亮点优先是大家都认的项。
    const ordered = [...sections.flatMap((section) => section.rows.filter((row) => !row.extra)), ...sections.flatMap((section) => section.rows.filter((row) => row.extra))];
    ordered.forEach((row) => {
      const { metric } = row;
      if (row.empty || HIGHLIGHT_SKIP.has(metric.key) || (metric.best ?? 'high') !== 'high') return;
      const value = row.numbers[focusIndex];
      if (value === null || value <= 0) return;
      const text = formatDetailValue(metric, row.values[focusIndex]);
      if (row.lead.has(focusIndex) && row.lead.size <= 2) {
        game.push({ key: metric.key, label: metric.label, text, scope: 'game', tied: row.lead.size > 1 });
        return;
      }
      if (row.extra || !focusColumn || focusColumn.group.players.length < 2) return;
      const mates = columns.flatMap((column, index) => column.group === focusColumn.group && index !== focusIndex ? [row.numbers[index] ?? 0] : []);
      if (mates.every((mate) => mate < value)) team.push({ key: metric.key, label: metric.label, text, scope: 'team', tied: false });
    });
    return [...game.slice(0, 4), ...team.slice(0, Math.max(0, 3 - game.length))];
  }, [columns, focusColumn, focusIndex, sections]);

  // 吸顶工具条的高度会随窗口宽度换行变化，表头吸顶的位置跟着它走。
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return undefined;
    const sync = () => root.style.setProperty('--dst-bar-h', `${bar.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // 滚动时让分区导航跟着亮到当前看到的那一块。
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (spyLock.current > Date.now()) {
        window.setTimeout(schedule, spyLock.current - Date.now() + 30);
        return;
      }
      // 表头的单元格是吸顶的，thead 自己不吸，所以基准线按「容器顶 + 工具条 + 表头高度」算。
      const line = root.getBoundingClientRect().top + (barRef.current?.offsetHeight ?? 0) + (headRef.current?.offsetHeight ?? 0) + 12;
      let current: DetailSectionKey | null = null;
      for (const section of visibleSections) {
        const node = sectionRefs.current.get(section.key);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= line) current = section.key;
        else break;
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2 && visibleSections.length) {
        current = visibleSections[visibleSections.length - 1].key;
      }
      setActiveSection(current ?? visibleSections[0]?.key ?? 'combat');
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    root.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      root.removeEventListener('scroll', schedule);
    };
  }, [visibleSections]);

  const scrollToNode = (node: HTMLElement | undefined, behavior: ScrollBehavior = 'smooth') => {
    const root = rootRef.current;
    if (!root || !node) return;
    const sticky = (barRef.current?.offsetHeight ?? 0) + (headRef.current?.offsetHeight ?? 0);
    const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - sticky;
    root.scrollTo({ top: Math.max(0, top), behavior });
  };

  const jumpToSection = (key: DetailSectionKey) => {
    spyLock.current = Date.now() + 900;
    setActiveSection(key);
    scrollToNode(sectionRefs.current.get(key));
  };

  const jumpToMetric = (key: string) => {
    const found = rowByKey.get(key);
    if (!found) return;
    setQuery('');
    if (found.row.extra) setExpanded((current) => ({ ...current, [found.section]: true }));
    setFlashKey(key);
  };

  useEffect(() => {
    if (!flashKey) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const node = rowRefs.current.get(flashKey);
      if (!node) return;
      const root = rootRef.current;
      const sticky = (barRef.current?.offsetHeight ?? 0) + (headRef.current?.offsetHeight ?? 0);
      if (root) {
        const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - sticky - 40;
        root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    });
    const timer = window.setTimeout(() => setFlashKey(null), 1600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [flashKey]);

  // 鼠标所在的那一列淡淡亮起来，配合行高亮形成十字准星，看数不串行。
  const setHoverCol = (index: number | null) => {
    if (hoverCol.current === index) return;
    if (hoverCol.current !== null) colRefs.current[hoverCol.current]?.classList.remove('is-hover');
    if (index !== null) colRefs.current[index]?.classList.add('is-hover');
    hoverCol.current = index;
  };
  const onTableOver = (event: MouseEvent<HTMLTableElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-col]');
    setHoverCol(cell ? Number(cell.dataset.col) : null);
  };

  if (!focusColumn) return <div className="dst-empty">这场对局没有可以展示的详细数据</div>;

  const focus = focusColumn.player;
  const position = POSITION_NAMES[focus.teamPosition];
  const splash = focus.championSplashUrl ? { '--dst-splash': `url(${JSON.stringify(focus.championSplashUrl)})` } as CSSProperties : undefined;
  const [firstGroup, secondGroup] = groups;

  return (
    <div className="dst" ref={rootRef}>
      <section className={`dst-hero is-${focusColumn.group.tone}`} style={splash}>
        <div className="dst-hero__who">
          <span className="dst-hero__avatar"><GameIcon src={focus.championAvatar} alt="" size={48} rounded /></span>
          <div>
            <strong title={focus.riotId || playerName(focus)}>
              {playerName(focus)}
              {focus.tagLine && <small>#{focus.tagLine}</small>}
            </strong>
            <span>
              <em className={focusColumn.group.win ? 'is-win' : 'is-loss'}>{focusColumn.group.label} · {focusColumn.group.win ? '胜利' : '落败'}</em>
              {position && <> · {position}</>}
              {focus.championName && <> · {focus.championName}</>}
            </span>
          </div>
        </div>
        {standings.length > 0 && (
          <div className="dst-hero__standings" aria-label="核心数据全场排名">
            {standings.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`dst-standing${item.rank === 1 ? ' is-top' : ''}`}
                title="在表格里定位这一项"
                onClick={() => jumpToMetric(item.key)}
              >
                <span>{item.label}</span>
                <strong>{item.text}</strong>
                <small>{item.rank === 1 ? <><Crown aria-hidden="true" />全场最高</> : <>全场第 <b>{item.rank}</b></>}</small>
              </button>
            ))}
          </div>
        )}
        {highlights.length > 0 && (
          <div className="dst-hero__marks">
            <span className="dst-hero__marks-title">这局的亮点</span>
            {highlights.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`dst-mark is-${item.scope}`}
                title="在表格里定位这一项"
                onClick={() => jumpToMetric(item.key)}
              >
                <em>{item.scope === 'game' ? (item.tied ? '并列全场最高' : '全场最高') : '队内最高'}</em>
                {item.label}
                <b>{item.text}</b>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="dst-bar" ref={barRef}>
        <nav className="dst-nav" aria-label="数据分区">
          {sections.filter((section) => visibleSections.some((visible) => visible.key === section.key)).map((section) => {
            const Icon = SECTION_ICONS[section.key];
            return (
              <button
                key={section.key}
                type="button"
                aria-current={activeSection === section.key ? 'true' : undefined}
                onClick={() => jumpToSection(section.key)}
              >
                <Icon aria-hidden="true" />
                {section.title}
              </button>
            );
          })}
        </nav>
        <label className="dst-search">
          <Search aria-hidden="true" />
          <input
            value={query}
            placeholder="找一项数据，比如 视野、单杀"
            aria-label="搜索数据项"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }}
          />
          {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X /></button>}
        </label>
      </div>

      {visibleSections.length === 0 ? (
        <div className="dst-empty">
          没有找到「{query.trim()}」相关的数据
          <button type="button" onClick={() => setQuery('')}>清空搜索</button>
        </div>
      ) : (
        <table
          className="dst-table"
          style={{ '--dst-cols': columns.length } as CSSProperties}
          onMouseOver={onTableOver}
          onMouseLeave={() => setHoverCol(null)}
        >
          <colgroup>
            <col className="dst-col-label" />
            {columns.map((column, index) => (
              <col
                key={column.player.puuid}
                ref={(node) => { colRefs.current[index] = node; }}
                className={index === focusIndex ? 'is-focus' : index === rivalIndex ? 'is-rival' : undefined}
              />
            ))}
          </colgroup>
          <thead ref={headRef}>
            <tr className="dst-teams">
              <th className="dst-corner" rowSpan={2} scope="col">
                <span>数据项</span>
                {firstGroup && secondGroup && firstGroup.tone !== 'neutral' && (
                  <small className="dst-corner__legend">
                    <i aria-hidden="true" />两队合计占比
                  </small>
                )}
              </th>
              {groups.map((group) => (
                <th key={group.key} colSpan={group.players.length} scope="colgroup" className={`dst-team is-${group.tone}${group.win ? ' is-win' : ''}`}>
                  <span>{group.label}</span>
                  {group.tone !== 'neutral' && <small>{group.win ? '胜利' : '落败'}</small>}
                </th>
              ))}
            </tr>
            <tr className="dst-players">
              {columns.map((column, index) => {
                const { player } = column;
                const isFocus = index === focusIndex;
                const isRival = index === rivalIndex;
                const label = POSITION_NAMES[player.teamPosition];
                return (
                  <th
                    key={player.puuid}
                    scope="col"
                    data-col={index}
                    className={`dst-player is-${column.group.tone}${column.groupStart ? ' is-group-start' : ''}${isFocus ? ' is-focus' : ''}${isRival ? ' is-rival' : ''}`}
                  >
                    <button
                      type="button"
                      aria-pressed={isFocus}
                      title={`${player.riotId || playerName(player)}${player.championName ? ` · ${player.championName}` : ''}${isFocus ? '' : '\n点击查看这个人'}`}
                      onClick={() => setFocusPuuid(player.puuid)}
                    >
                      <span className="dst-player__avatar">
                        <GameIcon src={player.championAvatar} alt="" size={30} rounded />
                        {player.champLevel > 0 && <small>{player.champLevel}</small>}
                      </span>
                      <span className="dst-player__name">{playerName(player)}</span>
                      <span className="dst-player__pos">{isRival ? '对位' : label ?? ' '}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleSections.map((section) => {
              const Icon = SECTION_ICONS[section.key];
              return (
                <Fragment key={section.key}>
                  <tr
                    className="dst-section"
                    ref={(node) => { if (node) sectionRefs.current.set(section.key, node); else sectionRefs.current.delete(section.key); }}
                  >
                    <th colSpan={columns.length + 1} scope="rowgroup">
                      <span className="dst-section__title">
                        <i aria-hidden="true"><Icon /></i>
                        {section.title}
                      </span>
                    </th>
                  </tr>
                  {section.rows.map((row) => (
                    <StatRow
                      key={row.metric.key}
                      row={row}
                      columns={columns}
                      focusIndex={focusIndex}
                      groups={[firstGroup, secondGroup]}
                      flash={flashKey === row.metric.key}
                      rowRef={(node) => { if (node) rowRefs.current.set(row.metric.key, node); else rowRefs.current.delete(row.metric.key); }}
                    />
                  ))}
                  {(section.hiddenMore > 0 || section.canCollapse) && (
                    <tr className="dst-more">
                      <td colSpan={columns.length + 1}>
                        <button
                          type="button"
                          aria-expanded={!section.hiddenMore}
                          onClick={() => setExpanded((current) => ({ ...current, [section.key]: !current[section.key] }))}
                        >
                          <ChevronDown aria-hidden="true" />
                          {section.hiddenMore > 0
                            ? (section.rows.length > 0 ? `再看 ${section.hiddenMore} 项更细的${section.title}数据` : `展开 ${section.hiddenMore} 项${section.title}数据`)
                            : '收起'}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatRow({ row, columns, focusIndex, groups, flash, rowRef }: {
  row: Row;
  columns: Column[];
  focusIndex: number;
  groups: [DetailGroup | undefined, DetailGroup | undefined];
  flash: boolean;
  rowRef: (node: HTMLTableRowElement | null) => void;
}) {
  const { metric } = row;
  const [first, second] = groups;
  const splitShare = row.split ? row.split[0] / (row.split[0] + row.split[1]) * 100 : 0;
  const splitTitle = row.split && first && second
    ? `${first.label}合计 ${formatDetailValue(metric, row.split[0])} · ${second.label}合计 ${formatDetailValue(metric, row.split[1])}`
    : undefined;
  return (
    <tr ref={rowRef} className={`dst-row${flash ? ' is-flash' : ''}`}>
      <th scope="row" className="dst-label" title={[metric.hint, splitTitle].filter(Boolean).join('\n') || undefined}>
        <span>{metric.label}</span>
        {row.split && (
          <span className="dst-split" aria-label={splitTitle}>
            <i style={{ width: `${splitShare}%` }} />
          </span>
        )}
      </th>
      {columns.map((column, index) => {
        const value = row.values[index];
        const number = row.numbers[index];
        const lead = row.lead.has(index);
        const className = `dst-cell is-${column.group.tone}${column.groupStart ? ' is-group-start' : ''}${index === focusIndex ? ' is-focus' : ''}${lead ? ' is-lead' : ''}`;
        if (metric.kind === 'kda') {
          const player = column.player;
          return (
            <td key={column.player.puuid} data-col={index} className={className}>
              <span className="dst-kda"><b>{player.kills}</b>/<em>{player.deaths}</em>/<b>{player.assists}</b></span>
            </td>
          );
        }
        if (metric.kind === 'mix' && metric.parts) {
          const parts = metric.parts(column.player);
          const total = parts[0] + parts[1] + parts[2];
          const top = total > 0 ? parts.indexOf(Math.max(...parts)) : -1;
          return (
            <td
              key={column.player.puuid}
              data-col={index}
              className={className}
              title={total > 0 ? parts.map((part, partIndex) => `${MIX_NAMES[partIndex]} ${Math.round(part).toLocaleString('zh-CN')}`).join(' · ') : undefined}
            >
              {total > 0 ? (
                <span className="dst-mix">
                  <span className="dst-mix__bar">
                    {parts.map((part, partIndex) => part > 0 && <i key={MIX_NAMES[partIndex]} className={`is-${partIndex}`} style={{ flexGrow: part }} />)}
                  </span>
                  <small>{MIX_NAMES[top]} {Math.round(parts[top] / total * 100)}%</small>
                </span>
              ) : <span className="dst-v is-none">—</span>}
            </td>
          );
        }
        const text = formatDetailValue(metric, value);
        return (
          <td key={column.player.puuid} data-col={index} className={className}>
            <span className={`dst-v${text === '—' ? ' is-none' : ''}`}>{text}</span>
            {row.bars && number !== null && number > 0 && (
              <i className="dst-meter" style={{ '--dst-w': `${Math.max(4, number / row.max * 100)}%` } as CSSProperties} />
            )}
          </td>
        );
      })}
    </tr>
  );
}
