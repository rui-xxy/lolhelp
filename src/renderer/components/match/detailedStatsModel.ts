import type { MatchParticipantSummary } from '../../../shared/api';

// 「详尽表格」的数据模型：把一场对局里每个人的几十上百项原始统计，整理成玩家看得懂的几大块。
// 每块分「常看」和「更多」两层：常看的默认摆出来，更多的点开才显示；全场都是 0 的项自动收起。
// 原始字段（SGP / 客户端战绩）不一定齐全，读不到就当这一项不存在，不会显示成一排 0。

export type DetailValue = number | string | boolean | null;
export type DetailKind = 'int' | 'decimal' | 'percent' | 'duration' | 'multikill' | 'kda' | 'text' | 'mix';
/** 哪一头算「领先」：high 最大值高亮，low 最小值高亮，none 只比大小不评价。 */
export type DetailBest = 'high' | 'low' | 'none';

export interface DetailGroup {
  key: string;
  label: string;
  tone: 'blue' | 'red' | 'neutral';
  win: boolean;
  players: MatchParticipantSummary[];
}

export interface DetailContext {
  minutes: number;
  groupOf: (player: MatchParticipantSummary) => string;
  groupTotal: (player: MatchParticipantSummary, field: TeamField) => number;
}

type TeamField = 'kills' | 'damage' | 'taken' | 'gold';

export interface DetailMetric {
  key: string;
  label: string;
  hint?: string;
  kind: DetailKind;
  digits?: number;
  best?: DetailBest;
  /** 能把一队的数加起来比较（伤害、金币……），行名下面画两队占比条。 */
  team?: boolean;
  read: (player: MatchParticipantSummary, ctx: DetailContext) => DetailValue;
  /** kind 为 mix 时：物理 / 魔法 / 真实三段。 */
  parts?: (player: MatchParticipantSummary) => [number, number, number];
}

export type DetailSectionKey = 'combat' | 'damage' | 'tank' | 'economy' | 'vision' | 'objectives' | 'casts' | 'other';

export interface DetailSection {
  key: DetailSectionKey;
  title: string;
  core: DetailMetric[];
  more: DetailMetric[];
}

// ─── 读值 ──────────────────────────────────────────────────────────────

export function rawValue(player: MatchParticipantSummary, key: string): number | string | boolean | null {
  const raw = player.rawStats?.[key];
  if (raw !== undefined && raw !== null && raw !== '') return raw;
  const normalized = (player.stats as unknown as Record<string, unknown> | undefined)?.[key];
  if (typeof normalized === 'number' || typeof normalized === 'boolean' || typeof normalized === 'string') return normalized;
  return null;
}

