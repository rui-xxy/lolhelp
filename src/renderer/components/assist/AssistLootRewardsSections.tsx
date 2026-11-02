import { useEffect, useMemo, useState } from 'react';
import { Gift, PackageOpen, RefreshCw } from 'lucide-react';
import type {
  AssistChampionShard,
  AssistClaimRewardRequest,
  AssistLootSummary,
  AssistRewardGrant,
} from '../../../shared/api';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  Btn,
  Empty,
  Panel,
  PanelBody,
} from './AssistControls';
import { localizeAssistMessage, rewardStatusLabel } from './assistText';

function resultMessage(results: { success: boolean; message: string }[]): string {
  if (results.length === 0) return '没有需要处理的项目';
  const successCount = results.filter((result) => result.success).length;
  const failed = results.filter((result) => !result.success);
  if (failed.length === 0) return `全部完成（${successCount} 项）`;
  return `完成 ${successCount}/${results.length} 项。没成功的：${failed
    .map((result) => localizeAssistMessage(result.message))
    .join('；')}`;
}

function rewardRequest(reward: AssistRewardGrant): AssistClaimRewardRequest {
  return {
    rewardId: reward.id,
    rewardGroupId: reward.rewardGroupId,
    selections: reward.rewards.map((item) => item.id),
  };
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

export function LootDisenchantSection({
  setOperationState,
}: {
  setOperationState: (message: string) => void;
}) {
  const [loot, setLoot] = useState<AssistLootSummary>({ championEssence: 0, shards: [] });
  const [selectedLootIds, setSelectedLootIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [disenchantConfirmation, setDisenchantConfirmation] = useState<AssistChampionShard[] | null>(null);

  const selectedShards = useMemo(
    () => loot.shards.filter((shard) => selectedLootIds.has(shard.lootId)),
    [loot.shards, selectedLootIds],
  );
  const shardTotal = loot.shards.reduce((sum, shard) => sum + shard.count, 0);
  const allValue = loot.shards.reduce((sum, shard) => sum + shard.count * shard.disenchantValue, 0);
  const selectedCount = selectedShards.reduce((sum, shard) => sum + shard.count, 0);
  const selectedValue = selectedShards.reduce((sum, shard) => sum + shard.count * shard.disenchantValue, 0);

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
      setOperationState(`读取英雄碎片失败：${localizeAssistMessage(String(error))}`);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggleShard = (lootId: string) => {
    setSelectedLootIds((current) => {
      const next = new Set(current);
      if (next.has(lootId)) next.delete(lootId);
      else next.add(lootId);
      return next;
    });
  };

  const allSelected = loot.shards.length > 0 && selectedLootIds.size === loot.shards.length;

  const performDisenchant = async () => {
    const shards = disenchantConfirmation ?? [];
    if (shards.length === 0) return;
    setLoading(true);
    try {
      const results = [];
      for (const shard of shards) {
        results.push(await window.lolHelper.assist.disenchantChampionShard({
          lootId: shard.lootId,
          count: shard.count,
        }));
      }
      setOperationState(resultMessage(results));
      setSelectedLootIds(new Set());
      setDisenchantConfirmation(null);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="as-stats">
        <div className="as-stat" data-tone="ok">
          <em>现有英雄精粹</em>
          <b>{formatNumber(loot.championEssence)}</b>
        </div>
        <div className="as-stat">
          <em>英雄碎片</em>
          <b>
            {loot.shards.length}
            <small>种 · 共 {shardTotal} 个</small>
          </b>
        </div>
        <div className="as-stat" data-tone="glow">
          <em>全部分解能拿到</em>
          <b>
            {formatNumber(allValue)}
            <small>精粹</small>
          </b>
        </div>
      </div>

      <Panel
        title="英雄碎片"
        count={loot.shards.length}
        extra={(
          <>
            {loot.shards.length > 0 && (
              <Btn size="sm" tone="ghost" onClick={() => setSelectedLootIds(allSelected ? new Set() : new Set(loot.shards.map((shard) => shard.lootId)))}>
                {allSelected ? '取消全选' : '全选'}
              </Btn>
            )}
            <Btn size="sm" onClick={() => void refresh()} busy={loading}>
              {!loading && <RefreshCw />}
              刷新
            </Btn>
          </>
        )}
      >
        {loot.shards.length === 0 ? (
          <Empty icon={<PackageOpen />} title={loading || !loaded ? '正在读取战利品…' : '暂无英雄碎片'} />
        ) : (
          <PanelBody>
            <div className="as-shards">
              {loot.shards.map((shard) => {
                const selected = selectedLootIds.has(shard.lootId);
                return (
                  <button
                    key={shard.lootId}
                    type="button"
                    className="as-shard"
                    aria-pressed={selected}
                    onClick={() => toggleShard(shard.lootId)}
                  >
                    {shard.icon ? <img src={shard.icon} alt="" loading="lazy" /> : <span className="as-pick__ph" />}
                    {shard.count > 1 && <span className="as-shard__count">×{shard.count}</span>}
                    <div style={{ minWidth: 0 }}>
                      <b>{shard.name}</b>
                      <span>分解得 {formatNumber(shard.disenchantValue * shard.count)}</span>
                    </div>
                    <span className="as-check" data-checked={selected ? 'true' : undefined} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </PanelBody>
        )}
        {selectedShards.length > 0 && (
          <div className="as-selection">
            <p>
              已选<b>{selectedShards.length}</b>种、<b>{selectedCount}</b>个碎片，分解后得到<b>{formatNumber(selectedValue)}</b>精粹
            </p>
            <Btn tone="ghost" onClick={() => setSelectedLootIds(new Set())}>取消选择</Btn>
            <Btn tone="danger" onClick={() => setDisenchantConfirmation(selectedShards)} disabled={loading}>
              分解这些碎片
            </Btn>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(disenchantConfirmation)}
        title="确认分解"
        description={disenchantConfirmation
          ? `将分解 ${disenchantConfirmation.length} 种、共 ${disenchantConfirmation.reduce((sum, shard) => sum + shard.count, 0)} 个英雄碎片，换成 ${formatNumber(disenchantConfirmation.reduce((sum, shard) => sum + shard.count * shard.disenchantValue, 0))} 精粹。分解后碎片就没了，不能撤回。`
          : ''}
        confirmLabel="确认分解"
        destructive
        busy={loading}
        onOpenChange={(open) => {
          if (!open) setDisenchantConfirmation(null);
        }}
        onConfirm={() => void performDisenchant()}
      />
    </>
  );
}

export function RewardsClaimSection({
  setOperationState,
}: {
  setOperationState: (message: string) => void;
}) {
  const [rewards, setRewards] = useState<AssistRewardGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busyRewardId, setBusyRewardId] = useState('');

  const claimableRewards = rewards.filter((reward) => reward.status === 'PENDING_SELECTION');
  const otherRewards = rewards.filter((reward) => reward.status !== 'PENDING_SELECTION');

  const refresh = async () => {
    setLoading(true);
    try {
      setRewards(await window.lolHelper.assist.getRewards());
    } catch (error) {
      setOperationState(`读取奖励失败：${localizeAssistMessage(String(error))}`);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const claimReward = async (reward: AssistRewardGrant) => {
    setBusyRewardId(reward.id);
    try {
      const result = await window.lolHelper.assist.claimReward(rewardRequest(reward));
      setOperationState(result.success ? `「${reward.title}」已领取` : localizeAssistMessage(result.message));
      await refresh();
    } finally {
      setBusyRewardId('');
    }
  };

  const claimAll = async () => {
    if (claimableRewards.length === 0) return;
    setLoading(true);
    try {
      const results = await window.lolHelper.assist.claimRewards(claimableRewards.map(rewardRequest));
      setOperationState(resultMessage(results));
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const renderReward = (reward: AssistRewardGrant) => {
    const claimable = reward.status === 'PENDING_SELECTION';
    return (
      <div key={reward.id} className="as-list-row" data-dim={claimable ? undefined : 'true'}>
        <span className="as-gift" aria-hidden="true"><Gift /></span>
        <div style={{ minWidth: 0 }}>
          <div className="as-list-row__title">{reward.title}</div>
          <div className="as-list-row__sub">
            {reward.rewards.length > 1
              ? `包含 ${reward.rewards.length} 样：${reward.rewards.map((item) => item.title).join('、')}`
              : rewardStatusLabel(reward.status)}
          </div>
        </div>
        {claimable ? (
          <Btn
            size="sm"
            tone="primary"
            busy={busyRewardId === reward.id}
            disabled={loading}
            onClick={() => void claimReward(reward)}
          >
            领取
          </Btn>
        ) : (
          <span className="as-status">{rewardStatusLabel(reward.status)}</span>
        )}
      </div>
    );
  };

  return (
    <Panel
      title="可以领取的奖励"
      count={claimableRewards.length}
      extra={(
        <>
          <Btn size="sm" onClick={() => void refresh()} busy={loading && !busyRewardId}>
            {!(loading && !busyRewardId) && <RefreshCw />}
            刷新
          </Btn>
          {claimableRewards.length > 0 && (
            <Btn size="sm" tone="primary" onClick={() => void claimAll()} disabled={loading}>
              全部领取
            </Btn>
          )}
        </>
      )}
    >
      {rewards.length === 0 ? (
        <Empty icon={<Gift />} title={loading || !loaded ? '正在读取奖励…' : '暂无可领取的奖励'} />
      ) : (
        <div className="as-list">
          {claimableRewards.map(renderReward)}
          {otherRewards.map(renderReward)}
        </div>
      )}
    </Panel>
  );
}
