import { useEffect, useState } from 'react';
import { BookmarkCheck, X } from 'lucide-react';
import type { PlayerMatchDetail } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import {
  loadSavedMatchAccounts,
  SAVED_MATCHES_CHANGED_EVENT,
  type SavedMatchAccount,
} from './savedMatchesStore';

interface SavedMatchPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (account: SavedMatchAccount) => void;
}

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
}

function getAccountSummary(matches: PlayerMatchDetail[]): string {
  const wins = matches.filter((match) => match.win).length;
  const losses = matches.length - wins;
  return `${matches.length} 场 · ${wins}胜 ${losses}负`;
}

function formatSavedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '--';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SavedMatchPickerDialog({ open, onClose, onSelect }: SavedMatchPickerDialogProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccount[]>([]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setAccounts(loadSavedMatchAccounts());
    refresh();
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/10 pt-14 pr-[154px] [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-[342px] overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-airbnb">
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-app-primary-soft text-app-primary">
              <BookmarkCheck className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-app-text">保存的战绩</div>
              <div className="mt-0.5 text-[11px] text-app-muted">选择账号后在战绩页打开</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-app-subtle transition-colors hover:bg-app-surface-soft hover:text-app-text"
            title="关闭"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2">
          {accounts.length > 0 ? (
            accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  onSelect(account);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-app-surface-soft"
              >
                <ProfileIcon
                  iconId={account.profile.profileIconId}
                  src={account.profile.profileIconUrl}
                  alt={getDisplayName(account.profile.riotId)}
                  size={34}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-app-text">
                    {getDisplayName(account.profile.riotId)}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-app-muted">
                    {getAccountSummary(account.matches)}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-app-subtle">{formatSavedAt(account.updatedAt)}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <div className="text-sm font-semibold text-app-text">还没有保存的战绩</div>
              <div className="mt-2 text-xs leading-5 text-app-muted">
                去战绩页点击“保存战绩”，勾选对局后保存。
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
