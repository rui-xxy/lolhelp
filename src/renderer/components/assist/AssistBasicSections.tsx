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
    <SettingCard title="选人和游戏内面板" description="需要时自动显示，也可以立即打开测试。">
      <ToggleRow
        label="显示符文助手"
        description="进入选人阶段后显示英雄推荐、符文和装备。"
        checked={assist.showRuneAssistant}
        onChange={(value) => updateBoolean('showRuneAssistant', value)}
      />
      <ToggleRow
        label="显示战力趋势"
        checked={assist.showPowerTrend}
        onChange={(value) => updateBoolean('showPowerTrend', value)}
      />
      <ToggleRow
        label="开启全局快捷键"
        description="即使主窗口不在前台，也可以呼出面板。"
        checked={assist.globalHotkeysEnabled}
        onChange={(value) => updateBoolean('globalHotkeysEnabled', value)}
      />
      <ToggleRow
        label="显示游戏内战绩面板"
        checked={assist.showMatchOverlay}
        onChange={(value) => updateBoolean('showMatchOverlay', value)}
      />
      <ToggleRow
        label="显示技能计时"
        checked={assist.showSpellOverlay}
        onChange={(value) => updateBoolean('showSpellOverlay', value)}
      />
      <div className="flex flex-wrap gap-2 pt-2">
        <ActionButton onClick={() => void toggleOverlay('helper')}>对局助手</ActionButton>
        <ActionButton onClick={() => void toggleOverlay('match')}>战绩面板</ActionButton>
        <ActionButton onClick={() => void toggleOverlay('spells')}>技能计时</ActionButton>
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
