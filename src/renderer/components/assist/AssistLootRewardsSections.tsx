import { useEffect, useMemo, useState } from 'react';
import type {
  AssistChampionShard,
  AssistClaimRewardRequest,
  AssistLootSummary,
  AssistRewardGrant,
} from '../../../shared/api';
import {
  ActionButton,
  SettingCard,
} from './AssistControls';

function resultMessage(results: { success: boolean; message: string }[]): string {
  if (results.length === 0) return '没有需要执行的项目';
  const successCount = results.filter((result) => result.success).length;
  return `${successCount}/${results.length} 成功：${results
    .map((result) => `${result.success ? '✓' : '×'} ${result.message}`)
    .join('；')}`;
}

function rewardStatusLabel(status: string): string {
  if (status === 'PENDING_SELECTION') return '待领取';
  if (status === 'FULFILLED') return '已领取';
  return status || '未知';
}

function rewardRequest(reward: AssistRewardGrant): AssistClaimRewardRequest {
  return {
    rewardId: reward.id,
    rewardGroupId: reward.rewardGroupId,
    selections: reward.rewards.map((item) => item.id),
  };
}

export function LootDisenchantSection({
  setOperationState,
}: {
  setOperationState: (message: string) => void;
}) {
  const [loot, setLoot] = useState<AssistLootSummary>({ championEssence: 0, shards: [] });
  const [selectedLootIds, setSelectedLootIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyLootId, setBusyLootId] = useState('');

  const selectedShards = useMemo(
    () => loot.shards.filter((shard) => selectedLootIds.has(shard.lootId)),
    [loot.shards, selectedLootIds],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await window.lolHelper.assist.getLoot();
      setLoot(next);
      setSelectedLootIds((current) => {
        const validIds = new Set(next.shards.map((shard) => shard.lootId));
        return new Set([...current].filter((id) => validIds.has(id)));
      });
    } catch (error) {
      setOperationState(`碎片数据加载失败：${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggleShard = (lootId: string, checked: boolean) => {
    setSelectedLootIds((current) => {
      const next = new Set(current);
      if (checked) next.add(lootId);
      else next.delete(lootId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedLootIds(checked ? new Set(loot.shards.map((shard) => shard.lootId)) : new Set());
  };

  const disenchantShard = async (shard: AssistChampionShard) => {
    if (!window.confirm(`确定分解 ${shard.count} 个「${shard.name}」英雄碎片吗？`)) return;
    setBusyLootId(shard.lootId);
    try {
      const result = await window.lolHelper.assist.disenchantChampionShard({
        lootId: shard.lootId,
        count: shard.count,
      });
      setOperationState(result.message);
      await refresh();
    } finally {
      setBusyLootId('');
    }
  };

  const disenchantSelected = async () => {
    if (selectedShards.length === 0) {
      setOperationState('请先选择要分解的英雄碎片');
      return;
    }
    const totalCount = selectedShards.reduce((sum, shard) => sum + shard.count, 0);
    if (!window.confirm(`确定分解选中的 ${selectedShards.length} 种、共 ${totalCount} 个英雄碎片吗？`)) return;
    setLoading(true);
    try {
      const results = [];
      for (const shard of selectedShards) {
        results.push(await window.lolHelper.assist.disenchantChampionShard({
          lootId: shard.lootId,
          count: shard.count,
        }));
      }
      setOperationState(resultMessage(results));
      setSelectedLootIds(new Set());
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingCard
      title="碎片分解"
      description="读取战利品里的英雄碎片，可单个分解，也可以勾选后批量分解。分解会直接消耗碎片，请确认后再操作。"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm text-app-body">
          当前精粹：<span className="font-semibold text-green-600">{loot.championEssence}</span>
        </div>
        <ActionButton onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新数据'}
        </ActionButton>
        <button
          type="button"
          onClick={() => void disenchantSelected()}
          disabled={selectedShards.length === 0 || loading}
          className="rounded-sm border border-app-danger px-4 py-2 text-xs font-semibold text-app-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          分解选中
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-app-border">
        <div className="grid grid-cols-[36px_minmax(170px,1fr)_90px_110px_110px_92px] border-b border-app-border bg-app-bg-soft px-3 py-2 text-xs font-semibold text-app-muted">
          <input
            type="checkbox"
            checked={loot.shards.length > 0 && selectedLootIds.size === loot.shards.length}
            onChange={(event) => toggleAll(event.target.checked)}
            aria-label="选择全部英雄碎片"
          />
          <span>英雄碎片</span>
          <span className="text-center">碎片数量</span>
          <span className="text-center">碎片价值</span>
          <span className="text-center">分解价值</span>
          <span className="text-center">操作</span>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {loot.shards.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-app-muted">
              {loading ? '正在加载碎片...' : '没有可分解的英雄碎片'}
            </div>
          ) : (
            loot.shards.map((shard) => (
              <div
                key={shard.lootId}
                className="grid grid-cols-[36px_minmax(170px,1fr)_90px_110px_110px_92px] items-center border-b border-app-border/70 px-3 py-2 text-sm last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedLootIds.has(shard.lootId)}
                  onChange={(event) => toggleShard(shard.lootId, event.target.checked)}
                  aria-label={`选择 ${shard.name}`}
                />
                <div className="flex min-w-0 items-center gap-2">
                  {shard.icon && (
                    <img
                      src={shard.icon}
                      alt={shard.name}
                      className="size-8 rounded-sm border border-app-border object-cover"
                    />
                  )}
                  <span className="truncate text-app-text">{shard.name}</span>
                </div>
                <span className="text-center tabular-nums">{shard.count}</span>
                <span className="text-center tabular-nums">{shard.value}</span>
                <span className="text-center tabular-nums">{shard.disenchantValue}</span>
                <button
                  type="button"
                  onClick={() => void disenchantShard(shard)}
                  disabled={loading || busyLootId === shard.lootId}
                  className="justify-self-center rounded-xs border border-app-danger px-3 py-1 text-xs font-semibold text-app-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyLootId === shard.lootId ? '分解中' : '分解'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </SettingCard>
  );
}

export function RewardsClaimSection({
  setOperationState,
}: {
  setOperationState: (message: string) => void;
}) {
  const [rewards, setRewards] = useState<AssistRewardGrant[]>([]);
  const [selectedRewardIds, setSelectedRewardIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyRewardId, setBusyRewardId] = useState('');

  const claimableRewards = rewards.filter((reward) => reward.status === 'PENDING_SELECTION');
  const selectedRewards = rewards.filter((reward) => selectedRewardIds.has(reward.id));

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await window.lolHelper.assist.getRewards();
      setRewards(next);
      setSelectedRewardIds((current) => {
        const claimableIds = new Set(
          next
            .filter((reward) => reward.status === 'PENDING_SELECTION')
            .map((reward) => reward.id),
        );
        return new Set([...current].filter((id) => claimableIds.has(id)));
      });
    } catch (error) {
      setOperationState(`奖励数据加载失败：${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggleReward = (reward: AssistRewardGrant, checked: boolean) => {
    if (reward.status !== 'PENDING_SELECTION') return;
    setSelectedRewardIds((current) => {
      const next = new Set(current);
      if (checked) next.add(reward.id);
      else next.delete(reward.id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedRewardIds(checked ? new Set(claimableRewards.map((reward) => reward.id)) : new Set());
  };

  const claimReward = async (reward: AssistRewardGrant) => {
    if (reward.status !== 'PENDING_SELECTION') {
      setOperationState('这个奖励已经领取过了');
      return;
    }
    setBusyRewardId(reward.id);
    try {
      const result = await window.lolHelper.assist.claimReward(rewardRequest(reward));
      setOperationState(result.message);
      await refresh();
    } finally {
      setBusyRewardId('');
    }
  };

  const claimSelected = async () => {
    const requests = selectedRewards
      .filter((reward) => reward.status === 'PENDING_SELECTION')
      .map(rewardRequest);
    if (requests.length === 0) {
      setOperationState('请先选择待领取奖励');
      return;
    }
    setLoading(true);
    try {
      const results = await window.lolHelper.assist.claimRewards(requests);
      setOperationState(resultMessage(results));
      setSelectedRewardIds(new Set());
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingCard
      title="奖励获取"
      description="读取客户端待领取奖励，可单个领取，也可以勾选后批量领取。"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm text-app-body">
          待领取：<span className="font-semibold text-app-primary">{claimableRewards.length}</span>
        </div>
        <ActionButton onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新数据'}
        </ActionButton>
        <button
          type="button"
          onClick={() => void claimSelected()}
          disabled={selectedRewards.length === 0 || loading}
          className="rounded-sm border border-green-500 px-4 py-2 text-xs font-semibold text-green-600 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          领取选中
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border border-app-border">
        <div className="grid grid-cols-[36px_minmax(240px,1fr)_120px_92px] border-b border-app-border bg-app-bg-soft px-3 py-2 text-xs font-semibold text-app-muted">
          <input
            type="checkbox"
            checked={claimableRewards.length > 0 && selectedRewardIds.size === claimableRewards.length}
            onChange={(event) => toggleAll(event.target.checked)}
            aria-label="选择全部待领取奖励"
          />
          <span>可获取奖励</span>
          <span className="text-center">奖励状态</span>
          <span className="text-center">操作</span>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {rewards.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-app-muted">
              {loading ? '正在加载奖励...' : '没有待展示的奖励'}
            </div>
          ) : (
            rewards.map((reward) => {
              const claimable = reward.status === 'PENDING_SELECTION';
              return (
                <div
                  key={reward.id}
                  className={`grid grid-cols-[36px_minmax(240px,1fr)_120px_92px] items-center border-b border-app-border/70 px-3 py-2 text-sm last:border-b-0 ${
                    claimable ? '' : 'opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedRewardIds.has(reward.id)}
                    disabled={!claimable}
                    onChange={(event) => toggleReward(reward, event.target.checked)}
                    aria-label={`选择 ${reward.title}`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-app-text">{reward.title}</div>
                    {reward.rewards.length > 1 && (
                      <div className="mt-0.5 truncate text-[11px] text-app-muted">
                        {reward.rewards.map((item) => item.title).join('、')}
                      </div>
                    )}
                  </div>
                  <span className="text-center text-xs text-app-muted">
                    {rewardStatusLabel(reward.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void claimReward(reward)}
                    disabled={!claimable || loading || busyRewardId === reward.id}
                    className="justify-self-center rounded-xs border border-app-primary px-3 py-1 text-xs font-semibold text-app-primary hover:bg-app-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyRewardId === reward.id ? '领取中' : '领取'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </SettingCard>
  );
}
