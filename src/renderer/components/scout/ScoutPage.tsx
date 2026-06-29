import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Square, Star, Pencil } from 'lucide-react';
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

interface ScoutPageProps {
  onPlayerSearch: (name: string, region?: string) => void;
  currentRegionName: string;
}

// 默认配置
const DEFAULT_CONFIG: ScoutConfig = {
  seedId: '',
  championIds: [],
  kdaThreshold: 5.0,
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

export function ScoutPage({ onPlayerSearch, currentRegionName }: ScoutPageProps) {
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
  const [finalSummary, setFinalSummary] = useState<string>('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [championsLoading, setChampionsLoading] = useState(true);
  const [championsError, setChampionsError] = useState('');
  const [activeRunKey, setActiveRunKey] = useState('');
  const [runBaseCount, setRunBaseCount] = useState(0);
  const [batchStarts, setBatchStarts] = useState<number[]>([]);

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
        if (s.scoutDefaults) {
          setConfig((c) => ({ ...c, ...s.scoutDefaults }));
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
    setConfig((c) => ({ ...c, ...patch }));
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

    setRunning(true);
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
    setRunBaseCount(baseHits.length);

    // 持久化本次配置
    persistSettings({ ...settings, scoutDefaults: config });

    try {
      const result = await window.lolHelper.scout.find(runConfig, (p) => {
        setProgress(p);
        const latest = p.latestHit;
        if (latest) {
          setHits((prev) => mergeHits(prev, [latest]));
        }
      });
      const nextHits = mergeHits(baseHits, result.hits);
      setHits((prev) => (continuing ? mergeHits(prev, result.hits) : nextHits));
      const reason = result.aborted
        ? '（已取消）'
        : result.hits.length >= runConfig.targetCount
          ? '（已达目标）'
          : '（关系网已扫完，未凑满目标）';
      setFinalSummary(
        `${continuing ? '继续找到' : '找到'} ${result.hits.length} 个达标者${reason} · 当前共 ${nextHits.length} 个 · 扩散 ${result.stats.totalSeeds} 种子 · ` +
          `${result.stats.totalCandidates} 候选 · 深度 ${result.stats.depth} · ${result.stats.totalRequests} 次请求`,
      );
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [activeRunKey, canStart, config, currentRunKey, hits, settings, persistSettings]);

  const handleCancel = useCallback(async () => {
    try {
      await window.lolHelper.scout.cancel();
    } catch (err) {
      console.error('[scout] 取消失败:', err);
    }
  }, []);

  const pct =
    progress && config.targetCount > 0
      ? Math.min(100, Math.round((progress.hits / progress.target) * 100))
      : 0;
  const progressLabel = running ? '搜索中...' : progress?.phase === 'aborted' ? '已取消' : '已完成';
  const batchStartSet = useMemo(() => new Set(batchStarts), [batchStarts]);

  return (
    <div className="flex h-full">
      {/* ===== 左侧：配置面板 ===== */}
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-app-border bg-app-surface p-4">
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <Search className="size-4 text-app-primary" />
          <h2 className="text-sm font-semibold">高手雷达</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-app-subtle">
          输入种子玩家 → 沿对局关系网扩散，找出指定英雄、近期手感火热的高手。
        </p>

        {/* 大区 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-app-text">目标大区</label>
          <select
            value={config.region ?? ''}
            onChange={(e) => updateConfig({ region: e.target.value })}
            disabled={running}
            className="h-8 rounded-sm border border-app-border bg-app-surface-soft px-2 text-xs text-app-text focus:border-app-primary focus:outline-none disabled:opacity-60"
          >
            {regionOptions.map((region) => (
              <option key={region.key} value={region.key}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        {/* 种子 ID */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-app-text">种子召唤师</label>
          <input
            type="text"
            value={config.seedId}
            onChange={(e) => updateConfig({ seedId: e.target.value })}
            placeholder="名字#编号"
            disabled={running}
            className="h-8 rounded-sm border border-app-border bg-app-surface-soft px-3 text-xs text-app-text placeholder:text-app-subtle focus:border-app-primary focus:bg-app-surface focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* 模式 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-app-text">游戏模式</label>
          <select
            value={config.tag}
            onChange={(e) => updateConfig({ tag: e.target.value })}
            disabled={running}
            className="h-8 rounded-sm border border-app-border bg-app-surface-soft px-2 text-xs text-app-text focus:border-app-primary focus:outline-none disabled:opacity-60"
          >
            {QUEUE_OPTIONS.map((q) => (
              <option key={q.tag} value={q.tag}>
                {q.name}
              </option>
            ))}
          </select>
        </div>

        {/* 指定英雄 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-app-text">
              指定英雄
              {config.championIds.length > 0 && (
                <span className="ml-1 text-app-subtle">（{config.championIds.length}）</span>
              )}
            </label>
            {favoriteIds.length > 0 && (
              <button
                onClick={() => updateConfig({ championIds: [...favoriteIds] })}
                disabled={running}
                className="flex items-center gap-1 text-[11px] text-app-primary transition-colors hover:underline disabled:opacity-60"
              >
                <Star className="size-3 fill-app-primary" />
                用收藏({favoriteIds.length})
              </button>
            )}
          </div>

          {/* 已选英雄摘要（头像列表） */}
          {selectedChampions.length > 0 && (
            <div className="flex flex-wrap gap-1 rounded-xs border border-app-border bg-app-surface-soft p-1.5">
              {selectedChampions.map((c) => (
                <GameIcon
                  key={c.id}
                  src={c.avatar}
                  alt={c.title || c.name}
                  title={c.title || c.name}
                  size={28}
                  rounded
                />
              ))}
            </div>
          )}

          {/* 打开弹窗按钮 */}
          <button
            onClick={() => setPickerOpen(true)}
            disabled={running}
            className="flex h-8 items-center justify-center gap-1.5 rounded-sm border border-app-border bg-app-surface-soft text-xs font-medium text-app-text transition-colors hover:border-app-primary hover:bg-app-surface disabled:opacity-60"
          >
            <Pencil className="size-3.5" />
            {config.championIds.length > 0 ? '修改英雄' : '选择英雄'}
          </button>
          {/* 加载/错误状态提示 */}
          {championsLoading && (
            <p className="text-[11px] text-app-subtle">英雄列表加载中…</p>
          )}
          {championsError && !championsLoading && (
            <p className="text-[11px] text-app-danger">{championsError}</p>
          )}
        </div>

        {/* KDA 阈值 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-app-text">KDA 达标阈值</label>
            <span className="text-xs font-semibold tabular-nums text-app-primary">
              {config.kdaThreshold.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={config.kdaThreshold}
            onChange={(e) => updateConfig({ kdaThreshold: Number(e.target.value) })}
            disabled={running}
            className="w-full accent-app-primary disabled:opacity-60"
          />
        </div>

        {/* 时间窗 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-app-text">达标时间窗（最近）</label>
          <div className="flex gap-1">
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => updateConfig({ hoursWindow: h })}
                disabled={running}
                className={`flex-1 rounded-xs border px-1 py-1 text-[11px] tabular-nums transition-colors disabled:opacity-60 ${
                  config.hoursWindow === h
                    ? 'border-app-primary bg-app-primary text-white'
                    : 'border-app-border bg-app-surface-soft text-app-muted hover:border-app-primary'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* 目标人数 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-app-text">目标人数</label>
          <input
            type="number"
            min={1}
            max={50}
            value={config.targetCount}
            onChange={(e) => updateConfig({ targetCount: Math.max(1, Number(e.target.value) || 1) })}
            disabled={running}
            className="h-8 rounded-sm border border-app-border bg-app-surface-soft px-3 text-xs text-app-text focus:border-app-primary focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* 开始 / 取消 */}
        <div className="flex gap-2">
          {!running ? (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="flex-1 rounded-sm bg-app-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canContinue ? '继续搜索下一批' : '开始搜索'}
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-app-border bg-app-surface px-3 py-2 text-xs font-semibold text-app-text transition-colors hover:bg-app-surface-soft"
            >
              <Square className="size-3 fill-current" />
              取消
            </button>
          )}
        </div>
        {!canStart && !running && (
          <p className="text-[11px] text-app-subtle">
            请填种子 ID 并至少选 1 个英雄
          </p>
        )}
      </aside>

      {/* ===== 右侧：结果区 ===== */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 进度条 */}
        {(running || progress) && (
          <div className="border-b border-app-border bg-app-surface px-4 py-2.5">
            <div className="mb-1 flex items-center justify-between text-[11px] text-app-muted">
              <span>
                {progressLabel}
                {progress && (
                  <span className="ml-2 tabular-nums">
                    本轮达标 <b className="text-app-primary">{progress.hits}</b>/{progress.target}
                    {runBaseCount > 0 && (
                      <>
                        {' · '}当前共 {runBaseCount + progress.hits}
                      </>
                    )}
                    {' · '}候选 {progress.checked}
                    {' · '}剩余种子 {progress.seedQueueRemaining}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-border">
              <div
                className="h-full bg-app-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* 达标者流 */}
        <div className="flex-1 overflow-y-auto bg-app-bg p-4">
          {error && (
            <div className="mb-3 rounded-sm border border-app-loss-border bg-app-loss-bg px-3 py-2 text-xs text-app-text">
              {error}
            </div>
          )}

          {hits.length === 0 && !running ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-app-subtle">
              {finalSummary || '配置好条件后点「开始搜索」，达标的高手会在这里逐个出现'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {hits.map((hit, idx) => {
                  const batchNumber = batchStarts.indexOf(idx) + 1;
                  return (
                    <Fragment key={`${hit.profile.puuid || hit.profile.riotId}-${idx}`}>
                      {idx > 0 && batchStartSet.has(idx) && (
                        <div className="col-span-full flex items-center gap-3 pt-1 text-[11px] text-app-subtle">
                          <div className="h-px flex-1 bg-app-border" />
                          <span className="shrink-0 tabular-nums">第 {batchNumber} 批</span>
                          <div className="h-px flex-1 bg-app-border" />
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
              {running && (
                <div className="mt-4 flex items-center justify-center gap-2 py-4 text-xs text-app-subtle">
                  <span className="inline-block size-2 animate-pulse rounded-full bg-app-primary" />
                  正在扩散搜索…{progress && `（已查 ${progress.checked} 人）`}
                </div>
              )}
              {finalSummary && !running && (
                <div className="mt-4 rounded-sm border border-app-border bg-app-surface px-3 py-2 text-[11px] text-app-muted">
                  {finalSummary}
                </div>
              )}
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
