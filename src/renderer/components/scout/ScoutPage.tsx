import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, Minus, Plus, RotateCcw, SlidersHorizontal, Square, Star, X } from 'lucide-react';
import { ChampionPickerDialog } from './ChampionPickerDialog';
import { GameIcon } from '../match/GameIcon';
import { ScoutHitCard } from './ScoutHitCard';
import { ScoutMatchPeek } from './ScoutMatchPeek';
import { ErrorBoundary } from '../ErrorBoundary';
import { createScoutRadarFeed } from './ScoutRadar';
import { ScoutScope, type ScoutLogEntry } from './ScoutScope';
import type {
  AppSettings,
  ChampionPreset,
  ChampionSummary,
  ScoutConfig,
  ScoutHit,
  ScoutPlayerEvent,
  ScoutProgress,
} from '../../../shared/api';
import { DEFAULT_ASSIST_SETTINGS } from '../../../shared/assist';
import { LOL_REGIONS } from '../../../shared/constants';

interface ScoutPageStatus {
  running: boolean;
  progress: ScoutProgress | null;
  hits: ScoutHit[];
  targetCount: number;
  region?: string;
  startedAt?: number | null;
  finishedAt?: number | null;
}

interface ScoutPageProps {
  onPlayerSearch: (name: string, region?: string) => void;
  currentRegionName: string;
  configPanelMinimized?: boolean;
  onConfigPanelMinimize?: () => void;
  onConfigPanelRestore?: () => void;
  onStatusChange?: (status: ScoutPageStatus | null) => void;
}

const KDA_THRESHOLD_MIN = 10;
const KDA_THRESHOLD_MAX = 25;
const KDA_THRESHOLD_STEP = 0.5;
const SCOUT_UI_FLUSH_MS = 250;
const SCOUT_SIDEBAR_FLUSH_MS = 500;

// 默认配置
const DEFAULT_CONFIG: ScoutConfig = {
  seedId: '',
  championIds: [],
  kdaThreshold: KDA_THRESHOLD_MIN,
  hoursWindow: 3,
  targetCount: 10,
  region: '',
  tag: 'q_450',
  topSeedsPerGame: 2,
};

// 模式列表（与 MatchHistoryPage 的 QUEUE_FILTERS 同步，这里去掉"全部"——雷达要求单一模式更纯净）
const QUEUE_OPTIONS = [
  { tag: 'q_420', name: '单双排' },
  { tag: 'q_440', name: '灵活组排' },
  { tag: 'q_450', name: '大乱斗' },
  { tag: 'q_2400', name: '海克斯大乱斗' },
  { tag: 'q_490', name: '快速模式' },
  { tag: 'q_1700', name: '竞技场' },
];

// 时间窗快捷档（小时）
const HOUR_OPTIONS = [1, 2, 3, 6, 12, 24];

const SCAN_LOG_LIMIT = 6;
const TARGET_MAX = 50;

// 配置区每一项的小标签：序号 + 中文 + 英文缩写，右侧可放读数或操作
function DeckLabel({ index, text, code, aside }: { index: string; text: ReactNode; code: string; aside?: ReactNode }) {
  return (
    <div className="scout-label">
      <span className="scout-label__text">
        <i>{index}</i>
        {text}
        <em>{code}</em>
      </span>
      {aside}
    </div>
  );
}

function toLogEntry(event: ScoutPlayerEvent, serial: number): ScoutLogEntry | null {
  if (!event.profile || (event.state !== 'checked' && event.state !== 'matched')) return null;
  return {
    key: `${event.puuid}-${event.state}-${serial}`,
    state: event.state,
    name: event.profile.riotId || '未知玩家',
    iconId: event.profile.profileIconId,
    iconUrl: event.profile.profileIconUrl,
    championName: event.recentChampionName,
    championAvatar: event.recentChampionAvatar,
    kda: event.recentKda,
  };
}

function clampKdaThreshold(value: number | undefined): number {
  const numeric = Number(value ?? KDA_THRESHOLD_MIN);
  if (!Number.isFinite(numeric)) return KDA_THRESHOLD_MIN;
  return Math.min(KDA_THRESHOLD_MAX, Math.max(KDA_THRESHOLD_MIN, numeric));
}

