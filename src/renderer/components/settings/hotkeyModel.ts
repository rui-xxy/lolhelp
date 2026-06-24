import type { LolHotkeyValues } from '../../../shared/api';

export type HotkeySectionKey = string;
export type HotkeyCategoryKey =
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
export type HotkeyBinding = { section: string; key: string; value: string };
export type HotkeyCaptureTarget = HotkeyBinding & { label: string };
export type HotkeyCategory = {
  key: HotkeyCategoryKey;
  label: string;
  defaultOpen?: boolean;
  bindings: HotkeyBinding[];
};

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

export const HERO_HOTKEY_GROUPS: {
  label: string;
  refs: { section: string; key: string; label: string }[];
}[] = [
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
    refs: [{ section: 'GameEvents', key: 'evtCastRoleBound', label: 'V' }],
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
    refs: [{ section: 'GameEvents', key: 'evtUseVisionItem', label: '4' }],
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

export function hotkeyLabel(key: string): string {
  if (HOTKEY_LABELS[key]) return HOTKEY_LABELS[key];
  const quickbindMatch = key.match(/^evtCast(Spell[1-4]|AvatarSpell[1-2]|RoleBound)smart$/)
    ?? key.match(/^evtUse(Item[1-6]|VisionItem)smart$/);
  if (quickbindMatch) return `${targetLabel(quickbindMatch[1])}快捷施法`;
  const smartMatch = key.match(
    /^evt(.+?)(Spell[1-4]|AvatarSpell[1-2]|Item[1-6]|VisionItem|RoleBound)$/,
  );
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
  return key ? '未命名热键' : '热键';
}

export function isSwitchHotkey(section: string, value: string): boolean {
  return section === 'Quickbinds' && (value === '0' || value === '1');
}

export function quickbindKeyFor(key: string): string | null {
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

export function displayHotkeyValue(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'null' || normalized === '[<Unbound>]') {
    return '未绑定';
  }
  return normalized
    .split(',')
    .map((combo) => {
      const tokens = [...combo.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
      if (tokens.length === 0) return displayHotkeyToken(combo.trim());
      return tokens.map(displayHotkeyToken).join(' + ');
    })
    .join(' / ');
}

interface HotkeyEventLike {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function composeCapturedHotkey(token: string, modifiers: HotkeyEventLike): string {
  const parts: string[] = [];
  const tokenIsModifier = token === 'Ctrl' || token === 'Alt' || token === 'Shift';
  if (!tokenIsModifier && modifiers.ctrlKey) parts.push('Ctrl');
  if (!tokenIsModifier && modifiers.altKey) parts.push('Alt');
  if (!tokenIsModifier && modifiers.shiftKey) parts.push('Shift');
  parts.push(token);
  return parts.map((part) => `[${part}]`).join('');
}

export function hotkeyFromKeyboardEvent(event: HotkeyEventLike & { key: string }): string | null {
  const keyMap: Record<string, string | null> = {
    Control: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
    Meta: null,
    ' ': 'Space',
    Escape: 'Esc',
    Enter: 'Return',
    ArrowUp: 'Up Arrow',
    ArrowDown: 'Down Arrow',
    ArrowLeft: 'Left Arrow',
    ArrowRight: 'Right Arrow',
  };
  const token =
    event.key in keyMap
      ? keyMap[event.key]
      : event.key.length === 1
        ? event.key.toLowerCase()
        : event.key;
  return token ? composeCapturedHotkey(token, event) : null;
}

export function hotkeyFromMouseEvent(event: HotkeyEventLike & { button: number }): string | null {
  const buttonMap: Record<number, string> = {
    0: 'Button 1',
    1: 'Button 3',
    2: 'Button 2',
    3: 'Button 4',
    4: 'Button 5',
  };
  const token = buttonMap[event.button];
  return token ? composeCapturedHotkey(token, event) : null;
}

export function hotkeyRefKey(binding: Pick<HotkeyBinding, 'section' | 'key'>): string {
  return `${binding.section}.${binding.key}`;
}

function hotkeyCategoryFor(
  binding: Pick<HotkeyBinding, 'section' | 'key'>,
): HotkeyCategoryKey {
  const { section, key } = binding;
  if (HERO_HOTKEY_REF_KEYS.has(hotkeyRefKey(binding))) return 'hero';
  if (section === 'Quickbinds') return 'quickcast';
  if (section === 'ShopEvents' || key === 'evtOpenShop') return 'shop';
  if (/Practice|Training/i.test(key)) return 'training';
  if (/Item|VisionItem/i.test(key)) return 'items';
  if (/Spell|AvatarSpell|RoleBound/i.test(key) || key.startsWith('evtLevelSpell')) {
    return 'spell-summoner';
  }
  if (
    /Show|Toggle|DrawHud|HealthBars|ScoreBoard|CharacterMenu|SummonerNames|FPS|DeathRecap|Minion/i.test(
      key,
    ) || section === 'HUDEvents'
  ) {
    return 'display';
  }
  if (/Ping|Emote|Chat|Voice|PushToTalk|Reciprocity/i.test(key)) return 'communication';
  if (/Player|Pet|ChampionOnly/i.test(key)) return 'movement';
  if (/Camera|Scroll|SelectAlly|SelectSelf|Mouse4Pan|DragScroll/i.test(key)) return 'camera';
  if (/Menu|Sys|Shop/i.test(key)) return 'menus';
  return 'other';
}

export function flattenHotkeys(values: LolHotkeyValues): HotkeyBinding[] {
  return Object.keys(values)
    .sort((first, second) => {
      const firstIndex = HOTKEY_SECTION_ORDER.indexOf(first);
      const secondIndex = HOTKEY_SECTION_ORDER.indexOf(second);
      if (firstIndex !== -1 || secondIndex !== -1) {
        return (firstIndex === -1 ? 99 : firstIndex) - (secondIndex === -1 ? 99 : secondIndex);
      }
      return first.localeCompare(second);
    })
    .flatMap((section) =>
      Object.entries(values[section] ?? {}).map(([key, value]) => ({ section, key, value })),
    );
}

export function buildHotkeyCategories(bindings: HotkeyBinding[]): HotkeyCategory[] {
  const grouped = new Map<HotkeyCategoryKey, HotkeyBinding[]>();
  for (const binding of bindings) {
    const category = hotkeyCategoryFor(binding);
    grouped.set(category, [...(grouped.get(category) ?? []), binding]);
  }
  return HOTKEY_CATEGORIES
    .map((category) => ({ ...category, bindings: grouped.get(category.key) ?? [] }))
    .filter((category) => category.bindings.length > 0);
}
