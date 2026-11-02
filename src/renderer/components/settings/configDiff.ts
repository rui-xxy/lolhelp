import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';
import { CONFIG_PARTS } from '../../../shared/configParts';
import {
  CLIENT_FIELDS,
  CLIENT_LAYOUT,
  GAME_FIELDS,
  GAME_LAYOUT,
  withClientValue,
  withGameValue,
  withHotkeyValue,
} from './configFields';
import { HERO_ACTION_LABELS, HERO_HOTKEY_GROUPS, compareText, flattenHotkeys, hotkeyLabel } from './hotkeyModel';

// 两套设置逐项对照：哪几行不一样、各是什么，以及把一行改回对照那边。
// 「不一样」的口径和 countPartDiffs 完全一致：显示出来的文字不同才算。

/** 设置页上各块的顺序：先游戏里的五块，再热键，最后客户端（和游戏自己的设置面板一个顺序）。 */
export const PART_ORDER: LolConfigPart[] = ['video', 'controls', 'interface', 'combat', 'audio', 'hotkeys', 'client'];

export const PART_LABEL = Object.fromEntries(CONFIG_PARTS.map((part) => [part.key, part.label])) as Record<LolConfigPart, string>;

export interface ConfigDiffRow {
  /** game.width / client.careerPrivate / hotkey.GameEvents.evtCastSpell1 */
  id: string;
  part: LolConfigPart;
  label: string;
  /** 对照那边（一般是游戏里现在）显示成什么 */
  before: string;
  /** 正在看的这边显示成什么 */
  after: string;
}

export interface ConfigDiffGroup {
  part: LolConfigPart;
  rows: ConfigDiffRow[];
}

// 一行背后其实是几个值：分辨率是宽和高，音量是音量和静音。
const GAME_LINKED: Partial<Record<keyof LolGameConfigValues, Array<keyof LolGameConfigValues>>> = {
  width: ['height'],
  masterVolume: ['masterMute'],
  musicVolume: ['musicMute'],
  sfxVolume: ['sfxMute'],
  ambienceVolume: ['ambienceMute'],
  pingsVolume: ['pingsMute'],
  announcerVolume: ['announcerMute'],
  voiceVolume: ['voiceMute'],
};

// 麦克风是这台电脑的设备；「隐藏所有人的名字」和游戏内是同一个开关，在游戏那边算过了。
const SKIPPED_CLIENT = new Set<keyof LolClientConfigValues>(['blockedPlayers', 'voiceInputDeviceName', 'hideAllPlayerNamesForMe']);

const HERO_KEYS = HERO_HOTKEY_GROUPS.flatMap((group) => group.refs.map((ref) => `${ref.section}.${ref.key}`));

function sameHotkey(a?: string, b?: string): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

function gameRows(values: LolConfigValues, baseline: LolConfigValues, part: LolConfigPart): ConfigDiffRow[] {
  const section = GAME_LAYOUT.find((item) => item.part === part);
  if (!section) return [];
  return section.groups.flatMap((group) => group.keys).flatMap((key) => {
    const meta = GAME_FIELDS[key];
    if (meta.hidden) return [];
    const after = meta.format(values.game[key], values.game);
    const before = meta.format(baseline.game[key], baseline.game);
    return after === before ? [] : [{ id: `game.${key}`, part, label: meta.label, before, after }];
  });
}

function clientRows(values: LolConfigValues, baseline: LolConfigValues): ConfigDiffRow[] {
  return CLIENT_LAYOUT.flatMap((section) => section.groups.flatMap((group) => group.keys)).flatMap((key) => {
    const meta = CLIENT_FIELDS[key];
    if (meta.hidden || SKIPPED_CLIENT.has(key)) return [];
    const after = meta.format(values.client[key], values.client);
    const before = meta.format(baseline.client[key], baseline.client);
    return after === before ? [] : [{ id: `client.${key}`, part: 'client' as const, label: meta.label, before, after }];
  });
}

function hotkeyRows(values: LolConfigValues, baseline: LolConfigValues): ConfigDiffRow[] {
  const seen = new Set<string>();
  const refs: Array<{ section: string; key: string }> = [];
  const add = (section: string, key: string) => {
    const ref = `${section}.${key}`;
    if (seen.has(ref)) return;
    seen.add(ref);
    refs.push({ section, key });
  };
  // 英雄热键排在最前面，其余按 input.ini 里的顺序。
  for (const ref of HERO_KEYS) {
    const [section, key] = ref.split('.');
    if (values.hotkeys[section]?.[key] !== undefined || baseline.hotkeys[section]?.[key] !== undefined) add(section, key);
  }
  for (const binding of [...flattenHotkeys(values.hotkeys), ...flattenHotkeys(baseline.hotkeys)]) add(binding.section, binding.key);

  return refs.flatMap(({ section, key }) => {
    const now = values.hotkeys[section]?.[key];
    const was = baseline.hotkeys[section]?.[key];
    if (sameHotkey(now, was)) return [];
    return [{
      id: `hotkey.${section}.${key}`,
      part: 'hotkeys' as const,
      label: HERO_ACTION_LABELS[key] ?? hotkeyLabel(key),
      before: compareText(section, was ?? ''),
      after: compareText(section, now ?? ''),
    }];
  });
}

/** values 和 baseline 不一样的每一行，按块分好，只留有差异的块。 */
export function buildConfigDiff(values: LolConfigValues, baseline: LolConfigValues): ConfigDiffGroup[] {
  return PART_ORDER
    .map((part) => ({
      part,
      rows: part === 'client' ? clientRows(values, baseline) : part === 'hotkeys' ? hotkeyRows(values, baseline) : gameRows(values, baseline, part),
    }))
    .filter((group) => group.rows.length > 0);
}

/** 把一行改回 baseline 那边的样子（分辨率连宽带高，音量连静音一起）。 */
export function revertConfigRow(values: LolConfigValues, baseline: LolConfigValues, id: string): LolConfigValues {
  const [kind, ...rest] = id.split('.');
  if (kind === 'game') {
    const key = rest[0] as keyof LolGameConfigValues;
    if (!(key in baseline.game)) return values;
    let next = withGameValue(values, key, baseline.game[key]);
    for (const linked of GAME_LINKED[key] ?? []) next = withGameValue(next, linked, baseline.game[linked]);
    return next;
  }
  if (kind === 'client') {
    const key = rest[0] as keyof LolClientConfigValues;
    if (!(key in baseline.client)) return values;
    return withClientValue(values, key, baseline.client[key]);
  }
  if (kind === 'hotkey') {
    const [section, ...keyParts] = rest;
    const key = keyParts.join('.');
    return withHotkeyValue(values, section, key, baseline.hotkeys[section]?.[key] ?? '');
  }
  return values;
}

/** 一行属于哪个控件：设置页上靠这个 id 找到那一行（从差异列表跳过去时用）。 */
export function gameRowId(key: keyof LolGameConfigValues): string {
  return `game.${key}`;
}

export function clientRowId(key: keyof LolClientConfigValues): string {
  return `client.${key}`;
}
