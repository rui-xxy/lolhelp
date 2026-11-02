import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

// 聊天输入框里的表情面板：常用 / 心形 / 手势三页。

const EMOJI_TABS: Array<{ label: string; emojis: string[] }> = [
  {
    label: '表情',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
      '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟',
      '😣', '😞', '😢', '😭', '😤', '😠', '😡', '🤬', '🥺', '😨', '😰', '😱', '😖', '😓', '😩', '😫',
      '🥱', '😲', '😳', '🫡', '💤',
    ],
  },
  {
    label: '心形',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '♥️', '💋', '💌', '💑', '💏', '🫂', '🤝',
    ],
  },
  {
    label: '手势',
    emojis: [
      '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
      '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🙏', '✍️', '💪', '👀',
      '🔥', '💯', '✨', '🎉', '⚡', '🏆',
    ],
  },
];

export function EmojiPicker({ disabled, onPick }: { disabled?: boolean; onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="msg-emoji">
      <button
        type="button"
        className="hub-icon-btn"
        data-active={open ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title="表情"
        aria-label="表情"
        aria-expanded={open}
      >
        <Smile />
      </button>
      {open && (
        <div className="msg-emoji__panel" role="dialog" aria-label="选择表情">
          <div className="msg-emoji__tabs" role="tablist">
            {EMOJI_TABS.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={tab === index}
                onClick={() => setTab(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="msg-emoji__grid">
            {EMOJI_TABS[tab].emojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => {
                  onPick(emoji);
                  setOpen(false);
                }}
                aria-label={`插入 ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
