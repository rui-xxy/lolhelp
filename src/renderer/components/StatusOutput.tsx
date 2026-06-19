import type { AppStatus } from '../../shared/api';

// 状态输出框：纯展示组件，不持有状态，由父组件传入数据。
// 用 app-* token 保持暖白纸感（error 红 / 正常 muted / 占位 subtle）。
interface StatusOutputProps {
  status: AppStatus | null;
  error: string | null;
  loading: boolean;
}

export function StatusOutput({ status, error, loading }: StatusOutputProps) {
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
