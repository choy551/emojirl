import { useEffect, useRef, useState } from 'react';
import { useDialogHotkeys } from '../hooks/useDialogHotkeys';

export function DevConsoleButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Open console"
      className="absolute bottom-1 left-1 z-10 min-h-11 min-w-11 rounded-md border border-border/70 bg-black/75 text-sm font-bold text-foreground"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
    >
      &gt;_
    </button>
  );
}

export function DevConsoleBar({ onSubmit, onClose }: { onSubmit: (raw: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <form
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-black/90 p-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
        setDraft('');
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label className="sr-only" htmlFor="dev-console">Console</label>
      <input
        id="dev-console"
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        className="w-full min-h-11 rounded-md border border-border bg-black px-3 text-base text-foreground"
        placeholder="/help"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
      />
    </form>
  );
}

export function DevConsoleConfirm({
  text,
  yesLabel,
  onYes,
  onNo,
}: {
  text: string;
  yesLabel: string;
  onYes: () => void;
  onNo: () => void;
}) {
  useDialogHotkeys(onYes, onNo);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl">
        <p className="mb-4 text-sm text-foreground">{text}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            onClick={onYes}
          >
            {yesLabel}
          </button>
          <button
            type="button"
            className="min-h-11 w-full rounded-lg border border-border bg-secondary/60 px-4 text-sm font-medium text-foreground"
            onClick={onNo}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
