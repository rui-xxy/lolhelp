import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  Download,
  FolderSearch,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import type {
  LolClientConfigValues,
  LolConfigProfileSummary,
  LolConfigState,
  LolConfigValues,
  LolGameConfigValues,
  LolHotkeyValues,
} from '../../../shared/api';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'client' | 'game' | 'hotkeys' | 'profiles';
type ClientSectionKey = 'general' | 'notifications' | 'chat' | 'sound' | 'voice' | 'blocked';
type GameSectionKey = 'controls' | 'gameplay' | 'alerts' | 'combat' | 'cooldowns' | 'video' | 'interface' | 'audio';
type HotkeySectionKey = string;
type Notice = { type: 'success' | 'error'; text: string } | null;
type HotkeyCategoryKey =
  | 'hero'
  | 'spell-summoner'
  | 'items'
  | 'movement'
  | 'camera'
  | 'display'
  | 'communication'
  | 'menus'
  | 'shop'
  | 'quickcast'
  | 'training'
  | 'other';
type HotkeyBinding = { section: string; key: string; value: string };
type HotkeyCaptureTarget = HotkeyBinding & { label: string };
type HotkeyCategory = {
  key: HotkeyCategoryKey;
  label: string;
  defaultOpen?: boolean;
  bindings: HotkeyBinding[];
};

const DEFAULT_ROOT_PATH = 'D:\\WeGameApps\\英雄联盟';

const WINDOW_MODES = [
  { value: '0', label: '全屏' },
  { value: '1', label: '窗口' },
  { value: '2', label: '无边框' },
];

const RESOLUTION_PRESETS = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

const QUALITY_OPTIONS = [
  { value: 0, label: '低' },
  { value: 1, label: '中低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
  { value: 4, label: '极高' },
];

const FRAME_CAP_OPTIONS = [
  { value: 0, label: '不限制' },
  { value: 1, label: '显示器刷新率' },
  { value: 2, label: '144 FPS' },
  { value: 3, label: '120 FPS' },
  { value: 4, label: '60 FPS' },
  { value: 5, label: '30 FPS' },
];

const CAMERA_LOCK_OPTIONS = [
  { value: 0, label: '基于红/蓝方的镜头偏移' },
  { value: 1, label: '固定偏移' },
  { value: 2, label: '无偏移' },
];

const SUMMONER_NAME_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '玩家名称' },
  { value: 2, label: '英雄名称' },
];

const COOLDOWN_FORMAT_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '秒' },
  { value: 2, label: '分钟 + 秒' },
];

const CLIENT_SECTIONS: { key: ClientSectionKey; label: string }[] = [
  { key: 'general', label: '综合' },
  { key: 'notifications', label: '通知弹窗' },
  { key: 'chat', label: '聊天&好友' },
  { key: 'sound', label: '声音' },
  { key: 'voice', label: '语音' },
  { key: 'blocked', label: '聊天黑名单' },
];

const GAME_SECTIONS: { key: GameSectionKey; label: string }[] = [
  { key: 'controls', label: '控制' },
  { key: 'gameplay', label: '游戏设置' },
  { key: 'alerts', label: '通知' },
  { key: 'combat', label: '技能和攻击显示' },
  { key: 'cooldowns', label: '技能冷却显示' },
  { key: 'video', label: '画面' },
  { key: 'interface', label: '界面' },
  { key: 'audio', label: '声音' },
];

const HOTKEY_SECTION_ORDER = ['GameEvents', 'HUDEvents', 'Quickbinds', 'ShopEvents', 'WASD'];

const HOTKEY_CATEGORIES: { key: HotkeyCategoryKey; label: string; defaultOpen?: boolean }[] = [
  { key: 'hero', label: '英雄热键', defaultOpen: true },
  { key: 'spell-summoner', label: '英雄技能和召唤师技能' },
  { key: 'items', label: '道具' },
  { key: 'movement', label: '玩家移动' },
  { key: 'camera', label: '镜头控制' },
  { key: 'display', label: '显示' },
  { key: 'communication', label: '交流' },
  { key: 'menus', label: '菜单' },
  { key: 'shop', label: '道具商店' },
  { key: 'quickcast', label: '快捷施法' },
  { key: 'training', label: '训练模式' },
  { key: 'other', label: '其他' },
];

const HERO_HOTKEY_GROUPS: { label: string; refs: { section: string; key: string; label: string }[] }[] = [
  {
    label: '英雄技能',
    refs: [
      { section: 'GameEvents', key: 'evtCastSpell1', label: 'Q' },
      { section: 'GameEvents', key: 'evtCastSpell2', label: 'W' },
      { section: 'GameEvents', key: 'evtCastSpell3', label: 'E' },
      { section: 'GameEvents', key: 'evtCastSpell4', label: 'R' },
    ],
  },
  {
    label: '召唤师技能',
    refs: [
      { section: 'GameEvents', key: 'evtCastAvatarSpell1', label: 'D' },
      { section: 'GameEvents', key: 'evtCastAvatarSpell2', label: 'F' },
    ],
  },
  {
    label: '分路任务',
    refs: [
      { section: 'GameEvents', key: 'evtCastRoleBound', label: 'V' },
    ],
  },
  {
    label: '道具',
    refs: [
      { section: 'GameEvents', key: 'evtUseItem1', label: '1' },
      { section: 'GameEvents', key: 'evtUseItem2', label: '2' },
      { section: 'GameEvents', key: 'evtUseItem3', label: '3' },
      { section: 'GameEvents', key: 'evtUseItem4', label: '5' },
      { section: 'GameEvents', key: 'evtUseItem5', label: '6' },
      { section: 'GameEvents', key: 'evtUseItem6', label: '7' },
      { section: 'GameEvents', key: 'evtUseItem7', label: '回城' },
    ],
  },
  {
    label: '饰品',
    refs: [
      { section: 'GameEvents', key: 'evtUseVisionItem', label: '4' },
    ],
  },
];

const HERO_HOTKEY_REF_KEYS = new Set(
  HERO_HOTKEY_GROUPS.flatMap((group) => group.refs.map((ref) => `${ref.section}.${ref.key}`)),
);

