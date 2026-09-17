import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2 } from 'lucide-react';

export interface MatchRegionOption {
  key: string;
  name: string;
  description?: string;
}

interface MatchRegionPickerProps {
  value: string;
  options: MatchRegionOption[];
  onChange: (value: string) => void;
}

export function MatchRegionPicker({ value, options, onChange }: MatchRegionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex w-[136px] shrink-0 items-center border-r border-app-border bg-app-shell/45"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group flex h-full w-full items-center gap-2 px-2.5 text-left outline-none transition-colors hover:bg-app-nav-hover focus-visible:bg-app-nav-hover"
      >
        <Globe2 className="size-3.5 shrink-0 text-app-muted transition-colors group-hover:text-app-body" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-app-body">
          {selected?.name ?? '选择大区'}
        </span>
        <ChevronDown
          className={'size-3.5 shrink-0 text-app-subtle transition-transform duration-150 ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="选择大区"
          className="absolute left-0 top-[calc(100%+6px)] z-[120] w-48 overflow-hidden rounded-md border border-app-border-strong bg-app-surface p-1 shadow-[var(--shadow-ui-popover)]"
        >
          <div className="max-h-72 overflow-y-auto">
            {options.map((option) => {
              const isSelected = option.key === value;
              return (
                <button
                  key={option.key || '__current__'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  title={option.description}
                  onClick={() => {
                    onChange(option.key);
                    setOpen(false);
                  }}
                  className={
                    isSelected
                      ? 'flex h-8 w-full items-center gap-2 rounded-sm bg-app-nav-hover px-2 text-left text-xs font-medium text-app-text outline-none'
                      : 'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-app-muted outline-none transition-colors hover:bg-app-nav-hover hover:text-app-body focus-visible:bg-app-nav-hover focus-visible:text-app-body'
                  }
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <Check className={isSelected ? 'size-3.5 opacity-100' : 'size-3.5 opacity-0'} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {option.key === '' && <span className="text-[9px] text-app-subtle">当前</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
