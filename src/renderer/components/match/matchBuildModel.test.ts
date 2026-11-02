import { describe, expect, it } from 'vitest';
import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent } from '../../../shared/api';
import { buildLaneDuel, buildMilestones, buildRunePage, buildSkillPlan, groupTrips, isPowerSpike, itemRole, reconcilePurchases, runeTree } from './matchBuildModel';

const at = (minutes: number, seconds = 0) => (minutes * 60 + seconds) * 1000;
const buy = (timestamp: number, itemId: number): MatchTimelineEvent => ({ type: 'ITEM_PURCHASED', timestamp, participantId: 1, itemId, itemName: `item${itemId}`, itemIcon: '' });
const destroy = (timestamp: number, itemId: number): MatchTimelineEvent => ({ type: 'ITEM_DESTROYED', timestamp, participantId: 1, itemId });
const sell = (timestamp: number, itemId: number): MatchTimelineEvent => ({ type: 'ITEM_SOLD', timestamp, participantId: 1, itemId });
const undo = (timestamp: number, beforeId: number, afterId = 0): MatchTimelineEvent => ({ type: 'ITEM_UNDO', timestamp, participantId: 1, beforeId, afterId });
const skill = (timestamp: number, skillSlot: number): MatchTimelineEvent => ({ type: 'SKILL_LEVEL_UP', timestamp, participantId: 1, skillSlot, levelUpType: 'NORMAL' });