const HOTKEY_LABELS: Record<string, string> = {
  evtCastSpell1: '施放技能 Q',
  evtCastSpell2: '施放技能 W',
  evtCastSpell3: '施放技能 E',
  evtCastSpell4: '施放技能 R',
  evtCastAvatarSpell1: '召唤师技能 1',
  evtCastAvatarSpell2: '召唤师技能 2',
  evtCastRoleBound: '角色绑定技能',
  evtUseItem1: '使用物品 1',
  evtUseItem2: '使用物品 2',
  evtUseItem3: '使用物品 3',
  evtUseItem4: '使用物品 4',
  evtUseItem5: '使用物品 5',
  evtUseItem6: '使用物品 6',
  evtUseItem7: '回城',
  evtUseVisionItem: '使用饰品',
  evtToggleMinionHealthBars: '切换小兵生命条',
  evtSysMenu: '系统菜单',
  evtPlayerAttackMove: '玩家攻击移动',
  evtPlayerAttackMoveClick: '攻击移动点击',
  evtPlayerAttackOnlyClick: '仅攻击英雄点击',
  evtPlayerHoldPosition: '原地待命',
  evtPlayerStopPosition: '停止',
  evtPlayerMoveClick: '移动点击',
  evtPetMoveClick: '宠物移动点击',
  evtCameraSnap: '镜头回到英雄',
  evtCameraLockToggle: '锁定镜头',
  evtSelectSelf: '选择自己',
  evtSelectAlly1: '选择队友 1',
  evtSelectAlly2: '选择队友 2',
  evtSelectAlly3: '选择队友 3',
  evtSelectAlly4: '选择队友 4',
  evtScrollUp: '镜头上移',
  evtScrollDown: '镜头下移',
  evtScrollLeft: '镜头左移',
  evtScrollRight: '镜头右移',
  evtOpenShop: '打开商店',
  evtShowScoreBoard: '显示计分板',
  evtShowCharacterMenu: '显示角色面板',
  evtShowSummonerNames: '显示召唤师名称',
  evtShowHealthBars: '显示生命条',
  evtShowVoicePanel: '显示语音面板',
  evtChatHistory: '聊天记录',
  evtChampionOnly: '只以英雄为目标',
  evtChampMasteryDisplay: '显示英雄成就',
  evtEmoteJoke: '笑话',
  evtEmoteTaunt: '嘲讽',
  evtEmoteDance: '跳舞',
  evtEmoteLaugh: '大笑',
  evtEmoteToggle: '切换表情',
  evtRadialEmoteInstantOpen: '打开表情轮盘',
  evtRadialEmoteOpen: '打开表情轮盘',
  evtRadialEmotePlaySlot0: '播放表情 1',
  evtRadialEmotePlaySlot1: '播放表情 2',
  evtRadialEmotePlaySlot2: '播放表情 3',
  evtRadialEmotePlaySlot3: '播放表情 4',
  evtRadialEmotePlaySlot4: '播放表情 5',
  evtRadialEmotePlaySlot5: '播放表情 6',
  evtRadialEmotePlaySlot6: '播放表情 7',
  evtRadialEmotePlaySlot7: '播放表情 8',
  evtRadialEmotePlaySlot8: '播放表情 9',
  evtPushToTalk: '按键说话',
  evtPushToTalkTeam: '队伍语音按键说话',
  evtLevelSpell1: '升级技能 Q',
  evtLevelSpell2: '升级技能 W',
  evtLevelSpell3: '升级技能 E',
  evtLevelSpell4: '升级技能 R',
  evtSmartCastSpell1: '快捷施法 Q',
  evtSmartCastSpell2: '快捷施法 W',
  evtSmartCastSpell3: '快捷施法 E',
  evtSmartCastSpell4: '快捷施法 R',
  evtNormalCastSpell1: '常规施法 Q',
  evtNormalCastSpell2: '常规施法 W',
  evtNormalCastSpell3: '常规施法 E',
  evtNormalCastSpell4: '常规施法 R',
  evtSelfCastSpell1: '自我施法 Q',
  evtSelfCastSpell2: '自我施法 W',
  evtSelfCastSpell3: '自我施法 E',
  evtSelfCastSpell4: '自我施法 R',
  evntPlayerPing: '信号',
  evntPlayerPingCursor: '光标信号',
  evntPlayerPingDanger: '危险信号',
  evntPlayerPingCursorDanger: '光标危险信号',
  evtPlayerPingAllIn: '全力以赴信号',
  evtPlayerPingComeHere: '协助我信号',
  evtPlayerPingMIA: '敌人消失信号',
  evtPlayerPingOMW: '正在路上信号',
  evtPlayerPingPush: '推进信号',
  evtPlayerPingRadialDanger: '危险轮盘信号',
  evtPlayerPingVisionNeeded: '需要视野信号',
  evtTogglePlayerStats: '切换玩家统计',
  evtToggleMouseClip: '切换鼠标限制',
  evtToggleFPSAndLatency: '切换 FPS 和延迟',
  evtToggleDeathRecapShowcase: '显示死亡回放',
  evtHoldShowScoreBoard: '按住显示计分板',
  evtDrawHud: '显示界面',
  evtDragScrollLock: '拖动滚屏锁定',
  evtOnUIMouse4Pan: '鼠标拖动画面',
  evtReciprocityTrigger: '回应互动',
  evtReciprocityMyBadTrigger: '回应失误',
  evtShopSwitchTabs: '商店切换标签',
  evtShopFocusSearch: '商店搜索',
  PlayerPingCursorDanger: '光标危险信号',
};

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
}

function percentLabel(value: number): string {
  return `${Math.round(value)}`;
}

function profileLabel(profile: LolConfigProfileSummary): string {
  return `${profile.name} · ${profile.gameResolution}`;
}

function targetLabel(target: string): string {
  const targetMap: Record<string, string> = {
    Spell1: 'Q',
    Spell2: 'W',
    Spell3: 'E',
    Spell4: 'R',
    AvatarSpell1: '召唤师技能 1',
    AvatarSpell2: '召唤师技能 2',
    Item1: '物品 1',
    Item2: '物品 2',
    Item3: '物品 3',
    Item4: '物品 4',
    Item5: '物品 5',
    Item6: '物品 6',
    VisionItem: '饰品',
    RoleBound: '角色绑定技能',
  };
  return targetMap[target] ?? target;
}

function hotkeyLabel(key: string): string {
  if (HOTKEY_LABELS[key]) return HOTKEY_LABELS[key];
  const quickbindMatch = key.match(/^evtCast(Spell[1-4]|AvatarSpell[1-2]|RoleBound)smart$/)
    ?? key.match(/^evtUse(Item[1-6]|VisionItem)smart$/);
  if (quickbindMatch) return `${targetLabel(quickbindMatch[1])}快捷施法`;
  const smartMatch = key.match(/^evt(.+?)(Spell[1-4]|AvatarSpell[1-2]|Item[1-6]|VisionItem|RoleBound)$/);
  if (smartMatch) {
    const prefixMap: Record<string, string> = {
      SmartCast: '快捷施法',
      SmartCastWithIndicator: '带指示器快捷施法',
      SmartPlusSelfCast: '快捷自我施法',
      SmartPlusSelfCastWithIndicator: '带指示器快捷自我施法',
      NormalCast: '常规施法',
      SelfCast: '自我施法',
    };
    return [prefixMap[smartMatch[1]], targetLabel(smartMatch[2])].filter(Boolean).join(' ') || key;
  }
  return key
    ? '未命名热键'
    : '热键';
}

function isSwitchHotkey(section: string, value: string): boolean {
  return section === 'Quickbinds' && (value === '0' || value === '1');
}

function quickbindKeyFor(key: string): string | null {
  if (key.match(/^evtCast(Spell[1-4]|AvatarSpell[1-2]|RoleBound)$/)) return `${key}smart`;
  if (key.match(/^evtUse(Item[1-6]|VisionItem)$/)) return `${key}smart`;
  return null;
}

function displayHotkeyToken(token: string): string {
  if (!token || token === '<Unbound>' || token.toLowerCase() === 'null') return '未绑定';
  if (/^[a-z]$/.test(token)) return token.toUpperCase();
  if (/^Button 1$/i.test(token)) return '鼠标左键';
  if (/^Button 2$/i.test(token)) return '鼠标右键';
  if (/^Button 3$/i.test(token)) return '鼠标中键';
  if (/^Button 4$/i.test(token)) return '鼠标侧键 1';
  if (/^Button 5$/i.test(token)) return '鼠标侧键 2';
  const labelMap: Record<string, string> = {
    Space: '空格',
    Return: '回车',
    Enter: '回车',
    Esc: 'Esc',
    Tab: 'Tab',
    Backspace: '退格',
    Delete: '删除',
    Insert: '插入',
    Home: 'Home',
    End: 'End',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    'Up Arrow': '↑',
    'Down Arrow': '↓',
    'Left Arrow': '←',
    'Right Arrow': '→',
    Ctrl: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
  };
  return labelMap[token] ?? token;
}

function displayHotkeyValue(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'null' || normalized === '[<Unbound>]') return '未绑定';

  return normalized
    .split(',')
    .map((combo) => {
      const tokens = [...combo.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
      if (tokens.length === 0) return displayHotkeyToken(combo.trim());
      return tokens.map(displayHotkeyToken).join(' + ');
    })
    .join(' / ');
}

