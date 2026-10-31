import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Gamepad2, RefreshCw, UserRoundSearch, Users } from 'lucide-react';
import type {
  AppSettings,
  AssistSettings,
  FriendInfo,
  LiveBattleInfo,
  PlayerLookupResult,
  PlayerMatchDetail,
  SavedMatchFollowAlertPreview,
} from '../../shared/api';
import { ProfileIcon } from './ProfileIcon';
import { GameIcon } from './match/GameIcon';
import { SAVED_MATCHES_CHANGED_EVENT } from './match/savedMatchesStore';
import { SwitchControl } from './settings/SettingsControls';
import { EmptyState, Panel, Stat, Tag, TierChip, WinLossStrip, tierLabel } from './ui/kit';
import type { View } from './AppShell';
import { broadcastSettingsChanged, SETTINGS_CHANGED_EVENT } from '../lib/events';

// 首页：开局前看一眼——账号状态、当前对局、最近战绩、关注动态、好友在玩、常用开关。

interface HomePageProps {
  active: boolean;
  connected: boolean;
  regionName: string;
  onNavigate: (view: View) => void;
  onPlayerSearch: (name: string, region?: string) => void;
  onOpenFollow: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  Lobby: '房间中',
  Matchmaking: '匹配中',
  ReadyCheck: '等待接受对局',
  ChampSelect: '选人阶段',
  GameStart: '载入中',
  InProgress: '游戏中',
  Reconnect: '重连中',
  WaitingForStats: '结算中',
  PreEndOfGame: '结算中',
  EndOfGame: '结算中',
};

const QUICK_TOGGLES: Array<{ key: keyof AssistSettings; label: string }> = [
  { key: 'autoAccept', label: '自动接受对局' },
  { key: 'autoReturnLobby', label: '结算自动回房间' },
  { key: 'autoHonorTeammates', label: '自动点赞队友' },
  { key: 'autoChampionEnabled', label: '选人自动操作' },
];

