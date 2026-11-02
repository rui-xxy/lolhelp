import { ArrowRight, Gamepad2, RefreshCw } from 'lucide-react';
import type {
  AppSettings,
  AssistSettings,
  CollectionWallet,
  LiveBattleInfo,
  PlayerDossier,
  PlayerLookupSummary,
  PlayerMatchDetail,
  PlayerProfile,
} from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { ExpRing } from '../hub/PlayerProfileView';
import { tierLabel } from '../ui/kit';
import { Art, formatCount, formatDamage } from './HomeArt';

// 名片：背景是自己在客户端设的生涯背景原画，左边渐隐成墨色。
// 左边是我：头像（外圈等级进度）、名字、段位、近期战绩和一排英雄小头像（最新在左）。
// 右边一块磨砂玻璃：现在在干嘛、钱包、四个常用开关。

const PHASE_LABELS: Record<string, string> = {
  Lobby: '房间中',
  Matchmaking: '匹配中',
  ReadyCheck: '等待接受',
  ChampSelect: '选人中',
  GameStart: '载入中',
  InProgress: '游戏中',
  Reconnect: '重连中',
  WaitingForStats: '结算中',
  PreEndOfGame: '结算中',
  EndOfGame: '结算中',
};

const LIVE_PHASES = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);

const QUICK_TOGGLES: Array<{ key: keyof AssistSettings; label: string }> = [
  { key: 'autoAccept', label: '自动接受' },
  { key: 'autoReturnLobby', label: '自动回房' },
  { key: 'autoHonorTeammates', label: '自动点赞' },
  { key: 'autoChampionEnabled', label: '选人辅助' },
];

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

interface IdentityBannerProps {
  connected: boolean;
  loading: boolean;
  error: string;
  profile: PlayerProfile | null;
  matches: PlayerMatchDetail[];
  summary: PlayerLookupSummary | null;
  dossier: PlayerDossier | null;
  regionName: string;
  art: { splash: string; fallback?: string } | null;
  battle: LiveBattleInfo | null;
  wallet: CollectionWallet | null;
  settings: AppSettings | null;
  onToggle: (key: keyof AssistSettings, value: boolean) => void;
  onRefresh: () => void;
  onOpenHistory: () => void;
  onOpenLive: () => void;
}

