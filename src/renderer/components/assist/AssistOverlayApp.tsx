import {
  Activity,
  CheckCircle2,
  Clock3,
  GripHorizontal,
  MousePointerClick,
  Pause,
  Pin,
  RefreshCw,
  RotateCcw,
  Swords,
  Timer,
  Wand2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type {
  AppSettings,
  AssistChampionGuide,
  AssistLiveData,
  AssistLivePlayer,
  AssistLiveSpell,
  AssistOverlayName,
  AssistRecommendation,
  AssistRuntimeStatus,
  LiveBattleInfo,
  LiveBattlePlayer,
} from '../../../shared/api';

const overlayMeta: Record<AssistOverlayName, {
  title: string;
  eyebrow: string;
  hotkey: string;
  icon: typeof Swords;
}> = {
  helper: { title: '对局助手', eyebrow: 'Champion Helper', hotkey: 'Shift+F5', icon: Wand2 },
  match: { title: '战绩卡片', eyebrow: 'Match Scout', hotkey: 'Shift+Tab', icon: Swords },
  spells: { title: '技能计时', eyebrow: 'Spell Timer', hotkey: 'Shift+F6', icon: Timer },
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
  actions,
}: {
  name: AssistOverlayName;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useOverlayClose(name);
  const meta = overlayMeta[name];
  const Icon = meta.icon;

  return (
    <div className="h-screen overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-white/[0.97] via-sky-50/[0.94] to-violet-50/[0.92] text-slate-800 shadow-[0_18px_48px_rgba(15,23,42,.18)] backdrop-blur-2xl">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200/70 bg-white/72 px-3 [-webkit-app-region:drag]">
        <div className="flex size-8 items-center justify-center rounded-xl border border-white bg-gradient-to-br from-sky-100 to-violet-100 shadow-sm">
          <Icon className="size-4 text-sky-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
            {meta.eyebrow}
          </div>
          <div className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
            <span>{meta.title}</span>
            <kbd className="rounded-md border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              {meta.hotkey}
            </kbd>
          </div>
        </div>
        {actions}
        <GripHorizontal className="size-4 text-slate-300" />
        <button
          type="button"
          title="关闭"
          aria-label="关闭悬浮窗"
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

function HeaderIconButton({
  title,
  active = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-xl transition-colors [-webkit-app-region:no-drag] ${
        active
          ? 'bg-sky-100 text-sky-600'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
      }`}
    >
      {children}
    </button>
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
    <section className={`rounded-2xl border border-white/80 bg-white/76 p-3 shadow-[0_10px_26px_rgba(71,85,105,.10)] ${className}`}>
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
  tone?: 'neutral' | 'good' | 'danger' | 'warn' | 'info';
}) {
  const colors = {
    neutral: 'border border-slate-200 bg-slate-100/80 text-slate-500',
    good: 'border border-emerald-100 bg-emerald-50 text-emerald-600',
    danger: 'border border-rose-100 bg-rose-50 text-rose-600',
    warn: 'border border-amber-100 bg-amber-50 text-amber-700',
    info: 'border border-sky-100 bg-sky-50 text-sky-600',
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
        窗口可以拖动，Esc 或右上角都能关闭。
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

type TimerState = {
  endsAt: number;
  cooldown: number;
  paused: boolean;
  pausedRemaining: number;
};

type PlayerAdjustments = {
  boots?: boolean;
  cosmic?: boolean;
};

function formatGameTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function adjustedCooldown(baseCooldown: number, withBoots: boolean, withCosmic: boolean): number {
  const haste = (withBoots ? 10 : 0) + (withCosmic ? 18 : 0);
  if (haste <= 0) return Math.max(1, Math.round(baseCooldown));
  return Math.max(1, Math.round(baseCooldown * (100 / (100 + haste))));
}

function spellKey(player: AssistLivePlayer, slot: number): string {
  return `${player.riotId}:${player.championName}:${slot}`;
}

function playerKey(player: AssistLivePlayer): string {
  return `${player.riotId}:${player.championName}`;
}

function timerRemaining(timer: TimerState | undefined, gameTime: number): number {
  if (!timer) return 0;
  if (timer.paused) return timer.pausedRemaining;
  return Math.max(0, Math.ceil(timer.endsAt - gameTime));
}

function SpellButton({
  spell,
  timer,
  gameTime,
  withBoots,
  withCosmic,
  onStart,
  onTogglePause,
  onReset,
}: {
  spell: AssistLiveSpell | null;
  timer?: TimerState;
  gameTime: number;
  withBoots: boolean;
  withCosmic: boolean;
  onStart: () => void;
  onTogglePause: () => void;
  onReset: () => void;
}) {
  const remaining = timerRemaining(timer, gameTime);
  const running = Boolean(timer && remaining > 0);
  const cooldown = spell
    ? adjustedCooldown(spell.cooldown, withBoots, withCosmic)
    : 0;

  if (!spell) {
    return (
      <div className="flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100/80 text-xs text-slate-300">
        -
      </div>
    );
  }

  return (
    <button
      type="button"
      title={running ? '点击暂停/继续，双击或右键清除' : `点击开始 ${cooldown} 秒计时`}
      onClick={(event) => {
        event.stopPropagation();
        if (running) onTogglePause();
        else onStart();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onReset();
      }}
      className={`relative size-12 overflow-hidden rounded-xl border shadow-sm transition-transform hover:scale-[1.03] ${
        running
          ? 'border-rose-200 bg-rose-50'
          : 'border-white bg-white/90'
      }`}
    >
      {spell.icon ? (
        <img
          src={spell.icon}
          alt={spell.name}
          className={`size-full object-cover ${running ? 'opacity-95' : 'opacity-55 grayscale-[.15]'}`}
        />
      ) : (
        <span className="flex size-full items-center justify-center text-[11px] font-semibold text-slate-500">
          {spell.name.slice(0, 2)}
        </span>
      )}
      {running ? (
        <span className="absolute inset-0 grid place-items-center bg-slate-900/44 text-base font-black text-white">
          {remaining}
        </span>
      ) : (
        <span className="absolute bottom-0 left-0 right-0 bg-white/82 py-0.5 text-[9px] font-semibold text-slate-500">
          {cooldown}s
        </span>
      )}
      {timer?.paused && (
        <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-400 p-0.5 text-white">
          <Pause className="size-2.5" />
        </span>
      )}
    </button>
  );
}

function LivePlayerCard({
  player,
  data,
  timers,
  adjustments,
  onStart,
  onTogglePause,
  onReset,
  onToggleAdjustment,
}: {
  player: AssistLivePlayer;
  data: AssistLiveData;
  timers: Record<string, TimerState>;
  adjustments: PlayerAdjustments;
  onStart: (key: string, cooldown: number) => void;
  onTogglePause: (key: string) => void;
  onReset: (key: string) => void;
  onToggleAdjustment: (field: keyof PlayerAdjustments, value: boolean) => void;
}) {
  const baseHasBoots = player.items.includes(3158);
  const withBoots = adjustments.boots ?? baseHasBoots;
  const withCosmic = adjustments.cosmic ?? false;
  const spells = [player.spellOne, player.spellTwo];
  const activeTimers = spells
    .map((_, index) => timers[spellKey(player, index)])
    .filter(Boolean);
  const nextReady = activeTimers
    .map((timer) => timer.paused
      ? data.gameTime + timer.pausedRemaining
      : timer.endsAt)
    .sort((a, b) => a - b)[0];

  return (
    <Card className="p-2.5">
      <div className="flex items-center gap-2">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-xl border border-white bg-slate-100 shadow-sm">
          {player.championIcon ? (
            <img src={player.championIcon} alt={player.championName} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-xs text-slate-400">?</div>
          )}
          <span className="absolute bottom-0 right-0 rounded-tl-md bg-white/90 px-1 text-[9px] font-bold text-slate-500">
            {player.level || '-'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-xs font-semibold text-slate-800">{player.riotId}</div>
            {player.isEnemy ? <StatusPill tone="danger">敌方</StatusPill> : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="truncate">{player.championName}</span>
            <span>{player.kills}/{player.deaths}/{player.assists}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          {spells.map((spell, index) => {
            const key = spellKey(player, index);
            const timer = timers[key];
            const cooldown = spell
              ? adjustedCooldown(spell.cooldown, withBoots, withCosmic)
              : 0;
            return (
              <SpellButton
                key={key}
                spell={spell}
                timer={timer}
                gameTime={data.gameTime}
                withBoots={withBoots}
                withCosmic={withCosmic}
                onStart={() => spell && onStart(key, cooldown)}
                onTogglePause={() => onTogglePause(key)}
                onReset={() => onReset(key)}
              />
            );
          })}
        </div>
        <div className="ml-auto flex flex-col gap-1">
          <button
            type="button"
            title="明朗之靴：召唤师技能急速 +10"
            onClick={() => onToggleAdjustment('boots', !withBoots)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
              withBoots
                ? 'border-sky-200 bg-sky-50 text-sky-600'
                : 'border-slate-200 bg-white/70 text-slate-400'
            }`}
          >
            CD鞋
          </button>
          <button
            type="button"
            title="星界洞悉：召唤师技能急速 +18"
            onClick={() => onToggleAdjustment('cosmic', !withCosmic)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
              withCosmic
                ? 'border-violet-200 bg-violet-50 text-violet-600'
                : 'border-slate-200 bg-white/70 text-slate-400'
            }`}
          >
            洞悉
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{nextReady ? `最近转好 ${formatGameTime(nextReady)}` : '点技能图标开始计时'}</span>
        <span>{withBoots || withCosmic ? '已按急速修正' : '基础冷却'}</span>
      </div>
    </Card>
  );
}

function LiveClientOverlay() {
  const [data, setData] = useState<AssistLiveData | null>(null);
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [adjustments, setAdjustments] = useState<Record<string, PlayerAdjustments>>({});
  const [message, setMessage] = useState('');
  const [pinned, setPinned] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const value = await window.lolHelper.assist.getLiveData();
      setData(value);
      setMessage(value.active ? '' : value.error || '等待对局中');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const safeRefresh = async () => {
      const value = await window.lolHelper.assist.getLiveData();
      if (!stopped) {
        setData(value);
        if (!value.active) setMessage(value.error || '等待对局中');
      }
    };
    void safeRefresh();
    const timer = window.setInterval(() => void safeRefresh(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!data?.active) return;
    setTimers((current) => Object.fromEntries(
      Object.entries(current).filter(([, timer]) =>
        timer.paused || timer.endsAt - data.gameTime > -3),
    ));
  }, [data?.active, data?.gameTime]);

  const enemyPlayers = useMemo(
    () => data?.players.filter((player) => player.isEnemy) ?? [],
    [data?.players],
  );
  const displayPlayers = enemyPlayers.length > 0 ? enemyPlayers : data?.players ?? [];

  const startTimer = (key: string, cooldown: number) => {
    if (!data) return;
    setTimers((current) => ({
      ...current,
      [key]: {
        endsAt: data.gameTime + cooldown,
        cooldown,
        paused: false,
        pausedRemaining: cooldown,
      },
    }));
  };

  const togglePause = (key: string) => {
    if (!data) return;
    setTimers((current) => {
      const timer = current[key];
      if (!timer) return current;
      const remaining = timerRemaining(timer, data.gameTime);
      return {
        ...current,
        [key]: timer.paused
          ? {
            ...timer,
            endsAt: data.gameTime + timer.pausedRemaining,
            paused: false,
          }
          : {
            ...timer,
            paused: true,
            pausedRemaining: remaining,
          },
      };
    });
  };

  const resetTimer = (key: string) => {
    setTimers((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const resetAll = () => {
    setTimers({});
  };

  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);
    void window.lolHelper.assist.setOverlayPinned('spells', next);
  };

  const actions = (
    <>
      <HeaderIconButton title="刷新数据" onClick={() => void refresh()}>
        <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
      </HeaderIconButton>
      <HeaderIconButton title={pinned ? '取消置顶' : '置顶'} active={pinned} onClick={togglePinned}>
        <Pin className={`size-4 ${pinned ? '-rotate-45' : ''}`} />
      </HeaderIconButton>
    </>
  );

  if (!data?.active) {
    return (
      <OverlayFrame name="spells" actions={actions}>
        <EmptyState>
          游戏载入后会读取 2999 实时数据。
          <br />
          {message || '等待对局中…'}
        </EmptyState>
      </OverlayFrame>
    );
  }

  return (
    <OverlayFrame name="spells" actions={actions}>
      <div className="space-y-3">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                Live Game
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Clock3 className="size-4 text-sky-500" />
                {formatGameTime(data.gameTime)}
              </div>
            </div>
            <div className="text-right">
              <StatusPill tone={enemyPlayers.length ? 'danger' : 'info'}>
                {enemyPlayers.length ? `敌方 ${enemyPlayers.length} 人` : '显示全部玩家'}
              </StatusPill>
              <div className="mt-1 text-[10px] text-slate-400">{data.gameMode || '实时对局'}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
            <div className="flex items-center gap-1 rounded-xl bg-slate-50/80 px-2 py-1.5">
              <MousePointerClick className="size-3.5 text-sky-500" />
              单击计时
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-50/80 px-2 py-1.5">
              <Pause className="size-3.5 text-amber-500" />
              再点暂停
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-50/80 px-2 py-1.5">
              <RotateCcw className="size-3.5 text-rose-500" />
              右键清除
            </div>
          </div>
        </Card>

        <div className="space-y-2">
          {displayPlayers.map((player) => (
            <LivePlayerCard
              key={playerKey(player)}
              player={player}
              data={data}
              timers={timers}
              adjustments={adjustments[playerKey(player)] ?? {}}
              onStart={startTimer}
              onTogglePause={togglePause}
              onReset={resetTimer}
              onToggleAdjustment={(field, value) => {
                setAdjustments((current) => ({
                  ...current,
                  [playerKey(player)]: {
                    ...(current[playerKey(player)] ?? {}),
                    [field]: value,
                  },
                }));
              }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-500"
          >
            <RotateCcw className="size-3.5" />
            清空计时
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <CheckCircle2 className="size-3.5" />
            刷新数据
          </button>
        </div>
      </div>
    </OverlayFrame>
  );
}

export function AssistOverlayApp({ name }: { name: AssistOverlayName }) {
  if (name === 'spells') return <LiveClientOverlay />;

  return (
    <OverlayFrame name={name}>
      {name === 'helper' && <HelperOverlay />}
      {name === 'match' && <MatchOverlay />}
    </OverlayFrame>
  );
}
