import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { PlayerMatchDetail } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { MatchDetail } from './MatchDetail';
import { MatchList, type RecurringMate } from './MatchList';
import {
  deleteSavedMatch,
  deleteSavedMatchAccount,
  loadSavedMatchAccounts,
  SAVED_MATCHES_CHANGED_EVENT,
  type SavedMatchAccount,
} from './savedMatchesStore';

interface SavedMatchesPageProps {
  onPlayerSearch?: (name: string) => void;
}

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
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

function getAccountSummary(matches: PlayerMatchDetail[]): string {
  const wins = matches.filter((match) => match.win).length;
  const losses = matches.length - wins;
  return `${matches.length} 场 · ${wins}胜 ${losses}败`;
}

function emptyRecurringMates(): Map<string, RecurringMate> {
  return new Map<string, RecurringMate>();
}

export function SavedMatchesPage({ onPlayerSearch }: SavedMatchesPageProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccount[]>(() => loadSavedMatchAccounts());
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(accounts[0]?.matches[0]?.gameId ?? null);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null;
  const selectedMatch =
    selectedAccount?.matches.find((match) => match.gameId === selectedGameId) ??
    selectedAccount?.matches[0] ??
    null;

  useEffect(() => {
    const refresh = () => {
      const nextAccounts = loadSavedMatchAccounts();
      setAccounts(nextAccounts);
      setSelectedAccountId((current) => {
        if (current && nextAccounts.some((account) => account.id === current)) return current;
        return nextAccounts[0]?.id ?? null;
      });
    };

    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    if (!selectedAccount) {
      setSelectedGameId(null);
      return;
    }
    if (!selectedGameId || !selectedAccount.matches.some((match) => match.gameId === selectedGameId)) {
      setSelectedGameId(selectedAccount.matches[0]?.gameId ?? null);
    }
  }, [selectedAccount, selectedGameId]);

  const recurringMates = useMemo(emptyRecurringMates, []);

  const handleDeleteAccount = (accountId: string) => {
    const nextAccounts = deleteSavedMatchAccount(accountId);
    setAccounts(nextAccounts);
    setSelectedAccountId((current) => {
      if (current !== accountId) return current;
      return nextAccounts[0]?.id ?? null;
    });
  };

  const handleDeleteMatch = () => {
    if (!selectedAccount || !selectedMatch) return;
    const nextAccounts = deleteSavedMatch(selectedAccount.id, selectedMatch.gameId);
    setAccounts(nextAccounts);
    const nextAccount = nextAccounts.find((account) => account.id === selectedAccount.id) ?? nextAccounts[0] ?? null;
    setSelectedAccountId(nextAccount?.id ?? null);
    setSelectedGameId(nextAccount?.matches[0]?.gameId ?? null);
  };

  if (accounts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-app-bg-soft p-8">
        <div className="rounded-sm border border-dashed border-app-border bg-app-surface px-8 py-10 text-center shadow-airbnb">
          <div className="text-sm font-semibold text-app-text">还没有保存的战绩</div>
          <div className="mt-2 max-w-sm text-xs leading-5 text-app-muted">
            去“战绩”页点击保存战绩，勾选想留下的对局后保存，就会出现在这里。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-app-bg-soft">
      <aside className="flex w-[250px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
        <div className="shrink-0 border-b border-app-border px-3 py-2">
          <div className="text-sm font-semibold text-app-text">战绩保存</div>
          <div className="mt-1 text-[11px] text-app-muted">{accounts.length} 个账号</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {accounts.map((account) => {
            const active = account.id === selectedAccount?.id;
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  setSelectedAccountId(account.id);
                  setSelectedGameId(account.matches[0]?.gameId ?? null);
                }}
                className={`group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors ${
                  active ? 'bg-app-surface text-app-text shadow-airbnb' : 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
                }`}
              >
                <ProfileIcon
                  iconId={account.profile.profileIconId}
                  src={account.profile.profileIconUrl}
                  alt={getDisplayName(account.profile.riotId)}
                  size={30}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{getDisplayName(account.profile.riotId)}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-app-subtle">
                    {getAccountSummary(account.matches)}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-app-subtle">{formatSavedAt(account.updatedAt)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <aside className="flex w-[300px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
        <div className="flex shrink-0 items-center justify-between border-b border-app-border px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-app-text">
              {selectedAccount ? getDisplayName(selectedAccount.profile.riotId) : '保存战绩'}
            </div>
            <div className="mt-0.5 text-[10px] text-app-muted">
              {selectedAccount ? getAccountSummary(selectedAccount.matches) : '--'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => selectedAccount && handleDeleteAccount(selectedAccount.id)}
            disabled={!selectedAccount}
            className="flex size-7 items-center justify-center rounded-xs text-app-subtle transition-colors enabled:hover:bg-app-danger/10 enabled:hover:text-app-danger disabled:opacity-40"
            title="删除这个账号的保存战绩"
            aria-label="删除这个账号的保存战绩"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-2.5">
          {selectedAccount && (
            <MatchList
              matches={selectedAccount.matches}
              selectedGameId={selectedMatch?.gameId ?? null}
              onSelect={setSelectedGameId}
              recurringMates={recurringMates}
              targetPuuid={selectedAccount.profile.puuid}
              onMateClick={(riotId) => onPlayerSearch?.(riotId)}
            />
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-5">
        {selectedMatch && selectedAccount ? (
          <div className="flex min-h-full flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between rounded-sm bg-app-surface px-3 py-2 shadow-airbnb">
              <div className="min-w-0 text-xs text-app-muted">
                已保存于 {formatSavedAt(selectedAccount.updatedAt)}
              </div>
              <button
                type="button"
                onClick={handleDeleteMatch}
                className="rounded-xs px-2 py-1 text-xs text-app-danger transition-colors hover:bg-app-danger/10"
              >
                删除这场
              </button>
            </div>
            <MatchDetail
              match={selectedMatch}
              targetPuuid={selectedAccount.profile.puuid}
              recurringMates={recurringMates}
              onPlayerSearch={onPlayerSearch}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-sm border border-dashed border-app-border bg-app-surface text-xs text-app-subtle">
            选择一场保存的战绩查看详情
          </div>
        )}
      </main>
    </div>
  );
}