describe('build model', () => {
  const events = [
    buy(at(0, 8), 1055), buy(at(0, 8), 2003),
    destroy(at(2, 0), 2003),
    buy(at(6, 40), 1038), buy(at(6, 40), 1001),
    destroy(at(13, 36), 1038), buy(at(13, 36), 3031),
    buy(at(14, 0), 1018), undo(at(14, 2), 1018),
    destroy(at(15, 0), 1001), buy(at(15, 0), 3006),
    sell(at(18, 0), 1055),
    buy(at(18, 5), 3072),
  ];
  const { purchases, sales } = reconcilePurchases(events, 1, [3031, 3006, 3072]);

  it('reconciles buys, undos, sales and items combined into bigger ones', () => {
    const fate = (id: number) => purchases.find((item) => item.itemId === id)?.fate;
    expect(fate(2003)).toBe('consumed');
    expect(fate(1038)).toBe('combined');
    expect(purchases.find((item) => item.itemId === 1038)?.intoName).toBe('item3031');
    expect(fate(1001)).toBe('combined');
    expect(fate(1055)).toBe('sold');
    expect(purchases.some((item) => item.itemId === 1018)).toBe(false);
    expect(purchases.filter((item) => item.final).map((item) => item.itemId)).toEqual([3031, 3006, 3072]);
    expect(sales.map((sale) => sale.itemId)).toEqual([1055]);
  });

  it('groups purchases into trips home, the first one being the starting items', () => {
    const trips = groupTrips(purchases, sales);
    expect(trips.map((trip) => trip.label)).toEqual(['出门装', '第 1 次回家', '第 2 次回家', '第 3 次回家', '第 4 次回家']);
    expect(trips[4].sales).toHaveLength(1);
    expect(trips[4].purchases.map((item) => item.itemId)).toEqual([3072]);
  });

  it('orders the final build by when each item was finished, numbering only full items', () => {
    const player = {
      items: [
        { id: 3072, name: '饮血剑', icon: '', slot: 0 },
        { id: 3006, name: '狂战士胫甲', icon: '', slot: 1 },
        { id: 3031, name: '无尽之刃', icon: '', slot: 2 },
        { id: 3363, name: '远见改造', icon: '', slot: 6 },
      ],
    } as unknown as MatchParticipantSummary;
    const milestones = buildMilestones(player, purchases);
    expect(milestones.map((item) => [item.itemId, item.order])).toEqual([[3031, 1], [3006, 0], [3072, 2]]);
    expect(itemRole(3006)).toBe('boots');
  });

  it('never counts a starting item kept to the end as a finished item, even with an unknown id', () => {
    const kept = reconcilePurchases([buy(at(0, 16), 9999), buy(at(0, 16), 2003), buy(at(11, 20), 6655)], 1, [9999, 6655]);
    const player = { items: [{ id: 9999, name: '新出门装', icon: '', slot: 0 }, { id: 6655, name: '卢登的配枪', icon: '', slot: 1 }] } as unknown as MatchParticipantSummary;
    const milestones = buildMilestones(player, kept.purchases);
    expect(milestones.map((item) => [item.itemId, item.role, item.order])).toEqual([[9999, 'starter', 0], [6655, 'core', 1]]);
    expect(milestones.filter(isPowerSpike).map((item) => item.itemId)).toEqual([6655]);
  });

  it('dates an item that upgraded by itself from when its base item was bought', () => {
    const upgraded = reconcilePurchases([buy(at(12, 0), 3003), destroy(at(20, 0), 3003)], 1, [3040]);
    const player = { items: [{ id: 3040, name: '炽天使之拥', icon: '', slot: 0 }] } as unknown as MatchParticipantSummary;
    const [seraph] = buildMilestones(player, upgraded.purchases);
    expect(seraph.time).toBe(at(12, 0));
    expect(seraph.upgradedFrom).toBe('item3003');
    expect(itemRole(323070)).toBe('component');
  });

  it('works out which skill was maxed first', () => {
    const order = [1, 2, 3, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2];
    const plan = buildSkillPlan(order.map((slot, index) => skill(at(index), slot)));
    expect(plan.priority).toEqual(['Q', 'E', 'W']);
    expect(plan.opening).toEqual(['Q', 'W', 'E']);
    expect(plan.ultimateAt).toEqual([6, 11, 16]);
  });

  it('compares a player with their lane opponent minute by minute', () => {
    const frame = (minute: number, myGold: number, theirGold: number) => ({
      timestamp: minute * 60_000 + 20,
      events: [],
      participantFrames: {
        1: { participantId: 1, totalGold: myGold, currentGold: 0, level: Math.floor(minute / 2) + 1, xp: minute * 400, minionsKilled: minute * 8, jungleMinionsKilled: 0 },
        6: { participantId: 6, totalGold: theirGold, currentGold: 0, level: Math.floor(minute / 2) + 1, xp: minute * 380, minionsKilled: minute * 7, jungleMinionsKilled: 0 },
      },
    });
    const timeline = { frameInterval: 60_000, frames: Array.from({ length: 21 }, (_, minute) => frame(minute, 500 + minute * 420, 500 + minute * 360)) } as unknown as MatchTimeline;
    const duel = buildLaneDuel(timeline, 1, 6);
    expect(duel?.checkpoints.map((point) => point.minute)).toEqual([10, 15]);
    const ten = duel?.checkpoints[0];
    expect(ten ? ten.mine.cs - ten.theirs.cs : null).toBe(10);
    expect(duel?.verdictAt.minute).toBe(14);
    expect(duel?.verdict).toBe('ahead');
    expect(buildLaneDuel(timeline, 1, 0)).toBe(null);
  });

  it('splits runes into the primary and secondary tree', () => {
    expect(runeTree(9923)).toBe('domination');
    expect(runeTree(8299)).toBe('precision');
    const page = buildRunePage({
      primaryRune: { id: 8008, name: '致命节奏', icon: '' },
      secondaryRune: { id: 8139, name: '恶意', icon: '' },
      runes: [8008, 9111, 9104, 8014, 8139, 8135].map((id) => ({ id, name: String(id), icon: '' })),
    } as unknown as MatchParticipantSummary);
    expect(page.primaryTree).toBe('precision');
    expect(page.primary.map((rune) => rune.id)).toEqual([9111, 9104, 8014]);
    expect(page.secondaryTree).toBe('domination');
    expect(page.secondary.map((rune) => rune.id)).toEqual([8139, 8135]);
  });
});
