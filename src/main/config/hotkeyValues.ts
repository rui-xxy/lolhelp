import type { LolHotkeyValues } from '../../shared/api';

export type LcuInputValue = boolean | number | string | null;
export type LcuInputSettings = Record<string, Record<string, LcuInputValue>>;

export function normalizeHotkeyValues(hotkeys: unknown): LolHotkeyValues {
  if (!hotkeys || typeof hotkeys !== 'object') return {};
  const result: LolHotkeyValues = {};
  for (const [section, bindings] of Object.entries(hotkeys as Record<string, unknown>)) {
    if (!bindings || typeof bindings !== 'object') continue;
    const normalizedBindings: Record<string, string> = {};
    for (const [key, value] of Object.entries(bindings as Record<string, unknown>)) {
      if (!key) continue;
      normalizedBindings[key] = value == null ? 'null' : String(value);
    }
    if (Object.keys(normalizedBindings).length > 0) {
      result[section] = normalizedBindings;
    }
  }
  return result;
}

export function coerceHotkeyValue(
  value: string,
  currentValue: LcuInputValue | undefined,
): LcuInputValue {
  if (value.toLowerCase() === 'null') return null;
  if (typeof currentValue === 'boolean') {
    return value === '1' || value.toLowerCase() === 'true';
  }
  if (typeof currentValue === 'number') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : currentValue;
  }
  return value;
}
