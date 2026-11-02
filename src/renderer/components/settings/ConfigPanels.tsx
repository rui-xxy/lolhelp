import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AppWindow,
  ArrowLeftRight,
  ArrowRight,
  Check,
  Crosshair,
  Keyboard,
  Monitor,
  MousePointer2,
  PanelsTopLeft,
  Undo2,
  Volume2,
} from 'lucide-react';
import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';
import { CLIENT_FIELDS, CLIENT_LAYOUT, GAME_FIELDS, GAME_LAYOUT } from './configFields';
import { PART_LABEL, PART_ORDER, clientRowId, gameRowId, type ConfigDiffGroup, type ConfigDiffRow } from './configDiff';
import { HeroHotkeys, HotkeyCaptureDialog } from './HotkeySettings';
import {
  buildHotkeyCategories,
  compareText,
  displayHotkeyValue,
  flattenHotkeys,
  hotkeyLabel,
  isSwitchHotkey,
  type HotkeyBinding,
  type HotkeyCaptureTarget,
} from './hotkeyModel';
import {
  CLIENT_CONTROLS,
  ChoiceMenu,
  FIELD_HINTS,
  GAME_CONTROLS,
  MiniRange,
  MiniSwitch,
  ResolutionMenu,
  SheetRow,
  VolumeMini,
} from './SheetControls';

// 设置页下半部分：一排分块标签，和每一块里的设置。
// 「不一样」是第一块：只列出和游戏里不同（或者刚改过）的那几行，前后对照着看。

export type Subject = 'profile' | 'account';
export type Tab = 'diff' | LolConfigPart;

export const PART_ICON: Record<LolConfigPart, typeof Monitor> = {
  video: Monitor,
  controls: MousePointer2,
  interface: PanelsTopLeft,
  combat: Crosshair,
  audio: Volume2,
  hotkeys: Keyboard,
  client: AppWindow,
};

const PART_TIP: Record<LolConfigPart, string> = {
  video: '窗口、分辨率、帧率和画质',
  controls: '鼠标、镜头、攻击和施法的手感',
  interface: '界面大小、血条上方显示和聊天框',
  combat: '攻击距离、弹道、屏幕闪烁这些提示',
  audio: '各种音量',
  hotkeys: '技能、道具和其他所有按键',
  client: '客户端自己的设置：性能、隐私、邀请和语音',
};

/** 一行改回对照那边的样子（方案里改成游戏里的，或者撤销刚改的）。 */
export interface RowCompare {
  wasLabel: string;
  revertLabel: string;
  onRevert: (id: string) => void;
}

// ---------- 分块标签 ----------

