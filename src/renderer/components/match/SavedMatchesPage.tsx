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
  return `${matches.length} 场 · ${wins}胜 ${losses}负`;
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
      <div className="saved-matches-empty">
        <div className="saved-empty-card">
          <div className="saved-empty-title">还没有保存的战绩</div>
          <div className="saved-empty-copy">
            去“战绩”页点击保存战绩，勾选想留下的对局后保存，就会出现在这里。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-matches-page">
      <aside className="saved-accounts-pane">
        <div className="saved-pane-title">
          <span>战绩保存</span>
          <small>{accounts.length} 个账号</small>
        </div>

        <div className="saved-account-list">
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
                className={`saved-account-card ${active ? 'saved-account-card--active' : ''}`}
              >
                <ProfileIcon
                  iconId={account.profile.profileIconId}
                  src={account.profile.profileIconUrl}
                  alt={getDisplayName(account.profile.riotId)}
                  size={34}
                  className="saved-account-avatar"
                />
                <span className="saved-account-main">
                  <span className="saved-account-name">{getDisplayName(account.profile.riotId)}</span>
                  <span className="saved-account-meta">{getAccountSummary(account.matches)}</span>
                </span>
                <span className="saved-account-date">{formatSavedAt(account.updatedAt)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <aside className="saved-match-pane">
        {selectedAccount && (
          <div className="saved-player-card">
            <ProfileIcon
              iconId={selectedAccount.profile.profileIconId}
              src={selectedAccount.profile.profileIconUrl}
              alt={getDisplayName(selectedAccount.profile.riotId)}
              size={42}
              className="saved-player-avatar"
            />
            <div className="saved-player-main">
              <div className="saved-player-name">{getDisplayName(selectedAccount.profile.riotId)}</div>
              <div className="saved-player-meta">{getAccountSummary(selectedAccount.matches)}</div>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteAccount(selectedAccount.id)}
              className="saved-icon-button"
              title="删除这个账号的保存战绩"
              aria-label="删除这个账号的保存战绩"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}

        <div className="saved-match-list">
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

      <main className="saved-detail-pane">
        {selectedMatch && selectedAccount ? (
          <>
            <div className="saved-detail-toolbar">
              <div className="saved-detail-info">
                <span>{selectedMatch.queueName}</span>
                <small>保存于 {formatSavedAt(selectedAccount.updatedAt)}</small>
              </div>
              <button type="button" onClick={handleDeleteMatch} className="saved-delete-match-button">
                删除这场
              </button>
            </div>
            <MatchDetail
              match={selectedMatch}
              targetPuuid={selectedAccount.profile.puuid}
              recurringMates={recurringMates}
              onPlayerSearch={onPlayerSearch}
            />
          </>
        ) : (
          <div className="saved-detail-empty">选择一场保存的战绩查看详情</div>
        )}
      </main>
    </div>
  );
}
