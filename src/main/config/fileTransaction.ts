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
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }
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
        `${record.filePath}: ${error instanceof Error ? error.message : String(error)}`,
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
  ensureDir(backupDir);

  try {
    for (const plan of writes) {
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

    for (const plan of writes) {
      atomicWrite(plan.filePath, plan.content);
    }
    return writes.map((plan) => plan.filePath);
  } catch (error) {
    const rollbackFailures = restoreBackups(backups);
    const detail = error instanceof Error ? error.message : String(error);
    const rollbackDetail = rollbackFailures.length
      ? `；回滚失败：${rollbackFailures.join('；')}`
      : '；已回滚已修改文件';
    throw new Error(`配置写入失败：${detail}${rollbackDetail}`);
  }
}

export function atomicWriteText(filePath: string, content: string): void {
  atomicWrite(filePath, content);
}
