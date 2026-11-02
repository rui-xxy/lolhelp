import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Clock3, EyeOff, History, LoaderCircle, MonitorPlay, RefreshCw, Users } from 'lucide-react';
import type {
  PlayerActiveGame,
  PlayerDossier,
  PlayerMatchBrief,
  PlayerMatchBriefMate,
  PlayerRankSummary,
  SavedMatchPreview,
} from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { GameIcon } from '../match/GameIcon';
import { tierLabel } from '../ui/kit';
import { ChampionSplash, ResultDots, useChampionCatalog } from './HubArt';
import { currentStreak, dayLabel, formatAgo, formatClock, formatDuration, groupSessions, splitRiotId } from './hubFormat';

// 玩家档案。关注一个人，想知道的就三件事：他在玩什么、和谁玩、打得怎么样，外加几条基础信息。
// 所以从上到下是：基础信息一行 → 「现在」（正在打的这局，或者上一局）→ 按时段分组的最近动态；
// 右边窄栏是战绩、在玩的英雄和模式、常一起玩的人、收藏和挑战。「我的玩家」和「消息」的好友申请都用这一套。

interface ProfileData {
  dossier: PlayerDossier | null;
  dossierError: string;
  ranks: PlayerRankSummary[] | null;
  matches: PlayerMatchBrief[];
  mates: PlayerMatchBriefMate[];
  briefError: string;
}

const profileCache = new Map<string, { at: number; data: ProfileData }>();
const PROFILE_CACHE_MS = 3 * 60_000;

function errorText(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason ?? '');
  return /No handler registered/i.test(text) ? '请重启助手' : text;
}

