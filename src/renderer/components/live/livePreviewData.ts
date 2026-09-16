import type { LiveBattlePlayer, PlayerRankSummary } from '../../../shared/api';

interface PreviewPlayerSpec {
  gameName: string;
  championId: number;
  championName: string;
  championAlias: string;
  level: number;
  position: string;
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  kda: number;
  winRate: number;
  premadeId?: string;
  historyChampions: Array<{ id: number; name: string; alias: string }>;
}

const TIER_NAMES: Record<string, string> = {
  CHALLENGER: '王者',
  GRANDMASTER: '宗师',
  MASTER: '大师',
  DIAMOND: '钻石',
  EMERALD: '翡翠',
  PLATINUM: '铂金',
  GOLD: '黄金',
};

const PREVIEW_CHAMPION_POOL = [
  { id: 222, name: '暴走萝莉', alias: 'Jinx' },
  { id: 21, name: '赏金猎人', alias: 'MissFortune' },
  { id: 103, name: '九尾妖狐', alias: 'Ahri' },
  { id: 86, name: '德玛西亚之力', alias: 'Garen' },
  { id: 412, name: '魂锁典狱长', alias: 'Thresh' },
  { id: 111, name: '深海泰坦', alias: 'Nautilus' },
  { id: 64, name: '盲僧', alias: 'LeeSin' },
  { id: 234, name: '破败之王', alias: 'Viego' },
  { id: 51, name: '皮城女警', alias: 'Caitlyn' },
  { id: 145, name: '虚空之女', alias: 'Kaisa' },
  { id: 114, name: '无双剑姬', alias: 'Fiora' },
  { id: 164, name: '青钢影', alias: 'Camille' },
];

const PLAYER_SPECS: PreviewPlayerSpec[] = [
  {
    gameName: '晚风与金克丝', championId: 222, championName: '暴走萝莉', championAlias: 'Jinx',
    level: 286, position: 'bottom', tier: 'DIAMOND', division: 'II', leaguePoints: 64,
    wins: 83, losses: 59, kda: 3.42, winRate: 58, premadeId: 'moon-duo',
    historyChampions: [{ id: 222, name: '暴走萝莉', alias: 'Jinx' }, { id: 21, name: '赏金猎人', alias: 'MissFortune' }],
  },
  {
    gameName: '灯下的锤石', championId: 412, championName: '魂锁典狱长', championAlias: 'Thresh',
    level: 319, position: 'support', tier: 'EMERALD', division: 'I', leaguePoints: 82,
    wins: 76, losses: 62, kda: 3.88, winRate: 55, premadeId: 'moon-duo',
    historyChampions: [{ id: 412, name: '魂锁典狱长', alias: 'Thresh' }, { id: 111, name: '深海泰坦', alias: 'Nautilus' }],
  },
  {
    gameName: '峡谷回声', championId: 64, championName: '盲僧', championAlias: 'LeeSin',
    level: 198, position: 'jungle', tier: 'PLATINUM', division: 'I', leaguePoints: 43,
    wins: 54, losses: 56, kda: 2.36, winRate: 49,
    historyChampions: [{ id: 64, name: '盲僧', alias: 'LeeSin' }, { id: 234, name: '破败之王', alias: 'Viego' }],
  },
  {
    gameName: '九尾的信笺', championId: 103, championName: '九尾妖狐', championAlias: 'Ahri',
    level: 442, position: 'middle', tier: 'MASTER', division: '', leaguePoints: 126,
    wins: 112, losses: 72, kda: 4.12, winRate: 61,
    historyChampions: [{ id: 103, name: '九尾妖狐', alias: 'Ahri' }, { id: 7, name: '诡术妖姬', alias: 'Leblanc' }],
  },
  {
    gameName: '北境不退', championId: 86, championName: '德玛西亚之力', championAlias: 'Garen',
    level: 257, position: 'top', tier: 'DIAMOND', division: 'IV', leaguePoints: 18,
    wins: 69, losses: 64, kda: 2.18, winRate: 52,
    historyChampions: [{ id: 86, name: '德玛西亚之力', alias: 'Garen' }, { id: 122, name: '诺克萨斯之手', alias: 'Darius' }],
  },
  {
    gameName: '皮城第七码头', championId: 51, championName: '皮城女警', championAlias: 'Caitlyn',
    level: 335, position: 'bottom', tier: 'DIAMOND', division: 'I', leaguePoints: 76,
    wins: 91, losses: 68, kda: 3.17, winRate: 57, premadeId: 'sun-duo',
    historyChampions: [{ id: 51, name: '皮城女警', alias: 'Caitlyn' }, { id: 145, name: '虚空之女', alias: 'Kaisa' }],
  },
  {
    gameName: '深海守望者', championId: 111, championName: '深海泰坦', championAlias: 'Nautilus',
    level: 276, position: 'support', tier: 'EMERALD', division: 'II', leaguePoints: 35,
    wins: 64, losses: 61, kda: 2.91, winRate: 51, premadeId: 'sun-duo',
    historyChampions: [{ id: 111, name: '深海泰坦', alias: 'Nautilus' }, { id: 89, name: '曙光女神', alias: 'Leona' }],
  },
  {
    gameName: '破败王座', championId: 234, championName: '破败之王', championAlias: 'Viego',
    level: 501, position: 'jungle', tier: 'MASTER', division: '', leaguePoints: 58,
    wins: 104, losses: 88, kda: 3.06, winRate: 54,
    historyChampions: [{ id: 234, name: '破败之王', alias: 'Viego' }, { id: 121, name: '虚空掠夺者', alias: 'Khazix' }],
  },
  {
    gameName: '暗星回廊', championId: 134, championName: '暗黑元首', championAlias: 'Syndra',
    level: 229, position: 'middle', tier: 'DIAMOND', division: 'III', leaguePoints: 22,
    wins: 59, losses: 67, kda: 2.44, winRate: 47, premadeId: 'rift-duo',
    historyChampions: [{ id: 134, name: '暗黑元首', alias: 'Syndra' }, { id: 99, name: '光辉女郎', alias: 'Lux' }],
  },
  {
    gameName: '无双剑意', championId: 114, championName: '无双剑姬', championAlias: 'Fiora',
    level: 388, position: 'top', tier: 'DIAMOND', division: 'II', leaguePoints: 91,
    wins: 87, losses: 69, kda: 2.72, winRate: 56, premadeId: 'rift-duo',
    historyChampions: [{ id: 114, name: '无双剑姬', alias: 'Fiora' }, { id: 164, name: '青钢影', alias: 'Camille' }],
  },
];

