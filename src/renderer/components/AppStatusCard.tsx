import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusOutput } from './StatusOutput';
import type { AppStatus } from '../../shared/api';

// 应用状态卡：演示业务组件通过 window.lolHelper 调 IPC。
// 这一层负责"内容"（状态逻辑 + shadcn Card/Button 组合），不负责页面布局。
export function AppStatusCard() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // window.lolHelper 由 preload 暴露 → ipcRenderer.invoke → 主进程 handler
      // 与迁移前完全相同的调用，契约未变
      const result = await window.lolHelper.app.getStatus();
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>应用状态</CardTitle>
        <CardDescription>通过 IPC 向主进程请求应用状态</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleGetStatus} disabled={loading}>
          {loading ? '请求中…' : '获取应用状态'}
        </Button>
        <StatusOutput status={status} error={error} loading={loading} />
      </CardContent>
    </Card>
  );
}
