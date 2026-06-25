import type {
  AssistOperationResult,
  AssistRole,
  AssistSettings,
} from '../../../shared/api';
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

export function ChampionsSection({
  assist,
  updateAssist,
  updateBoolean,
  openPicker,
  championSummary,
  setChampionArray,
  setRoleChampionArray,
  setBan,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
  openPicker: OpenPicker;
  championSummary: (ids: number[]) => string;
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
          <div key={key} className="grid grid-cols-[160px_1fr_auto] items-center gap-3 py-2">
            <span className="text-sm text-app-body">{label}</span>
            <span className="truncate text-xs text-app-muted">
              {championSummary(assist.champions[key])}
            </span>
            <ActionButton
              onClick={() => openPicker(
                label,
                assist.champions[key],
                24,
                (ids) => setChampionArray(key, ids),
              )}
            >
              选择
            </ActionButton>
          </div>
        ))}
      </SettingCard>
      <SettingCard title="按位置选用与禁用">
        {(Object.keys(roleLabels) as AssistRole[]).map((role) => (
          <div key={role} className="grid grid-cols-[70px_1fr_auto_1fr_auto] items-center gap-2 py-2">
            <span className="text-sm font-medium text-app-body">{roleLabels[role]}</span>
            <span className="truncate text-xs text-app-muted">
              {championSummary(assist.champions.byRole[role])}
            </span>
            <ActionButton
              onClick={() => openPicker(
                `${roleLabels[role]}选用`,
                assist.champions.byRole[role],
                24,
                (ids) => setRoleChampionArray(role, ids),
              )}
            >
              选用
            </ActionButton>
            <span className="truncate text-xs text-app-muted">
              {championSummary(assist.champions.bans[role] ? [assist.champions.bans[role]] : [])}
            </span>
            <ActionButton
              onClick={() => openPicker(
                `${roleLabels[role]}禁用`,
                assist.champions.bans[role] ? [assist.champions.bans[role]] : [],
                1,
                (ids) => setBan(role, ids),
              )}
            >
              禁用
            </ActionButton>
          </div>
        ))}
        <div className="grid grid-cols-[70px_1fr_auto] items-center gap-2 py-2">
          <span className="text-sm font-medium text-app-body">斗魂</span>
          <span className="truncate text-xs text-app-muted">
            {championSummary(assist.champions.bans.arena ? [assist.champions.bans.arena] : [])}
          </span>
          <ActionButton
            onClick={() => openPicker(
              '斗魂禁用',
              assist.champions.bans.arena ? [assist.champions.bans.arena] : [],
              1,
              (ids) => setBan('arena', ids),
            )}
          >
            选择禁用英雄
          </ActionButton>
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
