import type {
  AssistOperationResult,
  AssistRole,
  AssistSettings,
  ChampionSummary,
} from '../../../shared/api';
import { GameIcon } from '../match/GameIcon';
import {
  ActionButton,
  SelectInput,
  SettingCard,
  ToggleRow,
} from './AssistControls';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;
type UpdateBoolean = (key: keyof AssistSettings, value: boolean) => void;
type OpenPicker = (
  title: string,
  ids: number[],
  max: number,
  apply: (ids: number[]) => void,
) => void;

const roleLabels: Record<AssistRole, string> = {
  top: '上路',
  jungle: '打野',
  middle: '中路',
  bottom: '下路',
  utility: '辅助',
};

const positionOptions: Array<[string, string]> = [
  ['TOP', '上路'],
  ['JUNGLE', '打野'],
  ['MIDDLE', '中路'],
  ['BOTTOM', '下路'],
  ['UTILITY', '辅助'],
  ['FILL', '补位'],
];

function championName(champion: ChampionSummary): string {
  return champion.title || champion.name;
}

function ChampionSlotPicker({
  label,
  ids,
  maxVisible = 6,
  championMap,
  onClick,
}: {
  label: string;
  ids: number[];
  maxVisible?: number;
  championMap: Map<number, ChampionSummary>;
  onClick: () => void;
}) {
  const champions = ids
    .map((id) => championMap.get(id))
    .filter((champion): champion is ChampionSummary => Boolean(champion));
  const visibleChampions = champions.slice(0, maxVisible);
  const names = champions.map(championName).join('、');

  return (
    <button
      type="button"
      onClick={onClick}
      title={names || label}
      aria-label={label}
      className="group flex min-h-12 w-full min-w-0 items-center gap-2 rounded-sm border border-app-border bg-app-bg px-2.5 py-2 text-left transition-colors hover:border-app-primary hover:bg-app-surface-soft focus:outline-none focus:ring-2 focus:ring-app-primary/20"
    >
      {visibleChampions.length > 0 ? (
        <>
          <span className="flex shrink-0 -space-x-2">
            {visibleChampions.map((champion) => (
              <GameIcon
                key={champion.id}
                src={champion.avatar}
                alt={championName(champion)}
                title={championName(champion)}
                size={32}
                rounded
                className="ring-2 ring-app-bg group-hover:ring-app-surface-soft"
              />
            ))}
            {champions.length > visibleChampions.length && (
              <span className="flex size-8 items-center justify-center rounded-full bg-app-primary-soft text-[10px] font-semibold text-app-primary ring-2 ring-app-bg">
                +{champions.length - visibleChampions.length}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-app-text">
            {names}
          </span>
        </>
      ) : (
        <>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-app-border bg-app-surface text-xs text-app-subtle group-hover:border-app-primary group-hover:text-app-primary">
            +
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-app-muted">未设置</span>
        </>
      )}
    </button>
  );
}

export function ChampionsSection({
  assist,
  updateAssist,
  updateBoolean,
  openPicker,
  championMap,
  setChampionArray,
  setRoleChampionArray,
  setBan,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
  openPicker: OpenPicker;
  championMap: Map<number, ChampionSummary>;
  setChampionArray: (source: 'normal' | 'aram' | 'arena', ids: number[]) => void;
  setRoleChampionArray: (role: AssistRole, ids: number[]) => void;
  setBan: (role: AssistRole | 'arena', ids: number[]) => void;
}) {
  return (
    <>
      <SettingCard title="自动选人与换人">
        <ToggleRow
          label="开启自动禁选英雄"
          description="只在轮到你操作时执行；首选不可用会尝试下一个。"
          checked={assist.autoChampionEnabled}
          onChange={(value) => updateBoolean('autoChampionEnabled', value)}
        />
        {([
          ['normal', '匹配通用英雄'],
          ['aram', '大乱斗换人顺序'],
          ['arena', '斗魂竞技场英雄'],
        ] as const).map(([key, label]) => (
          <div key={key} className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3 py-2">
            <span className="text-sm text-app-body">{label}</span>
            <ChampionSlotPicker
              label={label}
              ids={assist.champions[key]}
              championMap={championMap}
              onClick={() => openPicker(
                label,
                assist.champions[key],
                24,
                (ids) => setChampionArray(key, ids),
              )}
            />
          </div>
        ))}
      </SettingCard>
      <SettingCard title="按位置选用与禁用">
        <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-0.5 text-[11px] font-medium text-app-subtle">
          <span>位置</span>
          <span>自动选用英雄</span>
          <span>自动禁用英雄</span>
        </div>
        {(Object.keys(roleLabels) as AssistRole[]).map((role) => (
          <div key={role} className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-2">
            <span className="text-sm font-medium text-app-body">{roleLabels[role]}</span>
            <ChampionSlotPicker
              label={`${roleLabels[role]}自动选用英雄`}
              ids={assist.champions.byRole[role]}
              championMap={championMap}
              onClick={() => openPicker(
                `${roleLabels[role]}选用`,
                assist.champions.byRole[role],
                24,
                (ids) => setRoleChampionArray(role, ids),
              )}
            />
            <ChampionSlotPicker
              label={`${roleLabels[role]}自动禁用英雄`}
              ids={assist.champions.bans[role] ? [assist.champions.bans[role]] : []}
              maxVisible={1}
              championMap={championMap}
              onClick={() => openPicker(
                `${roleLabels[role]}禁用`,
                assist.champions.bans[role] ? [assist.champions.bans[role]] : [],
                1,
                (ids) => setBan(role, ids),
              )}
            />
          </div>
        ))}
        <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-2">
          <span className="text-sm font-medium text-app-body">斗魂</span>
          <span />
          <ChampionSlotPicker
            label="斗魂自动禁用英雄"
            ids={assist.champions.bans.arena ? [assist.champions.bans.arena] : []}
            maxVisible={1}
            championMap={championMap}
            onClick={() => openPicker(
              '斗魂禁用',
              assist.champions.bans.arena ? [assist.champions.bans.arena] : [],
              1,
              (ids) => setBan('arena', ids),
            )}
          />
        </div>
      </SettingCard>
      <SettingCard title="快速游戏位置">
        <div className="grid grid-cols-2 gap-3">
          <SelectInput
            value={assist.champions.quickGameFirstPosition}
            options={positionOptions}
            onChange={(value) => updateAssist((next) => {
              next.champions.quickGameFirstPosition = value;
              return next;
            })}
          />
          <SelectInput
            value={assist.champions.quickGameSecondPosition}
            options={positionOptions}
            onChange={(value) => updateAssist((next) => {
              next.champions.quickGameSecondPosition = value;
              return next;
            })}
          />
        </div>
      </SettingCard>
    </>
  );
}

export function BuildsSection({
  assist,
  updateAssist,
  updateBoolean,
  runOperation,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
  runOperation: (
    operation: () => Promise<AssistOperationResult[]>,
  ) => Promise<void>;
}) {
  return (
    <>
      <SettingCard title="自动装备">
        <ToggleRow
          label="自动使用胜率最高配装"
          checked={assist.autoWinRateItems}
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoWinRateItems: value,
            autoPickRateItems: value ? false : next.autoPickRateItems,
          }))}
        />
        <ToggleRow
          label="自动使用使用率最高配装"
          checked={assist.autoPickRateItems}
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoPickRateItems: value,
            autoWinRateItems: value ? false : next.autoWinRateItems,
          }))}
        />
        <ToggleRow
          label="将配装结果发送到房间"
          checked={assist.sendItemsMessage}
          onChange={(value) => updateBoolean('sendItemsMessage', value)}
        />
      </SettingCard>
      <SettingCard title="自动符文">
        <ToggleRow
          label="自动使用胜率最高符文"
          checked={assist.autoWinRateRunes}
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoWinRateRunes: value,
            autoPickRateRunes: value ? false : next.autoPickRateRunes,
          }))}
        />
        <ToggleRow
          label="自动使用使用率最高符文"
          checked={assist.autoPickRateRunes}
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoPickRateRunes: value,
            autoWinRateRunes: value ? false : next.autoWinRateRunes,
          }))}
        />
        <ToggleRow
          label="将符文结果发送到房间"
          checked={assist.sendRunesMessage}
          onChange={(value) => updateBoolean('sendRunesMessage', value)}
        />
        <div className="flex gap-2 pt-2">
          <ActionButton
            onClick={() => void runOperation(() =>
              window.lolHelper.assist.applyRecommendation({
                strategy: assist.autoWinRateRunes || assist.autoWinRateItems
                  ? 'winRate'
                  : 'pickRate',
              }))}
          >
            立即读取当前英雄并应用
          </ActionButton>
        </div>
      </SettingCard>
    </>
  );
}
