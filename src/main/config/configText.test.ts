import { describe, expect, it } from 'vitest';
import {
  parseIni,
  setFirstYamlScalar,
  setIniValue,
  setYamlSectionChildScalar,
  yamlBool,
  yamlScalar,
} from './configText';

describe('config text helpers', () => {
  it('parses and updates INI while preserving unrelated entries', () => {
    const source = '[General]\r\nWidth=1920\r\nHeight=1080\r\n\r\n[HUD]\r\nScale=1\r\n';
    expect(parseIni(source).General).toEqual({ Width: '1920', Height: '1080' });

    const updated = setIniValue(source, 'General', 'Width', '2560');
    expect(updated).toContain('Width=2560');
    expect(updated).toContain('Height=1080');
    expect(updated).toContain('[HUD]');
  });

  it('adds missing INI sections and keys', () => {
    expect(setIniValue('[General]\nWidth=1920', 'Volume', 'MasterVolume', '0.5'))
      .toContain('[Volume]\nMasterVolume=0.5');
  });

  it('reads and updates YAML scalar values without replacing the whole document', () => {
    const source = [
      'audio:',
      '  masterSoundEnabled: true',
      'game-settings:',
      '  modified: false',
      '  timestamp: 1',
    ].join('\n');

    expect(yamlScalar(source, 'masterSoundEnabled')).toBe('true');
    expect(yamlBool(source, 'masterSoundEnabled', false)).toBe(true);
    expect(setFirstYamlScalar(source, 'masterSoundEnabled', false))
      .toContain('masterSoundEnabled: false');
    expect(setYamlSectionChildScalar(source, 'game-settings', 'timestamp', 2))
      .toContain('timestamp: 2');
  });
});
