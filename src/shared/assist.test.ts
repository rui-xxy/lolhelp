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

  it('retires removed in-game overlay and alert settings', () => {
    const normalized = normalizeAssistSettings({
      showRuneAssistant: true,
      showPowerTrend: true,
      showMatchOverlay: true,
      showSpellOverlay: true,
      showPositionMessage: true,
      blacklistAlert: true,
      blacklistAlertToClient: true,
      highWinRateAlert: true,
      hotkeys: {
        matchOverlay: 'SHIFT+TAB',
        matchHelper: 'F6',
        spellOverlay: 'F9',
      },
    });

    expect(normalized.showRuneAssistant).toBe(false);
    expect(normalized.showPowerTrend).toBe(false);
    expect(normalized.showMatchOverlay).toBe(false);
    expect(normalized.showSpellOverlay).toBe(false);
    expect(normalized.showPositionMessage).toBe(false);
    expect(normalized.blacklistAlert).toBe(false);
    expect(normalized.blacklistAlertToClient).toBe(false);
    expect(normalized.highWinRateAlert).toBe(false);
    expect(normalized.hotkeys.matchOverlay).toBe('');
    expect(normalized.hotkeys.matchHelper).toBe('');
    expect(normalized.hotkeys.spellOverlay).toBe('');
  });

  it('does not enable removed overlay defaults', () => {
    const normalized = normalizeAssistSettings({});

    expect(normalized.globalHotkeysEnabled).toBe(false);
    expect(normalized.showSpellOverlay).toBe(false);
    expect(normalized.hotkeys.spellOverlay).toBe('');
  });
});
