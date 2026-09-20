import { createRoot } from 'react-dom/client';
import { MatchDetail } from '../../src/renderer/components/match/MatchDetail';
import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent, MatchTimelineFrame, MatchTimelineParticipantFrame, PlayerMatchDetail } from '../../src/shared/api';
import '../../src/renderer/styles/index.css';

// Synthetic regression data, real application components and bundled/game artwork.
const params = new URLSearchParams(location.search);
const heroes = [[4, 'TwistedFate'], [103, 'Ahri'], [222, 'Jinx'], [64, 'LeeSin'], [86, 'Garen'], [51, 'Caitlyn'], [111, 'Nautilus'], [234, 'Viego'], [134, 'Syndra'], [412, 'Thresh']] as const;
const names = ['星河入梦', '九尾的信笺', '长夜与微光', '峡谷回声', '北境不退', '皮城第七码头', '深海守望者', '破败王座', '暗星回廊', '雾起时见你'];
const participants = heroes.map(([championId, championName], index) => ({
  participantId: index + 1, puuid: `timeline-fixture-${index}`, riotId: `${params.has('long') ? names[index].repeat(10) : names[index]}#${78091 + index}`,
  gameName: names[index], tagLine: String(78091 + index), summonerName: names[index], championId, championName,
  championAvatar: `/__timeline-art__/champion/${championName}.png`, teamId: index < 5 ? 100 : 200, teamPosition: ['MIDDLE', 'TOP', 'BOTTOM', 'JUNGLE', 'UTILITY'][index % 5],
  champLevel: 18, kills: 8, deaths: 4, assists: 12, gold: 15500, cs: 220, damage: 36000, win: index < 5,
  items: [], spells: [], runes: [], augments: [], ranks: [], stats: {}, rawStats: {},
})) as unknown as MatchParticipantSummary[];
const events: MatchTimelineEvent[] = Array.from({ length: 42 }, (_, i) => ({ type: 'CHAMPION_KILL', timestamp: 60000 + i * 32000, killerId: i % 5 + 1, victimId: i % 5 + 6 }));
for (const [timestamp, monsterType, killerId] of [[310000, 'DRAGON', 1], [605000, 'DRAGON', 7], [842000, 'RIFTHERALD', 4], [1190000, 'BARON_NASHOR', 8]] as const) events.push({ type: 'ELITE_MONSTER_KILL', timestamp, monsterType, killerId });
for (const timestamp of [405000, 700000, 1140000]) events.push({ type: 'BUILDING_KILL', timestamp, killerId: 1, teamId: 200, buildingType: 'TOWER_BUILDING', laneType: 'MID_LANE' });
const frameCount = params.has('single') ? 1 : 25;
const frames: MatchTimelineFrame[] = Array.from({ length: frameCount }, (_, n) => ({
  timestamp: n * 60000 + (n === 14 ? 15000 : 0),
  participantFrames: Object.fromEntries(participants.flatMap<[string, MatchTimelineParticipantFrame]>((player, index) => {
    if (params.has('partial') && n === 8 && index === 0) return [];
    const blue = index < 5;
    const gold = Math.round(500 + n * (blue ? 320 : 345) + (blue ? Math.sin(n / 3) * 200 + Math.max(0, n - 10) * 90 : Math.max(0, n - 16) * 190) + index % 5 * 180);
    const damageStats: Record<string, number> = {};
    if (params.has('noDamage')) damageStats.totalDamageDone = 150000 + n * 1000;
    else { damageStats.totalDamageDoneToChampions = n * (760 + index * 24); damageStats.totalDamageTaken = n * (980 + index * 40); }
    return [[String(player.participantId), {
      participantId: player.participantId ?? index + 1, totalGold: gold, currentGold: 200 + n * 21,
      level: Math.min(18, 1 + Math.floor(n * 0.72)), xp: n * 560 + index * 100,
      minionsKilled: n * (index % 5 === 4 ? 2 : 7) + index, jungleMinionsKilled: n * (index % 5 === 3 ? 4 : 1),
      damageStats,
      championStats: params.has('noStats') ? undefined : { attackDamage: 58 + n * 4, armor: 32 + n * 3, magicResist: 30 + n * 1.5 },
    }]];
  })), events: n === frameCount - 1 ? events : [],
}));
const timeline: MatchTimeline | null = params.has('missing') ? null : { frameInterval: 60000, frames };
window.lolHelper = {
  match: { getReplayAvailability: async () => ({ available: false }), getTimeline: async () => ({ available: Boolean(timeline), timeline }), getPlayerRanks: async () => [] },
  assist: { getChampionGuide: async () => ({ spells: [] }) },
} as unknown as typeof window.lolHelper;
const match = { participants, gameId: 900000007, queueId: 420, gameDuration: 1440, gameCreation: 0, gameVersion: '16.17.1', gameType: 'MATCHED_GAME' } as unknown as PlayerMatchDetail;
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<div style={{ height: '100vh' }}><MatchDetail match={match} targetPuuid={participants[0].puuid} /></div>);
