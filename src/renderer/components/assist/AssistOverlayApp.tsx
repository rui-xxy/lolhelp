import {
  Activity,
  GripHorizontal,
  RefreshCw,
  Swords,
  Timer,
  Wand2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type {
  AppSettings,
  AssistChampionGuide,
  AssistLiveData,
  AssistOverlayName,
  AssistRecommendation,
  AssistRuntimeStatus,
  LiveBattleInfo,
  LiveBattlePlayer,
} from '../../../shared/api';

const overlayMeta: Record<AssistOverlayName, {
  title: string;
  eyebrow: string;
  icon: typeof Swords;
}> = {
  helper: { title: '对局助手', eyebrow: 'Champion Helper', icon: Wand2 },
  match: { title: '战绩卡片', eyebrow: 'Match Scout', icon: Swords },
  spells: { title: '技能计时', eyebrow: 'Spell Timer', icon: Timer },
};

function useOverlayClose(name: AssistOverlayName) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void window.lolHelper.assist.toggleOverlay(name);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [name]);
}

function OverlayFrame({
  name,
  children,
}: {
  name: AssistOverlayName;
  children: ReactNode;
}) {
  useOverlayClose(name);
  const meta = overlayMeta[name];
  const Icon = meta.icon;

  return (
    <div className="h-screen overflow-hidden rounded-2xl border border-white/75 bg-gradient-to-br from-white/[0.96] via-sky-50/[0.94] to-violet-50/[0.92] text-slate-800 shadow-[0_20px_55px_rgba(71,85,105,.22)] backdrop-blur-2xl">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/70 px-3 [-webkit-app-region:drag]">
        <div className="flex size-8 items-center justify-center rounded-xl border border-white bg-gradient-to-br from-sky-100 to-violet-100 shadow-sm">
          <Icon className="size-4 text-sky-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
            {meta.eyebrow}
          </div>
          <div className="truncate text-sm font-semibold text-slate-800">{meta.title}</div>
        </div>
        <GripHorizontal className="size-4 text-slate-300" />
        <button
          type="button"
          title="关闭"
          aria-label="关闭浮窗"
          onClick={() => void window.lolHelper.assist.toggleOverlay(name)}
          className="flex size-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 [-webkit-app-region:no-drag]"
        >
          <X className="size-4" />
        </button>
      </header>
      <main className="h-[calc(100vh-48px)] overflow-y-auto p-3">
        {children}
      </main>
    </div>
  );
}

function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/80 bg-white/75 p-3 shadow-[0_10px_26px_rgba(71,85,105,.10)] ${className}`}>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center text-sm leading-6 text-slate-500">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-white bg-white/80 shadow-sm">
        <Activity className="size-5 text-sky-500" />
      </div>
      <div>{children}</div>
    </div>
  );
}

function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'danger' | 'warn';
}) {
  const colors = {
    neutral: 'border border-slate-200 bg-slate-100/80 text-slate-500',
    good: 'border border-emerald-100 bg-emerald-50 text-emerald-600',
    danger: 'border border-rose-100 bg-rose-50 text-rose-600',
    warn: 'border border-amber-100 bg-amber-50 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[tone]}`}>
      {children}
    </span>
  );
}

