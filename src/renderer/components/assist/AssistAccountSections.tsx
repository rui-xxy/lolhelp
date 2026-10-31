import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, Download, Pencil, Search, ShieldAlert, Trash2 } from 'lucide-react';
import type {
  AppSettings,
  AssistOperationResult,
  AssistSettings,
  ChampionSummary,
} from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { getRankEmblemUrl } from '../RankEmblem';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { SwitchControl } from '../settings/SettingsControls';
import {
  Btn,
  ChipChoices,
  Empty,
  Field,
  Panel,
  PanelBody,
  PanelFoot,
  TextInput,
} from './AssistControls';
import {
  APEX_TIERS,
  DIVISIONS,
  RANK_QUEUES,
  TIER_OPTIONS,
  queueLabel,
  tierLabel,
} from './assistText';
import { championDisplayName } from './AssistChampionPicker';
import { backgroundSkinId, skinSplashSources } from './AssistSkinPicker';

type UpdateAssist = (updater: (assist: AssistSettings) => AssistSettings) => void;
type UpdateBoolean = (key: keyof AssistSettings, value: boolean) => void;

export interface BlacklistDraft {
  riotId: string;
  region: string;
  tags: string;
  description: string;
}

const EMPTY_DRAFT: BlacklistDraft = { riotId: '', region: '', tags: '常见', description: '' };

// 多张图叠在一起当背景：前面的图挂了（透明），后面的就露出来。
function layeredBackground(urls: string[]): string | undefined {
  if (urls.length === 0) return undefined;
  return urls.map((url) => `url("${url}")`).join(', ');
}

