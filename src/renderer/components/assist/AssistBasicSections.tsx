import type { AssistSettings } from '../../../shared/api';
import {
  SettingCard,
  TextInput,
  ToggleRow,
} from './AssistControls';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;
type UpdateBoolean = (key: keyof AssistSettings, value: boolean) => void;

export function MatchSection({
  assist,
  updateBoolean,
}: {
  assist: AssistSettings;
  updateBoolean: UpdateBoolean;
}) {
  return (
    <SettingCard
      title="对局设置"
      description="游戏内悬浮窗已撤下，避免挡住客户端或残留在屏幕上。"
    >
      <ToggleRow
        label="开启主窗口快捷键"
        description="只用于呼出或隐藏主窗口，不再打开游戏内悬浮窗。"
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
