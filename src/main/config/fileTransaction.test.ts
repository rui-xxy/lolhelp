import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeFileTransaction } from './fileTransaction';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lolhelp-transaction-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
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

  it('replaces a read-only file and preserves its original permissions', () => {
    const root = createTempDir();
    const filePath = path.join(root, 'PersistedSettings.json');
    fs.writeFileSync(filePath, 'old-settings');
    fs.chmodSync(filePath, 0o444);
    const originalMode = fs.statSync(filePath).mode;

    expect(executeFileTransaction(root, path.join(root, 'backups'), [
      { filePath, content: 'new-settings' },
    ])).toEqual([filePath]);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new-settings');
    expect(fs.statSync(filePath).mode).toBe(originalMode);
    expect(fs.readFileSync(path.join(root, 'backups', 'PersistedSettings.json'), 'utf-8'))
      .toBe('old-settings');
    expect(fs.readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('restores the content and read-only attribute when a later write fails', () => {
    const root = createTempDir();
    const filePath = path.join(root, 'PersistedSettings.json');
    const blockedParent = path.join(root, 'blocked');
    fs.writeFileSync(filePath, 'old-settings');
    fs.chmodSync(filePath, 0o444);
    const originalMode = fs.statSync(filePath).mode;
    fs.writeFileSync(blockedParent, 'not-a-directory');

    expect(() => executeFileTransaction(root, path.join(root, 'backups'), [
      { filePath, content: 'new-settings' },
      { filePath: path.join(blockedParent, 'input.ini'), content: 'new-input' },
    ])).toThrow(/已回滚已修改文件/);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('old-settings');
    expect(fs.statSync(filePath).mode).toBe(originalMode);
    expect(fs.readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('restores read-only permissions after a failed rename and rolls back only modified files', () => {
    const root = createTempDir();
    const first = path.join(root, 'game.cfg');
    const locked = path.join(root, 'PersistedSettings.json');
    const pending = path.join(root, 'input.ini');
    fs.writeFileSync(first, 'old-game');
    fs.writeFileSync(locked, 'old-settings');
    fs.writeFileSync(pending, 'old-input');
    fs.chmodSync(locked, 0o444);
    const originalMode = fs.statSync(locked).mode;
    const rename = fs.renameSync;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === locked) {
        // 模拟 Windows 在解除只读后，仍因其他进程占用而拒绝替换。
        expect(fs.statSync(locked).mode & 0o200).not.toBe(0);
        throw Object.assign(new Error('rename denied'), { code: 'EPERM' });
      }
      rename(source, target);
    });

    expect(() => executeFileTransaction(root, path.join(root, 'backups'), [
      { filePath: first, content: 'new-game' },
      { filePath: locked, content: 'new-settings' },
      { filePath: pending, content: 'new-input' },
    ])).toThrow(/PersistedSettings\.json: 文件被占用或没有修改权限.*已回滚已修改文件/);

    expect(renameSpy.mock.calls.map(([, target]) => target)).toEqual([first, locked, first]);
    expect(fs.readFileSync(first, 'utf-8')).toBe('old-game');
    expect(fs.readFileSync(locked, 'utf-8')).toBe('old-settings');
    expect(fs.statSync(locked).mode).toBe(originalMode);
    expect(fs.readFileSync(pending, 'utf-8')).toBe('old-input');
    expect(fs.readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not attempt rollback when backing up a later file fails', () => {
    const root = createTempDir();
    const first = path.join(root, 'game.cfg');
    const second = path.join(root, 'input.ini');
    fs.writeFileSync(first, 'old-game');
    fs.writeFileSync(second, 'old-input');
    const copy = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((source, target, mode) => {
      if (source === second) {
        throw Object.assign(new Error('backup denied'), { code: 'EACCES' });
      }
      copy(source, target, mode);
    });
    const renameSpy = vi.spyOn(fs, 'renameSync');

    expect(() => executeFileTransaction(root, path.join(root, 'backups'), [
      { filePath: first, content: 'new-game' },
      { filePath: second, content: 'new-input' },
    ])).toThrow(/未修改配置文件/);

    expect(renameSpy).not.toHaveBeenCalled();
    expect(fs.readFileSync(first, 'utf-8')).toBe('old-game');
    expect(fs.readFileSync(second, 'utf-8')).toBe('old-input');
  });

  it('keeps a read-only file intact when its attribute cannot be changed', () => {
    const root = createTempDir();
    const filePath = path.join(root, 'PersistedSettings.json');
    fs.writeFileSync(filePath, 'old-settings');
    fs.chmodSync(filePath, 0o444);
    const originalMode = fs.statSync(filePath).mode;
    const chmod = fs.chmodSync;
    vi.spyOn(fs, 'chmodSync').mockImplementation((target, mode) => {
      if (target === filePath) {
        throw Object.assign(new Error('chmod denied'), { code: 'EPERM' });
      }
      chmod(target, mode);
    });

    expect(() => executeFileTransaction(root, path.join(root, 'backups'), [
      { filePath, content: 'new-settings' },
    ])).toThrow(/文件被占用或没有修改权限.*未修改配置文件/);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('old-settings');
    expect(fs.statSync(filePath).mode).toBe(originalMode);
    expect(fs.readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