function hotkeyTokenFromKeyboard(key: string): string | null {
  if (key === 'Control') return 'Ctrl';
  if (key === 'Alt') return 'Alt';
  if (key === 'Shift') return 'Shift';
  if (key === 'Meta') return null;
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
  if (key === 'Enter') return 'Return';
  if (key === 'ArrowUp') return 'Up Arrow';
  if (key === 'ArrowDown') return 'Down Arrow';
  if (key === 'ArrowLeft') return 'Left Arrow';
  if (key === 'ArrowRight') return 'Right Arrow';
  if (key.length === 1) return key.toLowerCase();
  if (/^F\d{1,2}$/.test(key)) return key;
  return key;
}

function bracketHotkeyToken(token: string): string {
  return `[${token}]`;
}

function composeCapturedHotkey(
  token: string,
  modifiers: Pick<ReactKeyboardEvent | ReactMouseEvent, 'ctrlKey' | 'altKey' | 'shiftKey'>,
): string {
  const parts: string[] = [];
  const tokenIsModifier = token === 'Ctrl' || token === 'Alt' || token === 'Shift';
  if (!tokenIsModifier && modifiers.ctrlKey) parts.push('Ctrl');
  if (!tokenIsModifier && modifiers.altKey) parts.push('Alt');
  if (!tokenIsModifier && modifiers.shiftKey) parts.push('Shift');
  parts.push(token);
  return parts.map(bracketHotkeyToken).join('');
}

function hotkeyFromKeyboardEvent(event: ReactKeyboardEvent): string | null {
  const token = hotkeyTokenFromKeyboard(event.key);
  if (!token) return null;
  return composeCapturedHotkey(token, event);
}

function hotkeyFromMouseEvent(event: ReactMouseEvent): string | null {
  const buttonMap: Record<number, string> = {
    0: 'Button 1',
    1: 'Button 3',
    2: 'Button 2',
    3: 'Button 4',
    4: 'Button 5',
  };
  const token = buttonMap[event.button];
  if (!token) return null;
  return composeCapturedHotkey(token, event);
}

function hotkeyRefKey(binding: Pick<HotkeyBinding, 'section' | 'key'>): string {
  return `${binding.section}.${binding.key}`;
}

function isHeroHotkey(binding: Pick<HotkeyBinding, 'section' | 'key'>): boolean {
  return HERO_HOTKEY_REF_KEYS.has(hotkeyRefKey(binding));
}

function hotkeyCategoryFor(binding: Pick<HotkeyBinding, 'section' | 'key'>): HotkeyCategoryKey {
  const { section, key } = binding;

  if (isHeroHotkey(binding)) return 'hero';
  if (section === 'Quickbinds') return 'quickcast';
  if (section === 'ShopEvents' || key === 'evtOpenShop') return 'shop';
  if (/Practice|Training/i.test(key)) return 'training';
  if (/Item|VisionItem/i.test(key)) return 'items';
  if (/Spell|AvatarSpell|RoleBound/i.test(key) || key.startsWith('evtLevelSpell')) return 'spell-summoner';
  if (/Show|Toggle|DrawHud|HealthBars|ScoreBoard|CharacterMenu|SummonerNames|FPS|DeathRecap|Minion/i.test(key) || section === 'HUDEvents') {
    return 'display';
  }
  if (/Ping|Emote|Chat|Voice|PushToTalk|Reciprocity/i.test(key)) return 'communication';
  if (/Player|Pet|ChampionOnly/i.test(key)) return 'movement';
  if (/Camera|Scroll|SelectAlly|SelectSelf|Mouse4Pan|DragScroll/i.test(key)) return 'camera';
  if (/Menu|Sys|Shop/i.test(key)) return 'menus';

  return 'other';
}

function flattenHotkeys(values: LolHotkeyValues): HotkeyBinding[] {
  return Object.keys(values ?? {})
    .sort((a, b) => {
      const ai = HOTKEY_SECTION_ORDER.indexOf(a);
      const bi = HOTKEY_SECTION_ORDER.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    })
    .flatMap((section) =>
      Object.entries(values[section] ?? {}).map(([key, value]) => ({
        section,
        key,
        value,
      })),
    );
}

function buildHotkeyCategories(bindings: HotkeyBinding[]): HotkeyCategory[] {
  const grouped = new Map<HotkeyCategoryKey, HotkeyBinding[]>();
  for (const binding of bindings) {
    const category = hotkeyCategoryFor(binding);
    grouped.set(category, [...(grouped.get(category) ?? []), binding]);
  }

  return HOTKEY_CATEGORIES
    .map((category) => ({
      ...category,
      bindings: grouped.get(category.key) ?? [],
    }))
    .filter((category) => category.bindings.length > 0);
}

