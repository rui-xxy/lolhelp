import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface LargeDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  notice?: string;
  children: ReactNode;
  className?: string;
}

export function LargeDialog({
  open,
  onClose,
  title,
  description,
  icon,
  notice,
  children,
  className,
}: LargeDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[1px] [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={cn(
          'flex h-[660px] max-h-[90vh] w-[1020px] max-w-[94vw] flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb',
          className,
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-app-border px-5">
          {icon && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-app-primary-soft text-app-primary">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-app-text">{title}</h2>
            {description && (
              <p className="mt-0.5 truncate text-[11px] text-app-muted">{description}</p>
            )}
          </div>
          {notice && (
            <div className="max-w-72 truncate rounded-sm bg-app-primary-soft/70 px-2.5 py-1.5 text-[11px] text-app-primary">
              {notice}
            </div>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`关闭${title}`}>
            <X className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  );
}
