import { useMemo, useState, type CSSProperties } from 'react';
import { GameIcon } from './GameIcon';
import type {
  MatchParticipantStats,
  MatchParticipantSummary,
  PlayerMatchDetail,
  PlayerRuneSummary,
} from '../../../shared/api';
import type { RecurringMate } from './MatchList';

type DetailTab = 'scoreboard' | 'overview' | 'stats' | 'charts' | 'runes';

interface MatchDetailProps {
  match: PlayerMatchDetail;
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}

interface ChartMetric {
  key: string;
  label: string;
  value: (participant: MatchParticipantSummary) => number;
}

interface StatsMetric {
  key: string;
  label: string;
  value?: (participant: MatchParticipantSummary) => number;
  text?: (participant: MatchParticipantSummary) => string;
}

interface StatsGroup {
  title: string;
  metrics: StatsMetric[];
}

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'scoreboard', label: '计分板' },
  { key: 'overview', label: '总览' },
  { key: 'stats', label: '统计' },
  { key: 'charts', label: '图表' },
  { key: 'runes', label: '符文' },
];

const CHART_METRICS: ChartMetric[] = [
  { key: 'championDamage', label: '对英雄造成伤害', value: (p) => p.damage },
  { key: 'totalDamage', label: '造成的总伤害', value: (p) => stat(p, 'totalDamageDealt') },
  { key: 'physicalDamage', label: '造成物理伤害', value: (p) => stat(p, 'physicalDamageDealtToChampions') },
  { key: 'magicDamage', label: '造成魔法伤害', value: (p) => stat(p, 'magicDamageDealtToChampions') },
  { key: 'trueDamage', label: '造成真实伤害', value: (p) => stat(p, 'trueDamageDealtToChampions') },
  { key: 'damageTaken', label: '承受伤害', value: (p) => stat(p, 'totalDamageTaken') },
  { key: 'selfMitigated', label: '自我缓和的伤害', value: (p) => stat(p, 'damageSelfMitigated') },
  { key: 'gold', label: '获得金币', value: (p) => p.gold },
  { key: 'vision', label: '视野得分', value: (p) => stat(p, 'visionScore') },
  { key: 'healing', label: '治疗效果', value: (p) => stat(p, 'totalHeal') },
];

const STATS_GROUPS: StatsGroup[] = [
  {
    title: '战斗',
    metrics: [
      { key: 'kda', label: '战损比', text: (p) => `${p.kills}/${p.deaths}/${p.assists}` },
      { key: 'largestKillingSpree', label: '最高连杀', value: (p) => stat(p, 'largestKillingSpree') },
      { key: 'largestMultiKill', label: '最高多杀', value: (p) => stat(p, 'largestMultiKill') },
      { key: 'timeCCingOthers', label: '控制得分', value: (p) => stat(p, 'timeCCingOthers') },
      {
        key: 'firstBlood',
        label: '三杀 / 四杀 / 五杀',
        text: (p) => `${stat(p, 'tripleKills')}/${stat(p, 'quadraKills')}/${stat(p, 'pentaKills')}`,
      },
    ],
  },
  {
    title: '造成伤害',
    metrics: [
      { key: 'championDamage', label: '对英雄的伤害总和', value: (p) => p.damage },
      {
        key: 'physicalChampionDamage',
        label: '对英雄的物理伤害',
        value: (p) => stat(p, 'physicalDamageDealtToChampions'),
      },
      {
        key: 'magicChampionDamage',
        label: '对英雄的魔法伤害',
        value: (p) => stat(p, 'magicDamageDealtToChampions'),
      },
      {
        key: 'trueChampionDamage',
        label: '对英雄的真实伤害',
        value: (p) => stat(p, 'trueDamageDealtToChampions'),
      },
      { key: 'totalDamage', label: '造成的伤害总和', value: (p) => stat(p, 'totalDamageDealt') },
      { key: 'physicalDamage', label: '造成的物理伤害', value: (p) => stat(p, 'physicalDamageDealt') },
      { key: 'magicDamage', label: '造成的魔法伤害', value: (p) => stat(p, 'magicDamageDealt') },
      { key: 'trueDamage', label: '造成的真实伤害', value: (p) => stat(p, 'trueDamageDealt') },
      { key: 'largestCrit', label: '最大暴击伤害', value: (p) => stat(p, 'largestCriticalStrike') },
    ],
  },
  {
    title: '承受与资源',
    metrics: [
      { key: 'totalTaken', label: '承受伤害', value: (p) => stat(p, 'totalDamageTaken') },
      { key: 'physicalTaken', label: '承受物理伤害', value: (p) => stat(p, 'physicalDamageTaken') },
      { key: 'magicTaken', label: '承受魔法伤害', value: (p) => stat(p, 'magicDamageTaken') },
      { key: 'trueTaken', label: '承受真实伤害', value: (p) => stat(p, 'trueDamageTaken') },
      { key: 'mitigated', label: '自我缓和的伤害', value: (p) => stat(p, 'damageSelfMitigated') },
      { key: 'heal', label: '输出治疗效果', value: (p) => stat(p, 'totalHeal') },
      {
        key: 'shield',
        label: '给予队友护盾',
        value: (p) => stat(p, 'totalDamageShieldedOnTeammates'),
      },
      { key: 'gold', label: '获得金币', value: (p) => p.gold },
      { key: 'goldSpent', label: '花费金币', value: (p) => stat(p, 'goldSpent') },
      { key: 'cs', label: '补刀', value: (p) => p.cs },
    ],
  },
  {
    title: '视野',
    metrics: [
      { key: 'visionScore', label: '视野得分', value: (p) => stat(p, 'visionScore') },
      { key: 'wardsPlaced', label: '放置守卫', value: (p) => stat(p, 'wardsPlaced') },
      { key: 'wardsKilled', label: '击杀守卫', value: (p) => stat(p, 'wardsKilled') },
      { key: 'detectorWardsPlaced', label: '控制守卫', value: (p) => stat(p, 'detectorWardsPlaced') },
    ],
  },
];