function makeScoutRunKey(config: ScoutConfig): string {
  return JSON.stringify({
    seedId: config.seedId.trim(),
    championIds: [...config.championIds].sort((a, b) => a - b),
    kdaThreshold: config.kdaThreshold,
    hoursWindow: config.hoursWindow,
    region: config.region ?? '',
    tag: config.tag ?? '',
    topSeedsPerGame: config.topSeedsPerGame ?? 2,
  });
}

function mergeHits(baseHits: ScoutHit[], nextHits: ScoutHit[]): ScoutHit[] {
  const seen = new Set<string>();
  const merged: ScoutHit[] = [];
  for (const hit of [...baseHits, ...nextHits]) {
    const key = hit.profile.puuid || hit.profile.riotId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }
  return merged;
}

export function ScoutPage({
  onPlayerSearch,
  currentRegionName,
  configPanelMinimized = false,
  onConfigPanelMinimize,
  onConfigPanelRestore,
  onStatusChange,
}: ScoutPageProps) {
  const [config, setConfig] = useState<ScoutConfig>(DEFAULT_CONFIG);
  const [champions, setChampions] = useState<ChampionSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    favoriteChampions: [],
    championPresets: [],
    assist: DEFAULT_ASSIST_SETTINGS,
    blacklist: [],
  });
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [championPresets, setChampionPresets] = useState<ChampionPreset[]>([]);

  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState<ScoutHit[]>([]);
  const [progress, setProgress] = useState<ScoutProgress | null>(null);
  const pendingSidebarStatusRef = useRef<ScoutPageStatus | null>(null);
  const sidebarStatusTimerRef = useRef<number | null>(null);
  const publishedSidebarRunningRef = useRef<boolean | null>(null);
  const [finalSummary, setFinalSummary] = useState<string>('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [championsLoading, setChampionsLoading] = useState(true);
  const [championsError, setChampionsError] = useState('');
  const [activeRunKey, setActiveRunKey] = useState('');
  const [batchStarts, setBatchStarts] = useState<number[]>([]);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [searchFinishedAt, setSearchFinishedAt] = useState<number | null>(null);
  const [scanLog, setScanLog] = useState<ScoutLogEntry[]>([]);
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const [radarFeed] = useState(createScoutRadarFeed);
  const logSerialRef = useRef(0);
  const initializedRef = useRef(false);

  // 英雄 id → 详情（给已选摘要展示用）
  const championMap = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const selectedChampions = useMemo(
    () =>
      config.championIds
        .map((id) => championMap.get(id))
        .filter((c): c is ChampionSummary => Boolean(c)),
    [config.championIds, championMap],
  );
  const regionOptions = useMemo(
    () => [{ key: '', name: currentRegionName }, ...LOL_REGIONS],
    [currentRegionName],
  );

  // 加载英雄列表 + 设置
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      try {
        setChampionsLoading(true);
        setChampionsError('');
        const [champs, s] = await Promise.all([
          window.lolHelper.match.getChampions(),
          window.lolHelper.db.getSettings(),
        ]);
        setChampions(champs);
        setSettings(s);
        setFavoriteIds(s.favoriteChampions ?? []);
        setChampionPresets(s.championPresets ?? []);
        // 回填上次的雷达配置
        const scoutDefaults = s.scoutDefaults;
        if (scoutDefaults) {
          setConfig((c) => ({
            ...c,
            ...scoutDefaults,
            kdaThreshold: clampKdaThreshold(scoutDefaults.kdaThreshold),
          }));
        }
        if (champs.length === 0) {
          setChampionsError('英雄列表为空（datas.json 可能未加载，请重启应用）');
        }
      } catch (err) {
        console.error('[scout] 初始化失败:', err);
        setChampionsError(err instanceof Error ? err.message : String(err));
      } finally {
        setChampionsLoading(false);
      }
    })();
  }, []);

  // 持久化收藏
  const persistSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      void window.lolHelper.db
        .updateSettings({
          favoriteChampions: next.favoriteChampions,
          championPresets: next.championPresets,
          scoutDefaults: next.scoutDefaults,
        })
        .catch((err) => {
          console.error('[scout] 保存设置失败:', err);
        });
    },
    [],
  );

  const toggleFavorite = useCallback(
    (id: number) => {
      const next = favoriteIds.includes(id)
        ? favoriteIds.filter((x) => x !== id)
        : [...favoriteIds, id];
      setFavoriteIds(next);
      persistSettings({ ...settings, favoriteChampions: next });
    },
    [favoriteIds, settings, persistSettings],
  );

  const updateConfig = (patch: Partial<ScoutConfig>) => {
    setConfig((c) => ({
      ...c,
      ...patch,
      ...(patch.kdaThreshold !== undefined
        ? { kdaThreshold: clampKdaThreshold(patch.kdaThreshold) }
        : {}),
    }));
  };

  const getChampionDisplayName = useCallback(
    (id: number) => {
      const champion = championMap.get(id);
      return champion?.title || champion?.name || `英雄${id}`;
    },
    [championMap],
  );

  const makeChampionPresetName = useCallback(
    (ids: number[]) => {
      const names = ids.slice(0, 3).map(getChampionDisplayName);
      if (names.length === 0) return '英雄方案';
      return ids.length > 3 ? `${names.join('、')} 等${ids.length}` : names.join('、');
    },
    [getChampionDisplayName],
  );

  const sameChampionSet = useCallback((a: number[], b: number[]) => {
    if (a.length !== b.length) return false;
    const left = [...a].sort((x, y) => x - y);
    const right = [...b].sort((x, y) => x - y);
    return left.every((id, index) => id === right[index]);
  }, []);

  const saveChampionPreset = useCallback(() => {
    const ids = [...config.championIds];
    if (ids.length === 0) return;
    const existing = championPresets.find((preset) => sameChampionSet(preset.championIds, ids));
    const preset: ChampionPreset = {
      id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: existing?.name ?? makeChampionPresetName(ids),
      championIds: ids,
      updatedAt: Date.now(),
    };
    const next = [preset, ...championPresets.filter((item) => item.id !== preset.id)].slice(0, 12);
    setChampionPresets(next);
    persistSettings({ ...settings, championPresets: next });
  }, [
    championPresets,
    config.championIds,
    makeChampionPresetName,
    persistSettings,
    sameChampionSet,
    settings,
  ]);

  const applyChampionPreset = useCallback((ids: number[]) => {
    setConfig((c) => ({ ...c, championIds: [...ids] }));
  }, []);

  const deleteChampionPreset = useCallback(
    (id: string) => {
      const next = championPresets.filter((preset) => preset.id !== id);
      setChampionPresets(next);
      persistSettings({ ...settings, championPresets: next });
    },
    [championPresets, persistSettings, settings],
  );

  const canStart =
    !running &&
    config.seedId.trim() !== '' &&
    config.championIds.length > 0 &&
    config.kdaThreshold > 0;
  const currentRunKey = useMemo(() => makeScoutRunKey(config), [config]);
  const canContinue = hits.length > 0 && activeRunKey === currentRunKey;

  const handleStart = useCallback(async () => {
    if (!canStart) return;
    const continuing = hits.length > 0 && activeRunKey === currentRunKey;
    const baseHits = continuing ? hits : [];
    const excludePuuids = baseHits.map((hit) => hit.profile.puuid).filter(Boolean);
    const runConfig: ScoutConfig = {
      ...config,
      excludePuuids,
    };

    const startedAt = Date.now();
    setRunning(true);
    onConfigPanelMinimize?.();
    setSearchStartedAt(startedAt);
    setSearchFinishedAt(null);
    if (continuing) {
      setBatchStarts((prev) => (prev.includes(baseHits.length) ? prev : [...prev, baseHits.length]));
    } else {
      setHits([]);
      setBatchStarts([0]);
      setScanLog([]);
      setPeekKey(null);
      radarFeed.reset();
    }
    setProgress(null);
    setFinalSummary('');
    setError('');
    setActiveRunKey(currentRunKey);

    // 持久化本次配置
    persistSettings({ ...settings, scoutDefaults: config });

    let pendingProgress: ScoutProgress | null = null;
    let pendingHits: ScoutHit[] = [];
    let pendingLog: ScoutLogEntry[] = [];
    let progressFlushTimer: number | null = null;
    const flushProgress = () => {
      if (progressFlushTimer !== null) {
        window.clearTimeout(progressFlushTimer);
        progressFlushTimer = null;
      }
      startTransition(() => {
        if (pendingProgress) {
          setProgress(pendingProgress);
          pendingProgress = null;
        }
        if (pendingHits.length > 0) {
          const newHits = pendingHits;
          pendingHits = [];
          setHits((prev) => mergeHits(prev, newHits));
        }
        if (pendingLog.length > 0) {
          const newLog = pendingLog.reverse();
          pendingLog = [];
          setScanLog((prev) => [...newLog, ...prev].slice(0, SCAN_LOG_LIMIT));
        }
      });
    };
    const queueProgress = (nextProgress: ScoutProgress) => {
      pendingProgress = nextProgress;
      if (nextProgress.latestHit) pendingHits.push(nextProgress.latestHit);
      // 扫描盘直接吃每一条事件（不等 React 刷新）；批量发现时 latestPlayer 就是批里最后一个
      const playerEvents = nextProgress.playerEvents
        ?? (nextProgress.latestPlayer ? [nextProgress.latestPlayer] : []);
      radarFeed.push(playerEvents);
      if (!nextProgress.playerEvents && nextProgress.latestPlayer) {
        logSerialRef.current += 1;
        const entry = toLogEntry(nextProgress.latestPlayer, logSerialRef.current);
        if (entry) pendingLog = [...pendingLog, entry].slice(-SCAN_LOG_LIMIT);
      }
      if (progressFlushTimer === null) {
        progressFlushTimer = window.setTimeout(flushProgress, SCOUT_UI_FLUSH_MS);
      }
    };

    try {
      const result = await window.lolHelper.scout.find(runConfig, queueProgress);
      flushProgress();
      const nextHits = mergeHits(baseHits, result.hits);
      setHits((prev) => (continuing ? mergeHits(prev, result.hits) : nextHits));
      const reason = result.aborted
        ? '（已取消）'
        : result.hits.length >= runConfig.targetCount
          ? '（已达目标）'
          : '（关系网已扫完，未凑满目标）';
      setFinalSummary(
        `${continuing ? '本批新增' : '本次找到'} ${result.hits.length} 位高手${reason}，当前共 ${nextHits.length} 位`,
      );
      if (result.error) setError(result.error);
    } catch (err) {
      flushProgress();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      flushProgress();
      setSearchFinishedAt(Date.now());
      setRunning(false);
    }
  }, [
    activeRunKey,
    canStart,
    config,
    currentRunKey,
    hits,
    onConfigPanelMinimize,
    radarFeed,
    settings,
    persistSettings,
  ]);

  const handleCancel = useCallback(async () => {
    try {
      await window.lolHelper.scout.cancel();
    } catch (err) {
      console.error('[scout] 取消失败:', err);
    }
  }, []);

  const batchStartSet = useMemo(() => new Set(batchStarts), [batchStarts]);

  // 战绩速览：点卡片打开 / 再点同一张关闭；只有点名字才跳到完整战绩页
  const hitKey = (hit: ScoutHit) => hit.profile.puuid || hit.profile.riotId;
  const peekIndex = peekKey ? hits.findIndex((hit) => hitKey(hit) === peekKey) : -1;
  const peekHit = peekIndex >= 0 ? hits[peekIndex] : null;
  const handlePeek = useCallback((hit: ScoutHit) => {
    const key = hit.profile.puuid || hit.profile.riotId;
    setPeekKey((current) => (current === key ? null : key));
  }, []);
  const closePeek = useCallback(() => setPeekKey(null), []);

  useEffect(() => {
    const shouldShowStatus = running || Boolean(progress) || hits.length > 0;
    const nextStatus: ScoutPageStatus | null = shouldShowStatus
      ? {
          running,
          progress,
          hits,
          targetCount: config.targetCount,
          region: config.region ?? '',
          startedAt: searchStartedAt,
          finishedAt: searchFinishedAt,
        }
      : null;
    pendingSidebarStatusRef.current = nextStatus;

    const publishStatus = () => {
      sidebarStatusTimerRef.current = null;
      const status = pendingSidebarStatusRef.current;
      publishedSidebarRunningRef.current = status?.running ?? null;
      onStatusChange?.(status);
    };
    const nextRunning = nextStatus?.running ?? null;
    if (nextRunning !== publishedSidebarRunningRef.current) {
      if (sidebarStatusTimerRef.current !== null) {
        window.clearTimeout(sidebarStatusTimerRef.current);
        sidebarStatusTimerRef.current = null;
      }
      publishStatus();
    } else if (sidebarStatusTimerRef.current === null) {
      sidebarStatusTimerRef.current = window.setTimeout(
        publishStatus,
        SCOUT_SIDEBAR_FLUSH_MS,
      );
    }
  }, [
    config.region,
    config.targetCount,
    hits,
    onStatusChange,
    progress,
    running,
    searchFinishedAt,
    searchStartedAt,
  ]);

  useEffect(() => {
    return () => {
      if (sidebarStatusTimerRef.current !== null) {
        window.clearTimeout(sidebarStatusTimerRef.current);
        sidebarStatusTimerRef.current = null;
      }
    };
  }, []);

  const canMinimizeConfigPanel = Boolean(onConfigPanelMinimize && running);
  const handleConfigPanelClick = useCallback(() => {
    if (!canMinimizeConfigPanel) return;
    onConfigPanelMinimize?.();
  }, [canMinimizeConfigPanel, onConfigPanelMinimize]);
  const checkedCount = progress?.checked ?? 0;
  const batchTarget = Math.max(1, progress?.target ?? config.targetCount);
  const batchHits = progress?.hits ?? 0;
  const kdaFill = ((config.kdaThreshold - KDA_THRESHOLD_MIN) / (KDA_THRESHOLD_MAX - KDA_THRESHOLD_MIN)) * 100;
  const idle = hits.length === 0 && !running && !progress && !finalSummary;
  // 空位：待机时预告要找几个人；扫描中把这一批还没填上的位置留出来
  const ghostCount = idle
    ? Math.min(config.targetCount, 6)
    : running
      ? Math.min(Math.max(0, batchTarget - batchHits), 6)
      : 0;
  const ghostOffset = hits.length;
  // 扫描盘的阶段：跑完以后种子/扫描阶段一律算完成，出错优先显示异常
  const scopePhase: ScoutProgress['phase'] | null = running
    ? progress?.phase ?? 'seeding'
    : error
      ? 'error'
      : progress?.phase === 'aborted'
        ? 'aborted'
        : progress || finalSummary
          ? 'done'
          : null;
  const setTargetCount = (value: number) =>
    updateConfig({ targetCount: Math.min(TARGET_MAX, Math.max(1, Math.round(value) || 1)) });

  const scopeActions = running ? (
    <button
      type="button"
      className="scout-scope-btn scout-scope-btn--stop"
      onClick={() => void handleCancel()}
    >
      <Square className="size-3 fill-current" />
      停止
    </button>
  ) : configPanelMinimized ? (
    <>
      {onConfigPanelRestore && (
        <button type="button" className="scout-scope-btn" onClick={onConfigPanelRestore}>
          <SlidersHorizontal className="size-3.5" />
          调整参数
        </button>
      )}
      {canStart && (
        <button type="button" className="scout-scope-btn scout-scope-btn--primary" onClick={() => void handleStart()}>
          {canContinue ? <ArrowRight className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          {canContinue ? '继续下一批' : '重新扫描'}
        </button>
      )}
    </>
  ) : null;

  return (
    <div className={`scout-page flex h-full ${configPanelMinimized ? 'scout-page--panel-minimized' : ''}`}>
      <aside
        aria-hidden={configPanelMinimized}
        aria-label="雷达参数"
        onClick={handleConfigPanelClick}
        title={canMinimizeConfigPanel ? '点击收起到侧边栏' : undefined}
        className={`scout-config-panel ${
          canMinimizeConfigPanel ? 'scout-config-panel--clickable' : ''
        }`}
      >
        <div className="scout-deck">
          <div className="scout-field">
            <DeckLabel index="01" text="种子召唤师" code="SEED" />
            <input
              type="text"
              value={config.seedId}
              onChange={(e) => updateConfig({ seedId: e.target.value })}
              placeholder="名字#编号"
              disabled={running}
              spellCheck={false}
              className="scout-input scout-input--seed"
            />
          </div>

          <div className="scout-field">
            <DeckLabel index="02" text="大区" code="REGION" />
            <span className="scout-select">
              <select
                value={config.region ?? ''}
                onChange={(e) => updateConfig({ region: e.target.value })}
                disabled={running}
                className="scout-input"
              >
                {regionOptions.map((region) => (
                  <option key={region.key} value={region.key}>{region.name}</option>
                ))}
              </select>
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </span>
          </div>

          <div className="scout-field">
            <DeckLabel index="03" text="模式" code="QUEUE" />
            <div className="scout-seg scout-seg--grid" role="radiogroup" aria-label="游戏模式">
              {QUEUE_OPTIONS.map((queue) => (
                <button
                  key={queue.tag}
                  type="button"
                  role="radio"
                  aria-checked={config.tag === queue.tag}
                  onClick={() => updateConfig({ tag: queue.tag })}
                  disabled={running}
                  className={config.tag === queue.tag ? 'is-active' : ''}
                >
                  {queue.name}
                </button>
              ))}
            </div>
          </div>

          <div className="scout-field">
            <DeckLabel
              index="04"
              text={<>英雄<b className="scout-label__count">{config.championIds.length}</b></>}
              code="CHAMPIONS"
              aside={favoriteIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => updateConfig({ championIds: [...favoriteIds] })}
                  disabled={running}
                  className="scout-label__action"
                >
                  <Star className="size-3 fill-current" />
                  用收藏
                </button>
              ) : undefined}
            />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={running}
              className="scout-hero-picker"
              data-empty={selectedChampions.length === 0 ? 'true' : undefined}
            >
              {selectedChampions.length > 0 ? (
                <span className="scout-hero-picker__list">
                  {selectedChampions.map((champion) => (
                    <GameIcon
                      key={champion.id}
                      src={champion.avatar}
                      alt={champion.title || champion.name}
                      title={champion.title || champion.name}
                      size={28}
                      rounded
                    />
                  ))}
                  <span className="scout-hero-picker__add" aria-hidden="true"><Plus className="size-3.5" /></span>
                </span>
              ) : (
                <span className="scout-hero-picker__empty">
                  <Plus className="size-4" />
                  选择要盯的英雄
                </span>
              )}
            </button>
            {championsLoading && <p className="scout-field-note">英雄列表加载中…</p>}
            {championsError && !championsLoading && <p className="scout-field-note scout-field-note--error">{championsError}</p>}
          </div>

          <div className="scout-field">
            <DeckLabel
              index="05"
              text="KDA 阈值"
              code="THRESHOLD"
              aside={<b className="scout-label__value">{config.kdaThreshold.toFixed(1)}</b>}
            />
            <input
              type="range"
              min={KDA_THRESHOLD_MIN}
              max={KDA_THRESHOLD_MAX}
              step={KDA_THRESHOLD_STEP}
              value={config.kdaThreshold}
              onChange={(e) => updateConfig({ kdaThreshold: Number(e.target.value) })}
              disabled={running}
              className="scout-range"
              style={{ '--fill': `${kdaFill}%` } as CSSProperties}
              aria-label="KDA 阈值"
            />
            <div className="scout-range-scale" aria-hidden="true">
              <span>{KDA_THRESHOLD_MIN}</span><span>15</span><span>20</span><span>{KDA_THRESHOLD_MAX}+</span>
            </div>
          </div>

          <div className="scout-field">
            <DeckLabel index="06" text="时间窗" code="WINDOW" />
            <div className="scout-seg" role="radiogroup" aria-label="最近时间">
              {HOUR_OPTIONS.map((hours) => (
                <button
                  type="button"
                  key={hours}
                  role="radio"
                  aria-checked={config.hoursWindow === hours}
                  onClick={() => updateConfig({ hoursWindow: hours })}
                  disabled={running}
                  className={config.hoursWindow === hours ? 'is-active' : ''}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>

          <div className="scout-field">
            <DeckLabel index="07" text="目标人数" code="TARGET" aside={<small className="scout-label__hint">最多 {TARGET_MAX}</small>} />
            <div className="scout-stepper">
              <button
                type="button"
                onClick={() => setTargetCount(config.targetCount - 1)}
                disabled={running || config.targetCount <= 1}
                aria-label="减少目标人数"
              >
                <Minus className="size-3.5" />
              </button>
              <input
                type="number"
                min={1}
                max={TARGET_MAX}
                value={config.targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                disabled={running}
                aria-label="目标人数"
              />
              <button
                type="button"
                onClick={() => setTargetCount(config.targetCount + 1)}
                disabled={running || config.targetCount >= TARGET_MAX}
                aria-label="增加目标人数"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        <footer className="scout-config-footer">
          {!running ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="scout-ignite"
            >
              <span>{canContinue ? '继续扫描下一批' : '开始扫描'}</span>
              <i aria-hidden="true"><ArrowRight className="size-4" /></i>
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleCancel();
              }}
              className="scout-ignite scout-ignite--stop"
            >
              <span>停止扫描</span>
              <i aria-hidden="true"><Square className="size-3 fill-current" /></i>
            </button>
          )}
          {!canStart && !running && <p>填好种子召唤师、选好英雄后即可开始</p>}
        </footer>
      </aside>

      <section className={`scout-results ${peekHit ? 'scout-results--peeking' : ''}`}>
        <div className="scout-results__main">
          <ScoutScope
            feed={radarFeed}
            running={running}
            phase={scopePhase}
            hitsTotal={hits.length}
            batchHits={batchHits}
            batchTarget={batchTarget}
            checked={checkedCount}
            queueRemaining={progress?.seedQueueRemaining ?? 0}
            startedAt={searchStartedAt}
            finishedAt={searchFinishedAt}
            summary={finalSummary}
            log={scanLog}
            actions={scopeActions}
          />

          <div className="scout-results-body">
            {error && <div className="scout-alert">{error}</div>}

            <div className="scout-rule">
              <span>锁定目标</span>
              <em>TARGETS</em>
              <i aria-hidden="true" />
              <b>{String(hits.length).padStart(2, '0')}</b>
            </div>

            {hits.length === 0 && !running && !idle && (
              <p className="scout-note">本轮已检查 {checkedCount} 位玩家，暂时没有符合条件的人。可以放宽 KDA 阈值或时间窗再试。</p>
            )}

            <div className="scout-results-grid">
              {hits.map((hit, idx) => {
                const batchNumber = batchStarts.indexOf(idx) + 1;
                return (
                  <Fragment key={`${hit.profile.puuid || hit.profile.riotId}-${idx}`}>
                    {idx > 0 && batchStartSet.has(idx) && (
                      <div className="scout-batch-divider">
                        <span>第 {batchNumber} 批</span>
                        <em>BATCH {String(batchNumber).padStart(2, '0')}</em>
                      </div>
                    )}
                    <ScoutHitCard
                      hit={hit}
                      index={idx}
                      region={config.region ?? ''}
                      active={peekIndex === idx}
                      onPeek={handlePeek}
                      onPlayerClick={onPlayerSearch}
                    />
                  </Fragment>
                );
              })}
              {Array.from({ length: ghostCount }, (_, index) => (
                <div
                  key={`ghost-${index}`}
                  className={`scout-ghost ${running && index === 0 ? 'is-scanning' : ''}`}
                  aria-hidden="true"
                >
                  <span>{String(ghostOffset + index + 1).padStart(2, '0')}</span>
                  <i />
                  <i />
                </div>
              ))}
            </div>
          </div>
        </div>

        {peekHit && (
          <ErrorBoundary
            label="战绩速览"
            resetKey={peekKey}
            fallback={(failure, reset) => (
              <aside className="scout-peek" aria-label="战绩速览">
                <header className="scout-peek__head">
                  <div className="scout-peek__kicker">
                    <span>战绩速览</span>
                    <em>PEEK</em>
                    <button type="button" className="scout-peek__close" onClick={closePeek} aria-label="关闭速览">
                      <X className="size-4" />
                    </button>
                  </div>
                </header>
                <div className="scout-peek__state">
                  <p>速览出错了：{failure.message}</p>
                  <button type="button" onClick={reset}>
                    <RotateCcw className="size-3.5" />
                    重试
                  </button>
                </div>
              </aside>
            )}
          >
            <ScoutMatchPeek
              hit={peekHit}
              index={peekIndex}
              region={config.region ?? ''}
              onClose={closePeek}
              onOpenHistory={onPlayerSearch}
            />
          </ErrorBoundary>
        )}
      </section>

      <ChampionPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        champions={champions}
        selectedIds={config.championIds}
        favoriteIds={favoriteIds}
        championPresets={championPresets}
        onChange={(ids) => updateConfig({ championIds: ids })}
        onToggleFavorite={toggleFavorite}
        onSavePreset={saveChampionPreset}
        onApplyPreset={applyChampionPreset}
        onDeletePreset={deleteChampionPreset}
      />
    </div>
  );
}