function useSettingsScrollSpy<TSection extends string>(
  prefix: string,
  sections: { key: TSection; label: string }[],
  setActiveSection: (section: TSection) => void,
) {
  useEffect(() => {
    const scrollHost = document.querySelector<HTMLElement>('[data-settings-scroll]');
    if (!scrollHost) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const sectionNodes = sections
        .map((section) => ({
          key: section.key,
          node: document.getElementById(`${prefix}-section-${section.key}`),
        }))
        .filter((item): item is { key: TSection; node: HTMLElement } => Boolean(item.node));

      if (sectionNodes.length === 0) return;

      const maxScrollTop = scrollHost.scrollHeight - scrollHost.clientHeight;
      if (maxScrollTop - scrollHost.scrollTop <= 2) {
        setActiveSection(sectionNodes[sectionNodes.length - 1].key);
        return;
      }

      const hostRect = scrollHost.getBoundingClientRect();
      const anchorY = hostRect.top + Math.min(180, hostRect.height * 0.38);
      let active = sectionNodes[0].key;

      for (const item of sectionNodes) {
        if (item.node.getBoundingClientRect().top <= anchorY) {
          active = item.key;
        } else {
          break;
        }
      }

      setActiveSection(active);
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    scrollHost.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollHost.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [prefix, sections, setActiveSection]);
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState<TabKey>('client');
  const [rootPath, setRootPath] = useState(DEFAULT_ROOT_PATH);
  const [state, setState] = useState<LolConfigState | null>(null);
  const [draft, setDraft] = useState<LolConfigValues | null>(null);
  const [profileName, setProfileName] = useState('我的配置');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const profiles = state?.profiles ?? [];
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const refresh = useCallback(async (pathOverride?: string) => {
    setBusy('read');
    setNotice(null);
    try {
      const next = await window.lolHelper.config.read(pathOverride ?? rootPath);
      setState(next);
      setRootPath(next.rootPath);
      setDraft(next.values);
      if (next.profiles.length > 0) {
        setSelectedProfileId((current) =>
          next.profiles.some((profile) => profile.id === current)
            ? current
            : next.profiles[0].id,
        );
      } else {
        setSelectedProfileId('');
      }
      setNotice(next.found ? null : { type: 'error', text: '没有找到可用的英雄联盟配置目录' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '读取配置失败' });
    } finally {
      setBusy(null);
    }
  }, [rootPath]);

  useEffect(() => {
    if (!open) return;
    void refresh(DEFAULT_ROOT_PATH);
  }, [open]);

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-settings-scroll]')?.scrollTo({ top: 0 });
  }, [tab]);

  const updateClient = useCallback(<K extends keyof LolClientConfigValues>(
    key: K,
    value: LolClientConfigValues[K],
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            client: { ...current.client, [key]: value },
            game: key === 'hideAllPlayerNamesForMe'
              ? { ...current.game, hidePlayerNames: Boolean(value) }
              : current.game,
          }
        : current,
    );
  }, []);

  const updateGame = useCallback(<K extends keyof LolGameConfigValues>(
    key: K,
    value: LolGameConfigValues[K],
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            game: { ...current.game, [key]: value },
            client: key === 'hidePlayerNames'
              ? { ...current.client, hideAllPlayerNamesForMe: Boolean(value) }
              : current.client,
          }
        : current,
    );
  }, []);

  const updateHotkey = useCallback((section: string, key: string, value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            hotkeys: {
              ...current.hotkeys,
              [section]: {
                ...(current.hotkeys[section] ?? {}),
                [key]: value,
              },
            },
          }
        : current,
    );
  }, []);

  const applyDraft = useCallback(async () => {
    if (!draft) return;
    setBusy('apply');
    setNotice(null);
    try {
      const result = await window.lolHelper.config.applyValues({ rootPath, values: draft });
      await refresh(result.rootPath);
      setNotice({
        type: result.lcuSynced ? 'success' : 'error',
        text: result.lcuSynced
          ? `已写入 ${result.filesWritten.length} 个配置文件，并同步到客户端`
          : `已写入 ${result.filesWritten.length} 个配置文件，但没有同步到正在运行的客户端${result.lcuError ? `：${result.lcuError}` : ''}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '写入配置失败' });
    } finally {
      setBusy(null);
    }
  }, [draft, refresh, rootPath]);

  const saveProfile = useCallback(async () => {
    if (!draft) return;
    setBusy('save-profile');
    setNotice(null);
    try {
      const nextProfiles = await window.lolHelper.config.saveProfile({
        name: profileName,
        rootPath,
        values: draft,
      });
      setState((current) => (current ? { ...current, profiles: nextProfiles } : current));
      const saved = nextProfiles.find((profile) => profile.name === profileName.trim());
      if (saved) setSelectedProfileId(saved.id);
      setNotice({ type: 'success', text: '方案已保存' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '保存方案失败' });
    } finally {
      setBusy(null);
    }
  }, [draft, profileName, rootPath]);

  const applyProfile = useCallback(async () => {
    if (!selectedProfileId) return;
    setBusy('apply-profile');
    setNotice(null);
    try {
      const result = await window.lolHelper.config.applyProfile({ profileId: selectedProfileId, rootPath });
      await refresh(result.rootPath);
      setNotice({
        type: result.lcuSynced ? 'success' : 'error',
        text: result.lcuSynced
          ? `方案已应用，写入 ${result.filesWritten.length} 个文件，并同步到客户端`
          : `方案已写入 ${result.filesWritten.length} 个文件，但没有同步到正在运行的客户端${result.lcuError ? `：${result.lcuError}` : ''}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '应用方案失败' });
    } finally {
      setBusy(null);
    }
  }, [refresh, rootPath, selectedProfileId]);

  const deleteProfile = useCallback(async () => {
    if (!selectedProfileId || !selectedProfile) return;
    if (!window.confirm(`删除方案“${selectedProfile.name}”？`)) return;
    setBusy('delete-profile');
    setNotice(null);
    try {
      const nextProfiles = await window.lolHelper.config.deleteProfile(selectedProfileId);
      setState((current) => (current ? { ...current, profiles: nextProfiles } : current));
      setSelectedProfileId(nextProfiles[0]?.id ?? '');
      setNotice({ type: 'success', text: '方案已删除' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '删除方案失败' });
    } finally {
      setBusy(null);
    }
  }, [selectedProfile, selectedProfileId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <section className="flex h-[640px] w-[980px] flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-app-border px-4">
          <div className="flex size-8 items-center justify-center rounded-sm bg-app-surface-soft text-app-primary">
            <Settings className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-app-text">设置同步</h2>
            <p className="truncate text-xs text-app-muted">{rootPath}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭设置">
            <X className="size-4" />
          </Button>
        </header>

        <div className="border-b border-app-border bg-app-bg-soft px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderSearch className="size-4 shrink-0 text-app-muted" />
            <input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-sm border border-app-border bg-app-surface px-2 text-xs text-app-text outline-none focus:border-app-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh(rootPath)}
              disabled={Boolean(busy)}
            >
              <RefreshCw className={`size-3.5 ${busy === 'read' ? 'animate-spin' : ''}`} />
              读取
            </Button>
            <Button size="sm" onClick={applyDraft} disabled={!draft || Boolean(busy)}>
              <Upload className="size-3.5" />
              写入当前
            </Button>
          </div>
          {notice && (
            <div
              className={`mt-2 flex items-center gap-2 rounded-sm border px-2 py-1.5 text-xs ${
                notice.type === 'success'
                  ? 'border-app-success/25 bg-app-success/5 text-app-success'
                  : 'border-app-danger/25 bg-app-danger/5 text-app-danger'
              }`}
            >
              {notice.type === 'success' ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              <span>{notice.text}</span>
            </div>
          )}
        </div>

        <nav className="hidden">
          <TabButton active={tab === 'client'} onClick={() => setTab('client')}>客户端</TabButton>
          <TabButton active={tab === 'game'} onClick={() => setTab('game')}>游戏内</TabButton>
          <TabButton active={tab === 'hotkeys'} onClick={() => setTab('hotkeys')}>热键</TabButton>
          <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>方案</TabButton>
        </nav>

        <div className="flex min-h-0 flex-1">
          <aside className="w-40 shrink-0 border-r border-app-border bg-app-bg-soft p-3">
            <nav className="space-y-1">
              <TabButton active={tab === 'client'} onClick={() => setTab('client')}>客户端</TabButton>
              <TabButton active={tab === 'game'} onClick={() => setTab('game')}>游戏内</TabButton>
              <TabButton active={tab === 'hotkeys'} onClick={() => setTab('hotkeys')}>热键</TabButton>
              <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>方案</TabButton>
            </nav>
          </aside>

        <main data-settings-scroll className="scrollbar-none min-w-0 flex-1 overflow-y-auto p-4">
          {!draft ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-app-muted">
              <span>{busy === 'read' ? '正在读取配置...' : '配置读取失败'}</span>
              {notice?.type === 'error' && (
                <span className="max-w-xl text-center text-xs text-app-danger">{notice.text}</span>
              )}
            </div>
          ) : (
            <>
              {tab === 'client' && (
                <ClientSettings values={draft.client} onChange={updateClient} />
              )}
              {tab === 'game' && (
                <GameSettings values={draft.game} onChange={updateGame} />
              )}
              {tab === 'hotkeys' && (
                <HotkeySettings values={draft.hotkeys} onChange={updateHotkey} />
              )}
              {tab === 'profiles' && (
                <ProfileSettings
                  state={state}
                  profileName={profileName}
                  setProfileName={setProfileName}
                  profiles={profiles}
                  selectedProfileId={selectedProfileId}
                  setSelectedProfileId={setSelectedProfileId}
                  onSaveProfile={saveProfile}
                  onApplyProfile={applyProfile}
                  onDeleteProfile={deleteProfile}
                  busy={busy}
                />
              )}
            </>
          )}
        </main>
        </div>
      </section>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center rounded-sm border-l-2 px-3 text-left text-sm font-medium transition-colors ${
        active
          ? 'border-app-primary bg-app-surface text-app-text'
          : 'border-transparent text-app-muted hover:bg-app-nav-hover hover:text-app-text'
      }`}
    >
      {children}
    </button>
  );
}

function ClientSettings({
  values,
  onChange,
}: {
  values: LolClientConfigValues;
  onChange: <K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => void;
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
            <CheckboxRow label="低配机器适应模式" checked={values.lowSpecMode} onChange={(v) => onChange('lowSpecMode', v)} />
            <CheckboxRow label="禁用互动背景效果" checked={values.disableInteractiveBackground} onChange={(v) => onChange('disableInteractiveBackground', v)} />
            <CheckboxRow label="游戏期间关闭客户端" checked={values.closeClientDuringGame} onChange={(v) => onChange('closeClientDuringGame', v)} />
            <CheckboxRow label="禁用英雄技能说明文本" checked={values.disableChampionSkillText} onChange={(v) => onChange('disableChampionSkillText', v)} />
          </SettingsGroup>

          <SettingsGroup title="系统">
            <CheckboxRow label="自动发送崩溃报告" checked={values.uploadCrashReports} onChange={(v) => onChange('uploadCrashReports', v)} />
            <CheckboxRow label="将我的生涯设为不公开" checked={values.careerPrivate} onChange={(v) => onChange('careerPrivate', v)} />
          </SettingsGroup>

          <SettingsGroup title="主播模式">
            <CheckboxRow label="隐藏所有名称（仅对我）" checked={values.hideAllPlayerNamesForMe} onChange={(v) => onChange('hideAllPlayerNamesForMe', v)} />
            <CheckboxRow label="对所有人隐藏我的名称" checked={values.hideMyNameFromOthers} onChange={(v) => onChange('hideMyNameFromOthers', v)} />
            <CheckboxRow label="对所有人隐藏我的身份信息" checked={values.hideMyIdentityFromOthers} onChange={(v) => onChange('hideMyIdentityFromOthers', v)} />
          </SettingsGroup>
        </div>
      </SettingsSection>

      <SettingsSection prefix="client" id="notifications" title="通知弹窗">
        <SettingsGroup>
          <CheckboxRow label="只接受好友游戏邀请" checked={values.blockNonFriendGameInvites} onChange={(v) => onChange('blockNonFriendGameInvites', v)} />
          <ReadonlyRow label="关闭比赛通知功能" value="未定位到稳定字段" />
          <ReadonlyRow label="禁用商品·新获内容的提醒" value="未定位到稳定字段" />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection prefix="client" id="chat" title="聊天&好友">
        <SettingsGroup>
          <CheckboxRow label="当我在聊天框中点击了跳转链接时，请警告我" checked={values.linkClickWarningEnabled} onChange={(v) => onChange('linkClickWarningEnabled', v)} />
          <CheckboxRow label="显示“更多未读”指示条" checked={values.moreUnreadsEnabled} onChange={(v) => onChange('moreUnreadsEnabled', v)} />
          <CheckboxRow label="显示新的好友请求浮标" checked={values.friendRequestToastsEnabled} onChange={(v) => onChange('friendRequestToastsEnabled', v)} />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection prefix="client" id="sound" title="声音">
        <SettingsGroup>
          <CheckboxRow label="开启客户端音效" checked={values.clientAudioEnabled} onChange={(v) => onChange('clientAudioEnabled', v)} />
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
          <CheckboxRow label="启用组队语音" checked={values.teamVoiceEnabled} onChange={(v) => onChange('teamVoiceEnabled', v)} />
          <CheckboxRow label="自动加入队伍语音" checked={values.autoJoinTeamVoice} onChange={(v) => onChange('autoJoinTeamVoice', v)} />
          <CheckboxRow label="在我连上联盟语音时将我静音" checked={values.muteOnConnect} onChange={(v) => onChange('muteOnConnect', v)} />
          <ReadonlyRow label="输入设备" value={values.voiceInputDeviceName || values.voiceInputDeviceHandle || '-'} />
          <SliderRow label="输入音量（增强）" value={values.voiceInputVolume} min={0} max={100} onChange={(v) => onChange('voiceInputVolume', v)} />
          <SelectRow
            label="输入模式"
            value={values.voiceInputMode}
            options={[
              { value: 'voiceActivity', label: '语音活跃度' },
              { value: 'pushToTalk', label: '按住以发言' },
            ]}
            onChange={(v) => onChange('voiceInputMode', v)}
          />
          <SliderRow label="语音激活阈值" value={values.voiceSensitivity} min={0} max={100} onChange={(v) => onChange('voiceSensitivity', v)} />
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

function SectionDot({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group relative flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-app-primary/40"
    >
      <span
        className={`rounded-full transition-all ${
          active
            ? 'h-6 w-2 bg-app-primary shadow-[0_0_0_4px_rgba(255,56,92,0.12)]'
            : 'size-2 bg-app-border group-hover:size-2.5 group-hover:bg-app-primary/60'
        }`}
      />
      <span className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-sm bg-app-text px-2 py-1 text-xs font-medium text-app-surface opacity-0 shadow-sm transition-opacity group-hover:opacity-100 xl:block">
        {label}
      </span>
    </button>
  );
}

function SettingsSection<TSection extends string>({
  prefix,
  id,
  title,
  children,
}: {
  prefix: string;
  id: TSection;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`${prefix}-section-${id}`}
      className="scroll-mt-4 space-y-4"
    >
      <h3 className="text-base font-semibold text-app-text">{title}</h3>
      {children}
    </section>
  );
}

function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="max-w-[460px] space-y-2">
      {title && <h4 className="mb-2 text-sm font-semibold text-app-text">{title}</h4>}
      {children}
    </div>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <span className="max-w-[160px] truncate text-right text-xs text-app-muted">{value}</span>
    </div>
  );
}

function BlockedPlayersList({
  players,
}: {
  players?: LolClientConfigValues['blockedPlayers'];
}) {
  const safePlayers = Array.isArray(players) ? players : [];

  if (safePlayers.length === 0) {
    return (
      <div className="rounded-sm bg-app-bg-soft px-3 py-8 text-center text-sm text-app-muted">
        暂无聊天黑名单
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {safePlayers.map((player, index) => {
        const gameName = player.gameName || '-';
        const fallbackKey = player.id || player.puuid || `${gameName}-${index}`;
        return (
        <div key={fallbackKey} className="flex min-w-0 items-center gap-3 rounded-sm bg-app-bg-soft px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-surface text-xs font-semibold text-app-muted">
            {player.icon > -1 ? player.icon : gameName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-app-text">{gameName}</div>
            <div className="truncate text-xs text-app-muted">
              {player.gameTag ? `#${player.gameTag}` : player.puuid}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function GameSettings({
  values,
  onChange,
}: {
  values: LolGameConfigValues;
  onChange: <K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => void;
}) {
  const [activeSection, setActiveSection] = useState<GameSectionKey>('controls');
  useSettingsScrollSpy<GameSectionKey>('game', GAME_SECTIONS, setActiveSection);

  const goToSection = useCallback((section: GameSectionKey) => {
    setActiveSection(section);
    document.getElementById(`game-section-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[580px] grid-cols-[minmax(0,1fr)_32px] gap-4 pb-8">
      <div className="min-w-0 space-y-8">
        <SettingsSection prefix="game" id="controls" title="控制">
          <SettingsGroup>
            <SliderRow label="鼠标速度" value={values.gameMouseSpeed} min={0} max={100} onChange={(v) => onChange('gameMouseSpeed', v)} />
            <SliderRow label="镜头移动速度（鼠标）" value={values.mapScrollSpeed} min={0} max={100} onChange={(v) => onChange('mapScrollSpeed', v)} />
            <SliderRow label="镜头移动速度（键盘）" value={values.keyboardScrollSpeed} min={0} max={100} onChange={(v) => onChange('keyboardScrollSpeed', v)} />
            <CheckboxRow label="复活时移动镜头" checked={values.snapCameraOnRespawn} onChange={(v) => onChange('snapCameraOnRespawn', v)} />
            <CheckboxRow label="启用镜头平滑" checked={values.scrollSmoothingEnabled} onChange={(v) => onChange('scrollSmoothingEnabled', v)} />
            <CheckboxRow label="按住鼠标拖拽滚屏" checked={values.middleClickDragScrollEnabled} onChange={(v) => onChange('middleClickDragScrollEnabled', v)} />
            <SelectRow label="镜头锁定模式" value={values.cameraLockMode} options={CAMERA_LOCK_OPTIONS} onChange={(v) => onChange('cameraLockMode', Number(v))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="gameplay" title="游戏设置">
          <SettingsGroup>
            <CheckboxRow label="自动攻击" checked={values.autoAcquireTarget} onChange={(v) => onChange('autoAcquireTarget', v)} />
            <CheckboxRow label="使用移动预测" checked={values.predictMovement} onChange={(v) => onChange('predictMovement', v)} />
            <CheckboxRow label="显示防御塔射程指示器" checked={values.showTurretRangeIndicators} onChange={(v) => onChange('showTurretRangeIndicators', v)} />
            <CheckboxRow label="依据鼠标指针攻击移动" checked={values.enableTargetedAttackMove} onChange={(v) => onChange('enableTargetedAttackMove', v)} />
            <CheckboxRow label="显示推荐打野路线" checked={values.recommendJunglePaths} onChange={(v) => onChange('recommendJunglePaths', v)} />
            <CheckboxRow label="“只以英雄为目标”视为可开关选项" checked={values.targetChampionsOnlyAsToggle} onChange={(v) => onChange('targetChampionsOnlyAsToggle', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="alerts" title="通知">
          <SettingsGroup>
            <CheckboxRow label="受伤时屏幕闪烁" checked={values.flashScreenWhenDamaged} onChange={(v) => onChange('flashScreenWhenDamaged', v)} />
            <CheckboxRow label="失控时屏幕闪烁" checked={values.flashScreenWhenStunned} onChange={(v) => onChange('flashScreenWhenStunned', v)} />
            <CheckboxRow label="显示屏幕外的事件信号" checked={values.showOffScreenPointsOfInterest} onChange={(v) => onChange('showOffScreenPointsOfInterest', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="combat" title="技能和攻击显示">
          <SettingsGroup>
            <CheckboxRow label="攻击时显示目标框架" checked={values.autoDisplayTarget} onChange={(v) => onChange('autoDisplayTarget', v)} />
            <CheckboxRow label="启用线状弹道显示" checked={values.enableLineMissileVis} onChange={(v) => onChange('enableLineMissileVis', v)} />
            <CheckboxRow label="显示攻击距离" checked={values.showAttackRadius} onChange={(v) => onChange('showAttackRadius', v)} />
            <CheckboxRow label="只能使用热键施放技能" checked={values.disableHudSpellClick} onChange={(v) => onChange('disableHudSpellClick', v)} />
            <CheckboxRow label="显示技能消耗" checked={values.showSpellCosts} onChange={(v) => onChange('showSpellCosts', v)} />
            <CheckboxRow label="显示推荐技能加点" checked={values.showSpellRecommendations} onChange={(v) => onChange('showSpellRecommendations', v)} />
            <CheckboxRow label="显示中立营地计时" checked={values.showNeutralCamps} onChange={(v) => onChange('showNeutralCamps', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="cooldowns" title="技能冷却显示">
          <SettingsGroup>
            <SelectRow label="冷却格式" value={values.numericCooldownFormat} options={COOLDOWN_FORMAT_OPTIONS} onChange={(v) => onChange('numericCooldownFormat', Number(v))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="video" title="画面">
          <SettingsGroup>
            <SelectRow label="窗口模式" value={values.windowMode} options={WINDOW_MODES} onChange={(v) => onChange('windowMode', v)} />
            <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
              <span className="text-sm text-app-body">分辨率</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={values.width}
                  onChange={(e) => onChange('width', Number(e.target.value))}
                  className="h-8 w-24 rounded-sm border border-app-border bg-app-surface px-2 text-sm"
                />
                <span className="text-xs text-app-muted">x</span>
                <input
                  type="number"
                  value={values.height}
                  onChange={(e) => onChange('height', Number(e.target.value))}
                  className="h-8 w-24 rounded-sm border border-app-border bg-app-surface px-2 text-sm"
                />
                <select
                  value={`${values.width}x${values.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split('x').map(Number);
                    onChange('width', width);
                    onChange('height', height);
                  }}
                  className="h-8 rounded-sm border border-app-border bg-app-surface px-2 text-xs"
                >
                  {RESOLUTION_PRESETS.map(([width, height]) => (
                    <option key={`${width}x${height}`} value={`${width}x${height}`}>
                      {width} x {height}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <SelectRow label="阴影质量" value={values.shadowQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('shadowQuality', Number(v))} />
            <SelectRow label="角色质量" value={values.characterQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('characterQuality', Number(v))} />
            <SelectRow label="特效质量" value={values.effectsQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('effectsQuality', Number(v))} />
            <SelectRow label="环境质量" value={values.environmentQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('environmentQuality', Number(v))} />
            <SelectRow label="帧率上限" value={values.frameCapType} options={FRAME_CAP_OPTIONS} onChange={(v) => onChange('frameCapType', Number(v))} />
            <CheckboxRow label="垂直同步" checked={values.waitForVerticalSync} onChange={(v) => onChange('waitForVerticalSync', v)} />
            <CheckboxRow label="抗锯齿 FXAA" checked={values.enableFxaa} onChange={(v) => onChange('enableFxaa', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="interface" title="界面">
          <SettingsGroup>
            <SelectRow label="生命槽上方名称" value={values.showSummonerNames} options={SUMMONER_NAME_OPTIONS} onChange={(v) => onChange('showSummonerNames', Number(v))} />
            <SliderRow label="用户界面缩放" value={values.globalScale} min={0} max={100} onChange={(v) => onChange('globalScale', v)} />
            <SliderRow label="聊天缩放" value={values.chatScale} min={0} max={100} onChange={(v) => onChange('chatScale', v)} />
            <SliderRow label="小地图缩放" value={values.minimapScale} min={0} max={100} onChange={(v) => onChange('minimapScale', v)} />
            <SliderRow label="指针缩放" value={values.cursorScale} min={0} max={100} onChange={(v) => onChange('cursorScale', v)} />
            <CheckboxRow label="启用用户界面动画" checked={values.enableHudAnimations} onChange={(v) => onChange('enableHudAnimations', v)} />
            <CheckboxRow label="显示 FPS 和延迟" checked={values.showFpsAndLatency} onChange={(v) => onChange('showFpsAndLatency', v)} />
            <CheckboxRow label="聊天显示时间戳" checked={values.showTimestamps} onChange={(v) => onChange('showTimestamps', v)} />
            <CheckboxRow label="显示队友聊天" checked={values.showAlliedChat} onChange={(v) => onChange('showAlliedChat', v)} />
            <CheckboxRow label="显示所有人聊天" checked={values.showAllChannelChat} onChange={(v) => onChange('showAllChannelChat', v)} />
            <CheckboxRow label="隐藏玩家名字" checked={values.hidePlayerNames} onChange={(v) => onChange('hidePlayerNames', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="audio" title="声音">
          <SettingsGroup>
            <CheckboxRow label="启用游戏音频" checked={values.enableAudio} onChange={(v) => onChange('enableAudio', v)} />
            <VolumeRow label="总音量" volume={values.masterVolume} muted={values.masterMute} onVolume={(v) => onChange('masterVolume', v)} onMuted={(v) => onChange('masterMute', v)} />
            <VolumeRow label="音乐" volume={values.musicVolume} muted={values.musicMute} onVolume={(v) => onChange('musicVolume', v)} onMuted={(v) => onChange('musicMute', v)} />
            <VolumeRow label="音效" volume={values.sfxVolume} muted={values.sfxMute} onVolume={(v) => onChange('sfxVolume', v)} onMuted={(v) => onChange('sfxMute', v)} />
            <VolumeRow label="环境音" volume={values.ambienceVolume} muted={values.ambienceMute} onVolume={(v) => onChange('ambienceVolume', v)} onMuted={(v) => onChange('ambienceMute', v)} />
            <VolumeRow label="信号" volume={values.pingsVolume} muted={values.pingsMute} onVolume={(v) => onChange('pingsVolume', v)} onMuted={(v) => onChange('pingsMute', v)} />
            <VolumeRow label="播报员" volume={values.announcerVolume} muted={values.announcerMute} onVolume={(v) => onChange('announcerVolume', v)} onMuted={(v) => onChange('announcerMute', v)} />
            <VolumeRow label="语音" volume={values.voiceVolume} muted={values.voiceMute} onVolume={(v) => onChange('voiceVolume', v)} onMuted={(v) => onChange('voiceMute', v)} />
          </SettingsGroup>
        </SettingsSection>
      </div>

      <aside className="sticky top-4 flex h-[360px] flex-col items-center justify-center gap-3">
        {GAME_SECTIONS.map((item) => (
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

function HotkeySettings({
  values,
  onChange,
}: {
  values: LolHotkeyValues;
  onChange: (section: string, key: string, value: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<HotkeySectionKey>('hero');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ hero: true });
  const [captureTarget, setCaptureTarget] = useState<HotkeyCaptureTarget | null>(null);
  const allBindings = useMemo(() => flattenHotkeys(values), [values]);
  const categories = useMemo(() => buildHotkeyCategories(allBindings), [allBindings]);

  const navSections = useMemo(
    () => categories.map((item) => ({ key: item.key, label: item.label })),
    [categories],
  );
  useSettingsScrollSpy<HotkeySectionKey>('hotkeys', navSections, setActiveSection);

  const goToSection = useCallback((section: HotkeySectionKey) => {
    setActiveSection(section);
    setOpenSections((current) => ({ ...current, [section]: true }));
    document.getElementById(`hotkeys-section-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, []);

  const toggleSection = useCallback((section: HotkeySectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !(current[section] ?? false) }));
  }, []);

  const openCapture = useCallback((binding: HotkeyBinding) => {
    setCaptureTarget({ ...binding, label: hotkeyLabel(binding.key) });
  }, []);

  if (allBindings.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-app-muted">
        未读取到 input.ini 热键配置
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[720px] grid-cols-[minmax(0,1fr)_32px] gap-4 pb-8">
      <div className="min-w-0 space-y-8">
        {categories.map((category) => (
          <HotkeyCategoryPanel
            key={category.key}
            category={category}
            open={openSections[category.key] ?? Boolean(category.defaultOpen)}
            onToggle={() => toggleSection(category.key)}
          >
            {category.key === 'hero' ? (
              <HeroHotkeyOverview
                bindings={category.bindings}
                values={values}
                onChange={onChange}
                onCapture={openCapture}
              />
            ) : (
              <HotkeyRows bindings={category.bindings} onChange={onChange} onCapture={openCapture} />
            )}
          </HotkeyCategoryPanel>
        ))}
      </div>

      <aside className="sticky top-4 flex h-[360px] flex-col items-center justify-center gap-3">
        {navSections.map((item) => (
          <SectionDot
            key={item.key}
            active={activeSection === item.key}
            label={item.label}
            onClick={() => goToSection(item.key)}
          />
        ))}
      </aside>
      {captureTarget && (
        <HotkeyCaptureDialog
          target={captureTarget}
          onClose={() => setCaptureTarget(null)}
          onConfirm={(nextValue) => {
            onChange(captureTarget.section, captureTarget.key, nextValue);
            setCaptureTarget(null);
          }}
        />
      )}
    </div>
  );
}

function HotkeyCategoryPanel({
  category,
  open,
  onToggle,
  children,
}: {
  category: HotkeyCategory;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={`hotkeys-section-${category.key}`} className="scroll-mt-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-app-text">{category.label}</span>
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-app-bg-soft text-lg font-semibold text-app-muted">
          {open ? '-' : '+'}
        </span>
      </button>
      {open && <div className="pt-2">{children}</div>}
    </section>
  );
}

function HeroHotkeyOverview({
  bindings,
  values,
  onChange,
  onCapture,
}: {
  bindings: HotkeyBinding[];
  values: LolHotkeyValues;
  onChange: (section: string, key: string, value: string) => void;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  const visibleKeys = new Set(bindings.map(hotkeyRefKey));
  const groups = HERO_HOTKEY_GROUPS
    .map((group) => ({
      ...group,
      refs: group.refs.filter((ref) => visibleKeys.has(hotkeyRefKey(ref)) && values[ref.section]?.[ref.key] !== undefined),
    }))
    .filter((group) => group.refs.length > 0);

  const updateAllQuickbinds = (enabled: boolean) => {
    for (const group of HERO_HOTKEY_GROUPS) {
      for (const ref of group.refs) {
        const quickbindKey = quickbindKeyFor(ref.key);
        if (quickbindKey && values.Quickbinds?.[quickbindKey] !== undefined) {
          onChange('Quickbinds', quickbindKey, enabled ? '1' : '0');
        }
      }
    }
  };

  return (
    <div className="space-y-6 rounded-sm bg-app-bg-soft px-5 py-5">
      <div className="mx-auto grid h-16 max-w-[560px] grid-cols-2 rounded-sm bg-app-surface p-1">
        <button type="button" className="rounded-sm bg-app-primary/15 text-sm font-semibold text-app-text">
          全局
        </button>
        <button type="button" className="rounded-sm text-sm font-semibold text-app-muted">
          当前英雄
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_190px] gap-x-6 gap-y-5">
        <div className="space-y-5">
          {groups.filter((group) => group.label === '英雄技能' || group.label === '道具').map((group) => (
            <HeroHotkeyGroup
              key={group.label}
              group={group}
              values={values}
              onChange={onChange}
              onCapture={onCapture}
            />
          ))}
        </div>
        <div className="space-y-5">
          {groups.filter((group) => group.label !== '英雄技能' && group.label !== '道具').map((group) => (
            <HeroHotkeyGroup
              key={group.label}
              group={group}
              values={values}
              onChange={onChange}
              onCapture={onCapture}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => updateAllQuickbinds(true)}>
          全部设为快捷施法
        </Button>
        <Button variant="outline" size="sm" onClick={() => updateAllQuickbinds(false)}>
          全部设为常规施法
        </Button>
      </div>
    </div>
  );
}

function HeroHotkeyGroup({
  group,
  values,
  onChange,
  onCapture,
}: {
  group: { label: string; refs: { section: string; key: string; label: string }[] };
  values: LolHotkeyValues;
  onChange: (section: string, key: string, value: string) => void;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-app-muted">{group.label}</h4>
      <div className="flex flex-wrap gap-2">
        {group.refs.map((ref) => {
          const quickbindKey = quickbindKeyFor(ref.key);
          const smartValue = quickbindKey ? values.Quickbinds?.[quickbindKey] : undefined;
          const value = values[ref.section]?.[ref.key] ?? '';
          return (
            <HeroHotkeyBox
              key={`${ref.section}-${ref.key}`}
              label={ref.label}
              value={value}
              smart={smartValue === '1'}
              smartToggleVisible={smartValue !== undefined}
              onCapture={() => onCapture({ section: ref.section, key: ref.key, value })}
              onToggleSmart={() => {
                if (quickbindKey && smartValue !== undefined) {
                  onChange('Quickbinds', quickbindKey, smartValue === '1' ? '0' : '1');
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function HeroHotkeyBox({
  label,
  value,
  smart,
  smartToggleVisible,
  onCapture,
  onToggleSmart,
}: {
  label: string;
  value: string;
  smart: boolean;
  smartToggleVisible: boolean;
  onCapture: () => void;
  onToggleSmart: () => void;
}) {
  const displayValue = displayHotkeyValue(value);
  const compact = displayValue.length > 6;

  return (
    <div className="w-[82px]">
      <button
        type="button"
        onClick={onCapture}
        className="flex h-[74px] w-full flex-col overflow-hidden rounded-sm bg-app-surface text-app-text shadow-sm ring-1 ring-app-border transition hover:ring-app-primary"
        aria-label={`修改${label}`}
      >
        <span className="flex min-h-0 flex-1 items-center justify-center px-1">
          <span className={`truncate font-semibold ${compact ? 'text-sm' : 'text-3xl'}`}>
            {displayValue}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleSmart}
        disabled={!smartToggleVisible}
        className={`mt-1 flex h-6 w-full items-center justify-center rounded-sm text-base transition ${
          smart
            ? 'bg-app-primary/15 text-app-primary'
            : 'bg-app-surface text-app-muted'
        } ${smartToggleVisible ? 'hover:text-app-primary' : 'opacity-35'}`}
        aria-label={`${smart ? '关闭' : '开启'}${label}快捷施法`}
      >
        ↩
      </button>
    </div>
  );
}

function HotkeyRows({
  bindings,
  onChange,
  onCapture,
}: {
  bindings: HotkeyBinding[];
  onChange: (section: string, key: string, value: string) => void;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  return (
    <div className="max-w-[560px] space-y-1">
      {bindings.map((binding) => (
        <HotkeyRow
          key={`${binding.section}-${binding.key}`}
          section={binding.section}
          bindingKey={binding.key}
          value={binding.value}
          onChange={(nextValue) => onChange(binding.section, binding.key, nextValue)}
          onCapture={() => onCapture(binding)}
        />
      ))}
    </div>
  );
}

function KeyBindingButton({
  value,
  onClick,
}: {
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 min-w-0 rounded-sm bg-app-bg-soft px-3 text-left text-sm font-medium text-app-text outline-none ring-1 ring-app-border transition hover:ring-app-primary focus-visible:ring-app-primary"
    >
      <span className="block truncate">{displayHotkeyValue(value)}</span>
    </button>
  );
}

function HotkeyCaptureDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: HotkeyCaptureTarget;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [captured, setCaptured] = useState(target.value);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captureRef.current?.focus();
  }, []);

  const captureKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextValue = hotkeyFromKeyboardEvent(event);
    if (nextValue) setCaptured(nextValue);
  };

  const captureMouse = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextValue = hotkeyFromMouseEvent(event);
    if (nextValue) setCaptured(nextValue);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35">
      <div className="w-[360px] rounded-md border border-app-border bg-app-surface p-4 shadow-airbnb">
        <h3 className="text-base font-semibold text-app-text">修改键位</h3>
        <p className="mt-1 text-sm text-app-muted">{target.label}</p>
        <div
          ref={captureRef}
          tabIndex={0}
          onKeyDown={captureKeyboard}
          onMouseDown={captureMouse}
          onContextMenu={(event) => event.preventDefault()}
          className="mt-4 flex h-28 cursor-crosshair items-center justify-center rounded-sm bg-app-bg-soft px-4 text-center outline-none ring-1 ring-app-border focus:ring-app-primary"
        >
          <span className="text-2xl font-semibold text-app-text">{displayHotkeyValue(captured)}</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCaptured('[<Unbound>]')}>
            清空
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" onClick={() => onConfirm(captured)}>
              确认
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HotkeyRow({
  section,
  bindingKey,
  value,
  onChange,
  onCapture,
}: {
  section: string;
  bindingKey: string;
  value: string;
  onChange: (value: string) => void;
  onCapture: () => void;
}) {
  const label = hotkeyLabel(bindingKey);

  return (
    <div className="grid grid-cols-[220px_260px] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-sm text-app-body" title={label}>{label}</div>
      </div>
      {isSwitchHotkey(section, value) ? (
        <div className="flex justify-start">
          <SwitchControl checked={value === '1'} onChange={(checked) => onChange(checked ? '1' : '0')} />
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <KeyBindingButton value={value} onClick={onCapture} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange('[<Unbound>]')}
            aria-label="清空热键"
            title="清空"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileSettings({
  state,
  profileName,
  setProfileName,
  profiles,
  selectedProfileId,
  setSelectedProfileId,
  onSaveProfile,
  onApplyProfile,
  onDeleteProfile,
  busy,
}: {
  state: LolConfigState | null;
  profileName: string;
  setProfileName: (value: string) => void;
  profiles: LolConfigProfileSummary[];
  selectedProfileId: string;
  setSelectedProfileId: (value: string) => void;
  onSaveProfile: () => void;
  onApplyProfile: () => void;
  onDeleteProfile: () => void;
  busy: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Panel title="方案">
        <div className="space-y-2">
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="h-9 w-full rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
          />
          <Button className="w-full" onClick={onSaveProfile} disabled={Boolean(busy)}>
            <Save className="size-4" />
            保存为方案
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="h-9 w-full rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
          >
            {profiles.length === 0 ? (
              <option value="">暂无方案</option>
            ) : (
              profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>
              ))
            )}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onApplyProfile} disabled={!selectedProfileId || Boolean(busy)}>
              <Download className="size-4" />
              一键应用
            </Button>
            <Button variant="outline" onClick={onDeleteProfile} disabled={!selectedProfileId || Boolean(busy)}>
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="文件">
        <div className="space-y-2">
          {(state?.files ?? []).map((file) => (
            <div key={file.key} className="grid grid-cols-[1fr_auto] gap-3 rounded-sm border border-app-border bg-app-bg-soft px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${file.exists ? 'bg-app-success' : 'bg-app-danger'}`} />
                  <span className="text-sm font-medium text-app-text">{file.label}</span>
                </div>
                <p className="mt-1 break-all text-xs text-app-muted">{file.path}</p>
              </div>
              <div className="text-right text-xs text-app-muted">
                <div>{file.exists ? `${Math.round(file.size / 1024)} KB` : '缺失'}</div>
                <div className="mt-1">{formatTime(file.updatedAt)}</div>
              </div>
            </div>
          ))}
        </div>
        {state?.warnings.length ? (
          <div className="mt-3 rounded-sm border border-app-danger/25 bg-app-danger/5 px-3 py-2 text-xs text-app-danger">
            {state.warnings.slice(0, 3).map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-app-border bg-app-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-app-text">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <SwitchControl checked={checked} onChange={onChange} />
    </label>
  );
}

function SwitchControl({
  checked,
  onChange,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const trackClass = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumbClass = size === 'sm'
    ? checked ? 'size-4 translate-x-4' : 'size-4 translate-x-0.5'
    : checked ? 'size-5 translate-x-5' : 'size-5 translate-x-0.5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(event) => {
        event.preventDefault();
        onChange(!checked);
      }}
      className={`${trackClass} relative shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-app-border'
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${thumbClass}`}
      />
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_42px] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-right text-xs font-medium text-app-muted">{percentLabel(value)}</span>
    </div>
  );
}

function SelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const selected = options.find((option) => String(option.value) === e.target.value);
          if (selected) onChange(selected.value);
        }}
        className="h-8 rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function VolumeRow({
  label,
  volume,
  muted,
  onVolume,
  onMuted,
}: {
  label: string;
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onMuted: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[78px_1fr_42px_54px] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onVolume(Number(e.target.value))}
      />
      <span className="text-right text-xs font-medium text-app-muted">{percentLabel(volume)}</span>
      <label className="flex items-center justify-end gap-2 text-xs text-app-muted">
        <span>静音</span>
        <SwitchControl checked={muted} onChange={onMuted} size="sm" />
      </label>
    </div>
  );
}
