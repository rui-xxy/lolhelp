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
  updateBoolean,
  toggleOverlay,
}: {
  assist: AssistSettings;
  updateBoolean: UpdateBoolean;
  toggleOverlay: (name: AssistOverlayName) => Promise<void>;
}) {
  return (
    <SettingCard
      title="游戏内工具卡片"
      description="新版浮窗默认不自动弹出。需要时手动打开，标题栏可拖动，右上角可关闭。"
    >
      <div className="grid gap-3 md:grid-cols-3">
        {([
          {
            name: 'helper',
            title: '对局助手',
            description: '选人阶段查看当前英雄、推荐符文和出装。',
          },
          {
            name: 'match',
            title: '战绩卡片',
            description: '查看双方近期胜率、KDA、黑名单等标签。',
          },
          {
            name: 'spells',
            title: '技能计时',
            description: '游戏中读取 2999 实时数据，手动点击开始冷却计时。',
          },
        ] as Array<{
          name: AssistOverlayName;
          title: string;
          description: string;
        }>).map((item) => (
          <div
            key={item.name}
            className="rounded-sm border border-app-border bg-app-bg-soft p-3"
          >
            <div className="text-sm font-semibold text-app-text">{item.title}</div>
            <p className="mt-1 min-h-10 text-xs leading-5 text-app-muted">
              {item.description}
            </p>
            <ActionButton onClick={() => void toggleOverlay(item.name)}>
              打开 / 关闭
            </ActionButton>
          </div>
        ))}
      </div>
      <ToggleRow
        label="开启主窗口快捷键"
        description="只用于呼出或隐藏主窗口；浮窗先用上面的按钮打开。"
        checked={assist.globalHotkeysEnabled}
        onChange={(value) => updateBoolean('globalHotkeysEnabled', value)}
      />
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
    <SettingCard title="自动操作" description="所有功能都可单独关闭，不会限制手动操作。">
      <ToggleRow
        label="自动接受对局"
        checked={assist.autoAccept}
        onChange={(value) => updateBoolean('autoAccept', value)}
      />
      <div className="grid grid-cols-[1fr_180px] items-center gap-4 py-2">
        <div>
          <div className="text-sm text-app-body">接受延时</div>
          <div className="text-xs text-app-muted">0–5000 毫秒</div>
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
        label="提示敌方高胜率队"
        checked={assist.highWinRateAlert}
        onChange={(value) => updateBoolean('highWinRateAlert', value)}
      />
    </SettingCard>
  );
}
