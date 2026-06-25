import type {
  AssistBlacklistEntry,
  AssistChampionPreferences,
  AssistHotkeys,
  AssistSettings,
  AssistRole,
} from './api';

export const ASSIST_ROLES: AssistRole[] = [
  'top',
  'jungle',
  'middle',
  'bottom',
  'utility',
];

const DEFAULT_CHAMPION_PREFERENCES: AssistChampionPreferences = {
  normal: [],
  aram: [],
  arena: [],
  byRole: {
    top: [],
    jungle: [],
    middle: [],
    bottom: [],
    utility: [],
  },
  bans: {
    top: 0,
    jungle: 0,
    middle: 0,
    bottom: 0,
    utility: 0,
    arena: 0,
  },
  quickGameFirstPosition: 'TOP',
  quickGameSecondPosition: 'FILL',
};

export const DEFAULT_ASSIST_SETTINGS: AssistSettings = {
  showRuneAssistant: false,
  showPowerTrend: false,
  globalHotkeysEnabled: false,
  showMatchOverlay: false,
  showSpellOverlay: false,

  autoAccept: false,
  autoAcceptDelayMs: 0,
  autoPlayAgain: false,
  autoReturnLobby: false,
  autoHonorTeammates: false,
  autoHonorSummonerId: 0,
  autoHonorSummonerName: '',

  showPositionMessage: false,
  blacklistAlert: false,
  blacklistAlertToClient: false,
  highWinRateAlert: false,

  autoChampionEnabled: false,
  champions: DEFAULT_CHAMPION_PREFERENCES,

  autoWinRateItems: false,
  autoPickRateItems: false,
  sendItemsMessage: true,
  autoWinRateRunes: false,
  autoPickRateRunes: false,
  sendRunesMessage: true,

  playerTags: [
    '胜率',
    '连胜/连败',
    'KDA',
    '伤害占比',
    '组排关系',
    '常用位置',
    '首次使用英雄',
    '黑名单',
  ],
  powerTitles: ['牛马', '混子', '中等马', '上等马', '通天代'],
  hotkeys: {
    mainWindow: 'CTRL+ALT+Y',
    matchOverlay: 'SHIFT+TAB',
    matchHelper: 'F6',
    spellOverlay: 'F9',
  },

  preferredPresence: 'auto',
  statusMessage: '',

  spoofRankEnabled: false,
  spoofRankQueue: 'RANKED_SOLO_5x5',
  spoofRankTier: 'GOLD',
  spoofRankDivision: 'IV',
  profileIconId: 0,
  profileBackgroundChampionId: 0,
  removeTokens: false,
  removePrestigeCrest: false,
};

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(Number)
    .filter((item) => Number.isInteger(item) && item > 0)
    .slice(0, 24);
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function stringValue(value: unknown, fallback = '', maxLength = 200): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeAssistSettings(value: unknown): AssistSettings {
  const source = value && typeof value === 'object'
    ? value as Partial<AssistSettings>
    : {};
  const championSource = source.champions && typeof source.champions === 'object'
    ? source.champions as Partial<AssistChampionPreferences>
    : {};
  const byRoleSource = (championSource.byRole ?? {}) as Partial<
    AssistChampionPreferences['byRole']
  >;
  const bansSource = (championSource.bans ?? {}) as Partial<
    AssistChampionPreferences['bans']
  >;
  const hotkeySource = (source.hotkeys ?? {}) as Partial<AssistHotkeys>;

  return {
    ...DEFAULT_ASSIST_SETTINGS,
    showRuneAssistant: boolValue(source.showRuneAssistant, false),
    showPowerTrend: boolValue(source.showPowerTrend, false),
    globalHotkeysEnabled: boolValue(source.globalHotkeysEnabled, false),
    showMatchOverlay: boolValue(source.showMatchOverlay, false),
    showSpellOverlay: boolValue(source.showSpellOverlay, false),
    autoAccept: boolValue(source.autoAccept, false),
    autoAcceptDelayMs: finiteNumber(source.autoAcceptDelayMs, 0, 0, 5000),
    autoPlayAgain: boolValue(source.autoPlayAgain, false),
    autoReturnLobby: boolValue(source.autoReturnLobby, false),
    autoHonorTeammates: boolValue(source.autoHonorTeammates, false),
    autoHonorSummonerId: finiteNumber(source.autoHonorSummonerId, 0, 0, Number.MAX_SAFE_INTEGER),
    autoHonorSummonerName: stringValue(source.autoHonorSummonerName, '', 100),
    showPositionMessage: boolValue(source.showPositionMessage, false),
    blacklistAlert: boolValue(source.blacklistAlert, false),
    blacklistAlertToClient: boolValue(source.blacklistAlertToClient, false),
    highWinRateAlert: boolValue(source.highWinRateAlert, false),
    autoChampionEnabled: boolValue(source.autoChampionEnabled, false),
    champions: {
      normal: numberArray(championSource.normal),
      aram: numberArray(championSource.aram),
      arena: numberArray(championSource.arena),
      byRole: {
        top: numberArray(byRoleSource.top),
        jungle: numberArray(byRoleSource.jungle),
        middle: numberArray(byRoleSource.middle),
        bottom: numberArray(byRoleSource.bottom),
        utility: numberArray(byRoleSource.utility),
      },
      bans: {
        top: finiteNumber(bansSource.top, 0, 0, 100_000),
        jungle: finiteNumber(bansSource.jungle, 0, 0, 100_000),
        middle: finiteNumber(bansSource.middle, 0, 0, 100_000),
        bottom: finiteNumber(bansSource.bottom, 0, 0, 100_000),
        utility: finiteNumber(bansSource.utility, 0, 0, 100_000),
        arena: finiteNumber(bansSource.arena, 0, 0, 100_000),
      },
      quickGameFirstPosition: stringValue(
        championSource.quickGameFirstPosition,
        'TOP',
        20,
      ),
      quickGameSecondPosition: stringValue(
        championSource.quickGameSecondPosition,
        'FILL',
        20,
      ),
    },
    autoWinRateItems: boolValue(source.autoWinRateItems, false),
    autoPickRateItems: boolValue(source.autoPickRateItems, false),
    sendItemsMessage: boolValue(source.sendItemsMessage, true),
    autoWinRateRunes: boolValue(source.autoWinRateRunes, false),
    autoPickRateRunes: boolValue(source.autoPickRateRunes, false),
    sendRunesMessage: boolValue(source.sendRunesMessage, true),
    playerTags: Array.isArray(source.playerTags)
      ? source.playerTags.filter((item): item is string => typeof item === 'string').slice(0, 30)
      : [...DEFAULT_ASSIST_SETTINGS.playerTags],
    powerTitles: Array.isArray(source.powerTitles)
      ? source.powerTitles
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.slice(0, 20))
          .slice(0, 5)
      : [...DEFAULT_ASSIST_SETTINGS.powerTitles],
    hotkeys: {
      mainWindow: stringValue(hotkeySource.mainWindow, 'CTRL+ALT+Y', 50),
      matchOverlay: stringValue(hotkeySource.matchOverlay, 'SHIFT+TAB', 50),
      matchHelper: stringValue(hotkeySource.matchHelper, 'F6', 50),
      spellOverlay: stringValue(hotkeySource.spellOverlay, 'F9', 50),
    },
    preferredPresence: stringValue(source.preferredPresence, 'auto', 20),
    statusMessage: stringValue(source.statusMessage, '', 100),
    spoofRankEnabled: boolValue(source.spoofRankEnabled, false),
    spoofRankQueue: stringValue(source.spoofRankQueue, 'RANKED_SOLO_5x5', 50),
    spoofRankTier: stringValue(source.spoofRankTier, 'GOLD', 30),
    spoofRankDivision: stringValue(source.spoofRankDivision, 'IV', 10),
    profileIconId: finiteNumber(source.profileIconId, 0, 0, 100_000),
    profileBackgroundChampionId: finiteNumber(
      source.profileBackgroundChampionId,
      0,
      0,
      100_000,
    ),
    removeTokens: boolValue(source.removeTokens, false),
    removePrestigeCrest: boolValue(source.removePrestigeCrest, false),
  };
}

export function normalizeAssistBlacklist(value: unknown): AssistBlacklistEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const source = item as Partial<AssistBlacklistEntry>;
      const now = Date.now();
      return {
        id: stringValue(source.id, crypto.randomUUID(), 100),
        riotId: stringValue(source.riotId, '', 100),
        region: stringValue(source.region, '', 30),
        tags: Array.isArray(source.tags)
          ? source.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 10)
          : [],
        description: stringValue(source.description, '', 500),
        createdAt: finiteNumber(source.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
        updatedAt: finiteNumber(source.updatedAt, now, 0, Number.MAX_SAFE_INTEGER),
      };
    })
    .filter((item) => item.riotId)
    .slice(0, 5000);
}