// 读出背景皮肤的名字，例如「星之守护者」；读不到就只显示英雄名。
function useSkinName(skinId: number): string {
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const championId = Math.floor(skinId / 1000);
  useEffect(() => {
    if (skinId <= 0 || names.has(skinId) || typeof window.lolHelper.assist.getChampionSkins !== 'function') return undefined;
    let cancelled = false;
    window.lolHelper.assist.getChampionSkins(championId)
      .then((skins) => {
        if (cancelled) return;
        setNames((current) => {
          const next = new Map(current);
          skins.forEach((skin) => next.set(skin.id, skin.name));
          if (!next.has(skinId)) next.set(skinId, '');
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setNames((current) => new Map(current).set(skinId, ''));
      });
    return () => {
      cancelled = true;
    };
  }, [championId, names, skinId]);
  return names.get(skinId) ?? '';
}

function SwitchLine({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="as-switch-line">
      <div>
        <b>{title}</b>
        <span>{description}</span>
      </div>
      <SwitchControl checked={checked} onChange={onChange} />
    </div>
  );
}

export function AccountSection({
  assist,
  updateAssist,
  updateBoolean,
  openProfileIconPicker,
  openSkinPicker,
  championMap,
  runOperation,
}: {
  assist: AssistSettings;
  updateAssist: UpdateAssist;
  updateBoolean: UpdateBoolean;
  openProfileIconPicker: () => Promise<void>;
  openSkinPicker: () => void;
  championMap: Map<number, ChampionSummary>;
  runOperation: (
    operation: () => Promise<AssistOperationResult[]>,
  ) => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const skinId = backgroundSkinId(assist.profileBackgroundChampionId);
  const backgroundChampion = skinId > 0 ? championMap.get(Math.floor(skinId / 1000)) : undefined;
  const skinName = useSkinName(skinId);
  const splash = layeredBackground(skinSplashSources(skinId));
  const backgroundLabel = skinId <= 0
    ? '还没选'
    : [backgroundChampion ? championDisplayName(backgroundChampion) : '', skinName && skinName !== '经典' ? skinName : '']
      .filter(Boolean).join(' · ') || `皮肤 ${skinId}`;
  const apex = APEX_TIERS.has(assist.spoofRankTier);
  const rankText = `${tierLabel(assist.spoofRankTier)}${apex ? '' : ` ${assist.spoofRankDivision}`}`;

  return (
    <Panel
      title="别人看到的你"
      description="左边是好友打开你资料时大致会看到的样子。这里只改展示，不会改动真实段位和战绩。"
    >
      <div className="as-profile">
        <div
          className="as-profile__card"
          style={{ '--as-splash': splash } as CSSProperties}
        >
          <span className="as-profile__bg" aria-hidden="true" />
          <span className="as-profile__label">预览</span>
          {assist.profileIconId > 0
            ? <ProfileIcon className="as-profile__avatar" iconId={assist.profileIconId} alt="当前头像" size={88} />
            : <span className="as-profile__avatar" aria-hidden="true" />}
          <div className="as-profile__rank" data-off={assist.spoofRankEnabled ? undefined : 'true'}>
            <img src={getRankEmblemUrl(assist.spoofRankTier)} alt="" />
            <b>{assist.spoofRankEnabled ? rankText : '显示真实段位'}</b>
            <span>{assist.spoofRankEnabled ? queueLabel(assist.spoofRankQueue) : '展示段位已关闭'}</span>
          </div>
        </div>

        <div className="as-profile__controls">
          <section>
            <SwitchLine
              title="展示一个段位"
              description="好友列表和资料卡上显示你选的段位"
              checked={assist.spoofRankEnabled}
              onChange={(value) => updateBoolean('spoofRankEnabled', value)}
            />
            {assist.spoofRankEnabled && (
              <>
                <div style={{ marginTop: 12 }}>
                  <ChipChoices
                    label="展示哪个队列"
                    value={assist.spoofRankQueue}
                    options={RANK_QUEUES.map((queue) => ({ value: queue.value, label: queue.label }))}
                    onChange={(value) => updateAssist((next) => ({ ...next, spoofRankQueue: value }))}
                  />
                </div>
                <div className="as-tiers" role="radiogroup" aria-label="段位">
                  {TIER_OPTIONS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      role="radio"
                      aria-checked={assist.spoofRankTier === tier.value}
                      className="as-tier"
                      onClick={() => updateAssist((next) => ({ ...next, spoofRankTier: tier.value }))}
                    >
                      <img src={getRankEmblemUrl(tier.value)} alt="" loading="lazy" />
                      {tier.short}
                    </button>
                  ))}
                </div>
                {!apex && (
                  <div style={{ marginTop: 10 }}>
                    <ChipChoices
                      label="小段"
                      value={assist.spoofRankDivision}
                      options={DIVISIONS.map((division) => ({ value: division, label: division }))}
                      onChange={(value) => updateAssist((next) => ({ ...next, spoofRankDivision: value }))}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <h4>头像和生涯背景</h4>
            <div className="as-picks">
              <button type="button" className="as-pick" onClick={() => void openProfileIconPicker()}>
                {assist.profileIconId > 0
                  ? <ProfileIcon className="as-pick__icon" iconId={assist.profileIconId} alt="" size={40} />
                  : <span className="as-pick__ph" />}
                <div>
                  <b>召唤师头像</b>
                  <span>{assist.profileIconId > 0 ? `头像 ${assist.profileIconId}` : '还没选'}</span>
                </div>
                <ChevronRight />
              </button>
              <button type="button" className="as-pick" onClick={openSkinPicker}>
                {splash
                  ? <span className="as-pick__splash" style={{ backgroundImage: splash }} aria-hidden="true" />
                  : <span className="as-pick__ph as-pick__ph--wide" />}
                <div>
                  <b>生涯背景</b>
                  <span title={backgroundLabel}>{backgroundLabel}</span>
                </div>
                <ChevronRight />
              </button>
            </div>
          </section>

          <section>
            <h4>装饰</h4>
            <SwitchLine
              title="卸下所有徽章"
              description="生涯页上不显示任何徽章"
              checked={assist.removeTokens}
              onChange={(value) => updateBoolean('removeTokens', value)}
            />
            <SwitchLine
              title="卸下至尊头像框"
              description="头像外圈不显示至尊边框"
              checked={assist.removePrestigeCrest}
              onChange={(value) => updateBoolean('removePrestigeCrest', value)}
            />
          </section>
        </div>
      </div>
      <PanelFoot note="上面的选择会自动记住；点「应用到客户端」之后，客户端里才会真的变过来。">
        <Btn
          tone="primary"
          busy={applying}
          onClick={() => {
            setApplying(true);
            void runOperation(() => window.lolHelper.assist.applyAccountSettings())
              .finally(() => setApplying(false));
          }}
        >
          应用到客户端
        </Btn>
      </PanelFoot>
    </Panel>
  );
}

const QUICK_TAGS = ['常见', '挂机', '演员', '喷子', '送人头', '坑队友', '开挂嫌疑', '大神'];

function splitTags(tags: string): string[] {
  return tags.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
}

function formatDate(time: number): string {
  if (!time) return '';
  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function BlacklistSection({
  blacklistDraft,
  setBlacklistDraft,
  editingBlacklistId,
  addBlacklistEntry,
  settings,
  persist,
  setOperationState,
  onPlayerSearch,
  setEditingBlacklistId,
}: {
  blacklistDraft: BlacklistDraft;
  setBlacklistDraft: (
    updater: (draft: BlacklistDraft) => BlacklistDraft,
  ) => void;
  editingBlacklistId: string;
  addBlacklistEntry: () => void;
  settings: AppSettings;
  persist: (next: AppSettings) => void;
  setOperationState: (message: string) => void;
  onPlayerSearch?: (riotId: string, region?: string) => void;
  setEditingBlacklistId: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [removeId, setRemoveId] = useState('');
  const draftTags = splitTags(blacklistDraft.tags);
  const editing = settings.blacklist.find((entry) => entry.id === editingBlacklistId);
  const removing = settings.blacklist.find((entry) => entry.id === removeId);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return settings.blacklist;
    return settings.blacklist.filter((entry) => [entry.riotId, entry.region, entry.description, ...entry.tags]
      .some((text) => text.toLowerCase().includes(keyword)));
  }, [query, settings.blacklist]);

  const toggleTag = (tag: string) => {
    setBlacklistDraft((draft) => {
      const tags = splitTags(draft.tags);
      const next = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
      return { ...draft, tags: next.join('，') };
    });
  };

  const cancelEdit = () => {
    setEditingBlacklistId('');
    setBlacklistDraft(() => EMPTY_DRAFT);
  };

  return (
    <>
      <Panel
        title={editing ? `修改「${editing.riotId}」` : '记下一个玩家'}
        description="碰到坑过你的人就记一笔：贴上标签、写下发生了什么，以后想查他，点「查战绩」就行。"
      >
        <PanelBody>
          <div className="as-fields">
            <Field label="玩家" hint="编号就是名字后面那串数字，在战绩页、对局页都能看到。">
              <TextInput
                value={blacklistDraft.riotId}
                placeholder="游戏名#编号"
                onChange={(value) => setBlacklistDraft((draft) => ({ ...draft, riotId: value }))}
                onEnter={addBlacklistEntry}
              />
            </Field>
            <Field label="大区" optional hint="不填也行，查战绩时用当前大区。">
              <TextInput
                value={blacklistDraft.region}
                placeholder="例如 艾欧尼亚"
                onChange={(value) => setBlacklistDraft((draft) => ({ ...draft, region: value }))}
              />
            </Field>
            <Field label="标签" hint="点选常用的，也可以在下面自己写，用逗号隔开。" wide>
              <div className="as-chips" style={{ marginBottom: 8 }}>
                {QUICK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="as-chip"
                    aria-pressed={draftTags.includes(tag)}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <TextInput
                value={blacklistDraft.tags}
                placeholder="自定义标签，用逗号隔开"
                onChange={(value) => setBlacklistDraft((draft) => ({ ...draft, tags: value }))}
              />
            </Field>
            <Field label="发生了什么" optional wide>
              <textarea
                className="as-input as-input--area"
                value={blacklistDraft.description}
                placeholder="例如：中路 3 分钟送了 4 个，开局就挂机"
                onChange={(event) => setBlacklistDraft((draft) => ({
                  ...draft,
                  description: event.target.value,
                }))}
              />
            </Field>
          </div>
        </PanelBody>
        <PanelFoot note={editing ? '改完点保存，原来的记录会被更新。' : '保存后会出现在下面的列表里。'}>
          {editing && <Btn tone="ghost" onClick={cancelEdit}>取消修改</Btn>}
          <Btn tone="primary" onClick={addBlacklistEntry} disabled={!blacklistDraft.riotId.trim()}>
            {editing ? '保存修改' : '加入黑名单'}
          </Btn>
        </PanelFoot>
      </Panel>

      <Panel
        title="黑名单"
        count={settings.blacklist.length}
        extra={settings.blacklist.length > 0 && (
          <>
            <Btn
              size="sm"
              onClick={() => void window.lolHelper.assist.exportBlacklist()
                .then((file) => setOperationState(file ? `已导出到 ${file}` : '已取消导出'))}
            >
              <Download />
              导出
            </Btn>
            <Btn size="sm" tone="danger" onClick={() => setClearOpen(true)}>
              <Trash2 />
              清空
            </Btn>
          </>
        )}
      >
        {settings.blacklist.length > 0 && (
          <div className="as-toolbar">
            <div className="as-search">
              <Search />
              <input
                className="as-input"
                value={query}
                placeholder="搜名字、标签、备注"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {query && <span className="as-toolbar__note">找到 {visible.length} 个</span>}
          </div>
        )}
        {settings.blacklist.length === 0 ? (
          <Empty icon={<ShieldAlert />} title="黑名单还是空的">
            在上面记下第一个玩家。
          </Empty>
        ) : visible.length === 0 ? (
          <Empty icon={<Search />} title="没有找到">换个关键词试试。</Empty>
        ) : (
          <div className="as-list">
            {visible.map((entry) => (
              <div key={entry.id} className="as-black" data-editing={entry.id === editingBlacklistId ? 'true' : undefined}>
                <span className="as-black__mark" aria-hidden="true">{entry.riotId.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="as-black__name">
                    <b>{entry.riotId}</b>
                    <span>{[entry.region, entry.createdAt ? `${formatDate(entry.createdAt)}记录` : ''].filter(Boolean).join(' · ')}</span>
                  </div>
                  {entry.tags.length > 0 && (
                    <div className="as-tagbox">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="as-tag" data-tone={tag === '大神' ? 'neutral' : undefined}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {entry.description && <div className="as-black__note">{entry.description}</div>}
                </div>
                <div className="as-list-row__actions">
                  <Btn size="sm" tone="ghost" onClick={() => onPlayerSearch?.(entry.riotId, entry.region)}>
                    <Search />
                    查战绩
                  </Btn>
                  <Btn
                    size="sm"
                    tone="ghost"
                    onClick={() => {
                      setEditingBlacklistId(entry.id);
                      setBlacklistDraft(() => ({
                        riotId: entry.riotId,
                        region: entry.region,
                        tags: entry.tags.join('，'),
                        description: entry.description,
                      }));
                    }}
                  >
                    <Pencil />
                    修改
                  </Btn>
                  <Btn size="sm" tone="ghost" onClick={() => setRemoveId(entry.id)}>
                    <Trash2 />
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={clearOpen}
        title="清空黑名单"
        description={`会删掉全部 ${settings.blacklist.length} 条记录，删了就找不回来了。建议先「导出」备份一份。`}
        confirmLabel="全部删除"
        destructive
        onOpenChange={setClearOpen}
        onConfirm={() => {
          persist({ ...settings, blacklist: [] });
          if (editingBlacklistId) cancelEdit();
          setClearOpen(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        title="删除这条记录"
        description={removing ? `把「${removing.riotId}」从黑名单里删掉？` : ''}
        confirmLabel="删除"
        destructive
        onOpenChange={(open) => {
          if (!open) setRemoveId('');
        }}
        onConfirm={() => {
          persist({
            ...settings,
            blacklist: settings.blacklist.filter((item) => item.id !== removeId),
          });
          if (removeId === editingBlacklistId) cancelEdit();
          setRemoveId('');
        }}
      />
    </>
  );
}
