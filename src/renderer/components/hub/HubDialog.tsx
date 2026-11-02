import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// 「我的玩家」「消息」共用的窗口外壳：遮罩、标题栏、底部轻提示。
// 布局与配色全部在 styles/features/hub.css，跟随外观设置里的深浅色与配色方案。

export type HubNoticeTone = 'neutral' | 'ok' | 'error';

export interface HubNotice {
  id: number;
  text: string;
  tone: HubNoticeTone;
}

/** 底部轻提示：几秒后自动消失，新的提示会顶掉旧的。 */
export function useHubNotice(): [HubNotice | null, (text: string, tone?: HubNoticeTone) => void] {
  const [notice, setNotice] = useState<HubNotice | null>(null);
  const idRef = useRef(0);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), notice.tone === 'error' ? 5_000 : 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const show = useCallback((text: string, tone: HubNoticeTone = 'neutral') => {
    idRef.current += 1;
    setNotice({ id: idRef.current, text, tone });
  }, []);
  return [notice, show];
}

interface HubDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  /** 标题栏右侧（关闭按钮左边）的操作区。 */
  actions?: ReactNode;
  notice?: HubNotice | null;
  children: ReactNode;
  variant?: 'players' | 'messages' | 'collection';
}

export function HubDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  actions,
  notice,
  children,
  variant,
}: HubDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="hub-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="hub" role="dialog" aria-modal="true" aria-label={title} data-variant={variant}>
        <header className="hub__head">
          <span className="hub__icon" aria-hidden="true">{icon}</span>
          <div className="hub__title">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="hub__actions">{actions}</div>}
          <button type="button" className="hub-icon-btn" onClick={onClose} aria-label={`关闭${title}`} title="关闭 (Esc)">
            <X />
          </button>
        </header>
        <div className="hub__body">{children}</div>
        {notice && (
          <div key={notice.id} className="hub-toast" data-tone={notice.tone} role="status">
            {notice.text}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

/** 头像右下角的小标记（关注中的铃铛、未读数等）。 */
export function AvatarBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'alert' | 'ok' }) {
  return <span className="hub-avatar-badge" data-tone={tone}>{children}</span>;
}
