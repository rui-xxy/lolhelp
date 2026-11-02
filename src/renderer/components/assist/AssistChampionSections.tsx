import { Coins, MessageSquareText, Pencil, Plus, Shuffle, Sparkles, Swords, TriangleAlert, WandSparkles } from 'lucide-react';
import type {
  AssistOperationResult,
  AssistRole,
  AssistSettings,
  ChampionSummary,
} from '../../../shared/api';
import { LaneIcon } from '../LaneIcon';
import { ChampionAvatar, championDisplayName, type ChampionPickerRequest } from './AssistChampionPicker';
import {
  Btn,
  ChipChoices,
  Choices,
  Feature,
  Panel,
  PanelFoot,
} from './AssistControls';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;
type UpdateBoolean = (key: keyof AssistSettings, value: boolean) => void;
type OpenPicker = (request: ChampionPickerRequest) => void;

const ROLES: Array<{ role: AssistRole; label: string }> = [
  { role: 'top', label: '上单' },
  { role: 'jungle', label: '打野' },
  { role: 'middle', label: '中路' },
  { role: 'bottom', label: '下路' },
  { role: 'utility', label: '辅助' },
];

const QUICK_POSITIONS = [
  { value: 'TOP', label: '上单' },
  { value: 'JUNGLE', label: '打野' },
  { value: 'MIDDLE', label: '中路' },
  { value: 'BOTTOM', label: '下路' },
  { value: 'UTILITY', label: '辅助' },
  { value: 'FILL', label: '补位' },
];

