import { createRoot } from 'react-dom/client';
import { MatchDetail } from '../../src/renderer/components/match/MatchDetail';
import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent, PlayerMatchDetail } from '../../src/shared/api';
import '../../src/renderer/styles/index.css';

// Synthetic match data, actual renderer and Riot artwork. Not a real match record.
const params = new URLSearchParams(location.search);
const missing = params.has('missing');
const noArt = params.has('noart');
const art = (type: string, name: string | number) => `/__build-art__/${type}/${name}.png`;
const champions = [[4, 'TwistedFate'], [103, 'Ahri'], [222, 'Jinx'], [64, 'LeeSin'], [86, 'Garen'], [51, 'Caitlyn'], [111, 'Nautilus'], [234, 'Viego'], [134, 'Syndra'], [412, 'Thresh']] as const;
const names = ['星河入梦', '九尾的信笺', '长夜与微光', '峡谷回声', '北境不退', '皮城第七码头', '深海守望者', '破败王座', '暗星回廊', '雾起时见你'];
const itemNames: Record<number, string> = { 1027: '蓝水晶', 2003: '生命药水', 1082: '黑暗封印', 1001: '草鞋', 1052: '增幅典籍', 3113: '以太精魂', 1058: '无用大棒', 3118: '装备 3118', 3089: '灭世者的死亡之帽', 3009: '轻灵之靴', 3115: '纳什之牙', 3363: '远见改造', 3100: '巫妖之祸', 1026: '爆裂魔杖', 3137: '装备 3137' };
const finalIds = [3089, 3100, 3115, 3009, 3137, 3118, 3363];
const participants = champions.map(([championId, championName], index) => ({
  puuid: `build-fixture-${index}`, participantId: index + 1, teamId: index < 5 ? 100 : 200,
  championId, championName, championAvatar: art('champion', championName),
  riotId: `${params.has('long') && index === 0 ? '这是一个用于检查姓名省略和布局稳定的特别长的玩家名称' : names[index]}#${78091 + index}`,
  summonerName: names[index], teamPosition: 'MIDDLE',
  kills: 6 + index, deaths: 2 + index, assists: 15 - index, damage: 25673,
  gold: 12587 + index * 711, cs: 189, win: index < 5, champLevel: index ? 18 : 16,
  items: missing ? [] : finalIds.filter((_, slot) => index !== 1 || slot !== 3).map((id) => ({ id, slot: finalIds.indexOf(id), name: itemNames[id], icon: art('item', id) })),
  spells: [], runes: [], augments: [], ranks: [], stats: {}, rawStats: {},
})) as unknown as MatchParticipantSummary[];
const purchaseGroups: Array<[number, number[]]> = [
  [1, [1027, 2003, 2003]], [86, [1082]], [202, [1001, 1052]], [393, [3113, 1027]],
  [491, [1058]], [618, [3118, 3089]], [746, [3009, 1058]], [954, [3115, 3363]],
  [1090, [1052]], [1170, [3100]], [1230, [1026]], [1350, [3137, 1052]], [1460, [3089]],
];
if (params.has('stress')) purchaseGroups[0][1] = Array.from({ length: 28 }, () => 2003);
const slots = [2, 1, 3, 3, 3, 4, 3, 2, 3, 2, 4, 2, 2, 1, 1, 4];
if (params.has('extra')) slots.push(1, 2, 3, 4, 1, 2, 3, 4);
if (params.has('unknown')) slots[2] = 0;
const events: MatchTimelineEvent[] = missing ? [] : participants.flatMap((participant, index) => [
  ...slots.slice(0, index === 1 ? 12 : slots.length).map((skillSlot, level) => ({ type: 'SKILL_LEVEL_UP', participantId: participant.participantId, timestamp: level * 90000, skillSlot: index === 1 && level === 0 ? 1 : skillSlot, levelUpType: 'NORMAL' })),
  ...purchaseGroups.flatMap(([seconds, ids]) => ids.map((itemId, offset) => ({ type: 'ITEM_PURCHASED', participantId: participant.participantId, timestamp: seconds * 1000 + offset * 100, itemId, itemName: itemNames[itemId], itemIcon: art('item', itemId) }))),
  ...(index === 2 ? [{ type: 'SKILL_LEVEL_UP', participantId: participant.participantId, timestamp: 900000, skillSlot: 1, levelUpType: 'EVOLVE' }] : []),
]);
const timeline = { frames: [{ timestamp: 0, events: [], participantFrames: {} }, { timestamp: 1800000, events, participantFrames: {} }], frameInterval: 60000 } as MatchTimeline;
window.lolHelper = {
  match: { getReplayAvailability: async () => ({ available: false }), getTimeline: async () => ({ available: true, timeline }), getPlayerRanks: async () => [] },
  assist: { getChampionGuide: async (championId: number) => {
    if (noArt) throw new Error('Fixture: artwork unavailable');
    const icons = championId === 103 ? ['AhriQ', 'AhriW', 'AhriE', 'AhriR'] : ['WildCards', 'PickACard', 'CardmasterStack', 'Destiny'];
    return { championId, spells: ['Q', 'W', 'E', 'R'].map((key, index) => ({ key, name: `${key} 技能`, icon: art('spell', icons[index]) })) };
  } },
} as unknown as typeof window.lolHelper;
const match = { participants, gameId: 900000002, queueId: 420, gameDuration: 1800, gameCreation: 0, gameVersion: '16.17.1', gameType: 'MATCHED_GAME' } as unknown as PlayerMatchDetail;
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<div style={{ height: '100vh' }}><MatchDetail match={match} targetPuuid={participants[0].puuid} /></div>);