function formatAgo(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatDamage(value: number): string {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}万` : value.toLocaleString('zh-CN');
}

function isInGame(friend: FriendInfo): boolean {
  const status = friend.lol?.gameStatus ?? '';
  return status === 'inGame' || status === 'championSelect' || status.toLowerCase().includes('progress');
}

function RecentMatchRow({ match, maxDamage, now }: { match: PlayerMatchDetail; maxDamage: number; now: number }) {
  const share = maxDamage > 0 ? Math.round((match.damage / maxDamage) * 100) : 0;
  return (
    <div className="grid grid-cols-[4px_32px_minmax(0,1fr)_96px_80px_76px] items-center gap-3 border-t border-line-1 py-2 first:border-t-0">
      <i className={`block h-8 w-1 rounded-full ${match.win ? 'bg-ally' : 'bg-enemy'}`} aria-label={match.win ? '胜利' : '失败'} />
      <GameIcon src={match.championAvatar} alt={match.championName} size={32} />
      <div className="min-w-0">
        <div className="truncate text-body text-text-1">{match.queueName}</div>
        <div className="num text-meta text-text-4">{formatDuration(match.gameDuration)} · {match.championName}</div>
      </div>
      <div className="num text-list font-semibold text-text-1">
        {match.kills}<span className="text-text-4"> / </span>{match.deaths}<span className="text-text-4"> / </span>{match.assists}
      </div>
      <div className="grid gap-1">
        <span className="num text-body text-text-2">{formatDamage(match.damage)}</span>
        <i className="relative block h-[3px] overflow-hidden rounded-full bg-ink-4">
          <i className="absolute inset-y-0 left-0 block rounded-full bg-text-4" style={{ width: `${share}%` }} />
        </i>
      </div>
      <span className="text-right text-meta text-text-4">{formatAgo(match.gameCreation, now)}</span>
    </div>
  );
}

export function HomePage({ active, connected, regionName, onNavigate, onPlayerSearch, onOpenFollow }: HomePageProps) {
  const [self, setSelf] = useState<PlayerLookupResult | null>(null);
  const [selfError, setSelfError] = useState('');
  const [loadingSelf, setLoadingSelf] = useState(false);
  const [battle, setBattle] = useState<LiveBattleInfo | null>(null);
  const [follows, setFollows] = useState<SavedMatchFollowAlertPreview[]>([]);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadSelf = useCallback(async () => {
    setLoadingSelf(true);
    setSelfError('');
    try {
      const result = await window.lolHelper.match.search({ name: '', pageSize: 20 });
      if (result.error) {
        setSelfError(result.error);
      } else {
        setSelf(result);
      }
    } catch (error) {
      setSelfError(error instanceof Error ? error.message : '读取战绩失败');
    } finally {
      setLoadingSelf(false);
      setNow(Date.now());
    }
  }, []);

  const loadSide = useCallback(async () => {
    const [catalog, friendList, appSettings, battleInfo] = await Promise.allSettled([
      window.lolHelper.match.getSavedMatchesCatalog(),
      window.lolHelper.lcu.getFriends(),
      window.lolHelper.db.getSettings(),
      window.lolHelper.live.getBattle(),
    ]);
    if (catalog.status === 'fulfilled') {
      setFollows([...catalog.value.followAlerts].sort((a, b) => b.detectedAt - a.detectedAt).slice(0, 4));
    }
    if (friendList.status === 'fulfilled') setFriends(friendList.value);
    if (appSettings.status === 'fulfilled') setSettings(appSettings.value);
    if (battleInfo.status === 'fulfilled') setBattle(battleInfo.value);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadSide();
  }, [active, loadSide]);

  useEffect(() => {
    if (connected) void loadSelf();
  }, [connected, loadSelf]);

  useEffect(() => {
    const unsubscribe = window.lolHelper.live.onStateChanged(() => {
      void window.lolHelper.live.getBattle().then(setBattle).catch(() => undefined);
    });
    const onSavedChanged = () => void loadSide();
    const onSettingsChanged = () => {
      void window.lolHelper.db.getSettings().then(setSettings).catch(() => undefined);
    };
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, onSavedChanged);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      unsubscribe();
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, onSavedChanged);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, [loadSide]);

  const toggleAssist = (key: keyof AssistSettings, value: boolean) => {
    if (!settings) return;
    const nextAssist = { ...settings.assist, [key]: value } as AssistSettings;
    setSettings({ ...settings, assist: nextAssist });
    void window.lolHelper.db.updateSettings({ assist: nextAssist }).then((saved) => {
      setSettings(saved);
      broadcastSettingsChanged('home');
    }).catch(() => {
      setSettings(settings);
    });
  };

  const matches = self?.matches ?? [];
  const results = useMemo(() => matches.slice(0, 20).map((match) => match.win), [matches]);
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  const averageKda = self?.summary.averageKda ?? 0;
  const averageDamage = self?.summary.averageDamage ?? 0;
  const maxDamage = Math.max(0, ...matches.slice(0, 5).map((match) => match.damage));
  const profile = self?.profile;
  const soloRank = profile?.ranks?.find((rank) => rank.queueType === 'RANKED_SOLO_5x5') ?? profile?.rank ?? null;
  const previousTier = soloRank?.previousSeasonEndTier || soloRank?.highestTier;

  const phase = battle?.phase ?? '';
  const phaseText = PHASE_LABELS[phase];
  const inMatchFlow = Boolean(phaseText);
  const onlineFriends = friends.filter((friend) => friend.availability !== 'offline' && friend.availability !== 'mobile');
  const playingFriends = onlineFriends.filter(isInGame);

  return (
    <div className="shell-page__scroll">
      <div className="shell-page__pad grid gap-4">
        <div className="grid grid-cols-12 gap-4">
          <Panel
            className="col-span-12 xl:col-span-5"
            title="我的账号"
            extra={(
              <>
                <span>{regionName}</span>
                <button
                  type="button"
                  onClick={() => void loadSelf()}
                  className="grid size-7 place-items-center rounded-sm text-text-3 transition-colors hover:bg-app-nav-hover hover:text-text-1"
                  title="刷新"
                  aria-label="刷新我的战绩"
                >
                  <RefreshCw className={`size-3.5 ${loadingSelf ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
            bodyClassName="grid gap-4"
          >
            {profile ? (
              <>
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="relative">
                    <ProfileIcon iconId={profile.profileIconId} src={profile.profileIconUrl} alt={profile.riotId} size={52} />
                    <span className="num absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-line-2 bg-ink-0 px-1.5 text-[11px] leading-4 text-text-1">
                      {profile.level}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onPlayerSearch(profile.riotId)}
                      className="max-w-full truncate text-left text-section font-semibold text-text-1 hover:underline"
                      title="查看完整战绩"
                    >
                      {profile.riotId.split('#')[0]}
                      <span className="num ml-1 text-body font-medium text-text-4">#{profile.riotId.split('#')[1] ?? ''}</span>
                    </button>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <TierChip rank={soloRank} />
                      {previousTier && <Tag>上赛季 {tierLabel(previousTier)}</Tag>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Stat label={`近 ${results.length} 场`} value={<><span className="text-ally">{wins}</span><span className="text-text-4"> / </span><span className="text-enemy">{losses}</span></>} />
                  <Stat label="胜率" value={results.length ? `${Math.round((wins / results.length) * 100)}%` : '—'} />
                  <Stat label="KDA" value={averageKda ? averageKda.toFixed(2) : '—'} />
                  <Stat label="场均伤害" value={averageDamage ? formatDamage(averageDamage) : '—'} />
                </div>
                {results.length > 0 && (
                  <div className="grid gap-1.5">
                    <WinLossStrip results={results} />
                    <div className="flex justify-between text-meta text-text-4"><span>最新</span><span>{results.length} 场前</span></div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Gamepad2 />}
                title={connected ? (loadingSelf ? '正在读取你的战绩…' : '还没读到你的战绩') : '没有检测到英雄联盟客户端'}
                description={connected ? selfError || '客户端登录后会自动读取。' : '打开并登录客户端后，这里会显示你的段位和最近战绩。'}
                className="py-6"
              />
            )}
          </Panel>

          <Panel
            className={`col-span-12 xl:col-span-7 ${inMatchFlow ? 'shadow-ui-inset-strong' : ''}`}
            title="当前状态"
            extra={settings?.assist.autoAccept ? <Tag tone="ok">自动接受已开启</Tag> : undefined}
            bodyClassName="grid gap-4"
          >
            {inMatchFlow ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-title font-semibold text-text-1">{phaseText}</span>
                  {battle?.queueName && <Tag>{battle.queueName}</Tag>}
                  {battle?.mapName && <Tag>{battle.mapName}</Tag>}
                </div>
                {battle && battle.myTeam.length > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {battle.myTeam.slice(0, 5).map((player) => (
                      <div key={player.puuid || player.riotId} className="grid min-w-0 justify-items-center gap-1.5 rounded-sm bg-ink-3 px-1 py-2.5">
                        <ProfileIcon iconId={player.profileIconId} alt={player.gameName} size={36} />
                        <span className="max-w-full truncate text-meta text-text-1">{player.gameName || player.riotId.split('#')[0]}</span>
                        <span className="num text-[11px] text-text-4">{player.matchCount ? `${Math.round(player.winRate)}% · ${player.kda.toFixed(1)}` : '读取中'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-meta text-text-3">进入选人或读条后会自动分析双方玩家。</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('live')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-app-primary px-3.5 text-body font-semibold text-app-primary-foreground transition-colors hover:bg-app-primary-hover"
                  >
                    查看对局分析
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<Gamepad2 />}
                title={connected ? '空闲中' : '等待客户端'}
                description={connected ? '开始排队后，这里会显示对局进度；进入选人后可以一键查看 10 人分析。' : '检测到客户端后会自动开始。'}
                className="py-6"
                action={(
                  <button
                    type="button"
                    onClick={() => onNavigate('live')}
                    className="text-meta text-text-3 underline-offset-4 hover:text-text-1 hover:underline"
                  >
                    打开对局页（可查看测试数据）
                  </button>
                )}
              />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <Panel
            className="col-span-12 xl:col-span-7"
            title="最近战绩"
            extra={profile && (
              <button type="button" onClick={() => onPlayerSearch(profile.riotId)} className="inline-flex items-center gap-1 hover:text-text-1">
                全部 <ArrowRight className="size-3" />
              </button>
            )}
          >
            {matches.length > 0 ? (
              <div>
                {matches.slice(0, 5).map((match) => (
                  <RecentMatchRow key={match.gameId} match={match} maxDamage={maxDamage} now={now} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-body text-text-4">{loadingSelf ? '读取中…' : '暂无战绩'}</p>
            )}
          </Panel>

          <Panel
            className="col-span-12 xl:col-span-5"
            title="关注动态"
            extra={(
              <button type="button" onClick={onOpenFollow} className="inline-flex items-center gap-1 hover:text-text-1">
                管理关注 <ArrowRight className="size-3" />
              </button>
            )}
            bodyClassName="grid gap-3"
          >
            {follows.length > 0 ? (
              <div className="grid gap-2.5">
                {follows.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => onPlayerSearch(alert.riotId, alert.region)}
                    className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5 rounded-sm p-1 text-left transition-colors hover:bg-app-nav-hover"
                  >
                    <ProfileIcon iconId={alert.profileIconId} src={alert.profileIconUrl} alt={alert.riotId} size={28} />
                    <span className="min-w-0 text-body leading-5 text-text-2">
                      <b className="font-medium text-text-1">{alert.riotId.split('#')[0]}</b>
                      {' 打完一局 '}{alert.match.queueName}，
                      <span className={alert.match.win ? 'text-ally' : 'text-enemy'}>{alert.match.win ? '胜' : '负'}</span>
                      <span className="num"> {alert.match.kills}/{alert.match.deaths}/{alert.match.assists}</span>
                      <small className="block text-meta text-text-4">{formatAgo(alert.detectedAt, now)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-sm bg-ink-3 px-3 py-3 text-body text-text-3">
                <UserRoundSearch className="size-4 shrink-0" />
                关注好友或任意玩家后，他们打完一局会出现在这里。
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-line-1 pt-3 text-meta text-text-3">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                好友 {onlineFriends.length} 在线 · {playingFriends.length} 游戏中
              </span>
              <span className="flex">
                {playingFriends.slice(0, 5).map((friend) => (
                  <ProfileIcon
                    key={friend.puuid || friend.id}
                    iconId={friend.icon}
                    src={friend.iconUrl}
                    srcs={friend.iconUrls}
                    alt={friend.gameName}
                    title={`${friend.gameName}${friend.lol?.gameQueueName ? ` · ${friend.lol.gameQueueName}` : ''}`}
                    size={24}
                    className="-ml-1.5 ring-2 ring-ink-2 first:ml-0"
                  />
                ))}
              </span>
            </div>
          </Panel>
        </div>

        {settings && (
          <div className="flex flex-wrap gap-2.5">
            {QUICK_TOGGLES.map((toggle) => (
              <label
                key={toggle.key}
                className="inline-flex h-10 cursor-pointer items-center gap-2.5 rounded-sm bg-ink-2 px-3 text-body text-text-1 shadow-ui-panel"
              >
                <SwitchControl
                  size="sm"
                  checked={Boolean(settings.assist[toggle.key])}
                  onChange={(value) => toggleAssist(toggle.key, value)}
                />
                {toggle.label}
              </label>
            ))}
            <button
              type="button"
              onClick={() => onNavigate('assist')}
              className="inline-flex h-10 items-center gap-1 rounded-sm px-3 text-meta text-text-3 transition-colors hover:bg-app-nav-hover hover:text-text-1"
            >
              更多助手设置 <ArrowRight className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
