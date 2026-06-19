import { useState, useRef, useEffect, useCallback } from 'react';

interface VirtualDpadProps {
  onMove: (dx: number, dy: number) => void;
  onWait: () => void;
  side?: 'left' | 'right';
  onToggleSide?: () => void;
}

const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 150;

interface CellDef {
  dx: number;
  dy: number;
  label: string;
  testId: string;
  isCenter?: boolean;
}

const CELLS: CellDef[] = [
  { dx: -1, dy: -1, label: '↖', testId: 'dpad-nw' },
  { dx:  0, dy: -1, label: '↑', testId: 'dpad-n'  },
  { dx:  1, dy: -1, label: '↗', testId: 'dpad-ne' },
  { dx: -1, dy:  0, label: '←', testId: 'dpad-w'  },
  { dx:  0, dy:  0, label: '·',  testId: 'dpad-wait', isCenter: true },
  { dx:  1, dy:  0, label: '→', testId: 'dpad-e'  },
  { dx: -1, dy:  1, label: '↙', testId: 'dpad-sw' },
  { dx:  0, dy:  1, label: '↓', testId: 'dpad-s'  },
  { dx:  1, dy:  1, label: '↘', testId: 'dpad-se' },
];

function DpadCell({
  cell,
  onMove,
  onWait,
}: {
  cell: CellDef;
  onMove: (dx: number, dy: number) => void;
  onWait: () => void;
}) {
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fire = useCallback(() => {
    if (cell.isCenter) {
      onWait();
    } else {
      onMove(cell.dx, cell.dy);
    }
  }, [cell, onMove, onWait]);

  const startRepeat = useCallback(() => {
    fire();
    if (!cell.isCenter) {
      repeatTimer.current = setTimeout(() => {
        repeatInterval.current = setInterval(fire, REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    }
  }, [fire, cell.isCenter]);

  const stopRepeat = useCallback(() => {
    if (repeatTimer.current) { clearTimeout(repeatTimer.current); repeatTimer.current = null; }
    if (repeatInterval.current) { clearInterval(repeatInterval.current); repeatInterval.current = null; }
  }, []);

  useEffect(() => () => stopRepeat(), [stopRepeat]);

  return (
    <button
      data-testid={cell.testId}
      className={[
        'flex items-center justify-center select-none touch-none rounded-lg',
        'transition-transform duration-75 active:scale-90',
        cell.isCenter
          ? 'bg-amber-900/60 border border-amber-500/50 text-amber-400/90 font-bold text-lg'
          : 'bg-white/10 border border-white/15 text-white/80 font-bold',
      ].join(' ')}
      style={{ minWidth: 48, minHeight: 48, fontSize: cell.isCenter ? '1.3rem' : '1.05rem' }}
      onPointerDown={e => { e.preventDefault(); startRepeat(); }}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      title={cell.isCenter ? 'Wait / rest (+1 HP)' : `Move ${cell.label}`}
      aria-label={cell.isCenter ? 'Wait' : `Move ${cell.label}`}
    >
      {cell.label}
    </button>
  );
}

const STORAGE_KEY = 'emojirl_dpad_side';

export function VirtualDpad({ onMove, onWait, side: sideProp, onToggleSide }: VirtualDpadProps) {
  const [internalSide, setInternalSide] = useState<'left' | 'right'>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'left' ? 'left' : 'right';
  });
  const side = sideProp ?? internalSide;

  const toggleSide = () => {
    if (onToggleSide) { onToggleSide(); return; }
    setInternalSide(prev => {
      const next = prev === 'right' ? 'left' : 'right';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return (
    <div
      className={[
        'fixed bottom-4 z-40 flex flex-col items-center gap-1',
        side === 'right' ? 'right-3' : 'left-3',
      ].join(' ')}
      style={{
        userSelect: 'none',
        paddingBottom: 'env(safe-area-inset-bottom)',
        ...(side === 'right'
          ? { paddingRight: 'env(safe-area-inset-right)' }
          : { paddingLeft: 'env(safe-area-inset-left)' }),
      }}
    >
      <div
        className="grid gap-1 p-1.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-white/10 shadow-2xl"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', width: 168 }}
      >
        {CELLS.map((cell, i) => (
          <DpadCell key={i} cell={cell} onMove={onMove} onWait={onWait} />
        ))}
      </div>

      <button
        onClick={toggleSide}
        className="text-[10px] text-white/30 hover:text-white/60 transition-colors px-2 py-0.5 rounded"
        aria-label="Swap d-pad side"
      >
        ⇄ move {side === 'right' ? 'left' : 'right'}
      </button>
    </div>
  );
}