// 一排英雄头像（带序号，序号就是优先级），最后一格是「＋」。整排点一下打开选择器。
function ChampionStrip({
  label,
  ids,
  maxVisible = 7,
  ban = false,
  championMap,
  onClick,
}: {
  label: string;
  ids: number[];
  maxVisible?: number;
  ban?: boolean;
  championMap: Map<number, ChampionSummary>;
  onClick: () => void;
}) {
  const champions = ids
    .map((id) => championMap.get(id))
    .filter((champion): champion is ChampionSummary => Boolean(champion));
  const visible = champions.slice(0, maxVisible);
  const hidden = champions.length - visible.length;

  return (
    <button
      type="button"
      className={`as-strip ${ban ? 'as-strip--ban' : ''}`}
      onClick={onClick}
      aria-label={`${label}：${champions.map(championDisplayName).join('、') || '未设置'}`}
    >
      {visible.map((champion, index) => (
        <span key={champion.id} className="as-strip__item">
          <span className="as-strip__face">
            <ChampionAvatar champion={champion} />
            {ban ? <i className="as-strip__ban">禁</i> : champions.length > 1 && <i className="as-strip__order">{index + 1}</i>}
          </span>
          <span className="as-strip__name">{championDisplayName(champion)}</span>
        </span>
      ))}
      {hidden > 0 && (
        <span className="as-strip__item">
          <span className="as-strip__face as-strip__more">+{hidden}</span>
          <span className="as-strip__name">更多</span>
        </span>
      )}
      {(!ban || champions.length === 0) && (
        <span className="as-strip__item">
          <span className="as-strip__add" aria-hidden="true">{champions.length === 0 ? <Plus /> : <Pencil />}</span>
          <span className="as-strip__name">{champions.length === 0 ? (ban ? '不禁' : '添加') : '调整'}</span>
        </span>
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
  const off = !assist.autoChampionEnabled;
  return (
    <>
      <section className="as-panel">
        <Feature
          icon={<WandSparkles />}
          title="自动选英雄、禁英雄"
          checked={assist.autoChampionEnabled}
          onChange={(value) => updateBoolean('autoChampionEnabled', value)}
        />
      </section>

      <Panel
        title="按模式选英雄"
        muted={off}
      >
        {off && (
          <div className="as-notice">
            <TriangleAlert />
            总开关已关闭
          </div>
        )}
        <div className="as-rows">
          {([
            ['normal', '匹配 / 排位'],
            ['aram', '大乱斗'],
            ['arena', '斗魂竞技场'],
          ] as const).map(([key, label]) => (
            <div key={key} className="as-row">
              <div className="as-row__label">
                <b>{label}</b>
              </div>
              <ChampionStrip
                label={label}
                ids={assist.champions[key]}
                championMap={championMap}
                onClick={() => openPicker({
                  title: `${label}：想玩的英雄`,
                  ids: assist.champions[key],
                  max: 24,
                  apply: (ids) => setChampionArray(key, ids),
                })}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="按位置选英雄、禁英雄"
        muted={off}
      >
        <div className="as-lanes">
          <div className="as-lane-row as-lane-row--head">
            <span>位置</span>
            <span>想玩的英雄</span>
            <span>要禁的英雄</span>
          </div>
          {ROLES.map(({ role, label }) => (
            <div key={role} className="as-lane-row">
              <span className="as-lane-name">
                <LaneIcon lane={role} className="" />
                {label}
              </span>
              <ChampionStrip
                label={`${label}想玩的英雄`}
                ids={assist.champions.byRole[role]}
                championMap={championMap}
                onClick={() => openPicker({
                  title: `${label}：想玩的英雄`,
                  ids: assist.champions.byRole[role],
                  max: 24,
                  apply: (ids) => setRoleChampionArray(role, ids),
                })}
              />
              <ChampionStrip
                label={`${label}要禁的英雄`}
                ids={assist.champions.bans[role] ? [assist.champions.bans[role]] : []}
                maxVisible={1}
                ban
                championMap={championMap}
                onClick={() => openPicker({
                  title: `${label}：要禁的英雄`,
                  mode: 'ban',
                  ids: assist.champions.bans[role] ? [assist.champions.bans[role]] : [],
                  max: 1,
                  apply: (ids) => setBan(role, ids),
                })}
              />
            </div>
          ))}
          <div className="as-lane-row">
            <span className="as-lane-name">
              <Swords />
              斗魂
            </span>
            <ChampionStrip
              label="斗魂要禁的英雄"
              ids={assist.champions.bans.arena ? [assist.champions.bans.arena] : []}
              maxVisible={1}
              ban
              championMap={championMap}
              onClick={() => openPicker({
                title: '斗魂竞技场：要禁的英雄',
                mode: 'ban',
                ids: assist.champions.bans.arena ? [assist.champions.bans.arena] : [],
                max: 1,
                apply: (ids) => setBan('arena', ids),
              })}
            />
          </div>
        </div>
      </Panel>

      <Panel title="快速游戏的位置">
        <div className="as-panel__body">
          <div className="as-lane-picks">
            {([
              ['quickGameFirstPosition', '第一位置'],
              ['quickGameSecondPosition', '第二位置'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <ChipChoices
                  label={label}
                  value={assist.champions[key]}
                  options={QUICK_POSITIONS.map((position) => ({
                    value: position.value,
                    label: (
                      <>
                        {position.value === 'FILL' ? <Shuffle /> : <LaneIcon lane={position.value} className="" />}
                        {position.label}
                      </>
                    ),
                  }))}
                  onChange={(value) => updateAssist((next) => {
                    next.champions[key] = value;
                    return next;
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}

type Strategy = 'off' | 'winRate' | 'pickRate';

const STRATEGY_OPTIONS: Array<{ value: Strategy; title: string }> = [
  { value: 'off', title: '不自动' },
  { value: 'winRate', title: '胜率最高' },
  { value: 'pickRate', title: '最多人用' },
];

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
  const itemStrategy: Strategy = assist.autoWinRateItems ? 'winRate' : assist.autoPickRateItems ? 'pickRate' : 'off';
  const runeStrategy: Strategy = assist.autoWinRateRunes ? 'winRate' : assist.autoPickRateRunes ? 'pickRate' : 'off';
  return (
    <>
      <Panel title="符文页">
        <div className="as-feature">
          <span className="as-feature__icon" aria-hidden="true"><Sparkles /></span>
          <div>
            <div className="as-feature__title">符文用哪套</div>
          </div>
          <span />
          <div className="as-feature__options">
            <Choices<Strategy>
              label="符文方案"
              value={runeStrategy}
              options={STRATEGY_OPTIONS}
              onChange={(value) => updateAssist((next) => ({
                ...next,
                autoWinRateRunes: value === 'winRate',
                autoPickRateRunes: value === 'pickRate',
              }))}
            />
          </div>
        </div>
        <Feature
          icon={<MessageSquareText />}
          title="把符文方案发到选人聊天"
          checked={assist.sendRunesMessage}
          onChange={(value) => updateBoolean('sendRunesMessage', value)}
        />
      </Panel>

      <Panel title="出装">
        <div className="as-feature">
          <span className="as-feature__icon" aria-hidden="true"><Coins /></span>
          <div>
            <div className="as-feature__title">出装用哪套</div>
          </div>
          <span />
          <div className="as-feature__options">
            <Choices<Strategy>
              label="出装方案"
              value={itemStrategy}
              options={STRATEGY_OPTIONS}
              onChange={(value) => updateAssist((next) => ({
                ...next,
                autoWinRateItems: value === 'winRate',
                autoPickRateItems: value === 'pickRate',
              }))}
            />
          </div>
        </div>
        <Feature
          icon={<MessageSquareText />}
          title="把出装方案发到选人聊天"
          checked={assist.sendItemsMessage}
          onChange={(value) => updateBoolean('sendItemsMessage', value)}
        />
        <PanelFoot>
          <Btn
            tone="primary"
            onClick={() => void runOperation(() =>
              window.lolHelper.assist.applyRecommendation({
                strategy: assist.autoWinRateRunes || assist.autoWinRateItems ? 'winRate' : 'pickRate',
              }))}
          >
            应用到当前英雄
          </Btn>
        </PanelFoot>
      </Panel>
    </>
  );
}