function HelperOverlay() {
  const [status, setStatus] = useState<AssistRuntimeStatus | null>(null);
  const [recommendation, setRecommendation] = useState<AssistRecommendation | null>(null);
  const [guide, setGuide] = useState<AssistChampionGuide | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let stopped = false;
    let lastChampionId = 0;
    const refresh = async () => {
      const next = await window.lolHelper.assist.getStatus();
      if (stopped) return;
      setStatus(next);
      if (next.championId && next.championId !== lastChampionId) {
        lastChampionId = next.championId;
        setLoading(true);
        Promise.all([
          window.lolHelper.assist.getRecommendation(),
          window.lolHelper.assist.getChampionGuide(next.championId),
        ])
          .then(([value, championGuide]) => {
            if (!stopped) {
              setRecommendation(value);
              setGuide(championGuide);
              setMessage('');
            }
          })
          .catch((error) => {
            if (!stopped) setMessage(String(error));
          })
          .finally(() => {
            if (!stopped) setLoading(false);
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
    return (
      <EmptyState>
        进入选人阶段并选中英雄后，这里会显示英雄资料、符文和装备推荐。
        <br />
        这个窗口可以拖动，Esc 或右上角都能关闭。
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
              Current Pick
            </div>
            <div className="mt-1 text-base font-semibold">
              {guide ? `${guide.name} · ${guide.title}` : `英雄 ${status.championId}`}
            </div>
          </div>
          <StatusPill tone={status.connected ? 'good' : 'warn'}>
            {status.phase || '等待状态'}
          </StatusPill>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-2 py-2">
            <div className="text-[10px] text-slate-400">位置</div>
            <div className="mt-1 text-xs font-semibold">{status.position || '未知'}</div>
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-2 py-2">
            <div className="text-[10px] text-slate-400">队列</div>
            <div className="mt-1 text-xs font-semibold">{status.queueId || '--'}</div>
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-2 py-2">
            <div className="text-[10px] text-slate-400">英雄 ID</div>
            <div className="mt-1 text-xs font-semibold">{status.championId}</div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className="size-4 animate-spin" />
            正在读取推荐…
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">推荐符文</div>
                <div className="mt-1 text-sm font-semibold">
                  {recommendation?.rune?.name || '暂无推荐'}
                </div>
              </div>
              {recommendation?.rune && (
                <StatusPill tone="good">
                  胜率 {(recommendation.rune.winRate * 100).toFixed(1)}%
                </StatusPill>
              )}
            </div>
          </Card>

          {recommendation?.items.length ? (
            <Card>
              <div className="mb-2 text-xs font-semibold text-slate-500">装备路线</div>
              <div className="space-y-2">
                {recommendation.items.map((block) => (
                  <div key={block.title} className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-2">
                    <div className="text-[10px] text-slate-400">{block.title}</div>
                    <div className="mt-1 text-xs text-slate-700">{block.itemIds.join(' → ')}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {guide?.spells.length ? (
            <Card>
              <div className="mb-2 text-xs font-semibold text-slate-500">技能信息</div>
              <div className="space-y-1.5">
                {guide.spells.map((spell) => (
                  <details key={spell.key} className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-2 py-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium">
                      {spell.key} · {spell.name}
                      <span className="ml-2 text-slate-400">CD {spell.cooldown}</span>
                    </summary>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{spell.description}</p>
                  </details>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMessage('正在锁定…');
            void window.lolHelper.assist.lockCurrentChampion()
              .then((result) => setMessage(result.message));
          }}
          className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-sky-50 hover:text-sky-700"
        >
          锁定英雄
        </button>
        <button
          type="button"
          onClick={() => {
            setMessage('正在应用…');
            void window.lolHelper.assist.applyRecommendation()
              .then((results) => setMessage(results.map((item) => item.message).join('；')))
              .catch((error) => setMessage(String(error)));
          }}
          className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          应用推荐
        </button>
      </div>
      {message && <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500 shadow-sm">{message}</div>}
    </div>
  );
}

function normalizeRiotId(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function averageWinRate(players: LiveBattlePlayer[]) {
  const known = players.filter((player) => player.matchCount > 0);
  return known.length
    ? Math.round(known.reduce((sum, player) => sum + player.winRate, 0) / known.length)
    : 0;
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

  const normalizedBlacklist = useMemo(
    () => new Set((settings?.blacklist ?? []).map((entry) => normalizeRiotId(entry.riotId))),
    [settings?.blacklist],
  );
  const activeTags = settings?.assist.playerTags ?? [];
  const powerTitles = settings?.assist.powerTitles ?? [];

  if (!battle?.inGame) {
    return (
      <EmptyState>
        进入选人或游戏后显示双方玩家的近期表现。
        <br />
        当前没有可展示的实时对局。
      </EmptyState>
    );
  }

  const myRate = averageWinRate(battle.myTeam);
  const enemyRate = averageWinRate(battle.enemyTeam);
  const totalRate = myRate + enemyRate;

  const tagsForPlayer = (player: LiveBattlePlayer): Array<{ text: string; tone?: 'danger' | 'good' | 'warn' }> => {
    const tags: Array<{ text: string; tone?: 'danger' | 'good' | 'warn' }> = [];
    if (activeTags.includes('胜率') && player.matchCount > 0) {
      tags.push({ text: `胜率 ${player.winRate}%`, tone: player.winRate >= 60 ? 'good' : undefined });
    }
    if (activeTags.includes('KDA') && player.matchCount > 0) tags.push({ text: `KDA ${player.kda.toFixed(1)}` });
    if (activeTags.includes('连胜/连败')) {
      const first = player.history[0]?.win;
      let streak = 0;
      for (const game of player.history) {
        if (game.win !== first) break;
        streak += 1;
      }
      if (streak >= 2) tags.push({ text: `${streak}连${first ? '胜' : '败'}`, tone: first ? 'good' : 'warn' });
    }
    if (
      activeTags.includes('首次使用英雄') &&
      player.history.length > 0 &&
      !player.history.some((game) => game.championId === player.championId)
    ) {
      tags.push({ text: '近期首玩', tone: 'warn' });
    }
    if (
      activeTags.includes('黑名单') &&
      normalizedBlacklist.has(normalizeRiotId(player.riotId))
    ) {
      tags.push({ text: '黑名单', tone: 'danger' });
    }
    return tags;
  };

  const titleForPlayer = (player: LiveBattlePlayer) => {
    if (powerTitles.length === 0 || player.matchCount === 0) return '';
    const score = player.winRate + Math.min(30, player.kda * 5);
    const index = score >= 85 ? 4 : score >= 75 ? 3 : score >= 65 ? 2 : score >= 55 ? 1 : 0;
    return powerTitles[index] ?? '';
  };

  const renderTeam = (label: string, players: LiveBattlePlayer[], accent: string) => (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <StatusPill>{players.length} 人</StatusPill>
      </div>
      <div className="space-y-2">
        {players.map((player) => (
          <div key={player.puuid || player.riotId} className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-2">
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${accent}`} />
              <div className="min-w-0 flex-1 truncate text-xs font-semibold">{player.riotId}</div>
              {titleForPlayer(player) && (
                <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">{titleForPlayer(player)}</span>
              )}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>{player.championName || '未知英雄'}</span>
              <span>{player.matchCount ? `${player.matchCount} 场样本` : '暂无样本'}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tagsForPlayer(player).slice(0, 4).map((tag) => (
                <StatusPill key={tag.text} tone={tag.tone ?? 'neutral'}>{tag.text}</StatusPill>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>我方近期胜率 {myRate || '--'}%</span>
          <span>敌方近期胜率 {enemyRate || '--'}%</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="bg-sky-400"
            style={{ width: `${totalRate > 0 ? (myRate / totalRate) * 100 : 50}%` }}
          />
          <div className="flex-1 bg-rose-300" />
        </div>
        <div className="mt-2 text-[10px] text-slate-400">每 5 秒自动刷新一次</div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        {renderTeam('我方', battle.myTeam, 'bg-sky-400')}
        {renderTeam('敌方', battle.enemyTeam, 'bg-rose-300')}
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
    return (
      <EmptyState>
        游戏进程启动后读取 2999 实时数据。
        <br />
        {data?.error || '等待对局中'}
      </EmptyState>
    );
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
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{data.gameMode || '实时对局'}</span>
          <span>
            {Math.floor(data.gameTime / 60)}
            :
            {String(Math.floor(data.gameTime % 60)).padStart(2, '0')}
          </span>
        </div>
      </Card>
      <div className="space-y-2">
        {data.players.map((player) => (
          <Card key={`${player.riotId}-${player.championName}`} className="p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="min-w-0 flex-1 truncate font-semibold">{player.riotId}</span>
              <StatusPill>Lv.{player.level}</StatusPill>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
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
                    className={`rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors ${
                      seconds > 0
                        ? 'border border-rose-100 bg-rose-50 text-rose-600'
                        : 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-sky-50 hover:text-sky-700'
                    } disabled:opacity-40`}
                    title="点击开始计时，再次点击可重置"
                  >
                    {spell || '-'} {seconds > 0 ? `${seconds}s` : ''}
                  </button>
                );
              })}
            </div>
          </Card>
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
