import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type {
  AssistLiveData,
  AssistChampionGuide,
  AssistOverlayName,
  AssistRecommendation,
  AssistRuntimeStatus,
  AppSettings,
  LiveBattleInfo,
  LiveBattlePlayer,
} from '../../../shared/api';

const overlayTitles: Record<AssistOverlayName, string> = {
  helper: '对局助手',
  match: '游戏内战绩',
  spells: '技能计时',
};

function OverlayFrame({
  name,
  children,
}: {
  name: AssistOverlayName;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-lg border border-white/15 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-md">
      <header className="flex h-10 shrink-0 items-center border-b border-white/10 px-3 [-webkit-app-region:drag]">
        <span className="text-sm font-semibold">{overlayTitles[name]}</span>
        <button
          type="button"
          onClick={() => void window.lolHelper.assist.toggleOverlay(name)}
          className="ml-auto flex size-7 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white [-webkit-app-region:no-drag]"
        >
          <X className="size-4" />
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-3">{children}</main>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm leading-6 text-white/55">
      {children}
    </div>
  );
}

function HelperOverlay() {
  const [status, setStatus] = useState<AssistRuntimeStatus | null>(null);
  const [recommendation, setRecommendation] = useState<AssistRecommendation | null>(null);
  const [guide, setGuide] = useState<AssistChampionGuide | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let stopped = false;
    let lastChampionId = 0;
    const refresh = async () => {
      const next = await window.lolHelper.assist.getStatus();
      if (stopped) return;
      setStatus(next);
      if (next.championId && next.championId !== lastChampionId) {
        lastChampionId = next.championId;
        Promise.all([
          window.lolHelper.assist.getRecommendation(),
          window.lolHelper.assist.getChampionGuide(next.championId),
        ])
          .then(([value, championGuide]) => {
            if (!stopped) {
              setRecommendation(value);
              setGuide(championGuide);
            }
          })
          .catch((error) => {
            if (!stopped) setMessage(String(error));
          });
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!status || !status.championId) {
    return <EmptyState>进入选人阶段并选中英雄后，这里会显示符文和装备推荐。</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-white/8 p-3">
        <div className="text-xs text-white/55">当前状态</div>
        <div className="mt-1 text-sm font-semibold">
          英雄 {status.championId} · {status.position || '未识别位置'} · {status.phase}
        </div>
      </div>
      {recommendation ? (
        <>
          {guide && (
            <div className="rounded-md bg-white/8 p-3">
              <div className="text-sm font-semibold">{guide.name} · {guide.title}</div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/55">
                {guide.stats.map((stat) => (
                  <div key={stat.label} className="flex justify-between">
                    <span>{stat.label}</span>
                    <span>{stat.base}{stat.perLevel ? ` +${stat.perLevel}/级` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-md bg-white/8 p-3">
            <div className="text-xs text-white/55">推荐符文</div>
            <div className="mt-1 text-sm font-semibold">{recommendation.rune?.name || '暂无推荐'}</div>
            {recommendation.rune && (
              <div className="mt-1 text-xs text-emerald-300">
                胜率 {(recommendation.rune.winRate * 100).toFixed(1)}%
              </div>
            )}
          </div>
          <div className="space-y-2">
            {recommendation.items.map((block) => (
              <div key={block.title} className="rounded-md bg-white/8 p-3">
                <div className="text-xs text-white/55">{block.title}</div>
                <div className="mt-1 text-sm">{block.itemIds.join(' → ')}</div>
              </div>
            ))}
          </div>
          {recommendation.augments.length > 0 && (
            <div className="rounded-md bg-white/8 p-3">
              <div className="mb-2 text-xs text-white/55">强化符文推荐</div>
              <div className="grid grid-cols-2 gap-2">
                {recommendation.augments.map((augment) => (
                  <div key={augment.id} className="flex items-center gap-2 rounded bg-black/20 p-1.5">
                    {augment.icon && (
                      <img src={augment.icon} alt={augment.name} className="size-7 rounded" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[10px]">{augment.name}</div>
                      <div className="text-[9px] text-white/45">
                        热度 {augment.popularity.toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {guide?.spells.length ? (
            <div className="rounded-md bg-white/8 p-3">
              <div className="mb-2 text-xs text-white/55">技能信息</div>
              <div className="space-y-1.5">
                {guide.spells.map((spell) => (
                  <details key={spell.key} className="rounded bg-black/20 px-2 py-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium">
                      {spell.key} · {spell.name}
                      <span className="ml-2 text-white/45">CD {spell.cooldown}</span>
                    </summary>
                    <p className="mt-1 text-[10px] leading-4 text-white/55">{spell.description}</p>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMessage('正在锁定…');
              void window.lolHelper.assist.lockCurrentChampion()
                .then((result) => setMessage(result.message));
            }}
            className="w-full rounded-md border border-white/15 py-2 text-sm font-semibold hover:bg-white/8"
          >
            锁定当前英雄
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage('正在应用…');
              void window.lolHelper.assist.applyRecommendation()
                .then((results) => setMessage(results.map((item) => item.message).join('；')))
                .catch((error) => setMessage(String(error)));
            }}
            className="w-full rounded-md bg-rose-500 py-2 text-sm font-semibold hover:bg-rose-400"
          >
            应用推荐
          </button>
        </>
      ) : (
        <EmptyState>正在读取 OP.GG 推荐…</EmptyState>
      )}
      {message && <div className="text-xs text-white/60">{message}</div>}
    </div>
  );
}

function MatchOverlay() {
  const [battle, setBattle] = useState<LiveBattleInfo | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      void Promise.all([
        window.lolHelper.live.getBattle(),
        window.lolHelper.db.getSettings(),
      ]).then(([value, currentSettings]) => {
        if (!stopped) {
          setBattle(value);
          setSettings(currentSettings);
        }
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!battle?.inGame) return <EmptyState>进入选人或游戏后显示双方玩家与近期表现。</EmptyState>;

  const averageWinRate = (players: LiveBattlePlayer[]) => {
    const known = players.filter((player) => player.matchCount > 0);
    return known.length
      ? Math.round(known.reduce((sum, player) => sum + player.winRate, 0) / known.length)
      : 0;
  };
  const myRate = averageWinRate(battle.myTeam);
  const enemyRate = averageWinRate(battle.enemyTeam);
  const normalizedBlacklist = new Set(
    (settings?.blacklist ?? []).map((entry) => entry.riotId.toLowerCase().replace(/\s+/g, '')),
  );
  const activeTags = settings?.assist.playerTags ?? [];

  const tagsForPlayer = (player: LiveBattlePlayer): string[] => {
    const tags: string[] = [];
    if (activeTags.includes('胜率') && player.matchCount > 0) tags.push(`胜率 ${player.winRate}%`);
    if (activeTags.includes('KDA') && player.matchCount > 0) tags.push(`KDA ${player.kda.toFixed(1)}`);
    if (activeTags.includes('连胜/连败')) {
      const first = player.history[0]?.win;
      let streak = 0;
      for (const game of player.history) {
        if (game.win !== first) break;
        streak += 1;
      }
      if (streak >= 2) tags.push(`${streak}连${first ? '胜' : '败'}`);
    }
    if (
      activeTags.includes('首次使用英雄') &&
      player.history.length > 0 &&
      !player.history.some((game) => game.championId === player.championId)
    ) {
      tags.push('近期首玩');
    }
    if (
      activeTags.includes('黑名单') &&
      normalizedBlacklist.has(player.riotId.toLowerCase().replace(/\s+/g, ''))
    ) {
      tags.push('黑名单');
    }
    return tags;
  };

  const titleForPlayer = (player: LiveBattlePlayer) => {
    const titles = settings?.assist.powerTitles ?? [];
    if (titles.length === 0 || player.matchCount === 0) return '';
    const score = player.winRate + Math.min(30, player.kda * 5);
    const index = score >= 85 ? 4 : score >= 75 ? 3 : score >= 65 ? 2 : score >= 55 ? 1 : 0;
    return titles[index] ?? '';
  };

  return (
    <div className="space-y-3">
      {settings?.assist.showPowerTrend && (
        <div className="rounded-md bg-white/7 p-3">
          <div className="mb-2 flex justify-between text-xs text-white/60">
            <span>我方近期胜率 {myRate || '--'}%</span>
            <span>敌方近期胜率 {enemyRate || '--'}%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="bg-sky-400"
              style={{ width: `${myRate + enemyRate > 0 ? (myRate / (myRate + enemyRate)) * 100 : 50}%` }}
            />
            <div className="flex-1 bg-rose-400" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
      {[
        ['我方', battle.myTeam],
        ['敌方', battle.enemyTeam],
      ].map(([label, players]) => (
        <section key={label as string} className="rounded-md bg-white/7 p-3">
          <h3 className="mb-2 text-sm font-semibold">{label as string}</h3>
          <div className="space-y-2">
            {(players as LiveBattleInfo['myTeam']).map((player) => (
              <div key={player.puuid || player.riotId} className="rounded bg-black/25 p-2">
                <div className="truncate text-xs font-medium">{player.riotId}</div>
                <div className="mt-1 flex justify-between text-[11px] text-white/55">
                  <span>{player.championName}</span>
                  <span>{titleForPlayer(player)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tagsForPlayer(player).map((tag) => (
                    <span
                      key={tag}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        tag === '黑名单'
                          ? 'bg-red-500/25 text-red-200'
                          : 'bg-white/8 text-white/60'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}

const SPELL_COOLDOWNS: Array<[RegExp, number]> = [
  [/闪现|flash/i, 300],
  [/传送|teleport/i, 360],
  [/点燃|ignite|dot/i, 180],
  [/治疗|heal/i, 240],
  [/屏障|barrier/i, 180],
  [/虚弱|exhaust/i, 240],
  [/净化|cleanse|boost/i, 210],
  [/疾跑|ghost|haste/i, 210],
  [/惩戒|smite/i, 90],
];

function spellCooldown(name: string): number {
  return SPELL_COOLDOWNS.find(([pattern]) => pattern.test(name))?.[1] ?? 180;
}

function LiveClientOverlay() {
  const [data, setData] = useState<AssistLiveData | null>(null);
  const [timers, setTimers] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      void window.lolHelper.assist.getLiveData().then((value) => {
        if (!stopped) setData(value);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, []);

  if (!data?.active) {
    return <EmptyState>游戏进程启动后读取 2999 实时数据。<br />{data?.error}</EmptyState>;
  }

  const startTimer = (key: string, spellName: string) => {
    setTimers((current) => ({
      ...current,
      [key]: Date.now() + spellCooldown(spellName) * 1000,
    }));
  };

  const remaining = (key: string) =>
    Math.max(0, Math.ceil(((timers[key] ?? 0) - now) / 1000));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-white/55">
        <span>{data.gameMode || '实时对局'}</span>
        <span>{Math.floor(data.gameTime / 60)}:{String(Math.floor(data.gameTime % 60)).padStart(2, '0')}</span>
      </div>
      <div className="space-y-1.5">
        {data.players.map((player) => (
          <div key={`${player.riotId}-${player.championName}`} className="rounded bg-white/8 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-medium">{player.riotId}</span>
              <span className="text-white/55">Lv.{player.level}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-white/55">
              <span>{player.championName}</span>
              <span>{player.kills}/{player.deaths}/{player.assists}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[player.spellOne, player.spellTwo].map((spell, index) => {
                const key = `${player.riotId}:${index}`;
                const seconds = remaining(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!spell}
                    onClick={() => startTimer(key, spell)}
                    className={`rounded px-2 py-1 text-[10px] ${
                      seconds > 0
                        ? 'bg-rose-500/25 text-rose-100'
                        : 'bg-white/8 text-white/65 hover:bg-white/15'
                    }`}
                    title="点击开始计时，再次点击可重置"
                  >
                    {spell || '-'} {seconds > 0 ? `${seconds}s` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssistOverlayApp({ name }: { name: AssistOverlayName }) {
  return (
    <OverlayFrame name={name}>
      {name === 'helper' && <HelperOverlay />}
      {name === 'match' && <MatchOverlay />}
      {name === 'spells' && <LiveClientOverlay />}
    </OverlayFrame>
  );
}