function rawNumber(player: MatchParticipantSummary, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = rawValue(player, key);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function rawFlag(player: MatchParticipantSummary, key: string): boolean {
  const value = rawValue(player, key);
  return value === true || value === 1 || value === 'true';
}

const perMinute = (value: number | null, ctx: DetailContext) => value === null ? null : value / ctx.minutes;
const share = (value: number | null, total: number) => value === null || total <= 0 ? null : value / total;

function raw(key: string, label: string, kind: DetailKind = 'int', extra: Partial<DetailMetric> = {}): DetailMetric {
  return { key, label, kind, read: (player) => rawNumber(player, key), ...extra };
}

function pings(player: MatchParticipantSummary): number | null {
  let found = false;
  let total = 0;
  for (const key of PING_KEYS) {
    const value = rawNumber(player, key);
    if (value === null) continue;
    found = true;
    total += value;
  }
  return found ? total : null;
}

const PING_KEYS = [
  'allInPings', 'assistMePings', 'baitPings', 'basicPings', 'commandPings', 'dangerPings', 'enemyMissingPings',
  'enemyVisionPings', 'getBackPings', 'holdPings', 'needVisionPings', 'onMyWayPings', 'pushPings', 'visionClearedPings',
  'retreatPings',
];

// ─── 分块 ──────────────────────────────────────────────────────────────

const SECTIONS_BASE: DetailSection[] = [
  {
    key: 'combat',
    title: '战斗',
    core: [
      { key: 'kda', label: 'K / D / A', kind: 'kda', best: 'none', read: (p) => `${p.kills}/${p.deaths}/${p.assists}` },
      { key: 'kdaRatio', label: 'KDA', kind: 'decimal', digits: 2, hint: '（击杀 + 助攻）÷ 死亡，没死过按 1 次算', read: (p) => (p.kills + p.assists) / Math.max(1, p.deaths) },
      {
        key: 'killParticipation', label: '参团率', kind: 'percent', hint: '击杀 + 助攻 占本队总击杀的比例',
        read: (p, ctx) => share(p.kills + p.assists, ctx.groupTotal(p, 'kills')),
      },
      { key: 'largestMultiKill', label: '最高多杀', kind: 'multikill', read: (p) => rawNumber(p, 'largestMultiKill') ?? p.largestMultiKill ?? null },
      { key: 'largestKillingSpree', label: '最大连杀', kind: 'int', hint: '不死连续击杀的最多人数', read: (p) => rawNumber(p, 'largestKillingSpree') ?? p.largestKillingSpree ?? null },
      raw('soloKills', '单杀'),
      raw('timeCCingOthers', '控制得分', 'int', { hint: '对敌方英雄造成控制效果的加权时长，越高说明控人越多' }),
      {
        key: 'firstBlood', label: '一血', kind: 'text', best: 'none',
        read: (p) => rawFlag(p, 'firstBloodKill') ? '拿下' : rawFlag(p, 'firstBloodAssist') ? '助攻' : null,
      },
    ],
    more: [
      { key: 'kills', label: '击杀', kind: 'int', read: (p) => p.kills, team: true },
      { key: 'deaths', label: '死亡', kind: 'int', best: 'low', read: (p) => p.deaths, team: true },
      { key: 'assists', label: '助攻', kind: 'int', read: (p) => p.assists, team: true },
      raw('doubleKills', '双杀'),
      raw('tripleKills', '三杀'),
      raw('quadraKills', '四杀'),
      raw('pentaKills', '五杀'),
      raw('killingSprees', '连杀次数'),
      raw('outnumberedKills', '以少打多击杀'),
      raw('pickKillWithAlly', '和队友抓单击杀'),
      raw('saveAllyFromDeath', '救下濒死队友'),
      raw('enemyChampionImmobilizations', '控住敌方英雄次数'),
      raw('totalTimeCCDealt', '造成控制总时长', 'duration'),
      raw('skillshotsHit', '技能命中'),
      raw('skillshotsDodged', '躲开技能'),
      raw('survivedSingleDigitHpCount', '残血逃生'),
      raw('longestTimeSpentLiving', '最长存活', 'duration'),
      raw('totalTimeSpentDead', '阵亡总时长', 'duration', { best: 'low', team: true }),
      raw('bountyLevel', '结束时赏金等级', 'int', { best: 'none' }),
    ],
  },
  {
    key: 'damage',
    title: '输出',
    core: [
      { key: 'championDamage', label: '对英雄伤害', kind: 'int', team: true, read: (p) => p.damage ?? rawNumber(p, 'totalDamageDealtToChampions') },
      {
        key: 'damageShare', label: '伤害占比', kind: 'percent', hint: '对英雄伤害占本队的比例',
        read: (p, ctx) => share(p.damage ?? null, ctx.groupTotal(p, 'damage')),
      },
      { key: 'damagePerMinute', label: '分均伤害', kind: 'int', hint: '对英雄伤害 ÷ 对局分钟数', read: (p, ctx) => perMinute(p.damage ?? null, ctx) },
      {
        key: 'damageMix', label: '伤害构成', kind: 'mix', best: 'none', hint: '对英雄伤害里物理 / 魔法 / 真实各占多少',
        read: (p) => p.damage ?? null,
        parts: (p) => [
          rawNumber(p, 'physicalDamageDealtToChampions') ?? 0,
          rawNumber(p, 'magicDamageDealtToChampions') ?? 0,
          rawNumber(p, 'trueDamageDealtToChampions') ?? 0,
        ],
      },
      raw('damageDealtToBuildings', '对建筑伤害', 'int', { team: true, hint: '对防御塔、召唤水晶、基地的伤害' }),
      raw('damageDealtToObjectives', '对战略目标伤害', 'int', { team: true, hint: '防御塔、召唤水晶、小龙、男爵、先锋等' }),
    ],
    more: [
      raw('physicalDamageDealtToChampions', '对英雄物理伤害', 'int', { team: true }),
      raw('magicDamageDealtToChampions', '对英雄魔法伤害', 'int', { team: true }),
      raw('trueDamageDealtToChampions', '对英雄真实伤害', 'int', { team: true }),
      raw('totalDamageDealt', '总伤害', 'int', { team: true, hint: '包含对小兵、野怪、建筑的全部伤害' }),
      raw('physicalDamageDealt', '物理伤害', 'int', { team: true }),
      raw('magicDamageDealt', '魔法伤害', 'int', { team: true }),
      raw('trueDamageDealt', '真实伤害', 'int', { team: true }),
      raw('largestCriticalStrike', '最大暴击'),
      raw('damageDealtToTurrets', '对防御塔伤害', 'int', { team: true }),
      raw('damageDealtToEpicMonsters', '对史诗野怪伤害', 'int', { team: true }),
    ],
  },
  {
    key: 'tank',
    title: '承伤与治疗',
    core: [
      raw('totalDamageTaken', '承受伤害', 'int', { team: true, best: 'none' }),
      {
        key: 'takenShare', label: '承伤占比', kind: 'percent', best: 'none', hint: '承受伤害占本队的比例，前排通常更高',
        read: (p, ctx) => share(rawNumber(p, 'totalDamageTaken'), ctx.groupTotal(p, 'taken')),
      },
      raw('damageSelfMitigated', '自我减免', 'int', { team: true, hint: '靠护甲、魔抗、护盾等抵消掉的伤害' }),
      {
        key: 'takenMix', label: '承伤构成', kind: 'mix', best: 'none', hint: '承受的伤害里物理 / 魔法 / 真实各占多少',
        read: (p) => rawNumber(p, 'totalDamageTaken'),
        parts: (p) => [
          rawNumber(p, 'physicalDamageTaken') ?? 0,
          rawNumber(p, 'magicDamageTaken', 'magicalDamageTaken') ?? 0,
          rawNumber(p, 'trueDamageTaken') ?? 0,
        ],
      },
      raw('totalHeal', '治疗量', 'int', { team: true }),
      raw('totalHealsOnTeammates', '治疗队友', 'int', { team: true }),
      raw('totalDamageShieldedOnTeammates', '给队友的护盾', 'int', { team: true }),
    ],
    more: [
      raw('physicalDamageTaken', '承受物理伤害', 'int', { team: true, best: 'none' }),
      { ...raw('magicDamageTaken', '承受魔法伤害', 'int', { team: true, best: 'none' }), read: (p) => rawNumber(p, 'magicDamageTaken', 'magicalDamageTaken') },
      raw('trueDamageTaken', '承受真实伤害', 'int', { team: true, best: 'none' }),
      raw('effectiveHealAndShielding', '有效治疗与护盾', 'int', { team: true }),
      raw('totalUnitsHealed', '治疗过的单位数'),
    ],
  },
  {
    key: 'economy',
    title: '经济与发育',
    core: [
      { key: 'gold', label: '获得金币', kind: 'int', team: true, read: (p) => p.gold ?? rawNumber(p, 'goldEarned') },
      { key: 'goldPerMinute', label: '分均经济', kind: 'int', read: (p, ctx) => perMinute(p.gold ?? null, ctx) },
      { key: 'goldShare', label: '经济占比', kind: 'percent', hint: '获得金币占本队的比例', read: (p, ctx) => share(p.gold ?? null, ctx.groupTotal(p, 'gold')) },
      { key: 'cs', label: '补刀', kind: 'int', team: true, hint: '小兵 + 野怪', read: (p) => p.cs ?? null },
      { key: 'csPerMinute', label: '分均补刀', kind: 'decimal', digits: 1, read: (p, ctx) => perMinute(p.cs ?? null, ctx) },
      { key: 'champLevel', label: '等级', kind: 'int', read: (p) => p.champLevel || null },
      raw('champExperience', '获得经验', 'int', { team: true }),
    ],
    more: [
      raw('goldSpent', '花费金币', 'int', { team: true }),
      raw('totalMinionsKilled', '小兵补刀', 'int', { team: true }),
      raw('neutralMinionsKilled', '野怪补刀', 'int', { team: true }),
      { ...raw('totalAllyJungleMinionsKilled', '己方野区补刀', 'int', { team: true }), read: (p) => rawNumber(p, 'totalAllyJungleMinionsKilled', 'neutralMinionsKilledTeamJungle') },
      { ...raw('totalEnemyJungleMinionsKilled', '敌方野区补刀', 'int', { team: true }), read: (p) => rawNumber(p, 'totalEnemyJungleMinionsKilled', 'neutralMinionsKilledEnemyJungle') },
      raw('laneMinionsFirst10Minutes', '10 分钟补刀'),
      raw('maxCsAdvantageOnLaneOpponent', '最多领先对位补刀'),
      raw('maxLevelLeadLaneOpponent', '最多领先对位等级'),
      raw('turretPlatesTaken', '拿到防御塔镀层', 'int', { team: true }),
      raw('bountyGold', '赏金收入', 'int', { team: true }),
      raw('itemsPurchased', '购买装备次数', 'int', { best: 'none' }),
      raw('consumablesPurchased', '购买消耗品次数', 'int', { best: 'none' }),
    ],
  },
  {
    key: 'vision',
    title: '视野',
    core: [
      { key: 'visionScore', label: '视野得分', kind: 'int', team: true, read: (p) => rawNumber(p, 'visionScore') ?? p.visionScore ?? null },
      {
        key: 'visionPerMinute', label: '分均视野', kind: 'decimal', digits: 2,
        read: (p, ctx) => perMinute(rawNumber(p, 'visionScore') ?? p.visionScore ?? null, ctx),
      },
      raw('wardsPlaced', '放置守卫', 'int', { team: true }),
      raw('wardsKilled', '排除守卫', 'int', { team: true }),
      { ...raw('detectorWardsPlaced', '放置控制守卫', 'int', { team: true }), read: (p) => rawNumber(p, 'detectorWardsPlaced', 'controlWardsPlaced') },
    ],
    more: [
      raw('visionWardsBoughtInGame', '购买控制守卫', 'int', { team: true }),
      raw('sightWardsBoughtInGame', '购买侦查守卫', 'int', { team: true }),
      raw('stealthWardsPlaced', '放置侦查守卫', 'int', { team: true }),
      raw('wardTakedowns', '参与排除守卫', 'int', { team: true }),
      raw('wardTakedownsBefore20M', '20 分钟前排除守卫'),
      raw('wardsGuarded', '保护守卫次数'),
      raw('controlWardTimeCoverageInRiverOrEnemyHalf', '河道 / 敌方半场真眼覆盖', 'percent'),
      raw('visionScoreAdvantageLaneOpponent', '视野得分领先对位', 'percent', { hint: '比对位多出的视野得分比例' }),
    ],
  },
  {
    key: 'objectives',
    title: '目标与推进',
    core: [
      { ...raw('turretTakedowns', '参与推塔', 'int', { team: true }), read: (p) => rawNumber(p, 'turretTakedowns', 'turretKills') },
      { ...raw('dragonTakedowns', '参与小龙', 'int'), read: (p) => rawNumber(p, 'dragonTakedowns', 'dragonKills') },
      { ...raw('baronTakedowns', '参与男爵', 'int'), read: (p) => rawNumber(p, 'baronTakedowns', 'baronKills') },
      raw('riftHeraldTakedowns', '参与先锋'),
      { ...raw('objectivesStolen', '抢到史诗野怪', 'int', { team: true }), read: (p) => rawNumber(p, 'objectivesStolen', 'epicMonsterSteals') },
      {
        key: 'firstTower', label: '一塔', kind: 'text', best: 'none',
        read: (p) => rawFlag(p, 'firstTowerKill') ? '拿下' : rawFlag(p, 'firstTowerAssist') ? '助攻' : null,
      },
    ],
    more: [
      raw('turretKills', '亲手推掉防御塔', 'int', { team: true }),
      raw('inhibitorTakedowns', '参与推召唤水晶', 'int', { team: true }),
      raw('inhibitorKills', '亲手推掉召唤水晶', 'int', { team: true }),
      raw('objectivesStolenAssists', '协助抢史诗野怪', 'int', { team: true }),
      raw('scuttleCrabKills', '击杀河蟹', 'int', { team: true }),
      raw('epicMonsterKillsWithin30SecondsOfSpawn', '史诗野怪刷新 30 秒内拿下'),
      raw('kTurretsDestroyedBeforePlatesFall', '镀层掉落前推塔'),
      raw('soloTurretsLategame', '后期单人推塔'),
    ],
  },
  {
    key: 'casts',
    title: '技能与信号',
    core: [
      raw('spell1Casts', 'Q 施放次数', 'int', { best: 'none' }),
      raw('spell2Casts', 'W 施放次数', 'int', { best: 'none' }),
      raw('spell3Casts', 'E 施放次数', 'int', { best: 'none' }),
      raw('spell4Casts', 'R 施放次数', 'int', { best: 'none' }),
      { key: 'pingsTotal', label: '发出信号', kind: 'int', best: 'none', team: true, hint: '各种地图信号加起来的次数', read: (p) => pings(p) },
    ],
    more: [
      raw('summoner1Casts', '召唤师技能 D 使用', 'int', { best: 'none' }),
      raw('summoner2Casts', '召唤师技能 F 使用', 'int', { best: 'none' }),
      ...PING_KEYS.filter((key) => key !== 'retreatPings').map((key) => raw(key, '', 'int', { best: 'none' })),
    ],
  },
];

// 这些字段要么是整队共享的（每个人都一样，放在个人表格里没意义），要么上面已经换算成更好懂的形式了。
const OTHER_EXCLUDED = new Set([
  'gameLength', 'timePlayed', 'teamBaronKills', 'teamElderDragonKills', 'teamRiftHeraldKills', 'turretsLost',
  'inhibitorsLost', 'nexusLost', 'nexusKills', 'nexusTakedowns', 'gameEndedInEarlySurrender', 'gameEndedInSurrender',
  'teamEarlySurrendered', 'eligibleForProgression', 'hadAfkTeammate', 'lostAnInhibitor', 'hadOpenNexus',
  'kda', 'killParticipation', 'goldPerMinute', 'damagePerMinute', 'teamDamagePercentage', 'damageTakenOnTeamPercentage',
  'visionScorePerMinute', 'takedowns', 'firstBloodKill', 'firstBloodAssist', 'firstTowerKill', 'firstTowerAssist',
  'unrealKills', 'legendaryCount', 'crowdControlScore', 'controlWardsPlaced', 'epicMonsterSteals', 'dragonKills',
  'baronKills', 'damageDealtToStructures', 'neutralMinionsKilledTeamJungle', 'neutralMinionsKilledEnemyJungle',
  'firstTurretKilled', 'multikills',
]);

const DURATION_KEYS = new Set(['earliestBaron', 'earliestDragonTakedown', 'earliestElderDragon', 'firstTurretKilledTime']);
const LOW_IS_BETTER_KEYS = new Set(['earliestBaron', 'earliestDragonTakedown', 'earliestElderDragon', 'firstTurretKilledTime', 'maxKillDeficit']);

const RAW_LABELS: Record<string, string> = {
  placement: '最终名次',
  subteamPlacement: '小队名次',
  timePlayed: '对局时长',
  spell1Casts: 'Q 技能施放次数',
  spell2Casts: 'W 技能施放次数',
  spell3Casts: 'E 技能施放次数',
  spell4Casts: 'R 技能施放次数',
  summoner1Casts: '召唤师技能 1 使用次数',
  summoner2Casts: '召唤师技能 2 使用次数',
  abilityUses: '技能使用总次数',
  '12AssistStreakCount': '连续 12 次助攻次数',
  acesBefore15Minutes: '15 分钟前团灭对手次数',
  alliedJungleMonsterKills: '击杀己方野区野怪',
  baronTakedowns: '参与击杀男爵',
  blastConeOppositeOpponentCount: '爆炸果实炸开敌人次数',
  completeSupportQuestInTime: '按时完成辅助任务',
  controlWardTimeCoverageInRiverOrEnemyHalf: '河道或敌方半区真眼覆盖时长',
  dancedWithRiftHerald: '与峡谷先锋共舞',
  dodgeSkillShotsSmallWindow: '短时间连续躲避技能次数',
  doubleAces: '连续团灭次数',
  dragonTakedowns: '参与击杀小龙',
  earliestBaron: '最早男爵击杀时间',
  earliestDragonTakedown: '最早小龙参与击杀时间',
  earliestElderDragon: '最早远古巨龙击杀时间',
  earlyLaningPhaseGoldExpAdvantage: '前期对线经济经验领先',
  elderDragonKillsWithOpposingSoul: '敌方有龙魂时击杀远古巨龙',
  elderDragonMultikills: '远古巨龙期间多杀次数',
  enemyChampionImmobilizations: '控制敌方英雄次数',
  enemyJungleMonsterKills: '击杀敌方野区野怪',
  epicMonsterKillsNearEnemyJungler: '敌方打野附近击杀史诗野怪',
  epicMonsterKillsWithin30SecondsOfSpawn: '史诗野怪出生 30 秒内击杀',
  epicMonsterSteals: '抢夺史诗野怪次数',
  epicMonsterStolenWithoutSmite: '未使用惩戒抢夺史诗野怪',
  flawlessAces: '无阵亡团灭对手次数',
  fullTeamTakedown: '全队参与击杀次数',
  gameLength: '对局时长',
  hadAfkTeammate: '存在挂机队友',
  hadOpenNexus: '己方基地曾暴露',
  immobilizeAndKillWithAlly: '与队友配合控制并击杀',
  initialBuffCount: '开局增益野怪数量',
  initialCrabCount: '开局河蟹数量',
  junglerKillsEarlyJungle: '前期野区击杀敌方打野',
  junglerTakedownsNearDamagedEpicMonster: '史诗野怪附近参与击杀',
  kTurretsDestroyedBeforePlatesFall: '镀层消失前摧毁防御塔',
  killAfterHiddenWithAlly: '与队友隐蔽后完成击杀',
  killedChampTookFullTeamDamageSurvived: '承受敌方全队伤害后击杀并存活',
  killsNearEnemyTurret: '敌方防御塔附近击杀',
  killsOnLanersEarlyJungleAsJungler: '打野前期击杀线上英雄',
  killsOnOtherLanesEarlyJungleAsLaner: '线上英雄前期跨线击杀',
  killsOnRecentlyHealedByAramPack: '击杀近期使用极地治疗包的敌人',
  killsUnderOwnTurret: '己方防御塔下击杀',
  killsWithHelpFromEpicMonster: '借助史诗野怪完成击杀',
  knockEnemyIntoTeamAndKill: '击退敌人至队伍并完成击杀',
  landSkillShotsEarlyGame: '前期技能命中次数',
  laningPhaseGoldExpAdvantage: '对线期经济经验领先',
  legendaryCount: '超神次数',
  lostAnInhibitor: '己方召唤水晶被摧毁',
  maxKillDeficit: '最大击杀落后',
  mejaisFullStackInTime: '梅贾的窃魂卷满层',
  moreEnemyJungleThanOpponent: '敌方野区资源领先',
  multiKillOneSpell: '单个技能多杀次数',
  multikills: '多杀次数',
  multikillsAfterAggressiveFlash: '进攻闪现后多杀次数',
  outerTurretExecutesBefore10Minutes: '10 分钟前摧毁外塔',
  outnumberedKills: '以少打多击杀次数',
  outnumberedNexusKill: '以少打多摧毁基地',
  perfectDragonSoulsTaken: '零失误获得龙魂',
  perfectGame: '完美对局',
  pickKillWithAlly: '与队友完成抓单击杀',
  poroExplosions: '魄罗爆炸次数',
  quickFirstTurret: '快速摧毁一塔',
  quickSoloKills: '快速单杀次数',
  riftHeraldTakedowns: '参与击杀峡谷先锋',
  scuttleCrabKills: '击杀河蟹次数',
  snowballsHit: '雪球命中次数',
  soloBaronKills: '单人击杀男爵',
  soloTurretsLategame: '后期单人摧毁防御塔',
  stealthWardsPlaced: '放置侦查守卫',
  survivedSingleDigitHpCount: '个位数生命值存活次数',
  survivedThreeImmobilizesInFight: '单次战斗承受三次控制后存活',
  takedownOnFirstTurret: '参与摧毁一塔',
  takedownsInAlcove: '凹室内参与击杀',
  takedownsInEnemyFountain: '敌方泉水内参与击杀',
  threeWardsOneSweeperCount: '单次扫描排除三个守卫',
  tookLargeDamageSurvived: '承受大量伤害后存活',
  turretsTakenWithRiftHerald: '利用峡谷先锋摧毁防御塔',
  twentyMinionsIn3SecondsCount: '3 秒内击杀 20 个小兵次数',
  twoWardsOneSweeperCount: '单次扫描排除两个守卫',
  unseenRecalls: '未被发现的回城次数',
  wardTakedownsBefore20M: '20 分钟前排除守卫次数',
  basicAttackDamage: '普攻造成伤害',
  basicAttackDamageToChampions: '普攻对英雄伤害',
  basicAttacks: '普攻次数',
  bountyGold: '赏金收入',
  buffsStolen: '偷取增益次数',
  controlWardsPlaced: '放置控制守卫',
  crowdControlScore: '控制得分',
  damageDealtToEpicMonsters: '对史诗野怪伤害',
  damageDealtToMonsters: '对野怪伤害',
  damageDealtToStructures: '对建筑伤害',
  damageTakenFromChampions: '承受英雄伤害',
  deathsByEnemyChamps: '被敌方英雄击杀次数',
  epicMonsterKills: '击杀史诗野怪',
  firstTurretKilled: '参与摧毁一塔',
  firstTurretKilledTime: '一塔摧毁时间',
  goldAt10: '10 分钟金币',
  goldAt15: '15 分钟金币',
  goldDiffAt10: '10 分钟经济差',
  goldDiffAt15: '15 分钟经济差',
  jungleCsBefore10Minutes: '10 分钟前野区补刀',
  laneMinionsFirst10Minutes: '10 分钟线上补刀',
  maxCsAdvantageOnLaneOpponent: '最大补刀领先',
  maxLevelLeadLaneOpponent: '最大等级领先',
  objectivesStolen: '抢夺史诗野怪',
  objectivesStolenAssists: '协助抢夺史诗野怪',
  quickCleanse: '快速解除控制次数',
  saveAllyFromDeath: '救下濒死队友次数',
  soloKills: '单杀次数',
  takedowns: '参与击杀',
  takedownsAfterGainingLevelAdvantage: '等级领先后参与击杀',
  takedownsBeforeJungleMinionSpawn: '野怪刷新前参与击杀',
  takedownsFirst25Minutes: '前 25 分钟参与击杀',
  teamBaronKills: '团队男爵击杀',
  teamElderDragonKills: '团队远古巨龙击杀',
  teamRiftHeraldKills: '团队峡谷先锋击杀',
  turretPlatesTaken: '获得防御塔镀层',
  visionScoreAdvantageLaneOpponent: '对位视野得分领先',
  visionScorePerMinute: '每分钟视野得分',
  wardTakedowns: '排除守卫次数',
  wardsGuarded: '保护守卫次数',
  killParticipation: '参团率',
  kda: 'KDA',
  goldPerMinute: '每分钟金币',
  damagePerMinute: '每分钟英雄伤害',
  teamDamagePercentage: '团队伤害占比',
  damageTakenOnTeamPercentage: '团队承伤占比',
  effectiveHealAndShielding: '有效治疗与护盾',
  skillshotsHit: '技能命中次数',
  skillshotsDodged: '躲避技能次数',
  totalAllyJungleMinionsKilled: '己方野区补刀',
  totalEnemyJungleMinionsKilled: '敌方野区补刀',
  totalTimeCCDealt: '造成控制总时长',
  totalUnitsHealed: '治疗单位数',
  sightWardsBoughtInGame: '购买侦查守卫',
  visionWardsBoughtInGame: '购买控制守卫',
  itemsPurchased: '购买装备次数',
  consumablesPurchased: '购买消耗品次数',
  longestTimeSpentLiving: '最长存活时间',
  totalTimeSpentDead: '总死亡时间',
  champExperience: '获得经验',
  unrealKills: '超神次数',
  firstBloodKill: '一血击杀',
  firstBloodAssist: '一血助攻',
  firstTowerKill: '一塔击杀',
  firstTowerAssist: '一塔助攻',
  inhibitorKills: '摧毁召唤水晶',
  inhibitorTakedowns: '参与摧毁召唤水晶',
  inhibitorsLost: '损失召唤水晶',
  nexusKills: '摧毁基地',
  nexusTakedowns: '参与摧毁基地',
  nexusLost: '基地被摧毁',
  turretKills: '摧毁防御塔',
  turretTakedowns: '参与摧毁防御塔',
  turretsLost: '损失防御塔',
  baronKills: '参与击杀男爵',
  dragonKills: '参与击杀小龙',
  allInPings: '全力进攻信号',
  assistMePings: '请求协助信号',
  baitPings: '引诱信号',
  basicPings: '基础信号',
  commandPings: '指令信号',
  dangerPings: '危险信号',
  enemyMissingPings: '敌人消失信号',
  enemyVisionPings: '敌方视野信号',
  getBackPings: '撤退信号',
  holdPings: '坚持信号',
  needVisionPings: '需要视野信号',
  onMyWayPings: '正在路上信号',
  pushPings: '推进信号',
  visionClearedPings: '视野已清除信号',
};

function labelFor(key: string): string {
  return RAW_LABELS[key] ?? key;
}

/** 按这场对局实际有的字段，把「其他」一块补齐；字段名没有中文说明的不显示（看不懂的数字没用）。 */
export function buildDetailSections(participants: MatchParticipantSummary[]): DetailSection[] {
  const used = new Set<string>();
  const sections = SECTIONS_BASE.map((section) => {
    const fix = (metric: DetailMetric) => (metric.label ? metric : { ...metric, label: labelFor(metric.key) });
    const result = { ...section, core: section.core.map(fix), more: section.more.map(fix) };
    [...result.core, ...result.more].forEach((metric) => used.add(metric.key));
    return result;
  });

  const extraKeys = new Set<string>();
  participants.forEach((player) => {
    Object.keys(player.rawStats ?? {}).forEach((key) => {
      if (RAW_LABELS[key] && !used.has(key) && !OTHER_EXCLUDED.has(key)) extraKeys.add(key);
    });
  });
  const other: DetailMetric[] = [...extraKeys].map((key): DetailMetric => {
    const sample = participants.map((player) => player.rawStats?.[key]).find((value) => value !== undefined && value !== null);
    const best: DetailBest = LOW_IS_BETTER_KEYS.has(key) ? 'low' : 'none';
    if (typeof sample === 'boolean') {
      return { key, label: RAW_LABELS[key], kind: 'text', best: 'none', read: (player) => rawFlag(player, key) ? '是' : null };
    }
    if (DURATION_KEYS.has(key)) return raw(key, RAW_LABELS[key], 'duration', { best });
    const fractional = participants.some((player) => {
      const value = rawNumber(player, key);
      return value !== null && !Number.isInteger(value);
    });
    return raw(key, RAW_LABELS[key], fractional ? 'decimal' : 'int', { best, digits: 2 });
  }).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));

  if (other.length > 0) sections.push({ key: 'other', title: '其他', core: [], more: other });
  return sections;
}