const POSITION_LABELS: Record<string, string> = {
  TOP: '上路',
  JUNGLE: '打野',
  MIDDLE: '中路',
  MID: '中路',
  BOTTOM: '下路',
  UTILITY: '辅助',
  SUPPORT: '辅助',
};

function stat(participant: MatchParticipantSummary, key: keyof MatchParticipantStats): number {
  const value = participant.stats?.[key] ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatInteger(value: number): string {
  return Math.round(value || 0).toLocaleString('zh-CN');
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor((seconds || 0) / 60);
  const rest = Math.floor((seconds || 0) % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function teamLabel(teamId: number): string {
  return teamId === 100 ? '蓝色方' : '红色方';
}

function teamTone(teamId: number): string {
  return teamId === 100 ? 'blue' : 'red';
}

function playerName(participant: MatchParticipantSummary): string {
  return participant.riotId || participant.summonerName || '未知玩家';
}

function positionLabel(position: string): string {
  return (POSITION_LABELS[position.toUpperCase()] ?? position) || '—';
}

function itemSlots(participant: MatchParticipantSummary): Array<MatchParticipantSummary['items'][number] | undefined> {
  return Array.from({ length: 7 }, (_, slot) => participant.items.find((item) => item.slot === slot));
}

function visibleRunes(participant: MatchParticipantSummary, limit = 4): PlayerRuneSummary[] {
  const runes = participant.runes?.length
    ? participant.runes
    : [participant.primaryRune, participant.secondaryRune].filter((rune): rune is PlayerRuneSummary => Boolean(rune));
  return runes.slice(0, limit);
}

function teamTotals(players: MatchParticipantSummary[]) {
  return players.reduce(
    (acc, player) => {
      acc.kills += player.kills;
      acc.deaths += player.deaths;
      acc.assists += player.assists;
      acc.gold += player.gold;
      acc.damage += player.damage;
      acc.cs += player.cs;
      acc.vision += stat(player, 'visionScore');
      return acc;
    },
    { kills: 0, deaths: 0, assists: 0, gold: 0, damage: 0, cs: 0, vision: 0 },
  );
}

function maxBy(
  players: MatchParticipantSummary[],
  getter: (participant: MatchParticipantSummary) => number,
): MatchParticipantSummary | null {
  return players.reduce<MatchParticipantSummary | null>((best, player) => {
    if (!best) return player;
    return getter(player) > getter(best) ? player : best;
  }, null);
}

export function MatchDetail({ match, targetPuuid, recurringMates, onPlayerSearch }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('scoreboard');
  const [chartMetricKey, setChartMetricKey] = useState(CHART_METRICS[0].key);

  const participants = useMemo(
    () => [...match.participants].sort((a, b) => a.teamId - b.teamId || b.kills - a.kills),
    [match.participants],
  );
  const target = participants.find((p) => p.puuid === targetPuuid) ?? participants[0];
  const selectedChartMetric =
    CHART_METRICS.find((metric) => metric.key === chartMetricKey) ?? CHART_METRICS[0];

  if (!target) {
    return <div className="lol-postgame lol-postgame-empty">暂无这场对局的详细数据</div>;
  }

  return (
    <div className={`lol-postgame lol-postgame--${target.win ? 'win' : 'loss'}`}>
      <div className="lol-postgame-hero">
        <div className="lol-postgame-result-mark" aria-hidden="true">
          <GameIcon src={target.championAvatar} alt={target.championName} size={42} rounded />
        </div>
        <div className="min-w-0">
          <div className="lol-postgame-result">{target.win ? '胜利' : '失败'}</div>
          <div className="lol-postgame-meta">
            <span>{target.championName}</span>
            <span>{match.queueName}</span>
            <span>{formatDuration(match.gameDuration)}</span>
            <span>{formatDate(match.gameCreation)}</span>
            <span>游戏ID {match.gameId}</span>
          </div>
        </div>
      </div>

      <div className="lol-postgame-tabs" role="tablist" aria-label="战绩详情标签">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`lol-postgame-tab ${activeTab === tab.key ? 'lol-postgame-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="lol-postgame-content">
        {activeTab === 'scoreboard' && (
          <ScoreboardTab
            participants={participants}
            targetPuuid={targetPuuid}
            recurringMates={recurringMates}
            onPlayerSearch={onPlayerSearch}
          />
        )}
        {activeTab === 'overview' && <OverviewTab participants={participants} targetPuuid={targetPuuid} />}
        {activeTab === 'stats' && <StatsTab participants={participants} targetPuuid={targetPuuid} />}
        {activeTab === 'charts' && (
          <ChartsTab
            participants={participants}
            targetPuuid={targetPuuid}
            selectedMetric={selectedChartMetric}
            selectedMetricKey={chartMetricKey}
            onSelectMetric={setChartMetricKey}
          />
        )}
        {activeTab === 'runes' && (
          <RunesTab
            participants={participants}
            targetPuuid={targetPuuid}
            onPlayerSearch={onPlayerSearch}
          />
        )}
      </div>
    </div>
  );
}

function ScoreboardTab({
  participants,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}) {
  return (
    <div className="lol-scoreboard">
      {[100, 200].map((id) => (
        <ScoreboardTeam
          key={id}
          teamId={id}
          players={participants.filter((player) => player.teamId === id)}
          targetPuuid={targetPuuid}
          recurringMates={recurringMates}
          onPlayerSearch={onPlayerSearch}
        />
      ))}
    </div>
  );
}

function ScoreboardTeam({
  teamId,
  players,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
}: {
  teamId: number;
  players: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}) {
  const totals = teamTotals(players);
  const tone = teamTone(teamId);
  const won = players[0]?.win ?? false;

  return (
    <section className={`lol-score-team lol-score-team--${tone}`}>
      <div className="lol-score-team-bar">
        <div className="lol-score-team-title">
          <span className="lol-score-team-line" />
          <span>{teamLabel(teamId)}</span>
          <span className="lol-score-team-result">{won ? 'WIN' : 'LOSE'}</span>
        </div>
        <div className="lol-score-team-total">{`${totals.kills} / ${totals.deaths} / ${totals.assists}`}</div>
        <div className="lol-score-team-total">{formatInteger(totals.gold)}</div>
      </div>
      <div className="lol-score-grid lol-score-grid--head">
        <span>玩家</span>
        <span>符文 / 强化</span>
        <span>装备</span>
        <span>KDA</span>
        <span>经济</span>
        <span>伤害</span>
        <span>补刀</span>
      </div>
      {players.map((player) => (
        <ScoreboardRow
          key={`${player.puuid}-${player.championId}`}
          participant={player}
          isTarget={player.puuid === targetPuuid}
          isRecurring={player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid))}
          onPlayerSearch={onPlayerSearch}
        />
      ))}
    </section>
  );
}

function ScoreboardRow({
  participant,
  isTarget,
  isRecurring,
  onPlayerSearch,
}: {
  participant: MatchParticipantSummary;
  isTarget: boolean;
  isRecurring: boolean;
  onPlayerSearch?: (riotId: string) => void;
}) {
  const slots = itemSlots(participant);
  const runes = visibleRunes(participant);
  const name = playerName(participant);

  return (
    <div
      className={`lol-score-grid lol-score-row ${isTarget ? 'lol-score-row--target' : ''} ${
        isRecurring ? 'lol-score-row--recurring' : ''
      }`}
    >
      <div className="lol-score-player">
        <div className="lol-score-spells">
          {participant.spells.map((spell) => (
            <GameIcon key={`${participant.puuid}-${spell.id}`} src={spell.icon} alt={spell.name} title={spell.name} size={18} />
          ))}
        </div>
        <div className="lol-score-champion">
          <GameIcon
            src={participant.championAvatar}
            alt={participant.championName}
            title={`${participant.championName} Lv.${participant.champLevel}`}
            size={38}
            rounded
          />
          <span>{participant.champLevel}</span>
        </div>
        <div className="lol-score-player-copy">
          <button
            type="button"
            className="lol-score-player-name"
            title={name}
            onClick={() => onPlayerSearch?.(name)}
          >
            {name}
          </button>
          <span>{positionLabel(participant.teamPosition)}</span>
        </div>
      </div>
      <div className="lol-score-runes">
        {runes.length > 0 ? (
          runes.map((rune) => (
            <GameIcon key={`${participant.puuid}-${rune.id}`} src={rune.icon} alt={rune.name} title={rune.name} size={22} rounded />
          ))
        ) : (
          <span className="lol-score-empty">—</span>
        )}
      </div>
      <div className="lol-score-items">
        {slots.map((item, slot) =>
          item ? (
            <GameIcon
              key={`${participant.puuid}-${slot}-${item.id}`}
              src={item.icon}
              alt={item.name}
              title={item.name}
              size={24}
            />
          ) : (
            <span key={`${participant.puuid}-${slot}`} className="lol-score-item-empty" />
          ),
        )}
      </div>
      <div className="lol-score-kda">
        <strong>{`${participant.kills} / ${participant.deaths} / ${participant.assists}`}</strong>
        <span>{participant.kda.toFixed(2)} KDA</span>
      </div>
      <span className="lol-score-number">{formatCompact(participant.gold)}</span>
      <span className="lol-score-number">{formatCompact(participant.damage)}</span>
      <span className="lol-score-number">{participant.cs}</span>
    </div>
  );
}

function OverviewTab({
  participants,
  targetPuuid,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
}) {
  const blue = participants.filter((player) => player.teamId === 100);
  const red = participants.filter((player) => player.teamId === 200);
  const leaders = [
    { label: '最高伤害', player: maxBy(participants, (p) => p.damage), value: (p: MatchParticipantSummary) => formatInteger(p.damage) },
    { label: '最高经济', player: maxBy(participants, (p) => p.gold), value: (p: MatchParticipantSummary) => formatInteger(p.gold) },
    { label: '最高视野', player: maxBy(participants, (p) => stat(p, 'visionScore')), value: (p: MatchParticipantSummary) => formatInteger(stat(p, 'visionScore')) },
    { label: '最佳 KDA', player: maxBy(participants, (p) => p.kda), value: (p: MatchParticipantSummary) => p.kda.toFixed(2) },
  ];

  return (
    <div className="lol-overview">
      <div className="lol-overview-teams">
        <TeamOverviewCard teamId={100} players={blue} />
        <TeamOverviewCard teamId={200} players={red} />
      </div>
      <div className="lol-overview-leaders">
        {leaders.map((leader) =>
          leader.player ? (
            <div
              key={leader.label}
              className={`lol-overview-card ${leader.player.puuid === targetPuuid ? 'lol-overview-card--target' : ''}`}
            >
              <span>{leader.label}</span>
              <div>
                <GameIcon
                  src={leader.player.championAvatar}
                  alt={leader.player.championName}
                  title={leader.player.championName}
                  size={34}
                  rounded
                />
                <div className="min-w-0">
                  <strong>{playerName(leader.player)}</strong>
                  <small>{leader.value(leader.player)}</small>
                </div>
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function TeamOverviewCard({ teamId, players }: { teamId: number; players: MatchParticipantSummary[] }) {
  const totals = teamTotals(players);
  const tone = teamTone(teamId);
  const won = players[0]?.win ?? false;

  return (
    <section className={`lol-overview-team lol-overview-team--${tone}`}>
      <div className="lol-overview-team-head">
        <span>{teamLabel(teamId)}</span>
        <strong>{won ? '胜利' : '失败'}</strong>
      </div>
      <div className="lol-overview-team-grid">
        <div>
          <span>K / D / A</span>
          <strong>{`${totals.kills} / ${totals.deaths} / ${totals.assists}`}</strong>
        </div>
        <div>
          <span>总经济</span>
          <strong>{formatInteger(totals.gold)}</strong>
        </div>
        <div>
          <span>总伤害</span>
          <strong>{formatInteger(totals.damage)}</strong>
        </div>
        <div>
          <span>总补刀</span>
          <strong>{formatInteger(totals.cs)}</strong>
        </div>
      </div>
    </section>
  );
}

function StatsTab({
  participants,
  targetPuuid,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
}) {
  const gridStyle = {
    gridTemplateColumns: `180px repeat(${participants.length}, minmax(74px, 1fr))`,
  } as CSSProperties;

  return (
    <div className="lol-stats">
      <div className="lol-stats-grid lol-stats-grid--icons" style={gridStyle}>
        <span />
        {participants.map((player) => (
          <GameIcon
            key={`${player.puuid}-icon`}
            src={player.championAvatar}
            alt={player.championName}
            title={playerName(player)}
            size={32}
            rounded
            className={player.teamId === 100 ? 'lol-stats-avatar--blue' : 'lol-stats-avatar--red'}
          />
        ))}
      </div>
      {STATS_GROUPS.map((group) => (
        <section key={group.title}>
          <div className="lol-stats-group-title">{group.title}</div>
          {group.metrics.map((metric) => (
            <div key={metric.key} className="lol-stats-grid lol-stats-row" style={gridStyle}>
              <span className="lol-stats-label">{metric.label}</span>
              {participants.map((player) => (
                <span
                  key={`${metric.key}-${player.puuid}`}
                  className={`lol-stats-value ${player.puuid === targetPuuid ? 'lol-stats-value--target' : ''}`}
                >
                  {metric.text ? metric.text(player) : formatInteger(metric.value?.(player) ?? 0)}
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ChartsTab({
  participants,
  targetPuuid,
  selectedMetric,
  selectedMetricKey,
  onSelectMetric,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  selectedMetric: ChartMetric;
  selectedMetricKey: string;
  onSelectMetric: (key: string) => void;
}) {
  const maxValue = Math.max(1, ...participants.map((player) => selectedMetric.value(player)));

  return (
    <div className="lol-charts">
      <aside className="lol-chart-picker">
        {CHART_METRICS.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={`lol-chart-option ${selectedMetricKey === metric.key ? 'lol-chart-option--active' : ''}`}
            onClick={() => onSelectMetric(metric.key)}
          >
            <span className="lol-chart-checkbox" />
            {metric.label}
          </button>
        ))}
      </aside>
      <div className="lol-chart-bars">
        <div className="lol-chart-title">{selectedMetric.label}</div>
        {participants.map((player) => {
          const value = selectedMetric.value(player);
          const width = Math.max(4, Math.round((value / maxValue) * 100));
          return (
            <div key={`${selectedMetric.key}-${player.puuid}`} className="lol-chart-row">
              <GameIcon
                src={player.championAvatar}
                alt={player.championName}
                title={playerName(player)}
                size={28}
                rounded
              />
              <div className="lol-chart-track">
                <div
                  className={`lol-chart-bar lol-chart-bar--${teamTone(player.teamId)} ${
                    player.puuid === targetPuuid ? 'lol-chart-bar--target' : ''
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span>{formatInteger(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunesTab({
  participants,
  targetPuuid,
  onPlayerSearch,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  onPlayerSearch?: (riotId: string) => void;
}) {
  return (
    <div className="lol-runes-panel">
      {participants.map((player) => {
        const runes = visibleRunes(player, 8);
        const name = playerName(player);
        return (
          <div
            key={`${player.puuid}-runes`}
            className={`lol-runes-row ${player.puuid === targetPuuid ? 'lol-runes-row--target' : ''}`}
          >
            <div className="lol-runes-player">
              <GameIcon src={player.championAvatar} alt={player.championName} title={player.championName} size={34} rounded />
              <button type="button" onClick={() => onPlayerSearch?.(name)}>{name}</button>
            </div>
            <div className="lol-runes-spells">
              {player.spells.map((spell) => (
                <GameIcon key={`${player.puuid}-rune-spell-${spell.id}`} src={spell.icon} alt={spell.name} title={spell.name} size={22} />
              ))}
            </div>
            <div className="lol-runes-main">
              {player.primaryRune ? (
                <GameIcon src={player.primaryRune.icon} alt={player.primaryRune.name} title={`主符文：${player.primaryRune.name}`} size={26} rounded />
              ) : (
                <span className="lol-score-empty">主符文 —</span>
              )}
              {player.secondaryRune ? (
                <GameIcon src={player.secondaryRune.icon} alt={player.secondaryRune.name} title={`副符文：${player.secondaryRune.name}`} size={22} rounded />
              ) : (
                <span className="lol-score-empty">副符文 —</span>
              )}
            </div>
            <div className="lol-runes-all">
              {runes.length > 0 ? (
                runes.map((rune) => (
                  <GameIcon key={`${player.puuid}-rune-${rune.id}`} src={rune.icon} alt={rune.name} title={rune.name} size={22} rounded />
                ))
              ) : (
                <span className="lol-score-empty">暂无符文数据</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
