import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive = false,
  busy = false,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onOpenChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onOpenChange, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-6 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onOpenChange(false);
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-[390px] max-w-full overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb"
      >
        <header className="flex items-start gap-3 px-5 pt-5">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            destructive
              ? 'bg-app-danger/10 text-app-danger'
              : 'bg-app-primary-soft text-app-primary'
          }`}>
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-app-text">
              {title}
            </h2>
            <p id="confirm-dialog-description" className="mt-1.5 text-xs leading-5 text-app-muted">
              {description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="size-3.5" />
          </Button>
        </header>
        <footer className="mt-5 flex justify-end gap-2 border-t border-app-border/70 bg-app-bg-soft/60 px-5 py-3">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '正在处理' : confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}