function usePlayerProfile(puuid: string, region?: string): { data: ProfileData | null; loading: boolean; reload: () => void } {
  const key = `${region ?? ''}:${puuid}`;
  const cached = profileCache.get(key);
  const fresh = cached && Date.now() - cached.at < PROFILE_CACHE_MS ? cached.data : null;
  const [data, setData] = useState<ProfileData | null>(fresh);
  const [loading, setLoading] = useState(!fresh);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const hit = profileCache.get(key);
    if (nonce === 0 && hit && Date.now() - hit.at < PROFILE_CACHE_MS) {
      setData(hit.data);
      setLoading(false);
      return undefined;
    }
    if (!puuid) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const match = window.lolHelper.match;
    void Promise.allSettled([
      typeof match.getPlayerDossier === 'function' ? match.getPlayerDossier(puuid, region) : Promise.reject(new Error('请重启助手')),
      match.getPlayerRanks(puuid, region),
      match.getMatchBriefs({ puuid, region, count: 20 }),
    ]).then(([dossier, ranks, briefs]) => {
      if (cancelled) return;
      const next: ProfileData = {
        dossier: dossier.status === 'fulfilled' ? dossier.value : null,
        dossierError: dossier.status === 'fulfilled' ? dossier.value.error ?? '' : errorText(dossier.reason),
        ranks: ranks.status === 'fulfilled' ? ranks.value : null,
        matches: briefs.status === 'fulfilled' ? briefs.value.matches : [],
        mates: briefs.status === 'fulfilled' ? briefs.value.mates : [],
        briefError: briefs.status === 'fulfilled' ? briefs.value.error ?? '' : errorText(briefs.reason),
      };
      profileCache.set(key, { at: Date.now(), data: next });
      setData(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [key, nonce, puuid, region]);

  const reload = useCallback(() => {
    profileCache.delete(key);
    setNonce((value) => value + 1);
  }, [key]);

  return { data, loading, reload };
}

interface SkinInfo {
  name: string;
  splash: string;
}

const skinCache = new Map<number, SkinInfo | null>();

/** 生涯背景皮肤的名字和原画（按英雄读一次皮肤表）。 */
function useSkin(skinId: number | null | undefined): SkinInfo | null {
  const [info, setInfo] = useState<SkinInfo | null>(() => (skinId ? skinCache.get(skinId) ?? null : null));
  useEffect(() => {
    if (!skinId) {
      setInfo(null);
      return undefined;
    }
    if (skinCache.has(skinId)) {
      setInfo(skinCache.get(skinId) ?? null);
      return undefined;
    }
    const championId = Math.floor(skinId / 1000);
    const fallback: SkinInfo = { name: '', splash: `https://game.gtimg.cn/images/lol/act/img/skin/big${skinId}.jpg` };
    setInfo(fallback);
    if (typeof window.lolHelper.assist?.getChampionSkins !== 'function') return undefined;
    let cancelled = false;
    window.lolHelper.assist.getChampionSkins(championId)
      .then((skins) => {
        const skin = skins.find((item) => item.id === skinId);
        const next = skin ? { name: skin.name, splash: skin.splash || fallback.splash } : fallback;
        skinCache.set(skinId, next);
        if (!cancelled) setInfo(next);
      })
      .catch(() => {
        skinCache.set(skinId, fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [skinId]);
  return info;
}

const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const QUEUES = [
  { type: 'RANKED_SOLO_5x5', label: '单双排', short: '单双' },
  { type: 'RANKED_FLEX_SR', label: '灵活排位', short: '灵活' },
] as const;

function realTier(tier?: string | null): string {
  const value = (tier ?? '').toUpperCase();
  return TIER_ORDER.includes(value) ? value : '';
}

function tierStyle(tier: string): CSSProperties {
  const value = realTier(tier);
  return value ? ({ '--tier': `var(--color-tier-${value.toLowerCase()})` } as CSSProperties) : {};
}

function rankDivision(rank: PlayerRankSummary): string {
  const tier = rank.tier.toUpperCase();
  const apex = tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER';
  return [tierLabel(tier), apex ? '' : rank.division].filter(Boolean).join(' ');
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('zh-CN');
}

function percentileText(percentile: number | null): string {
  if (percentile === null || percentile <= 0) return '';
  const value = percentile * 100;
  return `前 ${value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

export function ExpRing({ size, progress }: { size: number; progress: number | null }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = progress === null ? 0 : Math.min(1, Math.max(0, progress));
  return (
    <svg className="pv-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="pv-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
      <circle
        className="pv-ring__value"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference * value} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const LIVE_REFRESH_MS = 30_000;

/** 当前对局：打开档案时查一次，之后每 30 秒查一次。 */
function useActiveGame(puuid: string): PlayerActiveGame | null {
  const [game, setGame] = useState<PlayerActiveGame | null>(null);
  useEffect(() => {
    setGame(null);
    if (!puuid || typeof window.lolHelper.match.getActiveGame !== 'function') return undefined;
    let cancelled = false;
    const load = () => {
      window.lolHelper.match.getActiveGame(puuid)
        .then((value) => {
          if (!cancelled) setGame(value);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [puuid]);
  return game;
}

/** 每秒走一次的时钟，只在需要时启用。 */
function useTicker(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}

function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function championSplash(championId: number): string {
  return championId > 0 ? `https://game.gtimg.cn/images/lol/act/img/skin/big${championId}000.jpg` : '';
}

export interface PlayerProfileViewProps {
  puuid: string;
  riotId: string;
  /** 查询用的大区码；空表示客户端当前大区。 */
  region?: string;
  regionName?: string;
  iconId?: number;
  iconUrl?: string;
  iconUrls?: string[];
  fallbackLevel?: number;
  fallbackRanks?: PlayerRankSummary[];
  /** 战绩查询时顺带拿到的英雄 / 皮肤数，档案接口没拿到时先用它。 */
  fallbackCollection?: { champions?: number | null; skins?: number | null };
  /** 名字旁边的状态标签。 */
  tags?: ReactNode;
  /** 对方附带的留言（好友申请）。 */
  note?: string;
  /** 右上角的操作按钮。 */
  actions: ReactNode;
  onViewPlayer?: (riotId: string, region?: string) => void;
  /** 「我的玩家」里保存的对局。 */
  saved?: {
    matches: SavedMatchPreview[];
    opening: boolean;
    onOpen: () => void;
  };
}

interface MateLine {
  mate: PlayerMatchBriefMate;
  games: number;
  wins: number;
}

export function PlayerProfileView({
  puuid,
  riotId,
  region,
  regionName,
  iconId,
  iconUrl,
  iconUrls,
  fallbackLevel,
  fallbackRanks = [],
  fallbackCollection,
  tags,
  note,
  actions,
  onViewPlayer,
  saved,
}: PlayerProfileViewProps) {
  const { name, tag } = splitRiotId(riotId);
  const { data, loading, reload } = usePlayerProfile(puuid, region);
  const dossier = data?.dossier ?? null;
  const skin = useSkin(dossier?.backgroundSkinId);
  const champions = useChampionCatalog();
  const live = useActiveGame(puuid);
  const inGame = Boolean(live?.inGame);
  const now = useTicker(inGame);
  const [spectateText, setSpectateText] = useState('');
  const [openSession, setOpenSession] = useState<string | null>(null);

  const championName = useCallback(
    (championId: number, fallback = '') => {
      const champion = champions.get(championId);
      return champion?.title || champion?.name || fallback;
    },
    [champions],
  );

  const matches = useMemo(
    () => [...(data?.matches ?? [])].sort((left, right) => right.gameCreation - left.gameCreation),
    [data],
  );
  const mateById = useMemo(() => new Map((data?.mates ?? []).map((mate) => [mate.puuid, mate])), [data]);
  const sessions = useMemo(() => groupSessions(matches), [matches]);
  const streak = useMemo(() => currentStreak(matches), [matches]);

  const form = useMemo(() => {
    const games = matches.length;
    const wins = matches.filter((match) => match.win).length;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    const byChampion = new Map<number, { avatar: string; fallback: string; games: number; wins: number }>();
    const byQueue = new Map<string, number>();
    for (const match of matches) {
      kills += match.kills;
      deaths += match.deaths;
      assists += match.assists;
      const entry = byChampion.get(match.championId) ?? { avatar: match.championAvatar, fallback: match.championName, games: 0, wins: 0 };
      entry.games += 1;
      entry.wins += match.win ? 1 : 0;
      byChampion.set(match.championId, entry);
      const queue = match.queueName || '其他';
      byQueue.set(queue, (byQueue.get(queue) ?? 0) + 1);
    }
    return {
      games,
      wins,
      winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
      kda: (kills + assists) / Math.max(1, deaths),
      avg: games > 0 ? `${(kills / games).toFixed(1)} / ${(deaths / games).toFixed(1)} / ${(assists / games).toFixed(1)}` : '',
      champions: [...byChampion.entries()]
        .map(([championId, entry]) => ({ championId, ...entry }))
        .sort((left, right) => right.games - left.games || right.wins - left.wins),
      queues: [...byQueue.entries()].sort((left, right) => right[1] - left[1]),
    };
  }, [matches]);

  // 每个常一起玩的人：一起打了几局、一起时赢了几局。
  const mateLines = useMemo<MateLine[]>(() => {
    const stats = new Map<string, { games: number; wins: number }>();
    for (const match of matches) {
      for (const id of match.mates) {
        const entry = stats.get(id) ?? { games: 0, wins: 0 };
        entry.games += 1;
        entry.wins += match.win ? 1 : 0;
        stats.set(id, entry);
      }
    }
    return [...stats.entries()]
      .map(([id, entry]) => ({ mate: mateById.get(id), ...entry }))
      .filter((line): line is MateLine => Boolean(line.mate))
      .sort((left, right) => right.games - left.games)
      .slice(0, 5);
  }, [mateById, matches]);

  const ranks = (data?.ranks ?? fallbackRanks).filter((rank) => realTier(rank.tier));
  const level = dossier?.level ?? fallbackLevel ?? 0;
  const expProgress = dossier?.expPoints !== null && dossier?.expPoints !== undefined && dossier.expToNextLevel
    ? dossier.expToNextLevel > dossier.expPoints
      ? dossier.expPoints / dossier.expToNextLevel
      : dossier.expPoints / (dossier.expPoints + dossier.expToNextLevel)
    : null;
  const isPrivate = dossier?.privacy === 'PRIVATE';
  const lastSeen = Math.max(dossier?.lastGameDate ?? 0, matches[0] ? matches[0].gameCreation + matches[0].gameDuration * 1000 : 0);
  const collection = dossier?.collection && Object.values(dossier.collection).some((value) => value !== null)
    ? dossier.collection
    : fallbackCollection && (fallbackCollection.champions != null || fallbackCollection.skins != null)
      ? { champions: fallbackCollection.champions ?? null, skins: fallbackCollection.skins ?? null, chromas: null, icons: null, emotes: null, wards: null }
      : null;
  const dossierIncomplete = Boolean(data && (!dossier || !dossier.challengePoints || !dossier.collection.skins));
  const dossierError = data?.dossierError || dossier?.error || (dossier?.diagnostics ?? []).join('\n');
  const last = matches[0];
  const lastMates = last ? last.mates.map((id) => mateById.get(id)).filter((mate): mate is PlayerMatchBriefMate => Boolean(mate)) : [];
  const liveTeam = live?.inGame
    ? live.players.filter((player) => player.puuid !== puuid && (!live.teamId || player.teamId === live.teamId))
    : [];
  const banner = live?.championId
    ? championSplash(live.championId)
    : skin?.splash || (last ? last.championSplashUrl || championSplash(last.championId) : '');

  const spectate = async () => {
    setSpectateText('正在启动…');
    try {
      const result = await window.lolHelper.lcu.spectateFriend(puuid);
      setSpectateText(result.success ? '' : result.message || '观战失败');
    } catch (error) {
      setSpectateText(error instanceof Error ? error.message : '观战失败');
    }
  };

  const playerChip = (id: string, displayRiotId: string, icon: number, iconSrc?: string, extra?: ReactNode) => {
    const short = splitRiotId(displayRiotId).name;
    return (
      <button
        key={id}
        type="button"
        className="pv-person"
        onClick={() => displayRiotId && onViewPlayer?.(displayRiotId, region)}
        disabled={!onViewPlayer || !displayRiotId}
        title={displayRiotId}
      >
        <ProfileIcon iconId={icon} src={iconSrc} alt={short} size={22} />
        <span>{short}</span>
        {extra}
      </button>
    );
  };

  return (
    <div className="hub-scroll pv">
      {/* ---------- 基础信息 ---------- */}
      <header className="pv-head">
        <div className="pv-head__art" aria-hidden="true">
          <ChampionSplash src={skin?.splash} className="pv-head__splash" />
        </div>
        <div className="pv-avatar" title={dossier?.expPoints != null ? `经验 ${dossier.expPoints} / ${dossier.expToNextLevel ?? '?'}` : undefined}>
          <ExpRing size={64} progress={expProgress} />
          <ProfileIcon iconId={iconId} src={iconUrl} srcs={iconUrls} alt={name} size={54} className="pv-avatar__img" />
          {level > 0 && <span className="pv-avatar__level">{level}</span>}
        </div>
        <div className="pv-head__id">
          <div className="pv-head__name">
            <h3 data-selectable="true">{name}{tag && <small>#{tag}</small>}</h3>
            {tags}
          </div>
          <div className="pv-head__facts">
            {QUEUES.map((queue) => {
              const rank = ranks.find((item) => item.queueType === queue.type);
              const games = rank ? rank.wins + rank.losses : 0;
              const history = rank ? [
                realTier(rank.previousSeasonEndTier) ? `上赛季 ${tierLabel(rank.previousSeasonEndTier)}` : '',
                realTier(rank.highestTier) ? `最高 ${tierLabel(rank.highestTier)}` : '',
              ].filter(Boolean).join(' · ') : '';
              return (
                <span key={queue.type} className="pv-fact" data-empty={rank ? undefined : 'true'} style={rank ? tierStyle(rank.tier) : undefined} title={history || undefined}>
                  {rank ? <RankEmblem rank={rank} size={22} /> : <i className="pv-fact__blank" aria-hidden="true" />}
                  <small>{queue.short}</small>
                  {rank ? (
                    <>
                      <b>{rankDivision(rank)}</b>
                      <em>{rank.leaguePoints}</em>
                      {games > 0 && <em>{Math.round((rank.wins / games) * 100)}% · {games}场</em>}
                    </>
                  ) : <b>未定级</b>}
                </span>
              );
            })}
            {regionName && <span className="pv-fact"><b>{regionName}</b></span>}
            {lastSeen > 0 && !inGame && <span className="pv-fact"><Clock3 /><b>{formatAgo(lastSeen, now)}</b></span>}
            {isPrivate && <span className="pv-fact" data-tone="warn"><EyeOff /><b>战绩隐藏</b></span>}
          </div>
          {note && <p className="pv-note" data-selectable="true">{note}</p>}
        </div>
        <div className="pv-head__actions">{actions}</div>
      </header>

      {loading && !data ? (
        <div className="pv-loading"><LoaderCircle className="animate-spin" />读取中…</div>
      ) : (
        <div className="pv-body">
          <div className="pv-main">
            {/* ---------- 现在 ---------- */}
            {inGame && live ? (
              <section className="pv-now" data-live="true">
                <div className="pv-now__art" aria-hidden="true">
                  <ChampionSplash src={banner} className="pv-now__splash" />
                </div>
                <div className="pv-now__body">
                  <div className="pv-now__status">
                    <span className="pv-live"><i />正在游戏</span>
                    {live.startTime ? <span className="pv-now__clock">{elapsed(now - live.startTime)}</span> : <span className="pv-now__clock">读条中</span>}
                  </div>
                  <div className="pv-now__title">
                    {live.championId ? <GameIcon src={champions.get(live.championId)?.avatar ?? ''} alt="" size={40} rounded /> : null}
                    <div>
                      <b>{live.championId ? championName(live.championId) : '对局中'}</b>
                      <span>{live.queueName || live.gameMode || ''}</span>
                    </div>
                  </div>
                  {liveTeam.length > 0 && (
                    <div className="pv-now__team">
                      {liveTeam.map((player) => playerChip(
                        player.puuid || player.riotId,
                        player.riotId,
                        player.profileIconId,
                        undefined,
                        <>
                          {player.championId > 0 && <GameIcon src={champions.get(player.championId)?.avatar ?? ''} alt="" size={18} rounded />}
                          {mateById.has(player.puuid) && <em className="pv-person__tag"><Users /></em>}
                        </>,
                      ))}
                    </div>
                  )}
                  <div className="pv-now__actions">
                    {spectateText && <span className="pv-now__hint">{spectateText}</span>}
                    <button type="button" className="hub-btn" data-variant="primary" onClick={() => void spectate()}>
                      <MonitorPlay />
                      观战
                    </button>
                  </div>
                </div>
              </section>
            ) : last ? (
              <section className="pv-now" data-win={last.win ? 'true' : 'false'}>
                <div className="pv-now__art" aria-hidden="true">
                  <ChampionSplash src={banner} className="pv-now__splash" />
                </div>
                <div className="pv-now__body">
                  <div className="pv-now__status">
                    <span className="pv-now__label">上一局</span>
                    <span className="pv-now__clock">{formatAgo(last.gameCreation + last.gameDuration * 1000, now)}</span>
                  </div>
                  <div className="pv-now__title">
                    <GameIcon src={last.championAvatar} alt="" size={40} rounded />
                    <div>
                      <b>{championName(last.championId, last.championName)}<span className="pv-now__result">{last.win ? '胜利' : '失败'}</span></b>
                      <span>{last.queueName} · {formatDuration(last.gameDuration)}</span>
                    </div>
                    <span className="pv-now__kda">{last.kills}<i>/</i><em>{last.deaths}</em><i>/</i>{last.assists}</span>
                  </div>
                  {lastMates.length > 0 && (
                    <div className="pv-now__team">
                      <Users className="pv-now__team-icon" />
                      {lastMates.map((mate) => playerChip(mate.puuid, mate.riotId, mate.profileIconId, mate.profileIconUrl))}
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="pv-now" data-empty="true">
                <div className="pv-now__body">
                  <span className="pv-now__label">{isPrivate ? '战绩已隐藏' : data?.briefError || '暂无对局'}</span>
                </div>
              </section>
            )}

            {/* ---------- 最近动态：按时段分组 ---------- */}
            {sessions.length > 0 && (
              <section className="pv-sessions">
                {sessions.map((session) => {
                  const queues = new Map<string, number>();
                  const companions = new Map<string, PlayerMatchBriefMate>();
                  for (const match of session.matches) {
                    queues.set(match.queueName || '其他', (queues.get(match.queueName || '其他') ?? 0) + 1);
                    for (const id of match.mates) {
                      const mate = mateById.get(id);
                      if (mate) companions.set(id, mate);
                    }
                  }
                  const expanded = openSession === session.key;
                  return (
                    <article key={session.key} className="pv-session" data-open={expanded ? 'true' : undefined}>
                      <button type="button" className="pv-session__head" onClick={() => setOpenSession(expanded ? null : session.key)} aria-expanded={expanded}>
                        <span className="pv-session__when">
                          <b>{dayLabel(session.start, now)}</b>
                          <small>{formatClock(session.start)}–{formatClock(session.end)}</small>
                        </span>
                        <span className="pv-session__record">
                          <b>{session.matches.length}</b>局
                          <em data-tone="win">{session.wins}胜</em>
                          <em data-tone="loss">{session.losses}负</em>
                        </span>
                        <span className="pv-session__queues">
                          {[...queues.entries()].map(([queue, count]) => (
                            <span key={queue}>{queue}{count > 1 && <em>×{count}</em>}</span>
                          ))}
                        </span>
                        <span className="pv-session__mates">
                          {[...companions.values()].slice(0, 3).map((mate) => (
                            <ProfileIcon key={mate.puuid} iconId={mate.profileIconId} src={mate.profileIconUrl} alt={mate.riotId} size={20} title={mate.riotId} />
                          ))}
                          {companions.size === 0 && <small>单排</small>}
                        </span>
                      </button>
                      <div className="pv-session__games">
                        {session.matches.map((match) => (
                          <span
                            key={match.gameId}
                            className="pv-pill"
                            data-win={match.win ? 'true' : 'false'}
                            title={`${championName(match.championId, match.championName)} · ${match.kills}/${match.deaths}/${match.assists} · ${match.queueName} · ${formatClock(match.gameCreation)}`}
                          >
                            <GameIcon src={match.championAvatar} alt="" size={26} rounded />
                            <small>{match.kills}/{match.deaths}/{match.assists}</small>
                          </span>
                        ))}
                      </div>
                      {expanded && (
                        <div className="pv-session__rows">
                          {session.matches.map((match) => (
                            <div key={match.gameId} className="pv-row" data-win={match.win ? 'true' : 'false'}>
                              <GameIcon src={match.championAvatar} alt="" size={24} rounded />
                              <b>{match.win ? '胜' : '负'}</b>
                              <span className="pv-row__champ">{championName(match.championId, match.championName)}</span>
                              <span className="pv-row__kda">{match.kills}<i>/</i><em>{match.deaths}</em><i>/</i>{match.assists}</span>
                              <span className="pv-row__queue">{match.queueName}</span>
                              <span className="pv-row__mates">
                                {match.mates.map((id) => mateById.get(id)).filter(Boolean).map((mate) => (
                                  <ProfileIcon key={mate?.puuid} iconId={mate?.profileIconId} src={mate?.profileIconUrl} alt={mate?.riotId ?? ''} size={18} title={mate?.riotId} />
                                ))}
                              </span>
                              <time>{formatClock(match.gameCreation)} · {formatDuration(match.gameDuration)}</time>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </div>

          {/* ---------- 右栏 ---------- */}
          <aside className="pv-side">
            <section className="pv-block">
              <h4>战绩<small>近 {form.games || 20} 场</small></h4>
              {form.games > 0 ? (
                <>
                  <div className="pv-score">
                    <b data-tone={form.winRate >= 50 ? 'win' : 'loss'}>{form.winRate}<small>%</small></b>
                    <span>
                      <b>{form.kda.toFixed(2)}</b>
                      <small>{form.avg}</small>
                    </span>
                    {streak && streak.count >= 2 && (
                      <em className="pv-streak" data-tone={streak.win ? 'win' : 'loss'}>{streak.count}{streak.win ? '连胜' : '连败'}</em>
                    )}
                  </div>
                  <ResultDots className="pv-dots" results={matches.map((match) => ({ key: match.gameId, win: match.win }))} />
                </>
              ) : (
                <div className="pv-empty">{isPrivate ? '战绩已隐藏' : '暂无'}</div>
              )}
            </section>

            {form.champions.length > 0 && (
              <section className="pv-block">
                <h4>在玩</h4>
                <div className="pv-pool">
                  {form.champions.slice(0, 5).map((champion) => {
                    const rate = Math.round((champion.wins / champion.games) * 100);
                    return (
                      <div key={champion.championId} className="pv-pool__row">
                        <GameIcon src={champion.avatar} alt="" size={24} rounded />
                        <b>{championName(champion.championId, champion.fallback)}</b>
                        <small>{champion.games}</small>
                        <em data-tone={rate >= 50 ? 'win' : 'loss'}>{rate}%</em>
                      </div>
                    );
                  })}
                </div>
                <div className="pv-modes" aria-label="模式占比">
                  {form.queues.slice(0, 4).map(([queue, count], index) => (
                    <i key={queue} style={{ flexGrow: count, '--mode': `var(--mode-${index})` } as CSSProperties} title={`${queue} ${count} 局`} />
                  ))}
                </div>
                <div className="pv-modes__legend">
                  {form.queues.slice(0, 4).map(([queue, count], index) => (
                    <span key={queue} style={{ '--mode': `var(--mode-${index})` } as CSSProperties}><i />{queue}<em>{count}</em></span>
                  ))}
                </div>
              </section>
            )}

            {mateLines.length > 0 && (
              <section className="pv-block">
                <h4>一起玩</h4>
                <div className="pv-mates">
                  {mateLines.map((line) => {
                    const rate = Math.round((line.wins / line.games) * 100);
                    return (
                      <button
                        key={line.mate.puuid}
                        type="button"
                        className="pv-mate"
                        onClick={() => onViewPlayer?.(line.mate.riotId, region)}
                        disabled={!onViewPlayer || !line.mate.riotId}
                        title={line.mate.riotId}
                      >
                        <ProfileIcon iconId={line.mate.profileIconId} src={line.mate.profileIconUrl} alt={line.mate.riotId} size={24} />
                        <b>{splitRiotId(line.mate.riotId).name}</b>
                        <small>{line.games}局</small>
                        <em data-tone={rate >= 50 ? 'win' : 'loss'}>{rate}%</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="pv-block">
              <h4>
                资产
                {dossierIncomplete && (
                  <button type="button" className="pv-retry" onClick={reload} title={dossierError || '重新读取'} aria-label="重新读取">
                    <RefreshCw className={loading ? 'animate-spin' : ''} />
                  </button>
                )}
              </h4>
              <div className="pv-assets">
                {collection ? (
                  <>
                    {collection.skins !== null && <span><b>{formatCount(collection.skins)}</b>皮肤</span>}
                    {collection.champions !== null && <span><b>{formatCount(collection.champions)}</b>英雄</span>}
                    {collection.chromas !== null && <span><b>{formatCount(collection.chromas)}</b>炫彩</span>}
                    {collection.icons !== null && <span><b>{formatCount(collection.icons)}</b>头像</span>}
                  </>
                ) : (
                  <span className="pv-assets__none" title={dossierError}>{dossierError ? '读取失败' : '暂无'}</span>
                )}
              </div>
              {dossier?.challengePoints && (
                <div className="pv-challenge" style={tierStyle(dossier.challengePoints.level)}>
                  <i aria-hidden="true" />
                  <b>挑战 {tierLabel(dossier.challengePoints.level) || '无等级'}</b>
                  <small>{percentileText(dossier.challengePoints.percentile)}</small>
                  {dossier.tokens.map((token) => (
                    <img
                      key={token.id}
                      src={token.iconUrl}
                      alt={token.name}
                      title={[token.name, tierLabel(token.level)].filter(Boolean).join(' · ')}
                      draggable={false}
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  ))}
                </div>
              )}
              {skin?.name && <div className="pv-skin" title="生涯背景">{skin.name}</div>}
            </section>

            {saved && saved.matches.length > 0 && (
              <button type="button" className="pv-saved" onClick={saved.onOpen} disabled={saved.opening}>
                <History />
                <span>保存的对局</span>
                <em>{saved.matches.length}</em>
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
