import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, RotateCcw, Square, X } from 'lucide-react';
import { ChampionPickerDialog } from './ChampionPickerDialog';
import { ScoutHitCard } from './ScoutHitCard';
import { ScoutMatchPeek } from './ScoutMatchPeek';
import { ErrorBoundary } from '../ErrorBoundary';
import { createScoutFeed } from './scoutFeed';
import { ScoutQuery } from './ScoutQuery';
import { ScoutStage } from './ScoutStage';
import type {
  AppSettings,
  ChampionPreset,
  ChampionSummary,
  ScoutConfig,
  ScoutHit,
  ScoutProgress,
} from '../../../shared/api';
import { DEFAULT_ASSIST_SETTINGS } from '../../../shared/assist';
import { LOL_REGIONS } from '../../../shared/constants';

// 高手雷达：一句话写清要找什么人，下面一片灯海翻找，找到的人对焦成金点、在下面排成卡片。

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
  onStatusChange?: (status: ScoutPageStatus | null) => void;
}

const KDA_THRESHOLD_MIN = 10;
const KDA_THRESHOLD_MAX = 25;
const KDA_THRESHOLD_STEP = 0.5;
const KDA_RANGE: [number, number, number] = [KDA_THRESHOLD_MIN, KDA_THRESHOLD_MAX, KDA_THRESHOLD_STEP];
const SCOUT_UI_FLUSH_MS = 250;
const SCOUT_SIDEBAR_FLUSH_MS = 500;

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

// 模式（与战绩页的筛选同步，这里不给「全部」：雷达只在一个模式里找）
const QUEUE_OPTIONS = [
  { key: 'q_420', name: '单双排' },
  { key: 'q_440', name: '灵活组排' },
  { key: 'q_450', name: '大乱斗' },
  { key: 'q_2400', name: '海克斯大乱斗' },
  { key: 'q_490', name: '快速模式' },
  { key: 'q_1700', name: '竞技场' },
];

const HOUR_OPTIONS = [1, 2, 3, 6, 12, 24];
const TARGET_MAX = 50;

