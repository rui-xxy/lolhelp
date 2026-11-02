import { useMemo, useState } from 'react';
import { Eye, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import type {
  AssistOperationResult,
  AssistSettings,
  FriendInfo,
} from '../../../shared/api';
import {
  Btn,
  ChipChoices,
  Empty,
  Field,
  Panel,
  PanelBody,
  PanelFoot,
} from './AssistControls';
import { PRESENCE_OPTIONS, friendStatus, localizeAssistMessage } from './assistText';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;

type FriendFilter = 'all' | 'online' | 'game' | 'offline';

const SIGNATURE_LIMIT = 100;

function friendRiotId(friend: FriendInfo): string {
  return friend.gameTag ? `${friend.gameName}#${friend.gameTag}` : friend.gameName;
}

function friendGroup(friend: FriendInfo): string {
  const group = String(friend.groupName ?? '');
  if (!group || group.startsWith('**')) return '';
  return group;
}

export function FriendsSection({
  assist,
  updateAssist,
  runOperation,
  friends,
  selectedFriendIds,
  setSelectedFriendIds,
  refreshFriends,
  deleteSelectedFriends,
  setOperationState,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  runOperation: (
    operation: () => Promise<AssistOperationResult[]>,
  ) => Promise<void>;
  friends: FriendInfo[];
  selectedFriendIds: Set<string>;
  setSelectedFriendIds: (
    updater: (current: Set<string>) => Set<string>,
  ) => void;
  refreshFriends: () => Promise<void>;
  deleteSelectedFriends: () => void;
  setOperationState: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FriendFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const presence = PRESENCE_OPTIONS.find((option) => option.value === assist.preferredPresence) ?? PRESENCE_OPTIONS[0];

  const rows = useMemo(() => friends.map((friend) => ({ friend, status: friendStatus(friend) })), [friends]);
  const counts = useMemo(() => ({
    all: rows.length,
    online: rows.filter(({ status }) => status.tone !== 'muted').length,
    game: rows.filter(({ status }) => status.inGame).length,
    offline: rows.filter(({ status }) => status.tone === 'muted').length,
  }), [rows]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter(({ friend, status }) => {
      if (filter === 'online' && status.tone === 'muted') return false;
      if (filter === 'game' && !status.inGame) return false;
      if (filter === 'offline' && status.tone !== 'muted') return false;
      if (!keyword) return true;
      return [friend.gameName, friend.gameTag, friend.note, friendGroup(friend)]
        .some((text) => String(text ?? '').toLowerCase().includes(keyword));
    });
  }, [filter, query, rows]);

  const visibleIds = visible.map(({ friend }) => friend.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedFriendIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedFriendIds.has(id));

  return (
    <>
      <Panel title="我的在线状态">
        <PanelBody>
          <div className="as-fields">
            <Field label="显示为" hint={presence.hint} wide>
              <ChipChoices
                label="在线状态"
                value={presence.value}
                options={PRESENCE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: (
                    <>
                      <i className="as-dot" data-tone={option.tone === 'muted' ? undefined : option.tone} />
                      {option.label}
                    </>
                  ),
                }))}
                onChange={(value) => updateAssist((next) => ({ ...next, preferredPresence: value }))}
              />
            </Field>
            <Field label="个人签名" optional hint="显示在你名字下面，留空就不改。" wide>
              <div className="as-input-wrap">
                <input
                  className="as-input"
                  value={assist.statusMessage}
                  maxLength={SIGNATURE_LIMIT}
                  placeholder="例如：只玩大乱斗，来就开"
                  onChange={(event) => updateAssist((next) => ({ ...next, statusMessage: event.target.value }))}
                />
                <small>{assist.statusMessage.length}/{SIGNATURE_LIMIT}</small>
              </div>
            </Field>
          </div>
        </PanelBody>
        <PanelFoot>
          <Btn
            tone="primary"
            busy={applying}
            onClick={() => {
              setApplying(true);
              void runOperation(() => window.lolHelper.assist.applyAccountSettings())
                .finally(() => setApplying(false));
            }}
          >
            应用
          </Btn>
        </PanelFoot>
      </Panel>

      <Panel
        title="好友"
        count={friends.length}
        extra={(
          <Btn
            size="sm"
            busy={refreshing}
            onClick={() => {
              setRefreshing(true);
              void refreshFriends().finally(() => setRefreshing(false));
            }}
          >
            {!refreshing && <RefreshCw />}
            刷新
          </Btn>
        )}
      >
        <div className="as-toolbar">
          <div className="as-search">
            <Search />
            <input
              className="as-input"
              value={query}
              placeholder="搜名字、备注、分组"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ChipChoices<FriendFilter>
            label="筛选好友"
            value={filter}
            options={[
              { value: 'all', label: `全部 ${counts.all}` },
              { value: 'online', label: `在线 ${counts.online}` },
              { value: 'game', label: `游戏中 ${counts.game}` },
              { value: 'offline', label: `离线 ${counts.offline}` },
            ]}
            onChange={setFilter}
          />
        </div>

        {friends.length === 0 ? (
          <Empty icon={<Users />} title="还没读到好友">打开英雄联盟客户端后点「刷新」。</Empty>
        ) : visible.length === 0 ? (
          <Empty icon={<Search />} title="没有符合条件的好友">换个关键词或筛选试试。</Empty>
        ) : (
          <div className="as-friend-list">
            {visible.map(({ friend, status }) => {
              const riotId = friendRiotId(friend);
              const selected = selectedFriendIds.has(friend.id);
              const group = friendGroup(friend);
              return (
                <label key={friend.id} className="as-friend" data-selected={selected ? 'true' : undefined}>
                  <input
                    type="checkbox"
                    className="as-check"
                    checked={selected}
                    onChange={(event) => setSelectedFriendIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(friend.id);
                      else next.delete(friend.id);
                      return next;
                    })}
                  />
                  <span className="as-friend__avatar">
                    {friend.iconUrl ? <img src={friend.iconUrl} alt="" loading="lazy" /> : <span />}
                    <i className="as-dot" data-tone={status.tone === 'muted' ? undefined : status.tone} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="as-friend__name">
                      <b>{friend.note || friend.gameName || riotId}</b>
                      <small>{friend.note ? riotId : friend.gameTag ? `#${friend.gameTag}` : ''}</small>
                    </div>
                    <div className="as-friend__status">
                      <span>{status.text}</span>
                      {group && <span className="as-friend__group">{group}</span>}
                    </div>
                  </div>
                  {status.inGame ? (
                    <Btn
                      size="sm"
                      tone="ghost"
                      onClick={() => void window.lolHelper.lcu.spectateFriend(friend.puuid)
                        .then((result) => setOperationState(localizeAssistMessage(result.message)))}
                    >
                      <Eye />
                      观战
                    </Btn>
                  ) : <span />}
                </label>
              );
            })}
          </div>
        )}

        {friends.length > 0 && (
          <div className="as-selection">
            <label className="as-status" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="as-check"
                checked={allVisibleSelected}
                ref={(element) => {
                  if (element) element.indeterminate = !allVisibleSelected && someVisibleSelected;
                }}
                onChange={(event) => setSelectedFriendIds((current) => {
                  const next = new Set(current);
                  visibleIds.forEach((id) => {
                    if (event.target.checked) next.add(id);
                    else next.delete(id);
                  });
                  return next;
                })}
              />
              全选当前列表
            </label>
            <p>
              {selectedFriendIds.size > 0 && <>已选<b>{selectedFriendIds.size}</b>位好友</>}
            </p>
            {selectedFriendIds.size > 0 && (
              <Btn tone="ghost" onClick={() => setSelectedFriendIds(() => new Set())}>取消选择</Btn>
            )}
            <Btn tone="danger" onClick={deleteSelectedFriends} disabled={selectedFriendIds.size === 0}>
              <Trash2 />
              删除所选
            </Btn>
          </div>
        )}
      </Panel>
    </>
  );
}
