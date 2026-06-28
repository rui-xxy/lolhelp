import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectLeagueInstallRoots,
  normalizeInstallRoot,
  rootLooksValid,
} from './configPaths';

let tempRoot: string | null = null;

function makeTempRoot(): string {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lolhelp-config-root-'));
  return tempRoot;
}

afterEach(() => {
  if (!tempRoot) return;
  fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe('configPaths', () => {
  it('normalizes LeagueClient/Game/Config child folders back to install root', () => {
    const root = path.join(makeTempRoot(), 'League');

    expect(normalizeInstallRoot(`"${path.join(root, 'LeagueClient')}"`)).toBe(root);
    expect(normalizeInstallRoot(path.join(root, 'Game'))).toBe(root);
    expect(normalizeInstallRoot(path.join(root, 'Game', 'Config'))).toBe(root);
  });

  it('recognizes selected child folders as a valid install root', () => {
    const root = path.join(makeTempRoot(), 'League');
    fs.mkdirSync(path.join(root, 'LeagueClient', 'Config'), { recursive: true });

    expect(rootLooksValid(root)).toBe(true);
    expect(rootLooksValid(path.join(root, 'LeagueClient'))).toBe(true);
    expect(rootLooksValid(path.join(root, 'LeagueClient', 'Config'))).toBe(true);
  });

  it('includes extra valid roots when detecting install roots', () => {
    const root = path.join(makeTempRoot(), 'League');
    fs.mkdirSync(path.join(root, 'Game', 'Config'), { recursive: true });

    expect(detectLeagueInstallRoots([path.join(root, 'Game')])).toContain(root);
  });
});
