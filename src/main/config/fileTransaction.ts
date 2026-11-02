import fs from 'node:fs';
import path from 'node:path';

export interface FileWritePlan {
  filePath: string;
  content: string;
}

interface BackupRecord {
  filePath: string;
  backupPath: string;
  existed: boolean;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function atomicWrite(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  const originalMode = fs.existsSync(filePath) ? fs.statSync(filePath).mode & 0o777 : undefined;
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  let madeWritable = false;
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    if (originalMode !== undefined) {
      // 让替换后的文件保留原权限，包括用户设置的只读属性。
      fs.chmodSync(tempPath, originalMode);
      if ((originalMode & 0o200) === 0) {
        // Windows 不允许覆盖只读目标，只在替换前临时解除。
        fs.chmodSync(filePath, originalMode | 0o200);
        madeWritable = true;
      }
    }
    fs.renameSync(tempPath, filePath);
    madeWritable = false;
  } finally {
    try {
      // rename 失败时，原文件仍在，恢复它原来的只读属性。
      if (madeWritable && originalMode !== undefined) {
        fs.chmodSync(filePath, originalMode);
      }
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    }
  }
}

function describeFileError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') {
    return `文件被占用或没有修改权限，请关闭游戏及客户端后重试，并检查文件和目录权限（${code}）`;
  }
  return error instanceof Error ? error.message : String(error);
}

function restoreBackups(records: BackupRecord[]): string[] {
  const failures: string[] = [];
  for (const record of [...records].reverse()) {
    try {
      if (record.existed) {
        atomicWrite(record.filePath, fs.readFileSync(record.backupPath, 'utf-8'));
      } else if (fs.existsSync(record.filePath)) {
        fs.rmSync(record.filePath, { force: true });
      }
    } catch (error) {
      failures.push(
        `${record.filePath}: ${describeFileError(error)}`,
      );
    }
  }
  return failures;
}

export function executeFileTransaction(
  rootPath: string,
  backupDir: string,
  plans: FileWritePlan[],
): string[] {
  const uniquePlans = new Map<string, FileWritePlan>();
  for (const plan of plans) uniquePlans.set(path.resolve(plan.filePath), plan);
  const writes = [...uniquePlans.values()];
  if (writes.length === 0) return [];

  const backups: BackupRecord[] = [];
  const modified: BackupRecord[] = [];
  let currentPath = backupDir;
  ensureDir(backupDir);

  try {
    for (const plan of writes) {
      currentPath = plan.filePath;
      const existed = fs.existsSync(plan.filePath);
      const relativePath = path.relative(rootPath, plan.filePath);
      const safeRelativePath = relativePath.startsWith('..')
        ? path.join('_external', path.basename(plan.filePath))
        : relativePath;
      const backupPath = path.join(backupDir, safeRelativePath);

      if (existed) {
        ensureDir(path.dirname(backupPath));
        fs.copyFileSync(plan.filePath, backupPath);
      }
      backups.push({ filePath: plan.filePath, backupPath, existed });
    }

    for (const [index, plan] of writes.entries()) {
      currentPath = plan.filePath;
      atomicWrite(plan.filePath, plan.content);
      modified.push(backups[index]);
    }
    return writes.map((plan) => plan.filePath);
  } catch (error) {
    const rollbackFailures = restoreBackups(modified);
    const detail = `${currentPath}: ${describeFileError(error)}`;
    const rollbackDetail = rollbackFailures.length
      ? `；回滚失败：${rollbackFailures.join('；')}`
      : modified.length > 0 ? '；已回滚已修改文件' : '；未修改配置文件';
    throw new Error(`配置写入失败：${detail}${rollbackDetail}`);
  }
}

export function atomicWriteText(filePath: string, content: string): void {
  atomicWrite(filePath, content);
}