export function IdentityBanner({
  connected,
  loading,
  error,
  profile,
  matches,
  summary,
  dossier,
  regionName,
  art,
  battle,
  wallet,
  settings,
  onToggle,
  onRefresh,
  onOpenHistory,
  onOpenLive,
}: IdentityBannerProps) {
  const recent = matches.slice(0, 20);
  const wins = recent.filter((match) => match.win).length;
  const losses = recent.length - wins;
  const rate = recent.length ? Math.round((wins / recent.length) * 100) : null;
  const rank = profile?.ranks?.find((item) => item.queueType === 'RANKED_SOLO_5x5') ?? profile?.rank ?? null;
  const ranked = rank && rank.tier && !['NONE', 'UNRANKED'].includes(rank.tier.toUpperCase());
  const previous = rank?.previousSeasonEndTier;
  const [name, tag] = (profile?.riotId ?? '').split('#');
  const level = dossier?.level ?? profile?.level ?? null;
  const progress = dossier?.expPoints != null && dossier.expToNextLevel ? dossier.expPoints / dossier.expToNextLevel : null;

  const phase = battle?.phase ?? '';
  const phaseText = PHASE_LABELS[phase];
  const live = LIVE_PHASES.has(phase);

  return (
    <section className="hm-card" data-live={live ? 'true' : undefined}>
      {art && <Art src={art.splash} fallback={art.fallback} className="hm-card__art" loading="eager" />}

      <div className="hm-card__me">
        {profile ? (
          <>
            <div className="hm-me">
              <span className="hm-me__avatar">
                <ExpRing size={70} progress={progress} />
                <ProfileIcon iconId={profile.profileIconId} src={profile.profileIconUrl} alt={profile.riotId} size={58} />
                {level !== null && <b>{level}</b>}
              </span>
              <div className="hm-me__id">
                <button type="button" className="hm-me__name" onClick={onOpenHistory} title="查看完整战绩">
                  {name}
                  {tag && <small>#{tag}</small>}
                </button>
                <div className="hm-me__rank">
                  {ranked && rank ? (
                    <>
                      <RankEmblem rank={rank} size={30} />
                      <b>{tierLabel(rank.tier)}{APEX.has(rank.tier.toUpperCase()) ? '' : ` ${rank.division}`}</b>
                      <span>{rank.leaguePoints} 胜点</span>
                    </>
                  ) : (
                    <b className="hm-me__unranked">单双排未定级</b>
                  )}
                  {previous && previous.toUpperCase() !== 'NONE' && <span>上赛季 {tierLabel(previous)}</span>}
                  <span>{regionName}</span>
                </div>
              </div>
            </div>

            <dl className="hm-form">
              <div>
                <dt>近 {recent.length} 场</dt>
                <dd><b data-tone="win">{wins}</b><i>胜</i><b data-tone="loss">{losses}</b><i>负</i></dd>
              </div>
              <div>
                <dt>胜率</dt>
                <dd><b>{rate ?? '—'}</b>{rate !== null && <i>%</i>}</dd>
              </div>
              <div>
                <dt>KDA</dt>
                <dd><b>{summary?.averageKda ? summary.averageKda.toFixed(2) : '—'}</b></dd>
              </div>
              <div>
                <dt>场均伤害</dt>
                <dd><b>{summary?.averageDamage ? formatDamage(summary.averageDamage) : '—'}</b></dd>
              </div>
            </dl>

            {recent.length > 0 && (
              <button type="button" className="hm-games" onClick={onOpenHistory} aria-label="打开完整战绩">
                {recent.map((match) => (
                  <span
                    key={match.gameId}
                    data-win={match.win ? 'true' : 'false'}
                    title={`${match.queueName} · ${match.championName} · ${match.win ? '胜' : '负'} · ${match.kills}/${match.deaths}/${match.assists}`}
                  >
                    <Art src={match.championAvatar} />
                  </span>
                ))}
              </button>
            )}
          </>
        ) : (
          <div className="hm-me hm-me--empty">
            <span className="hm-me__avatar hm-me__avatar--empty"><Gamepad2 className="size-6" aria-hidden="true" /></span>
            <div className="hm-me__id">
              <b className="hm-me__name">{connected ? (loading ? '读取中…' : '没读到战绩') : '未连接客户端'}</b>
              {connected && !loading && (
                <div className="hm-me__rank">
                  {error && <span>{error}</span>}
                  <button type="button" className="hm-mini-btn" onClick={onRefresh}>
                    <RefreshCw className="size-3" aria-hidden="true" />
                    重试
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="hm-card__side">
        <div className="hm-state" data-phase={phaseText ? phase : connected ? 'Idle' : 'Offline'}>
          <i aria-hidden="true" />
          <b>{phaseText ?? (connected ? '空闲中' : '未连接')}</b>
          {phaseText && battle?.queueName && <span>{battle.queueName}</span>}
          {live ? (
            <button type="button" className="hm-mini-btn hm-mini-btn--strong" onClick={onOpenLive}>
              看对局 <ArrowRight className="size-3" aria-hidden="true" />
            </button>
          ) : profile ? (
            <button type="button" className="hm-icon-btn" onClick={onRefresh} title="刷新" aria-label="刷新">
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          ) : null}
        </div>

        {wallet && (
          <dl className="hm-wallet">
            {wallet.rp !== undefined && (
              <div data-kind="rp"><dt>点券</dt><dd>{formatCount(wallet.rp)}</dd></div>
            )}
            <div data-kind="be"><dt>蓝色精粹</dt><dd>{formatCount(wallet.blueEssence)}</dd></div>
            <div data-kind="oe"><dt>橙色精粹</dt><dd>{formatCount(wallet.orangeEssence)}</dd></div>
            {(wallet.chests ?? 0) + (wallet.keys ?? 0) > 0 && (
              <div data-kind="chest"><dt>宝箱 · 钥匙</dt><dd>{wallet.chests ?? 0}<i>·</i>{wallet.keys ?? 0}</dd></div>
            )}
          </dl>
        )}

        {settings && (
          <div className="hm-toggles">
            {QUICK_TOGGLES.map((toggle) => {
              const on = Boolean(settings.assist[toggle.key]);
              return (
                <button
                  key={toggle.key}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className="hm-switch"
                  onClick={() => onToggle(toggle.key, !on)}
                >
                  <i aria-hidden="true" />
                  {toggle.label}
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </section>
  );
}
