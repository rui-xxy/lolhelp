import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Button } from './ui/button';
import type { LcuConnection } from '../../shared/api';

export function LcuConnectionCard() {
  const [result, setResult] = useState<LcuConnection | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDetect = async () => {
    setLoading(true);
    try {
      setResult(await window.lolHelper.lcu.detectClient());
    } catch (err) {
      setResult({
        found: false,
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-md shadow-airbnb">
      <CardHeader>
        <CardTitle>LCU 客户端检测</CardTitle>
        <CardDescription>检测 LOL 客户端是否运行并验证连接</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleDetect} disabled={loading}>
          {loading ? '检测中…' : '检测 LOL 客户端'}
        </Button>
        {result && (
          <pre className="mt-4 break-all rounded-md border border-app-border bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
