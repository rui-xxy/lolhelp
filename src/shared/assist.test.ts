import { describe, expect, it } from 'vitest';
import { normalizeAssistSettings } from './assist';

describe('assist settings', () => {
  it('keeps the five-second delay boundary', () => {
    expect(normalizeAssistSettings({ autoAcceptDelayMs: 9000 }).autoAcceptDelayMs).toBe(5000);
  });

  it('drops retired cloud-game fields from older settings', () => {
    const normalized = normalizeAssistSettings({
      showTftOverlay: true,
      hotkeys: {
        mainWindow: 'CTRL+ALT+Y',
        matchOverlay: 'SHIFT+TAB',
        matchHelper: 'F6',
        spellOverlay: 'F9',
        tftOverlay: 'F7',
      },
    });

    expect('showTftOverlay' in normalized).toBe(false);
    expect('tftOverlay' in normalized.hotkeys).toBe(false);
  });

  it('keeps Yuumi-style in-game spell timer settings', () => {
    const normalized = normalizeAssistSettings({
      showRuneAssistant: true,
      showPowerTrend: true,
      showMatchOverlay: true,
      showSpellOverlay: true,
      hotkeys: {
        matchOverlay: 'SHIFT+TAB',
        matchHelper: 'F6',
        spellOverlay: 'F9',
      },
    });

    expect(normalized.showRuneAssistant).toBe(false);
    expect(normalized.showPowerTrend).toBe(false);
    expect(normalized.showMatchOverlay).toBe(false);
    expect(normalized.showSpellOverlay).toBe(true);
    expect(normalized.hotkeys.matchOverlay).toBe('SHIFT+TAB');
    expect(normalized.hotkeys.matchHelper).toBe('F6');
    expect(normalized.hotkeys.spellOverlay).toBe('F9');
  });

  it('defaults spell timer to Shift+F6', () => {
    const normalized = normalizeAssistSettings({});

    expect(normalized.globalHotkeysEnabled).toBe(true);
    expect(normalized.showSpellOverlay).toBe(true);
    expect(normalized.hotkeys.spellOverlay).toBe('SHIFT+F6');
  });
});