// ─── 分组与上下文 ──────────────────────────────────────────────────────

export function buildDetailGroups(participants: MatchParticipantSummary[]): DetailGroup[] {
  const subteamOf = (player: MatchParticipantSummary) => rawNumber(player, 'playerSubteamId') ?? 0;
  const subteams = new Set(participants.map(subteamOf).filter((id) => id > 0));
  // 斗魂竞技场这类多队模式按小队分；普通对局按蓝红两方分。
  if (subteams.size > 2) {
    const groups = [...subteams].map((id) => {
      const players = participants.filter((player) => subteamOf(player) === id);
      const placement = rawNumber(players[0], 'subteamPlacement', 'placement');
      return { id, placement, players };
    }).sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || a.id - b.id);
    return groups.map(({ id, placement, players }) => ({
      key: `sub-${id}`,
      label: placement ? `第 ${placement} 名` : `小队 ${id}`,
      tone: 'neutral',
      win: placement === 1,
      players,
    }));
  }
  const teamIds = [...new Set(participants.map((player) => player.teamId))];
  return teamIds.map((teamId) => {
    const players = participants.filter((player) => player.teamId === teamId);
    return {
      key: `team-${teamId}`,
      label: teamId === 100 ? '蓝方' : teamId === 200 ? '红方' : `队伍 ${teamId}`,
      tone: teamId === 100 ? 'blue' : teamId === 200 ? 'red' : 'neutral',
      win: players.some((player) => player.win),
      players,
    };
  });
}

