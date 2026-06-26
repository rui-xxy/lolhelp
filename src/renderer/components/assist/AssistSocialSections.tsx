import type {
  AssistOperationResult,
  AssistSettings,
  FriendInfo,
} from '../../../shared/api';
import {
  ActionButton,
  SelectInput,
  SettingCard,
  TextInput,
} from './AssistControls';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;

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
  deleteSelectedFriends: () => Promise<void>;
  setOperationState: (message: string) => void;
}) {
  return (
    <>
      <SettingCard
        title="好友展示设置"
        description="好友列表仍在右侧常驻，这里控制你自己的在线展示。"
      >
        <div className="grid grid-cols-[160px_1fr] items-center gap-3">
          <span className="text-sm text-app-body">在线状态</span>
          <SelectInput
            value={assist.preferredPresence}
            options={[
              ['auto', '跟随客户端'],
              ['chat', '在线'],
              ['away', '离开'],
              ['dnd', '游戏中 / 请勿打扰'],
              ['offline', '离线'],
            ]}
            onChange={(value) => updateAssist((next) => ({
              ...next,
              preferredPresence: value,
            }))}
          />
        </div>
        <div className="grid grid-cols-[160px_1fr] items-center gap-3">
          <span className="text-sm text-app-body">个人签名</span>
          <TextInput
            value={assist.statusMessage}
            placeholder="最长 100 字"
            onChange={(value) => updateAssist((next) => ({
              ...next,
              statusMessage: value,
            }))}
          />
        </div>
        <ActionButton
          onClick={() => void runOperation(() =>
            window.lolHelper.assist.applyAccountSettings())}
        >
          立即应用在线状态和签名
        </ActionButton>
      </SettingCard>

      <SettingCard
        title={`好友管理（${friends.length}）`}
        description="可查看状态、观战游戏中的好友，或批量删除。"
      >
        <div className="flex gap-2">
          <ActionButton onClick={() => void refreshFriends()}>刷新好友</ActionButton>
          <button
            type="button"
            onClick={() => void deleteSelectedFriends()}
            className="rounded-sm border border-app-danger px-4 py-2 text-xs font-semibold text-app-danger hover:bg-red-50"
          >
            删除选中
          </button>
        </div>
        <div className="grid max-h-[360px] gap-2 overflow-y-auto md:grid-cols-2">
          {friends.map((friend) => {
            const riotId = friend.gameTag
              ? `${friend.gameName}#${friend.gameTag}`
              : friend.gameName;
            return (
              <div
                key={friend.id}
                className="flex items-center gap-2 rounded-sm border border-app-border bg-app-bg-soft p-2"
              >
                <input
                  type="checkbox"
                  checked={selectedFriendIds.has(friend.id)}
                  onChange={(event) => setSelectedFriendIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(friend.id);
                    else next.delete(friend.id);
                    return next;
                  })}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-app-text">
                    {friend.note || riotId}
                  </div>
                  <div className="truncate text-[11px] text-app-muted">
                    {friend.lol?.gameQueueName || friend.lol?.gameStatus || friend.availability}
                  </div>
                </div>
                {friend.lol?.gameStatus === 'inGame' && (
                  <button
                    type="button"
                    onClick={() => void window.lolHelper.lcu.spectateFriend(friend.puuid)
                      .then((result) => setOperationState(result.message))}
                    className="text-[11px] font-medium text-app-link"
                  >
                    观战
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SettingCard>
    </>
  );
}
