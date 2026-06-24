import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeFileTransaction } from './fileTransaction';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lolhelp-transaction-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('executeFileTransaction', () => {
  it('writes all files and stores their previous contents', () => {
    const root = createTempDir();
    const backupDir = path.join(root, 'backups');
    const first = path.join(root, 'Game', 'Config', 'game.cfg');
    const second = path.join(root, 'Game', 'Config', 'input.ini');
    fs.mkdirSync(path.dirname(first), { recursive: true });
    fs.writeFileSync(first, 'old-game');
    fs.writeFileSync(second, 'old-input');

    const written = executeFileTransaction(root, backupDir, [
      { filePath: first, content: 'new-game' },
      { filePath: second, content: 'new-input' },
    ]);

    expect(written).toEqual([first, second]);
    expect(fs.readFileSync(first, 'utf-8')).toBe('new-game');
    expect(fs.readFileSync(second, 'utf-8')).toBe('new-input');
    expect(fs.readFileSync(path.join(backupDir, 'Game', 'Config', 'game.cfg'), 'utf-8'))
      .toBe('old-game');
  });

  it('rolls back files when a later write fails', () => {
    const root = createTempDir();
    const backupDir = path.join(root, 'backups');
    const first = path.join(root, 'game.cfg');
    const blockedParent = path.join(root, 'blocked');
    const invalidTarget = path.join(blockedParent, 'input.ini');
    fs.writeFileSync(first, 'old-game');
    fs.writeFileSync(blockedParent, 'not-a-directory');

    expect(() =>
      executeFileTransaction(root, backupDir, [
        { filePath: first, content: 'new-game' },
        { filePath: invalidTarget, content: 'new-input' },
      ]),
    ).toThrow(/已回滚/);

    expect(fs.readFileSync(first, 'utf-8')).toBe('old-game');
    expect(fs.existsSync(invalidTarget)).toBe(false);
  });
});
