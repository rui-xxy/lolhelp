import { ListPlus } from 'lucide-react';
import type {
  AppSettings,
  AssistOperationResult,
  AssistSettings,
} from '../../../shared/api';
import {
  ActionButton,
  SelectInput,
  SettingCard,
  TextInput,
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

export interface BlacklistDraft {
  riotId: string;
  region: string;
  tags: string;
  description: string;
}

export function AccountSection({
  assist,
  updateAssist,
  updateBoolean,
  openProfileIconPicker,
  championSummary,
  openPicker,
  runOperation,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
  openProfileIconPicker: () => Promise<void>;
  championSummary: (ids: number[]) => string;
  openPicker: OpenPicker;
  runOperation: (
    operation: () => Promise<AssistOperationResult[]>,
  ) => Promise<void>;
}) {
  return (
    <>
      <SettingCard title="客户端展示段位">
        <ToggleRow
          label="启用展示段位"
          description="只修改客户端社交展示，不改变真实排位数据。"
          checked={assist.spoofRankEnabled}
          onChange={(value) => updateBoolean('spoofRankEnabled', value)}
        />
        <div className="grid grid-cols-3 gap-3">
          <SelectInput
            value={assist.spoofRankQueue}
            options={[
              ['RANKED_SOLO_5x5', '单双排'],
              ['RANKED_FLEX_SR', '灵活排位'],
            ]}
            onChange={(value) => updateAssist((next) => ({
              ...next,
              spoofRankQueue: value,
            }))}
          />
          <SelectInput
            value={assist.spoofRankTier}
            options={[
              'IRON',
              'BRONZE',
              'SILVER',
              'GOLD',
              'PLATINUM',
              'EMERALD',
              'DIAMOND',
              'MASTER',
              'GRANDMASTER',
              'CHALLENGER',
            ].map((value): [string, string] => [value, value])}
            onChange={(value) => updateAssist((next) => ({
              ...next,
              spoofRankTier: value,
            }))}
          />
          <SelectInput
            value={assist.spoofRankDivision}
            options={['IV', 'III', 'II', 'I']
              .map((value): [string, string] => [value, value])}
            onChange={(value) => updateAssist((next) => ({
              ...next,
              spoofRankDivision: value,
            }))}
          />
        </div>
      </SettingCard>

      <SettingCard title="头像、生涯背景和装饰">
        <div className="overflow-hidden rounded-sm border border-app-border bg-app-surface divide-y divide-app-border/70">
          <button
            type="button"
            onClick={() => void openProfileIconPicker()}
            className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app-bg-soft/75"
          >
            <div className="w-32 shrink-0 text-xs font-medium text-app-body">玩家头像</div>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {assist.profileIconId > 0 ? (
                <img
                  src={`https://game.gtimg.cn/images/lol/act/img/profileicon/${assist.profileIconId}.png`}
                  alt=""
                  className="size-12 rounded-full border border-app-border"
                />
              ) : (
                <div className="size-12 rounded-full bg-app-bg-soft" />
              )}
              <div className="min-w-0">
                <div className="truncate text-xs text-app-body">
                  {assist.profileIconId ? `头像 ${assist.profileIconId}` : '未选择'}
                </div>
                <div className="mt-1 text-[11px] text-app-muted">点击整行选择</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openPicker(
              '选择生涯背景英雄',
              assist.profileBackgroundChampionId
                ? [assist.profileBackgroundChampionId]
                : [],
              1,
              (ids) => updateAssist((next) => ({
                ...next,
                profileBackgroundChampionId: ids.at(-1) ?? 0,
              })),
            )}
            className="flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app-bg-soft/75"
          >
            <div className="w-32 shrink-0 text-xs font-medium text-app-body">生涯背景英雄</div>
            <div className="min-w-0 flex-1 truncate text-sm text-app-body">
              {championSummary(
                assist.profileBackgroundChampionId
                  ? [assist.profileBackgroundChampionId]
                  : [],
              )}
            </div>
            <span className="text-[11px] text-app-muted">点击修改</span>
          </button>
        </div>
        <ToggleRow
          label="一键卸下徽章"
          checked={assist.removeTokens}
          onChange={(value) => updateBoolean('removeTokens', value)}
        />
        <ToggleRow
          label="卸下至尊头像框"
          checked={assist.removePrestigeCrest}
          onChange={(value) => updateBoolean('removePrestigeCrest', value)}
        />
        <ActionButton
          onClick={() => void runOperation(() =>
            window.lolHelper.assist.applyAccountSettings())}
        >
          立即应用账号展示
        </ActionButton>
      </SettingCard>
    </>
  );
}

