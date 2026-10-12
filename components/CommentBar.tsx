import { useState, type FormEvent } from 'react';
import { cx } from '@/lib/util';
import { IconCamera, IconDots, IconNav, IconNote } from './Icons';

/** "Add Comment" bar with send / request / camera / more buttons. */
export function CommentBar({
  onSend,
  onRequest,
  onCamera,
  onMore,
  placeholder = 'Add Comment',
  className,
  tone = 'blue',
}: {
  onSend: (text: string) => Promise<void> | void;
  onRequest?: () => void;
  onCamera?: () => void;
  onMore?: () => void;
  placeholder?: string;
  className?: string;
  tone?: 'blue' | 'green' | 'purple';
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  const field = tone === 'blue' ? 'bg-[#1b2a86]/85 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]' : tone === 'green' ? 'bg-[#2a3b34]/80' : 'bg-[#2c1846]/85';
  const btn = tone === 'blue' ? 'bg-[#1b2a86] text-[#8aa2ff]' : tone === 'green' ? 'bg-[#2a3b34] text-accent-soft' : 'bg-[#2c1846] text-[#d6a7ff]';

  return (
    <form onSubmit={submit} className={cx('flex items-center gap-[7px]', className)}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx('h-[34px] min-w-0 flex-1 rounded-[10px] border-0 px-3 font-ui text-[14px] font-semibold text-white outline-none placeholder:font-semibold placeholder:text-white/45', field)}
        enterKeyHint="send"
      />
      <button type="submit" aria-label="Send" disabled={busy} className={cx('flex h-[30px] w-[30px] items-center justify-center rounded-full', btn)}>
        <IconNav size={16} />
      </button>
      {onRequest && (
        <button type="button" aria-label="Make a request" onClick={onRequest} className={cx('flex h-[30px] w-[30px] items-center justify-center rounded-full', btn)}>
          <IconNote size={17} />
        </button>
      )}
      {onCamera && (
        <button type="button" aria-label="Post a pic snippet" onClick={onCamera} className={cx('flex h-[30px] w-[30px] items-center justify-center rounded-full', btn)}>
          <IconCamera size={16} />
        </button>
      )}
      {onMore && (
        <button type="button" aria-label="More" onClick={onMore} className={cx('flex h-[30px] w-[30px] items-center justify-center rounded-full', btn)}>
          <IconDots size={16} />
        </button>
      )}
    </form>
  );
}
