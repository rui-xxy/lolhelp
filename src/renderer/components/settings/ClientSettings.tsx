import { useCallback, useState } from 'react';
import type { LolClientConfigValues } from '../../../shared/api';
import {
  BlockedPlayersList,
  CheckboxRow,
  ReadonlyRow,
  SectionDot,
  SelectRow,
  SettingsGroup,
  SettingsSection,
  SliderRow,
  useSettingsScrollSpy,
} from './SettingsControls';

type ClientSectionKey =
  | 'general'
  | 'notifications'
  | 'chat'
  | 'sound'
  | 'voice'
  | 'blocked';

const CLIENT_SECTIONS: { key: ClientSectionKey; label: string }[] = [
  { key: 'general', label: '综合' },
  { key: 'notifications', label: '通知弹窗' },
  { key: 'chat', label: '聊天&好友' },
  { key: 'sound', label: '声音' },
  { key: 'voice', label: '语音' },
  { key: 'blocked', label: '聊天黑名单' },
];

export function ClientSettings({
  values,
  onChange,
}: {
  values: LolClientConfigValues;
  onChange: <K extends keyof LolClientConfigValues>(
    key: K,
    value: LolClientConfigValues[K],
  ) => void;
}) {
  const [activeSection, setActiveSection] = useState<ClientSectionKey>('general');
  useSettingsScrollSpy<ClientSectionKey>('client', CLIENT_SECTIONS, setActiveSection);

  const goToSection = useCallback((section: ClientSectionKey) => {
    setActiveSection(section);
    document.getElementById(`client-section-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[580px] grid-cols-[minmax(0,1fr)_32px] gap-4 pb-8">
      <div className="min-w-0 space-y-8">
        <SettingsSection prefix="client" id="general" title="综合">
          <div className="space-y-7">
            <SettingsGroup title="界面">
              <CheckboxRow label="低配机器适应模式" checked={values.lowSpecMode} onChange={(value) => onChange('lowSpecMode', value)} />
              <CheckboxRow label="禁用互动背景效果" checked={values.disableInteractiveBackground} onChange={(value) => onChange('disableInteractiveBackground', value)} />
              <CheckboxRow label="游戏期间关闭客户端" checked={values.closeClientDuringGame} onChange={(value) => onChange('closeClientDuringGame', value)} />
              <CheckboxRow label="禁用英雄技能说明文本" checked={values.disableChampionSkillText} onChange={(value) => onChange('disableChampionSkillText', value)} />
            </SettingsGroup>

            <SettingsGroup title="系统">
              <CheckboxRow label="自动发送崩溃报告" checked={values.uploadCrashReports} onChange={(value) => onChange('uploadCrashReports', value)} />
              <CheckboxRow label="将我的生涯设为不公开" checked={values.careerPrivate} onChange={(value) => onChange('careerPrivate', value)} />
            </SettingsGroup>

            <SettingsGroup title="主播模式">
              <CheckboxRow label="隐藏所有名称（仅对我）" checked={values.hideAllPlayerNamesForMe} onChange={(value) => onChange('hideAllPlayerNamesForMe', value)} />
              <CheckboxRow label="对所有人隐藏我的名称" checked={values.hideMyNameFromOthers} onChange={(value) => onChange('hideMyNameFromOthers', value)} />
              <CheckboxRow label="对所有人隐藏我的身份信息" checked={values.hideMyIdentityFromOthers} onChange={(value) => onChange('hideMyIdentityFromOthers', value)} />
            </SettingsGroup>
          </div>
        </SettingsSection>

        <SettingsSection prefix="client" id="notifications" title="通知弹窗">
          <SettingsGroup>
            <CheckboxRow label="只接受好友游戏邀请" checked={values.blockNonFriendGameInvites} onChange={(value) => onChange('blockNonFriendGameInvites', value)} />
            <ReadonlyRow label="关闭比赛通知功能" value="未定位到稳定字段" />
            <ReadonlyRow label="禁用商品·新获内容的提醒" value="未定位到稳定字段" />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="chat" title="聊天&好友">
          <SettingsGroup>
            <CheckboxRow label="当我在聊天框中点击了跳转链接时，请警告我" checked={values.linkClickWarningEnabled} onChange={(value) => onChange('linkClickWarningEnabled', value)} />
            <CheckboxRow label="显示“更多未读”指示条" checked={values.moreUnreadsEnabled} onChange={(value) => onChange('moreUnreadsEnabled', value)} />
            <CheckboxRow label="显示新的好友请求浮标" checked={values.friendRequestToastsEnabled} onChange={(value) => onChange('friendRequestToastsEnabled', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="sound" title="声音">
          <SettingsGroup>
            <CheckboxRow label="开启客户端音效" checked={values.clientAudioEnabled} onChange={(value) => onChange('clientAudioEnabled', value)} />
            <ReadonlyRow label="音效音量" value="客户端未开放稳定字段" />
            <ReadonlyRow label="音乐音量" value="客户端未开放稳定字段" />
            <ReadonlyRow label="播放英雄选择音乐" value="客户端未开放稳定字段" />
            <ReadonlyRow label="播放房间/赛前音乐" value="客户端未开放稳定字段" />
            <ReadonlyRow label="播放《英雄联盟》首页" value="客户端未开放稳定字段" />
            <ReadonlyRow label="播放登录音乐" value="客户端未开放稳定字段" />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="voice" title="语音">
          <SettingsGroup>
            <CheckboxRow label="启用组队语音" checked={values.teamVoiceEnabled} onChange={(value) => onChange('teamVoiceEnabled', value)} />
            <CheckboxRow label="自动加入队伍语音" checked={values.autoJoinTeamVoice} onChange={(value) => onChange('autoJoinTeamVoice', value)} />
            <CheckboxRow label="在我连上联盟语音时将我静音" checked={values.muteOnConnect} onChange={(value) => onChange('muteOnConnect', value)} />
            <ReadonlyRow label="输入设备" value={values.voiceInputDeviceName || values.voiceInputDeviceHandle || '-'} />
            <SliderRow label="输入音量（增强）" value={values.voiceInputVolume} min={0} max={100} onChange={(value) => onChange('voiceInputVolume', value)} />
            <SelectRow
              label="输入模式"
              value={values.voiceInputMode}
              options={[
                { value: 'voiceActivity', label: '语音活跃度' },
                { value: 'pushToTalk', label: '按住以发言' },
              ]}
              onChange={(value) => onChange('voiceInputMode', value)}
            />
            <SliderRow label="语音激活阈值" value={values.voiceSensitivity} min={0} max={100} onChange={(value) => onChange('voiceSensitivity', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="blocked" title="聊天黑名单">
          <BlockedPlayersList players={values.blockedPlayers} />
        </SettingsSection>
      </div>

      <aside className="sticky top-4 flex h-[360px] flex-col items-center justify-center gap-3">
        {CLIENT_SECTIONS.map((item) => (
          <SectionDot
            key={item.key}
            active={activeSection === item.key}
            label={item.label}
            onClick={() => goToSection(item.key)}
          />
        ))}
      </aside>
    </div>
  );
}
