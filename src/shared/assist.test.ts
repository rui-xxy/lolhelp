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
});
