import { describe, expect, it } from 'vitest';
import type { LiveBattleInfo, MayhemAugmentRankingEntry, MayhemChampionBuild } from '../../../shared/api';
import { augmentTierScore, balanceIsBuff, compareAugments, liveMayhemTeam } from './mayhemModel';

function augment(slug: string, tier: string, rank: number): MayhemAugmentRankingEntry {
  return {
    slug,
    name: slug,
    icon: '',
    rarity: 'gold',
    availability: 'live',
    rank,
    allRank: rank,
    tier,
    winRate: null,
    pickRate: 10,
    isNew: false,
    effect: '',
    topChampions: [],
  };
}

describe('mayhem balance modifiers', () => {
  it('treats less damage taken as a buff and less damage dealt as a nerf', () => {
    expect(balanceIsBuff({ direction: 'down', label: '承受伤害', value: '-5%' })).toBe(true);
    expect(balanceIsBuff({ direction: 'down', label: '造成伤害', value: '-5%' })).toBe(false);
    expect(balanceIsBuff({ direction: 'up', label: '治疗效果', value: '+10%' })).toBe(true);
  });
});

describe('choose one of three augments', () => {
  const candidates = [augment('a', 'A', 30), augment('b', 'S+', 2), augment('c', 'S-', 9)];

  it('ranks by overall tier without champion data', () => {
    expect(augmentTierScore('S+')).toBeGreaterThan(augmentTierScore('S'));
    expect(augmentTierScore('S-')).toBeGreaterThan(augmentTierScore('A+'));
    expect(compareAugments(candidates, null).map((row) => row.augment.slug)).toEqual(['b', 'c', 'a']);
  });

  it('prefers what works for the current champion', () => {
    const build = {
      name: '迅捷斥候',
      title: '提莫',
      augments: [
        { slug: 'a', name: 'a', rarity: 'gold', icon: '', tier: 'S', rarityRank: 1, overallTier: 'A', overallRank: 30, pickRate: 20, winRate: null, effect: '' },
      ],
    } as unknown as MayhemChampionBuild;
    const rows = compareAugments(candidates, build);
    expect(rows[0].augment.slug).toBe('a');
    expect(rows[0].reason).toContain('提莫');
  });
});

describe('live mayhem team', () => {
  const battle: LiveBattleInfo = {
    inGame: false,
    phase: 'ChampSelect',
    queueName: '海克斯大乱斗',
    myPuuid: 'me',
    myTeam: [
      { puuid: 'me', championId: 17 },
      { puuid: 'mate', championId: 86 },
      { puuid: 'empty', championId: 0 },
    ] as LiveBattleInfo['myTeam'],
    enemyTeam: [],
  };

  it('finds my champion and the team during champ select', () => {
    expect(liveMayhemTeam(battle)).toEqual({ phase: 'ChampSelect', myChampionId: 17, championIds: [17, 86] });
  });

  it('ignores other queues and idle phases', () => {
    expect(liveMayhemTeam({ ...battle, queueName: '单双排位', mapName: '召唤师峡谷' })).toBeNull();
    expect(liveMayhemTeam({ ...battle, phase: 'None' })).toBeNull();
  });
});