const FINISH_TEXT = {
  reached: '寻齐了',
  exhausted: '能翻的人都翻过了',
  aborted: '已停下',
} as const;

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
  const [finalSummary, setFinalSummary] = useState<'' | 'aborted' | 'reached' | 'exhausted'>('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [championsLoading, setChampionsLoading] = useState(true);
  const [championsError, setChampionsError] = useState('');
  const [activeRunKey, setActiveRunKey] = useState('');
  const [batchStarts, setBatchStarts] = useState<number[]>([]);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [searchFinishedAt, setSearchFinishedAt] = useState<number | null>(null);
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const [glowKey, setGlowKey] = useState<string | null>(null);
  const [feed] = useState(createScoutFeed);
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
    setSearchStartedAt(startedAt);
    setSearchFinishedAt(null);
    if (continuing) {
      setBatchStarts((prev) => (prev.includes(baseHits.length) ? prev : [...prev, baseHits.length]));
    } else {
      setHits([]);
      setBatchStarts([0]);
      setPeekKey(null);
      feed.reset();
    }
    setProgress(null);
    setFinalSummary('');
    setError('');
    setActiveRunKey(currentRunKey);

    // 持久化本次配置
    persistSettings({ ...settings, scoutDefaults: config });

    let pendingProgress: ScoutProgress | null = null;
    let pendingHits: ScoutHit[] = [];
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
      });
    };
    const queueProgress = (nextProgress: ScoutProgress) => {
      pendingProgress = nextProgress;
      if (nextProgress.latestHit) pendingHits.push(nextProgress.latestHit);
      // 灯海直接吃每一条事件（不等 React 刷新）；批量发现时 latestPlayer 就是批里最后一个
      const playerEvents = nextProgress.playerEvents
        ?? (nextProgress.latestPlayer ? [nextProgress.latestPlayer] : []);
      feed.push(playerEvents);
      if (progressFlushTimer === null) {
        progressFlushTimer = window.setTimeout(flushProgress, SCOUT_UI_FLUSH_MS);
      }
    };

    try {
      const result = await window.lolHelper.scout.find(runConfig, queueProgress);
      flushProgress();
      const nextHits = mergeHits(baseHits, result.hits);
      setHits((prev) => (continuing ? mergeHits(prev, result.hits) : nextHits));
      setFinalSummary(
        result.aborted ? 'aborted' : result.hits.length >= runConfig.targetCount ? 'reached' : 'exhausted',
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
    feed,
    hits,
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

  const checkedCount = progress?.checked ?? 0;
  const batchTarget = Math.max(1, progress?.target ?? config.targetCount);
  const batchHits = progress?.hits ?? 0;
  const layout = running || hits.length > 0 ? 'band' : 'hero';
  const mode = running ? 'running' : hits.length > 0 || finalSummary ? 'done' : 'idle';
  const goal = Math.max(hits.length, hits.length - batchHits + batchTarget);
  const seeding = running && (!progress || progress.phase === 'seeding');

  let status: ReactNode = null;
  let statusTone: 'error' | 'quiet' | undefined;
  if (error) {
    status = error;
    statusTone = 'error';
  } else if (championsError && !championsLoading) {
    status = championsError;
    statusTone = 'error';
  } else if (!running && hits.length === 0 && finalSummary) {
    status = finalSummary === 'aborted'
      ? `已停下，看过 ${checkedCount.toLocaleString('zh-CN')} 人`
      : `看过 ${checkedCount.toLocaleString('zh-CN')} 人，还没有人符合`;
    statusTone = 'quiet';
  }

  const actions = running ? (
    <button type="button" className="sx-btn sx-btn--stop" onClick={() => void handleCancel()}>
      <Square className="size-2.5 fill-current" aria-hidden="true" />
      停下
    </button>
  ) : (
    <button type="button" className="sx-btn sx-btn--go" onClick={() => void handleStart()} disabled={!canStart}>
      <span>{canContinue ? `再寻 ${config.targetCount} 位` : hits.length > 0 ? '重新寻找' : '开始寻找'}</span>
      <ArrowRight className="size-4" aria-hidden="true" />
    </button>
  );

  return (
    <div className="scout-page flex h-full">
      <section className={`scout-results ${peekHit ? 'scout-results--peeking' : ''}`}>
        <div className="scout-results__main">
          <ScoutStage
            feed={feed}
            layout={layout}
            mode={mode}
            running={running}
            seeding={seeding}
            seedName={config.seedId.trim()}
            hits={hits}
            found={hits.length}
            goal={goal}
            batchFound={batchHits}
            batchGoal={batchTarget}
            checked={checkedCount}
            startedAt={searchStartedAt}
            finishedAt={searchFinishedAt}
            status={status}
            statusTone={statusTone}
            summary={!running && finalSummary ? FINISH_TEXT[finalSummary] : undefined}
            activeKey={peekKey}
            glowKey={glowKey}
            onPick={handlePeek}
            onHover={setGlowKey}
            actions={actions}
            query={(
              <ScoutQuery
                config={config}
                regions={regionOptions}
                queues={QUEUE_OPTIONS}
                hours={HOUR_OPTIONS}
                champions={selectedChampions}
                locked={running}
                kdaRange={KDA_RANGE}
                targetMax={TARGET_MAX}
                onChange={updateConfig}
                onPickChampions={() => setPickerOpen(true)}
                onSubmit={() => void handleStart()}
              />
            )}
          />

          {layout === 'band' && (
            <div className="scout-results-body">
              <div className="scout-results-grid">
                {hits.map((hit, idx) => {
                  const batchNumber = batchStarts.indexOf(idx) + 1;
                  const key = hitKey(hit);
                  return (
                    <Fragment key={`${key}-${idx}`}>
                      {idx > 0 && batchStartSet.has(idx) && (
                        <div className="scout-batch-divider">
                          <span>第 {batchNumber} 批</span>
                        </div>
                      )}
                      <ScoutHitCard
                        hit={hit}
                        index={idx}
                        region={config.region ?? ''}
                        active={peekIndex === idx}
                        glow={glowKey === key}
                        onPeek={handlePeek}
                        onHover={setGlowKey}
                        onPlayerClick={onPlayerSearch}
                      />
                    </Fragment>
                  );
                })}
                {running && batchHits < batchTarget && (
                  <div className="scout-ghost is-scanning" aria-hidden="true">
                    <span>{String(hits.length + 1).padStart(2, '0')}</span>
                    <i />
                    <i />
                  </div>
                )}
              </div>
            </div>
          )}
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
        onUseFavorites={() => updateConfig({ championIds: [...favoriteIds] })}
      />
    </div>
  );
}
