import { describe, expect, it } from 'vitest';
import { normalizeRiotIdInput, splitRiotId } from './playerAccount';

describe('Riot player account helpers', () => {
  it('normalizes full-width hash and surrounding whitespace', () => {
    expect(normalizeRiotIdInput('  爱意秋散 ＃ 23554  ')).toBe('爱意秋散#23554');
    expect(normalizeRiotIdInput('玩家﹟12345')).toBe('玩家#12345');
  });

  it('splits Riot ID by the last hash', () => {
    expect(splitRiotId('名字#中间#12345')).toEqual({
      gameName: '名字#中间',
      tagLine: '12345',
    });
  });

  it('rejects incomplete Riot IDs', () => {
    expect(splitRiotId('只有名字')).toBeNull();
    expect(splitRiotId('名字#')).toBeNull();
  });
});
