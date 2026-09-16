import type { AppStatus } from '../../shared/api';

interface StatusOutputProps {
  status: AppStatus | null;
  error: string | null;
  loading: boolean;
}

export function StatusOutput({ status, error, loading }: StatusOutputProps) {
  if (loading) {
    return (
      <pre className="mt-4 break-all rounded-sm border border-app-border bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-subtle">
        正在请求主进程状态…
      </pre>
    );
  }
  if (error) {
    return (
      <pre className="mt-4 break-all rounded-sm border border-app-danger/40 bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-danger">
        {error}
      </pre>
    );
  }
  if (status) {
    return (
      <pre className="mt-4 break-all rounded-sm border border-app-border bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-muted">
        {JSON.stringify(status, null, 2)}
      </pre>
    );
  }
  return (
    <pre className="mt-4 break-all rounded-sm border border-app-border bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-subtle">
      点击按钮，通过 IPC 向主进程请求应用状态…
    </pre>
  );
}
