import type {
  AssistOverlayName,
  AssistSettings,
} from '../../../shared/api';
import {
  ActionButton,
  SettingCard,
  TextInput,
  ToggleRow,
} from './AssistControls';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;
type UpdateBoolean = (key: keyof AssistSettings, value: boolean) => void;

export function MatchSection({
  assist,
  updateAssist,
  updateBoolean,
  toggleOverlay,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
  toggleOverlay: (name: AssistOverlayName) => Promise<void>;
}) {
  const overlayCards: Array<{
    name: AssistOverlayName;
    title: string;
    hotkey: string;
    description: string;
  }> = [
    {
      name: 'helper',
      title: '对局助手',
      hotkey: assist.hotkeys.matchHelper || 'SHIFT+F5',
      description: '选人阶段查看当前英雄、符文和出装推荐。',
    },
    {
      name: 'match',
      title: '战绩卡片',
      hotkey: assist.hotkeys.matchOverlay || 'SHIFT+TAB',
      description: '查看双方近期胜率、KDA、黑名单等标签。',
    },
    {
      name: 'spells',
      title: '技能计时',
      hotkey: assist.hotkeys.spellOverlay || 'SHIFT+F6',
      description: '进入游戏后读取 2999 实时数据，点击敌方技能图标开始倒计时。',
    },
  ];

  return (
    <SettingCard
      title="游戏内工具"
      description="按 Yuumi 的使用方式整理：技能计时可自动随对局打开，也可以用快捷键随时呼出/隐藏。"
    >
      <div className="grid gap-3 md:grid-cols-3">
        {overlayCards.map((item) => (
          <div
            key={item.name}
            className="rounded-sm border border-app-border bg-app-bg-soft p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-app-text">{item.title}</div>
              <kbd className="rounded border border-app-border bg-app-surface px-1.5 py-0.5 text-[10px] text-app-muted">
                {item.hotkey}
              </kbd>
            </div>
            <p className="mt-2 min-h-12 text-xs leading-5 text-app-muted">
              {item.description}
            </p>
            <ActionButton onClick={() => void toggleOverlay(item.name)}>
              打开 / 关闭
            </ActionButton>
          </div>
        ))}
      </div>

      <ToggleRow
        label="全局快捷键"
        description="开启后可用 Shift+F5 / Shift+F6 等快捷键呼出游戏内窗口。"
        checked={assist.globalHotkeysEnabled}
        onChange={(value) => updateBoolean('globalHotkeysEnabled', value)}
      />
      <ToggleRow
        label="进入游戏自动打开技能计时"
        description="进入载入/游戏中后约 12 秒打开一次；本局手动关闭后不会反复弹。"
        checked={assist.showSpellOverlay}
        onChange={(value) => updateBoolean('showSpellOverlay', value)}
      />
      <ToggleRow
        label="进入游戏自动打开战绩卡片"
        description="默认关闭，避免遮挡；需要像 Yuumi 一样自动弹出时再开启。"
        checked={assist.showMatchOverlay}
        onChange={(value) => updateBoolean('showMatchOverlay', value)}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {([
          ['mainWindow', '主窗口'],
          ['matchHelper', '对局助手'],
          ['matchOverlay', '战绩卡片'],
          ['spellOverlay', '技能计时'],
        ] as const).map(([key, label]) => (
          <div key={key} className="grid grid-cols-[86px_1fr] items-center gap-3">
            <span className="text-sm text-app-body">{label}</span>
            <TextInput
              value={assist.hotkeys[key]}
              onChange={(value) => updateAssist((next) => {
                next.hotkeys[key] = value.toUpperCase();
                return next;
              })}
            />
          </div>
        ))}
      </div>
    </SettingCard>
  );
}

export function AutomationSection({
  assist,
  updateAssist,
  updateBoolean,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
}) {
  return (
    <SettingCard title="自动操作" description="这些功能都能单独关闭，不会限制你手动操作。">
      <ToggleRow
        label="自动接受对局"
        checked={assist.autoAccept}
        onChange={(value) => updateBoolean('autoAccept', value)}
      />
      <div className="grid grid-cols-[1fr_180px] items-center gap-4 py-2">
        <div>
          <div className="text-sm text-app-body">接受延时</div>
          <div className="text-xs text-app-muted">0-5000 毫秒</div>
        </div>
        <TextInput
          type="number"
          value={assist.autoAcceptDelayMs}
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoAcceptDelayMs: Math.max(0, Math.min(5000, Number(value) || 0)),
          }))}
        />
      </div>
      <ToggleRow
        label="自动再来一局"
        description="结算后回房间并重新开始匹配。"
        checked={assist.autoPlayAgain}
        onChange={(value) => updateAssist((next) => ({
          ...next,
          autoPlayAgain: value,
          autoReturnLobby: value ? false : next.autoReturnLobby,
        }))}
      />
      <ToggleRow
        label="自动回到房间"
        checked={assist.autoReturnLobby}
        onChange={(value) => updateAssist((next) => ({
          ...next,
          autoReturnLobby: value,
          autoPlayAgain: value ? false : next.autoPlayAgain,
        }))}
      />
      <ToggleRow
        label="自动点赞队友"
        checked={assist.autoHonorTeammates}
        onChange={(value) => updateBoolean('autoHonorTeammates', value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          value={assist.autoHonorSummonerName}
          placeholder="优先点赞的玩家名称"
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoHonorSummonerName: value,
          }))}
        />
        <TextInput
          type="number"
          value={assist.autoHonorSummonerId || ''}
          placeholder="召唤师 ID（可留空）"
          onChange={(value) => updateAssist((next) => ({
            ...next,
            autoHonorSummonerId: Number(value) || 0,
          }))}
        />
      </div>
    </SettingCard>
  );
}

export function AlertsSection({
  assist,
  updateBoolean,
}: {
  assist: AssistSettings;
  updateBoolean: UpdateBoolean;
}) {
  return (
    <SettingCard title="游戏提示">
      <ToggleRow
        label="提示地图位置"
        description="选人时在房间聊天中提示蓝色方或红色方。"
        checked={assist.showPositionMessage}
        onChange={(value) => updateBoolean('showPositionMessage', value)}
      />
      <ToggleRow
        label="黑名单玩家预警"
        checked={assist.blacklistAlert}
        onChange={(value) => updateBoolean('blacklistAlert', value)}
      />
      <ToggleRow
        label="将黑名单提示发到客户端"
        checked={assist.blacklistAlertToClient}
        onChange={(value) => updateBoolean('blacklistAlertToClient', value)}
      />
      <ToggleRow
        label="提示敌方高胜率车队"
        checked={assist.highWinRateAlert}
        onChange={(value) => updateBoolean('highWinRateAlert', value)}
      />
    </SettingCard>
  );
}
