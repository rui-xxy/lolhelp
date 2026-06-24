import { describe, expect, it } from 'vitest';
import {
  buildHotkeyCategories,
  displayHotkeyValue,
  flattenHotkeys,
  hotkeyFromKeyboardEvent,
  hotkeyFromMouseEvent,
  hotkeyLabel,
} from './hotkeyModel';

describe('hotkey model', () => {
  it('formats and captures keyboard and mouse bindings', () => {
    expect(displayHotkeyValue('[Ctrl][q]')).toBe('Ctrl + Q');
    expect(
      hotkeyFromKeyboardEvent({
        key: 'q',
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe('[Ctrl][q]');
    expect(
      hotkeyFromMouseEvent({
        button: 3,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe('[Shift][Button 4]');
  });

  it('sorts and categorizes bindings without losing values', () => {
    const bindings = flattenHotkeys({
      ShopEvents: { evtShopFocusSearch: '[Ctrl][f]' },
      GameEvents: { evtCastSpell1: '[q]', evtCameraSnap: '[Space]' },
    });
    const categories = buildHotkeyCategories(bindings);

    expect(bindings[0]).toMatchObject({ section: 'GameEvents', key: 'evtCastSpell1' });
    expect(categories.find((category) => category.key === 'hero')?.bindings).toHaveLength(1);
    expect(categories.find((category) => category.key === 'camera')?.bindings).toHaveLength(1);
    expect(categories.find((category) => category.key === 'shop')?.bindings).toHaveLength(1);
  });

  it('keeps known localized labels', () => {
    expect(hotkeyLabel('evtRadialEmotePlaySlot8')).toBe('播放表情 9');
  });
});
