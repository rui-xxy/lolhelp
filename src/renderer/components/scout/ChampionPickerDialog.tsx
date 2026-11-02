import { Dialog } from 'radix-ui';
import { Star } from 'lucide-react';
import { ChampionPicker } from './ChampionPicker';
import type { ChampionPreset, ChampionSummary } from '../../../shared/api';

interface ChampionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champions: ChampionSummary[];
  selectedIds: number[];
  favoriteIds: number[];
  championPresets?: ChampionPreset[];
  onChange: (ids: number[]) => void;
  onToggleFavorite?: (id: number) => void;
  onSavePreset?: () => void;
  onApplyPreset?: (ids: number[]) => void;
  onDeletePreset?: (id: string) => void;
  onUseFavorites?: () => void;
}

export function ChampionPickerDialog({
  open,
  onOpenChange,
  champions,
  selectedIds,
  favoriteIds,
  championPresets,
  onChange,
  onToggleFavorite,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onUseFavorites,
}: ChampionPickerDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          onPointerDownOutside={() => onOpenChange(false)}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[640px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-airbnb"
        >
          <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-app-text">
              选择指定英雄
              <span className="text-xs font-normal text-app-subtle">
                （已选 {selectedIds.length}）
              </span>
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              从英雄列表中选择想要查找的高手所使用的英雄，可多选并收藏
            </Dialog.Description>
            <Dialog.Close
              className="flex size-7 items-center justify-center rounded-sm text-app-subtle transition-colors hover:bg-app-surface-soft hover:text-app-text"
              aria-label="关闭"
            >
              ✕
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {champions.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-xs text-app-subtle">
                英雄列表加载中…
              </div>
            ) : (
              <ChampionPicker
                champions={champions}
                selectedIds={selectedIds}
                favoriteIds={favoriteIds}
                championPresets={championPresets}
                onChange={onChange}
                onToggleFavorite={onToggleFavorite}
                onSavePreset={onSavePreset}
                onApplyPreset={onApplyPreset}
                onDeletePreset={onDeletePreset}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-app-border bg-app-surface-soft px-5 py-3">
            {onUseFavorites && favoriteIds.length > 0 ? (
              <button
                type="button"
                onClick={onUseFavorites}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs text-app-subtle transition-colors hover:bg-app-surface hover:text-app-text"
              >
                <Star className="size-3 fill-current text-gold" aria-hidden="true" />
                用收藏的 {favoriteIds.length} 个
              </button>
            ) : (
              <span />
            )}
            <Dialog.Close className="rounded-sm bg-app-primary px-5 py-1.5 text-xs font-semibold text-app-primary-foreground transition-colors hover:bg-app-primary-hover">
              确定（{selectedIds.length}）
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