export function ConfigTabs({
  tab,
  onTab,
  stats,
  subject,
  excluded,
  diffTotal,
  showDiff,
  diffLabel,
  onSubject,
  subjects,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  stats: Record<LolConfigPart, number>;
  subject: Subject;
  excluded: Set<LolConfigPart>;
  diffTotal: number;
  showDiff: boolean;
  diffLabel: string;
  onSubject: (subject: Subject) => void;
  /** 没有方案时只有「游戏里」一边，不显示切换 */
  subjects: Array<{ key: Subject; label: string; title: string; icon: ReactNode }>;
}) {
  return (
    <div className="cw-tabs">
      <nav className="cw-tabs__list" aria-label="设置分块">
        {showDiff && (
          <button type="button" className="cw-tab cw-tab--diff" aria-current={tab === 'diff' ? 'page' : undefined} onClick={() => onTab('diff')}>
            <ArrowLeftRight />
            <span>{diffLabel}</span>
            <b className="cw-tab__count num" data-zero={diffTotal === 0 ? 'true' : undefined}>{diffTotal}</b>
          </button>
        )}
        {PART_ORDER.map((part) => {
          const Icon = PART_ICON[part];
          const count = stats[part];
          const off = subject === 'profile' && excluded.has(part) && count > 0;
          return (
            <button
              key={part}
              type="button"
              className="cw-tab"
              aria-current={tab === part ? 'page' : undefined}
              data-off={off ? 'true' : undefined}
              title={off ? `${PART_TIP[part]}（这次应用不带）` : PART_TIP[part]}
              onClick={() => onTab(part)}
            >
              <Icon />
              <span>{PART_LABEL[part]}</span>
              {count > 0 ? (
                <b className="cw-tab__count num">{count}</b>
              ) : subject === 'profile' ? (
                <Check className="cw-tab__ok" aria-label="和游戏里一样" />
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="cw-tabs__side">
        {subjects.length > 1 && (
          <div className="cw-subject" role="radiogroup" aria-label="看哪一边的设置">
            {subjects.map((item) => (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={subject === item.key}
                title={item.title}
                onClick={() => onSubject(item.key)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 不一样的那几行 ----------

export function DiffPanel({
  groups,
  subject,
  excluded,
  beforeLabel,
  afterLabel,
  revertLabel,
  emptyText,
  onToggleExclude,
  onRevert,
  onJump,
}: {
  groups: ConfigDiffGroup[];
  subject: Subject;
  excluded: Set<LolConfigPart>;
  beforeLabel: string;
  afterLabel: string;
  revertLabel: string;
  emptyText: string;
  onToggleExclude: (part: LolConfigPart) => void;
  onRevert: (id: string) => void;
  onJump: (row: ConfigDiffRow) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="cw-calm">
        <span className="cw-calm__mark"><Check /></span>
        <b>{emptyText}</b>
      </div>
    );
  }
  return (
    <div className="cw-diff">
      <div className="cw-diff__head" aria-hidden="true">
        <span />
        <span>{beforeLabel}</span>
        <span />
        <span>{afterLabel}</span>
        <span />
      </div>
      {groups.map((group) => {
        const Icon = PART_ICON[group.part];
        const off = subject === 'profile' && excluded.has(group.part);
        return (
          <section key={group.part} className="cw-diff__group" data-off={off ? 'true' : undefined} aria-label={PART_LABEL[group.part]}>
            <header>
              <Icon />
              <h3>{PART_LABEL[group.part]}</h3>
              <span className="num">{group.rows.length} 处</span>
              {subject === 'profile' && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={!off}
                  className="cw-take"
                  onClick={() => onToggleExclude(group.part)}
                  title={off ? '这次应用不带这一块，点一下带上' : '应用时带上这一块，点一下不带'}
                >
                  <i>{!off && <Check />}</i>
                  {off ? '这次不带' : '应用时带上'}
                </button>
              )}
            </header>
            {group.rows.map((row) => (
              <div key={row.id} className="cw-diff__row">
                <button type="button" className="cw-diff__label" onClick={() => onJump(row)} title="跳到这一项去改">
                  {row.label}
                </button>
                <span className="cw-diff__before" title={row.before}>{row.before}</span>
                <ArrowRight className="cw-diff__arrow" aria-hidden="true" />
                <span className="cw-diff__after" title={row.after}>{row.after}</span>
                <button type="button" className="cw-diff__undo" onClick={() => onRevert(row.id)}>
                  <Undo2 />
                  <span>{revertLabel}</span>
                </button>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ---------- 跳过来的那一行闪一下 ----------

function useFocusRow(root: RefObject<HTMLElement | null>, focus: { id: string; n: number } | null) {
  useEffect(() => {
    if (!focus) return undefined;
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      const node = root.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(focus.id)}"]`)
        ?? root.current?.querySelector<HTMLElement>('[data-row-fallback]');
      if (!node) return;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.setAttribute('data-flash', 'true');
      timer = window.setTimeout(() => node.removeAttribute('data-flash'), 1600);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focus, root]);
}

// ---------- 一块设置：分组小卡 ----------

type GameSetter = <K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => void;
type ClientSetter = <K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => void;

export function PartPanel({
  part,
  values,
  baseline,
  compare,
  focus,
  showBlocked,
  onGame,
  onClient,
}: {
  part: Exclude<LolConfigPart, 'hotkeys'>;
  values: LolConfigValues;
  baseline: LolConfigValues;
  compare: RowCompare;
  focus: { id: string; n: number } | null;
  showBlocked: boolean;
  onGame: GameSetter;
  onClient: ClientSetter;
}) {
  const root = useRef<HTMLDivElement>(null);
  useFocusRow(root, focus);

  const groups: Array<{ title: string; rows: ReactNode[]; diff: number }> = [];
  if (part === 'client') {
    for (const section of CLIENT_LAYOUT) {
      const keys = section.groups.flatMap((group) => group.keys).filter((key) => !CLIENT_FIELDS[key].hidden);
      const rows = keys.map((key) => (
        <ClientRow key={key} field={key} values={values} baseline={baseline} compare={compare} onChange={onClient} />
      ));
      if (section.key === 'privacy' && showBlocked) {
        rows.push(
          <SheetRow key="blocked" label="聊天黑名单" hint="在客户端好友列表里管理">
            <span className="sy-readonly num">{values.client.blockedPlayers?.length ?? 0} 人</span>
          </SheetRow>,
        );
      }
      const diff = keys.filter((key) => key !== 'voiceInputDeviceName'
        && CLIENT_FIELDS[key].format(values.client[key], values.client) !== CLIENT_FIELDS[key].format(baseline.client[key], baseline.client)).length;
      groups.push({ title: section.label, rows, diff });
    }
  } else {
    const section = GAME_LAYOUT.find((item) => item.part === part);
    for (const group of section?.groups ?? []) {
      const keys = group.keys.filter((key) => !GAME_FIELDS[key].hidden);
      const diff = keys.filter((key) => GAME_FIELDS[key].format(values.game[key], values.game) !== GAME_FIELDS[key].format(baseline.game[key], baseline.game)).length;
      groups.push({
        title: group.title ?? PART_LABEL[part],
        diff,
        rows: keys.map((key) => (
          <GameRow key={key} field={key} values={values} baseline={baseline} compare={compare} onChange={onGame} />
        )),
      });
    }
  }

  return (
    <div ref={root} className="cw-groups" data-count={groups.length}>
      {groups.map((group) => (
        <section key={group.title} className="cw-group" aria-label={group.title}>
          <header>
            <h3>{group.title}</h3>
            {group.diff > 0 && <span className="cw-group__diff num">{group.diff}</span>}
          </header>
          <div className="cw-group__rows">{group.rows}</div>
        </section>
      ))}
    </div>
  );
}

function GameRow({
  field,
  values,
  baseline,
  compare,
  onChange,
}: {
  field: keyof LolGameConfigValues;
  values: LolConfigValues;
  baseline: LolConfigValues;
  compare: RowCompare;
  onChange: GameSetter;
}) {
  const meta = GAME_FIELDS[field];
  const game = values.game;
  const now = meta.format(game[field], game);
  const before = meta.format(baseline.game[field], baseline.game);
  const control = GAME_CONTROLS[field] ?? { kind: 'bool' as const };
  const set = onChange as (key: keyof LolGameConfigValues, value: unknown) => void;
  const id = gameRowId(field);

  let node: ReactNode;
  switch (control.kind) {
    case 'choice':
      node = <ChoiceMenu label={meta.label} value={game[field] as string | number} options={control.options} onChange={(value) => set(field, value)} />;
      break;
    case 'range':
      node = <MiniRange label={meta.label} value={Number(game[field])} min={control.min} max={control.max} onChange={(value) => set(field, value)} />;
      break;
    case 'volume':
      node = (
        <VolumeMini
          label={meta.label}
          volume={Number(game[field])}
          muted={Boolean(game[control.mute])}
          onVolume={(value) => set(field, value)}
          onMuted={(value) => set(control.mute, value)}
        />
      );
      break;
    case 'resolution':
      node = (
        <ResolutionMenu
          width={game.width}
          height={game.height}
          onChange={(width, height) => {
            set('width', width);
            set('height', height);
          }}
        />
      );
      break;
    case 'readonly':
      node = <span className="sy-readonly">{now}</span>;
      break;
    default:
      node = <MiniSwitch label={meta.label} checked={Boolean(game[field])} onChange={(value) => set(field, value)} />;
  }

  return (
    <SheetRow
      id={id}
      label={meta.label}
      hint={FIELD_HINTS[field]}
      was={now !== before ? before : undefined}
      wasLabel={compare.wasLabel}
      revertLabel={compare.revertLabel}
      onRevert={() => compare.onRevert(id)}
    >
      {node}
    </SheetRow>
  );
}

function ClientRow({
  field,
  values,
  baseline,
  compare,
  onChange,
}: {
  field: keyof LolClientConfigValues;
  values: LolConfigValues;
  baseline: LolConfigValues;
  compare: RowCompare;
  onChange: ClientSetter;
}) {
  const meta = CLIENT_FIELDS[field];
  const clientValues = values.client;
  const now = meta.format(clientValues[field], clientValues);
  const before = meta.format(baseline.client[field], baseline.client);
  const control = CLIENT_CONTROLS[field] ?? { kind: 'bool' as const };
  const set = onChange as (key: keyof LolClientConfigValues, value: unknown) => void;
  const id = clientRowId(field);

  let node: ReactNode;
  if (control.kind === 'choice') {
    node = <ChoiceMenu label={meta.label} value={clientValues[field] as string} options={control.options} onChange={(value) => set(field, value)} />;
  } else if (control.kind === 'range') {
    node = <MiniRange label={meta.label} value={Number(clientValues[field])} min={control.min} max={control.max} onChange={(value) => set(field, value)} />;
  } else if (control.kind === 'readonly') {
    node = <span className="sy-readonly" title={now}>{now}</span>;
  } else {
    node = <MiniSwitch label={meta.label} checked={Boolean(clientValues[field])} onChange={(value) => set(field, value)} />;
  }

  // 麦克风是这台电脑的设备，不算差异。
  const differs = field !== 'voiceInputDeviceName' && now !== before;
  return (
    <SheetRow
      id={id}
      label={meta.label}
      hint={FIELD_HINTS[field]}
      was={differs ? before : undefined}
      wasLabel={compare.wasLabel}
      revertLabel={compare.revertLabel}
      onRevert={() => compare.onRevert(id)}
    >
      {node}
    </SheetRow>
  );
}

// ---------- 热键：常用键帽 + 其他热键按用途展开 ----------

export function HotkeyPanel({
  values,
  baseline,
  compare,
  focus,
  onChange,
}: {
  values: LolConfigValues;
  baseline: LolConfigValues;
  compare: RowCompare;
  focus: { id: string; n: number } | null;
  onChange: (section: string, key: string, value: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [capture, setCapture] = useState<HotkeyCaptureTarget | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const categories = useMemo(
    () => buildHotkeyCategories(flattenHotkeys(values.hotkeys)).filter((category) => category.key !== 'hero'),
    [values.hotkeys],
  );
  const changed = (binding: HotkeyBinding) =>
    (binding.value ?? '').trim().toLowerCase() !== (baseline.hotkeys[binding.section]?.[binding.key] ?? '').trim().toLowerCase();

  // 从差异列表跳过来：先把那一类展开。
  useEffect(() => {
    if (!focus?.id.startsWith('hotkey.')) return;
    const [, section, ...rest] = focus.id.split('.');
    const key = rest.join('.');
    const category = categories.find((item) => item.bindings.some((binding) => binding.section === section && binding.key === key));
    if (category) setOpen((set) => (set.has(category.key) ? set : new Set(set).add(category.key)));
  }, [categories, focus]);
  useFocusRow(root, focus);

  if (Object.keys(values.hotkeys).length === 0) {
    return <p className="cw-note">没读到热键配置（input.ini）</p>;
  }

  return (
    <div ref={root} className="cw-keys">
      <section className="cw-group cw-group--caps" aria-label="常用热键" data-row-fallback>
        <header>
          <h3>常用热键</h3>
          <span className="cw-group__tip">点键帽改键，下面的「快捷」切换快捷施法</span>
        </header>
        <HeroHotkeys
          values={values.hotkeys}
          onChange={onChange}
          onCapture={(binding, label) => setCapture({ ...binding, label: label ?? hotkeyLabel(binding.key) })}
        />
      </section>

      <section className="cw-group" aria-label="其他热键">
        <header>
          <h3>其他热键</h3>
          <span className="cw-group__tip">按用途分好了，点开看</span>
        </header>
        <div className="cw-keys__cats">
          {categories.map((category) => {
            const diff = category.bindings.filter(changed).length;
            const isOpen = open.has(category.key);
            return (
              <button
                key={category.key}
                type="button"
                className="cw-keys__cat"
                aria-expanded={isOpen}
                onClick={() => setOpen((set) => {
                  const next = new Set(set);
                  if (next.has(category.key)) next.delete(category.key);
                  else next.add(category.key);
                  return next;
                })}
              >
                {category.label}
                {diff > 0 ? <em className="num">{diff}</em> : <span className="num">{category.bindings.length}</span>}
              </button>
            );
          })}
        </div>
        {categories.filter((category) => open.has(category.key)).map((category) => (
          <div key={category.key} className="cw-keys__list">
            <h4>{category.label}</h4>
            <div className="cw-group__rows">
              {category.bindings.map((binding) => {
                const label = hotkeyLabel(binding.key);
                const before = baseline.hotkeys[binding.section]?.[binding.key] ?? '';
                const display = displayHotkeyValue(binding.value);
                const id = `hotkey.${binding.section}.${binding.key}`;
                return (
                  <SheetRow
                    key={id}
                    id={id}
                    label={label}
                    was={changed(binding) ? compareText(binding.section, before) : undefined}
                    wasLabel={compare.wasLabel}
                    revertLabel={compare.revertLabel}
                    onRevert={() => compare.onRevert(id)}
                  >
                    {isSwitchHotkey(binding.section, binding.value) ? (
                      <MiniSwitch label={label} checked={binding.value === '1'} onChange={(on) => onChange(binding.section, binding.key, on ? '1' : '0')} />
                    ) : (
                      <button
                        type="button"
                        className="sy-key"
                        data-unbound={display === '未绑定' ? 'true' : undefined}
                        onClick={() => setCapture({ ...binding, label })}
                      >
                        {display}
                      </button>
                    )}
                  </SheetRow>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {capture && (
        <HotkeyCaptureDialog
          target={capture}
          onClose={() => setCapture(null)}
          onConfirm={(next) => {
            onChange(capture.section, capture.key, next);
            setCapture(null);
          }}
        />
      )}
    </div>
  );
}
