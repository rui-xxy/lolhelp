import { describe, expect, it } from 'vitest';
import { buildChampionSkinIndex } from './championSkins';

describe('champion skin index', () => {
  it('maps a chroma id to its parent skin id', () => {
    const index = buildChampionSkinIndex(238, [
      {
        id: 238013,
        chromas: [{ id: 238028 }, { id: 238029 }],
      },
    ]);

    expect(index.get(238029)).toBe(238013);
  });

  it('keeps ordinary skin ids unchanged', () => {
    const index = buildChampionSkinIndex(777, [
      { id: 777000 },
      { id: 777010, chromas: [{ id: 777023 }] },
    ]);

    expect(index.get(777010)).toBe(777010);
    expect(index.get(777023)).toBe(777010);
  });
});
