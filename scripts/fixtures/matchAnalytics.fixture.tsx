import { createRoot } from 'react-dom/client';
import { MatchDetail } from '../../src/renderer/components/match/MatchDetail';
import type { MatchParticipantSummary, MatchTimeline, PlayerMatchDetail } from '../../src/shared/api';
import '../../src/renderer/styles/index.css';

const champions = [
  [222, 'Jinx', '金克丝'], [412, 'Thresh', '锤石'], [103, 'Ahri', '阿狸'], [64, 'LeeSin', '李青'], [86, 'Garen', '盖伦'],
  [51, 'Caitlyn', '凯特琳'], [111, 'Nautilus', '诺提勒斯'], [234, 'Viego', '佛耶戈'], [134, 'Syndra', '辛德拉'], [895, 'Nilah', '尼菈'],
] as const;
const nicknames = ['星河入梦', '雾起时见你', '九尾的信笺', '峡谷回声', '北境不退', '皮城第七码头', '深海守望者', '破败王座', '暗星回廊', '长夜与微光'];
const participants = champions.map(([id, alias], index) => ({
  puuid: `ui-fixture-${index}`, participantId: index + 1, teamId: index < 5 ? 100 : 200,
  championId: id, championName: alias,
  championAvatar: `https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/${alias}.png`,
  riotId: `${nicknames[index]}#${1000 + index}`, summonerName: nicknames[index], teamPosition: '',
  kills: 16 - index, deaths: 5 + index, assists: 27 - index, damage: 42670 - index * 2623,
  gold: 16700 - index * 743, cs: 166 - index * 8, win: index < 5, champLevel: 18,
  items: [], spells: [], runes: [], augments: [], ranks: [],
  stats: { totalDamageTaken: 36190 + index * 2500, largestKillingSpree: 5, largestMultiKill: 2,
    physicalDamageDealtToChampions: 24100 - index * 1234, magicDamageDealtToChampions: 15000 - index * 500,
    trueDamageDealtToChampions: 3570, totalDamageDealt: 189543, physicalDamageDealt: 139543, magicDamageDealt: 40000, trueDamageDealt: 10000,
    largestCriticalStrike: 1234, visionScore: 5, totalHeal: 5376, timeCCingOthers: 17, tripleKills: 1, quadraKills: 0, pentaKills: 0 },
  rawStats: { firstBloodKill: index === 0, goldPerMinute: 627.5, teamDamagePercentage: .28, goldDiffAt10: index % 2 ? -420 : 800, spell1Casts: 65, totalTimeSpentDead: 120, customFlag: false },
})) as unknown as MatchParticipantSummary[];
const damage = [
  { participantId: 1, basic: true, damage: 724, physicalDamage: 724, spellName: 'JinxBasicAttack' },
  { participantId: 1, basic: false, damage: 462, magicDamage: 462, spellSlot: 0, spellName: 'JinxQ' },
  { participantId: 2, basic: false, damage: 245, magicDamage: 245, spellSlot: 2, spellName: 'ThreshE' },
];
const events = Array.from({ length: 48 }, (_, index) => ({
  timestamp: 90000 + index * 23000 + (index % 3 === 1 ? -21000 : 0),
  type: index % 12 === 10 ? 'ELITE_MONSTER_KILL' : index % 12 === 11 ? 'BUILDING_KILL' : 'CHAMPION_KILL',
  killerId: index % 5 + 1, victimId: index % 5 + 6, assistingParticipantIds: [2, 3],
  shutdownBounty: index === 2 ? 350 : 0,
  monsterType: 'BARON_NASHOR', buildingType: 'TOWER_BUILDING', laneType: 'MID_LANE',
  position: { x: 7400, y: 9200 }, victimDamageReceived: index === 3 ? [] : damage,
}));
// Match-v5-like notifications are separate from CHAMPION_KILL. Keep the
// fixture faithful so the UI cannot pass while silently discarding all awards.
const rawEvents = events.flatMap((event, index) => event.type === 'CHAMPION_KILL' && index % 3 === 1
  ? [event, { type: 'CHAMPION_SPECIAL_KILL', killType: 'KILL_MULTI', multiKillLength: 2, killerId: event.killerId, timestamp: event.timestamp }]
  : [event]);
const timeline = { frames: [{ timestamp: 0, events: [] }, { timestamp: 1200000, events: rawEvents }], frameInterval: 60000 } as unknown as MatchTimeline;
window.lolHelper = {
  match: { getReplayAvailability: async () => ({ available: false }), getTimeline: async () => ({ available: true, timeline }) },
  assist: { getChampionGuide: async (id: number) => ({ championId: id, spells: [{ key: 'Q', name: '技能示例', icon: participants[0].championAvatar }, { key: 'E', name: '技能示例', icon: participants[1].championAvatar }] }) },
} as unknown as typeof window.lolHelper;
const match = { participants, gameId: 900000001, queueId: 450, gameDuration: 1200, gameCreation: 0, gameVersion: '16.17.1', gameType: 'MATCHED_GAME' } as unknown as PlayerMatchDetail;
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<div style={{ height: '100vh' }}><MatchDetail match={match} targetPuuid={participants[0].puuid} /></div>);