export function buildDetailContext(groups: DetailGroup[], gameDuration: number): DetailContext {
  const groupByPuuid = new Map<string, string>();
  const totals = new Map<string, Record<TeamField, number>>();
  groups.forEach((group) => {
    const total: Record<TeamField, number> = { kills: 0, damage: 0, taken: 0, gold: 0 };
    group.players.forEach((player) => {
      groupByPuuid.set(player.puuid, group.key);
      total.kills += player.kills || 0;
      total.damage += player.damage || 0;
      total.taken += rawNumber(player, 'totalDamageTaken') ?? 0;
      total.gold += player.gold || 0;
    });
    totals.set(group.key, total);
  });
  const seconds = gameDuration > 100_000 ? gameDuration / 1000 : gameDuration;
  const fallback = groups[0]?.players[0] ? rawNumber(groups[0].players[0], 'timePlayed') : null;
  const minutes = Math.max(1, (seconds > 0 ? seconds : fallback ?? 1500) / 60);
  return {
    minutes,
    groupOf: (player) => groupByPuuid.get(player.puuid) ?? '',
    groupTotal: (player, field) => totals.get(groupByPuuid.get(player.puuid) ?? '')?.[field] ?? 0,
  };
}

// ─── 显示 ──────────────────────────────────────────────────────────────

