import { describe, expect, it } from 'vitest';
import { buildChampionSplashCandidatesByAlias } from './gameAssets';

describe('champion splash candidates', () => {
  it('uses the resolved parent skin first and keeps the base splash as fallback', () => {
    expect(buildChampionSplashCandidatesByAlias('Yone', 777, 777010)).toEqual([
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yone_10.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yone_0.jpg',
    ]);
  });

  it('does not duplicate the base splash', () => {
    expect(buildChampionSplashCandidatesByAlias('Yone', 777, 777000)).toEqual([
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yone_0.jpg',
    ]);
  });
});
