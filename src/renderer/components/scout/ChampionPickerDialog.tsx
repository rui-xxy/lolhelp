import { Dialog } from 'radix-ui';
import { ChampionPicker } from './ChampionPicker';
import type { ChampionPreset, ChampionSummary } from '../../../shared/api';

// 英雄选择弹窗：点「选择英雄」按钮触发，弹出大窗选英雄。
// 用 radix-ui 的 Dialog 原语（项目已有 radix-ui 依赖）。
//
// Props 透传给 ChampionPicker：选中态/收藏态由父组件管理。

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
}: ChampionPickerDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* 遮罩 */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        {/* 弹窗主体：居中 */}
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[640px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-airbnb">
          {/* 标题栏 */}
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

          {/* 内容区：英雄网格（可滚动） */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {champions.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-xs text-app-subtle">
                英雄列表加载中…若长时间无反应请重启应用
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

          {/* 底部：确定按钮 */}
          <div className="flex items-center justify-between border-t border-app-border bg-app-surface-soft px-5 py-3">
            <span className="text-[11px] text-app-subtle">点方案可一键套用，点格子选/取消</span>
            <Dialog.Close className="rounded-sm bg-app-primary px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-app-primary-hover">
              确定（{selectedIds.length}）
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