function createRank(spec: PreviewPlayerSpec, index: number): PlayerRankSummary[] {
  const tierName = TIER_NAMES[spec.tier] ?? spec.tier;
  const division = spec.division ? ` ${spec.division}` : '';
  const solo: PlayerRankSummary = {
    queueType: 'RANKED_SOLO_5x5',
    queueName: '单双',
    tier: spec.tier,
    division: spec.division,
    leaguePoints: spec.leaguePoints,
    wins: spec.wins,
    losses: spec.losses,
    displayText: `单双 ${tierName}${division} ${spec.leaguePoints}`,
  };

  const flexTiers = ['SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
  const flexTier = flexTiers[(index * 3 + 1) % flexTiers.length];
  const flexDivision = ['I', 'II', 'III', 'IV'][index % 4];
  const flexLp = 12 + ((index * 17) % 88);
  const flex: PlayerRankSummary = {
    queueType: 'RANKED_FLEX_SR',
    queueName: '灵活',
    tier: flexTier,
    division: flexDivision,
    leaguePoints: flexLp,
    wins: 40 + ((index * 7) % 60),
    losses: 38 + ((index * 5) % 50),
    displayText: `灵活 ${TIER_NAMES[flexTier] ?? flexTier} ${flexDivision} ${flexLp}`,
  };

  return [solo, flex];
}

function createPlayer(spec: PreviewPlayerSpec, index: number): LiveBattlePlayer {
  const teamId = index < 5 ? 100 : 200;
  const ranks = createRank(spec, index);
  const historyChampions = [
    ...spec.historyChampions,
    ...PREVIEW_CHAMPION_POOL.filter((candidate) => (
      !spec.historyChampions.some((champion) => champion.id === candidate.id)
    )),
  ].slice(0, 10);
  const history = Array.from({ length: 24 }, (_, matchIndex) => {
    const champion = historyChampions[matchIndex % historyChampions.length];
    const win = ((matchIndex * 3 + index * 2) % 10) < spec.winRate / 10;
    const kills = 2 + ((index * 3 + matchIndex * 2) % 12);
    const deaths = 1 + ((index + matchIndex * 3) % 8);
    const assists = 3 + ((index * 5 + matchIndex * 4) % 17);
    return {
      gameId: 8_000_000 + index * 100 + matchIndex,
      teamId,
      championId: champion.id,
      championName: champion.name,
      championAlias: champion.alias,
      queueName: '海克斯大乱斗',
      kills,
      deaths,
      assists,
      win,
      timeStr: matchIndex < 2 ? `${18 + matchIndex * 17}分` : matchIndex < 8 ? `${matchIndex}时` : `${Math.ceil(matchIndex / 4)}天`,
    };
  });

  return {
    puuid: `preview-player-${index + 1}`,
    summonerId: 90_000 + index,
    riotId: `${spec.gameName}#TEST`,
    gameName: spec.gameName,
    championId: spec.championId,
    championName: spec.championName,
    championAlias: spec.championAlias,
    teamId,
    premadeId: spec.premadeId,
    summonerLevel: spec.level,
    position: spec.position,
    rank: ranks[0],
    ranks,
    kda: spec.kda,
    winRate: spec.winRate,
    matchCount: history.length,
    history,
  };
}

const previewPlayers = PLAYER_SPECS.map(createPlayer);

export const LIVE_PREVIEW_MY_TEAM = previewPlayers.slice(0, 5);
export const LIVE_PREVIEW_ENEMY_TEAM = previewPlayers.slice(5);