export function BlacklistSection({
  blacklistDraft,
  setBlacklistDraft,
  editingBlacklistId,
  addBlacklistEntry,
  settings,
  persist,
  setOperationState,
  onPlayerSearch,
  setEditingBlacklistId,
}: {
  blacklistDraft: BlacklistDraft;
  setBlacklistDraft: (
    updater: (draft: BlacklistDraft) => BlacklistDraft,
  ) => void;
  editingBlacklistId: string;
  addBlacklistEntry: () => void;
  settings: AppSettings;
  persist: (next: AppSettings) => void;
  setOperationState: (message: string) => void;
  onPlayerSearch?: (riotId: string, region?: string) => void;
  setEditingBlacklistId: (id: string) => void;
}) {
  return (
    <>
      <SettingCard title="添加黑名单玩家">
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            value={blacklistDraft.riotId}
            placeholder="玩家名#编号"
            onChange={(value) => setBlacklistDraft((draft) => ({ ...draft, riotId: value }))}
          />
          <TextInput
            value={blacklistDraft.region}
            placeholder="大区（可留空）"
            onChange={(value) => setBlacklistDraft((draft) => ({ ...draft, region: value }))}
          />
          <TextInput
            value={blacklistDraft.tags}
            placeholder="标签，用逗号分隔"
            onChange={(value) => setBlacklistDraft((draft) => ({ ...draft, tags: value }))}
          />
          <TextInput
            value={blacklistDraft.description}
            placeholder="行为描述"
            onChange={(value) => setBlacklistDraft((draft) => ({
              ...draft,
              description: value,
            }))}
          />
        </div>
        <div className="flex gap-2">
          <ActionButton onClick={addBlacklistEntry}>
            <span className="flex items-center gap-1">
              <ListPlus className="size-3.5" />
              {editingBlacklistId ? '保存修改' : '加入黑名单'}
            </span>
          </ActionButton>
          <ActionButton
            onClick={() => void window.lolHelper.assist.exportBlacklist()
              .then((file) => setOperationState(
                file ? `已导出到 ${file}` : '已取消导出',
              ))}
          >
            导出黑名单
          </ActionButton>
          <button
            type="button"
            onClick={() => persist({ ...settings, blacklist: [] })}
            className="rounded-sm border border-app-danger px-4 py-2 text-xs font-semibold text-app-danger hover:bg-red-50"
          >
            清空
          </button>
        </div>
      </SettingCard>

      <SettingCard title={`黑名单（${settings.blacklist.length}）`}>
        {settings.blacklist.length === 0 ? (
          <div className="py-8 text-center text-sm text-app-muted">暂无黑名单玩家</div>
        ) : <div className="overflow-hidden rounded-sm border border-app-border bg-app-surface divide-y divide-app-border/70">
          {settings.blacklist.map((entry) => (
          <div key={entry.id} className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-app-bg-soft/60">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-app-text">{entry.riotId}</div>
              <div className="mt-1 text-xs text-app-muted">
                {[entry.region, ...entry.tags].filter(Boolean).join(' · ') || '无标签'}
              </div>
              {entry.description && (
                <div className="mt-1 text-xs text-app-body">{entry.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onPlayerSearch?.(entry.riotId, entry.region)}
              className="text-xs font-medium text-app-link"
            >
              查战绩
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingBlacklistId(entry.id);
                setBlacklistDraft(() => ({
                  riotId: entry.riotId,
                  region: entry.region,
                  tags: entry.tags.join('，'),
                  description: entry.description,
                }));
              }}
              className="text-xs font-medium text-app-body"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => persist({
                ...settings,
                blacklist: settings.blacklist.filter((item) => item.id !== entry.id),
              })}
              className="text-xs font-medium text-app-danger"
            >
              删除
            </button>
          </div>
          ))}
        </div>}
      </SettingCard>
    </>
  );
}