const MULTI_KILL_NAMES = ['', '', '双杀', '三杀', '四杀', '五杀'];

export function formatDetailValue(metric: DetailMetric, value: DetailValue): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '—';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';
  switch (metric.kind) {
    case 'percent': {
      const percentage = Math.abs(value) <= 1 ? value * 100 : value;
      return `${percentage.toFixed(percentage >= 10 || percentage === 0 ? 0 : 1)}%`;
    }
    case 'duration': {
      const seconds = Math.max(0, Math.round(value));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    case 'multikill':
      return value >= 6 ? '超神' : MULTI_KILL_NAMES[Math.round(value)] || '—';
    case 'decimal':
      return value.toFixed(metric.digits ?? 1);
    default:
      return Math.round(value).toLocaleString('zh-CN');
  }
}

export function detailNumber(metric: DetailMetric, value: DetailValue): number | null {
  if (metric.kind === 'text' || metric.kind === 'kda') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function playerName(player: MatchParticipantSummary): string {
  return player.gameName || (player.riotId || player.summonerName || '未知玩家').split('#')[0];
}

export const POSITION_NAMES: Record<string, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MIDDLE: '中单',
  MID: '中单',
  BOTTOM: '下路',
  UTILITY: '辅助',
  SUPPORT: '辅助',
};
