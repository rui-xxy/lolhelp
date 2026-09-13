import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Pencil, Search, Square, Star } from 'lucide-react';
import { ChampionPickerDialog } from './ChampionPickerDialog';
import { GameIcon } from '../match/GameIcon';
import { ScoutHitCard } from './ScoutHitCard';
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

const SCOUT_PHASE_LABELS: Record<ScoutProgress['phase'], string> = {
  seeding: '正在建立关系网',
  scanning: '正在筛选候选玩家',
  done: '搜索完成',
  aborted: '搜索已停止',
  error: '搜索遇到问题',
};

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
  const progressTarget = Math.max(1, progress?.target ?? config.targetCount);
  const progressPercent = Math.min(100, Math.round((hits.length / progressTarget) * 100));
  const resultStatus = running
    ? SCOUT_PHASE_LABELS[progress?.phase ?? 'seeding']
    : hits.length > 0
      ? `已找到 ${hits.length} 位符合条件的玩家`
      : finalSummary || '等待开始搜索';
  return (
    <div className={`scout-page flex h-full ${configPanelMinimized ? 'scout-page--panel-minimized' : ''}`}>
      {/* ===== 左侧：配置面板 ===== */}
      <aside
        aria-hidden={configPanelMinimized}
        onClick={handleConfigPanelClick}
        title={canMinimizeConfigPanel ? '点击收起到侧边栏' : undefined}
        className={`scout-config-panel ${
          canMinimizeConfigPanel ? 'scout-config-panel--clickable' : ''
        }`}
      >
        <header className="scout-config-heading">
          <span className="scout-config-heading__icon"><Search className="size-4" /></span>
          <span className="min-w-0">
            <strong>高手雷达</strong>
            <small>{running ? '搜索进行中' : `${selectedChampions.length} 个指定英雄`}</small>
          </span>
        </header>

        <div className="scout-config-fields">
          <div className="scout-field scout-field--seed">
            <label>种子召唤师</label>
            <input
              type="text"
              value={config.seedId}
              onChange={(e) => updateConfig({ seedId: e.target.value })}
              placeholder="名字#编号"
              disabled={running}
              className="scout-control"
            />
          </div>

          <div className="scout-field-row">
            <div className="scout-field">
              <label>目标大区</label>
              <select
                value={config.region ?? ''}
                onChange={(e) => updateConfig({ region: e.target.value })}
                disabled={running}
                className="scout-control"
              >
                {regionOptions.map((region) => (
                  <option key={region.key} value={region.key}>{region.name}</option>
                ))}
              </select>
            </div>
            <div className="scout-field">
              <label>游戏模式</label>
              <select
                value={config.tag}
                onChange={(e) => updateConfig({ tag: e.target.value })}
                disabled={running}
                className="scout-control"
              >
                {QUEUE_OPTIONS.map((queue) => (
                  <option key={queue.tag} value={queue.tag}>{queue.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="scout-field">
            <div className="scout-field-heading">
              <label>指定英雄 <span>{config.championIds.length}</span></label>
              {favoriteIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateConfig({ championIds: [...favoriteIds] })}
                  disabled={running}
                  className="scout-favorite-action"
                >
                  <Star className="size-3 fill-current" />
                  收藏
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={running}
              className="scout-hero-picker"
            >
              {selectedChampions.length > 0 ? (
                <span className="scout-selected-champions">
                  {selectedChampions.map((champion) => (
                    <GameIcon
                      key={champion.id}
                      src={champion.avatar}
                      alt={champion.title || champion.name}
                      title={champion.title || champion.name}
                      size={26}
                      rounded
                    />
                  ))}
                </span>
              ) : (
                <span className="scout-hero-picker__empty">
                  <Pencil className="size-3.5" />
                  选择英雄
                </span>
              )}
            </button>
            {championsLoading && <p className="scout-field-note">英雄列表加载中…</p>}
            {championsError && !championsLoading && <p className="scout-field-note scout-field-note--error">{championsError}</p>}
          </div>

          <div className="scout-field scout-threshold-field">
            <div className="scout-field-heading">
              <label>KDA 阈值</label>
              <strong>{config.kdaThreshold.toFixed(1)}</strong>
            </div>
            <input
              type="range"
              min={KDA_THRESHOLD_MIN}
              max={KDA_THRESHOLD_MAX}
              step={KDA_THRESHOLD_STEP}
              value={config.kdaThreshold}
              onChange={(e) => updateConfig({ kdaThreshold: Number(e.target.value) })}
              disabled={running}
              className="scout-range"
            />
            <div className="scout-range-scale">
              <span>{KDA_THRESHOLD_MIN}</span><span>15</span><span>20</span><span>{KDA_THRESHOLD_MAX}+</span>
            </div>
          </div>

          <div className="scout-field">
            <label>最近时间</label>
            <div className="scout-time-options">
              {HOUR_OPTIONS.map((hours) => (
                <button
                  type="button"
                  key={hours}
                  onClick={() => updateConfig({ hoursWindow: hours })}
                  disabled={running}
                  className={config.hoursWindow === hours ? 'is-active' : ''}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>

          <div className="scout-target-field">
            <span><b>目标人数</b><small>最多 50 人</small></span>
            <input
              type="number"
              min={1}
              max={50}
              value={config.targetCount}
              onChange={(e) => updateConfig({ targetCount: Math.max(1, Number(e.target.value) || 1) })}
              disabled={running}
              className="scout-control scout-target-control"
            />
          </div>
        </div>

        <footer className="scout-config-footer">
          {!running ? (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="scout-start-button"
            >
              {canContinue ? '继续搜索下一批' : '开始搜索'}
            </button>
          ) : (
            <button
              onClick={(event) => {
                event.stopPropagation();
                void handleCancel();
              }}
              className="scout-cancel-button"
            >
              <Square className="size-3 fill-current" />
              取消
            </button>
          )}
          {!canStart && !running && <p>补全种子 ID 和指定英雄后即可开始</p>}
        </footer>
      </aside>

      {/* ===== 右侧：结果区 ===== */}
      <section className="scout-results">
        <header className="scout-results-header">
          <div className="scout-results-title">
            <span className={running ? 'is-running' : ''} aria-hidden="true" />
            <div>
              <strong>雷达结果</strong>
              <small>{resultStatus}</small>
            </div>
          </div>
          <div className="scout-results-metrics">
            <span>找到 <b>{hits.length}</b></span>
            <span>已检查 <b>{checkedCount}</b></span>
            <span>目标 <b>{progressTarget}</b></span>
          </div>
          <div className="scout-results-progress" aria-label={`搜索进度 ${progressPercent}%`}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </header>

        <div className="scout-results-body">
          {error && (
            <div className="scout-results-error">
              {error}
            </div>
          )}

          {running && (
            <div className="scout-results-no-hits">
              正在筛选玩家，已检查 {checkedCount} 位
            </div>
          )}

          {hits.length === 0 && !running && !progress && !finalSummary ? (
            <div className="scout-results-empty">
              <span><Crosshair className="size-5" /></span>
              <strong>还没有搜索结果</strong>
              <p>设置好种子玩家和英雄后开始搜索</p>
            </div>
          ) : (
            <>
              {hits.length === 0 && !running && (
                <div className="scout-results-no-hits">本轮已检查 {checkedCount} 位玩家，暂时没有符合条件的人</div>
              )}
              {hits.length > 0 && (
                <div className="scout-results-section-title">
                  <strong>达标玩家</strong>
                  <span>{hits.length}</span>
                </div>
              )}
              <div className="scout-results-grid">
                {hits.map((hit, idx) => {
                  const batchNumber = batchStarts.indexOf(idx) + 1;
                  return (
                    <Fragment key={`${hit.profile.puuid || hit.profile.riotId}-${idx}`}>
                      {idx > 0 && batchStartSet.has(idx) && (
                        <div className="scout-batch-divider">
                          <span>第 {batchNumber} 批</span>
                        </div>
                      )}
                      <ScoutHitCard
                        hit={hit}
                        index={idx}
                        region={config.region ?? ''}
                        onPlayerClick={onPlayerSearch}
                      />
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 英雄选择弹窗 */}
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
