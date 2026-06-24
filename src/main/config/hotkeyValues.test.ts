import { describe, expect, it } from 'vitest';
import { coerceHotkeyValue, normalizeHotkeyValues } from './hotkeyValues';

describe('hotkey value conversion', () => {
  it('preserves the LCU value type when applying edited values', () => {
    expect(coerceHotkeyValue('1', 0)).toBe(1);
    expect(coerceHotkeyValue('false', true)).toBe(false);
    expect(coerceHotkeyValue('[q]', '[w]')).toBe('[q]');
    expect(coerceHotkeyValue('null', '[q]')).toBeNull();
  });

  it('keeps the previous numeric value when input is not numeric', () => {
    expect(coerceHotkeyValue('not-a-number', 1)).toBe(1);
  });

  it('normalizes unknown LCU payloads for the renderer', () => {
    expect(
      normalizeHotkeyValues({
        Quickbinds: { evtCastSpell1smart: 1, disabled: null },
        invalid: 'value',
      }),
    ).toEqual({
      Quickbinds: { evtCastSpell1smart: '1', disabled: 'null' },
    });
  });
});
