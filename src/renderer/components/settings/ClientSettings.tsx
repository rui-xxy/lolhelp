import { useCallback, useState } from 'react';
import type { LolClientConfigValues } from '../../../shared/api';
import { CLIENT_FIELDS, VOICE_INPUT_OPTIONS } from './configFields';
import {
  BlockedPlayersList,
  CheckboxRow,
  ReadonlyRow,
  SectionTabs,
  SelectRow,
  SettingsGroup,
  SettingsSection,
  SliderRow,
  scrollToSettingsSection,
  useSettingsScrollSpy,
} from './SettingsControls';

type ClientSectionKey = 'general' | 'privacy' | 'social' | 'voice' | 'blocked';

const CLIENT_SECTIONS: { key: ClientSectionKey; label: string }[] = [
  { key: 'general', label: '综合' },
  { key: 'privacy', label: '隐私与主播模式' },
  { key: 'social', label: '聊天与邀请' },
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
    scrollToSettingsSection('client', section);
  }, []);

  return (
    <>
      <SectionTabs sections={CLIENT_SECTIONS} active={activeSection} onSelect={goToSection} />
      <div className="st-sections">
        <SettingsSection prefix="client" id="general" title="综合" description="客户端本身的表现：卡不卡、吵不吵。">
          <SettingsGroup>
            <CheckboxRow
              label={CLIENT_FIELDS.lowSpecMode.label}
              hint="关掉客户端里大部分动画，老电脑会顺滑很多"
              checked={values.lowSpecMode}
              onChange={(value) => onChange('lowSpecMode', value)}
            />
            <CheckboxRow label={CLIENT_FIELDS.disableInteractiveBackground.label} checked={values.disableInteractiveBackground} onChange={(value) => onChange('disableInteractiveBackground', value)} />
            <CheckboxRow
              label={CLIENT_FIELDS.closeClientDuringGame.label}
              hint="省一点内存，结算后客户端会重新打开"
              checked={values.closeClientDuringGame}
              onChange={(value) => onChange('closeClientDuringGame', value)}
            />
            <CheckboxRow label={CLIENT_FIELDS.disableChampionSkillText.label} checked={values.disableChampionSkillText} onChange={(value) => onChange('disableChampionSkillText', value)} />
            <CheckboxRow label={CLIENT_FIELDS.clientAudioEnabled.label} checked={values.clientAudioEnabled} onChange={(value) => onChange('clientAudioEnabled', value)} />
            <CheckboxRow label={CLIENT_FIELDS.uploadCrashReports.label} checked={values.uploadCrashReports} onChange={(value) => onChange('uploadCrashReports', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="privacy" title="隐私与主播模式" description="直播或不想被认出来时用。">
          <SettingsGroup>
            <CheckboxRow
              label={CLIENT_FIELDS.careerPrivate.label}
              hint="别人点开你的资料看不到战绩"
              checked={values.careerPrivate}
              onChange={(value) => onChange('careerPrivate', value)}
            />
            <CheckboxRow
              label={CLIENT_FIELDS.hideAllPlayerNamesForMe.label}
              hint="你看到的玩家名字都会被隐藏，和游戏内「隐藏玩家名字」是同一个开关"
              checked={values.hideAllPlayerNamesForMe}
              onChange={(value) => onChange('hideAllPlayerNamesForMe', value)}
            />
            <CheckboxRow label={CLIENT_FIELDS.hideMyNameFromOthers.label} checked={values.hideMyNameFromOthers} onChange={(value) => onChange('hideMyNameFromOthers', value)} />
            <CheckboxRow
              label={CLIENT_FIELDS.hideMyIdentityFromOthers.label}
              hint="名字、头像、段位都会对其他玩家隐藏"
              checked={values.hideMyIdentityFromOthers}
              onChange={(value) => onChange('hideMyIdentityFromOthers', value)}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="social" title="聊天与邀请">
          <SettingsGroup>
            <CheckboxRow
              label={CLIENT_FIELDS.blockNonFriendGameInvites.label}
              hint="陌生人拉你进房间的邀请不再弹出来"
              checked={values.blockNonFriendGameInvites}
              onChange={(value) => onChange('blockNonFriendGameInvites', value)}
            />
            <CheckboxRow label={CLIENT_FIELDS.linkClickWarningEnabled.label} checked={values.linkClickWarningEnabled} onChange={(value) => onChange('linkClickWarningEnabled', value)} />
            <CheckboxRow label={CLIENT_FIELDS.moreUnreadsEnabled.label} checked={values.moreUnreadsEnabled} onChange={(value) => onChange('moreUnreadsEnabled', value)} />
            <CheckboxRow label={CLIENT_FIELDS.friendRequestToastsEnabled.label} checked={values.friendRequestToastsEnabled} onChange={(value) => onChange('friendRequestToastsEnabled', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="client" id="voice" title="语音" description="组队开黑时的队伍语音。">
          <SettingsGroup>
            <CheckboxRow label={CLIENT_FIELDS.teamVoiceEnabled.label} checked={values.teamVoiceEnabled} onChange={(value) => onChange('teamVoiceEnabled', value)} />
            <CheckboxRow label={CLIENT_FIELDS.autoJoinTeamVoice.label} checked={values.autoJoinTeamVoice} onChange={(value) => onChange('autoJoinTeamVoice', value)} />
            <CheckboxRow label={CLIENT_FIELDS.muteOnConnect.label} checked={values.muteOnConnect} onChange={(value) => onChange('muteOnConnect', value)} />
            <SelectRow
              label={CLIENT_FIELDS.voiceInputMode.label}
              value={values.voiceInputMode}
              options={VOICE_INPUT_OPTIONS}
              segmented
              onChange={(value) => onChange('voiceInputMode', value)}
            />
            <ReadonlyRow
              label={CLIENT_FIELDS.voiceInputDeviceName.label}
              hint="在客户端里切换，这里只显示"
              value={values.voiceInputDeviceName || values.voiceInputDeviceHandle || '系统默认'}
            />
            <SliderRow label={CLIENT_FIELDS.voiceInputVolume.label} value={values.voiceInputVolume} min={0} max={100} onChange={(value) => onChange('voiceInputVolume', value)} />
            <SliderRow
              label={CLIENT_FIELDS.voiceSensitivity.label}
              hint="「有声音就发」时，声音超过这个大小才会被队友听到"
              value={values.voiceSensitivity}
              min={0}
              max={100}
              onChange={(value) => onChange('voiceSensitivity', value)}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          prefix="client"
          id="blocked"
          title="聊天黑名单"
          description="客户端里屏蔽的玩家，只能查看。要解除屏蔽请在客户端好友列表里操作。"
        >
          <BlockedPlayersList players={values.blockedPlayers} />
        </SettingsSection>
      </div>
    </>
  );
}
