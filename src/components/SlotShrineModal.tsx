import { useEffect, useRef, useState } from 'react';
import { GameState } from '../game/types';
import {
  slotShrineCost, rollSlotTier, resolveSlotPrize, grantSlotPrizeItems,
  SLOT_REEL_FACE, SlotPrize, SlotTier,
} from '../game/gameHelpers';
import { useDismissGuard } from '../hooks/useDismissGuard';
import { CloseHintButton } from './CloseHintButton';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';

interface SlotShrineModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

const REEL_FACES = Object.values(SLOT_REEL_FACE);

interface PendingSpin {
  prize: SlotPrize;
  tier: SlotTier;
  floor: number;
}

export function SlotShrineModal({ gameState, setGameState, addLog, onClose }: SlotShrineModalProps) {
  const dismiss = useDismissGuard(onClose);
  const hand = useMobileHand();
  const [reels, setReels] = useState<string[]>(['❓', '❓', '❓']);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState('');
  const pendingRef = useRef<PendingSpin | null>(null);
  const timerRef = useRef<number | null>(null);
  const setStateRef = useRef(setGameState);
  setStateRef.current = setGameState;
  void addLog;

  const grant = (job: PendingSpin) => {
    const { prize, tier, floor } = job;
    setStateRef.current(prev => {
      if (!prev) return prev;
      const placed = grantSlotPrizeItems(prev.player.inventory, prev.player.bank, prize.items, floor);
      return {
        ...prev,
        player: {
          ...prev.player,
          inventory: placed.inventory,
          bank: placed.bank,
          stats: { ...prev.player.stats, gold: prev.player.stats.gold + prize.goldGain + placed.gold },
        },
        logs: [
          ...placed.logs.map(text => ({ id: Math.random().toString(), text, turn: prev.turn })),
          ...(tier === 'godtier' ? [{ id: Math.random().toString(), text: '✨ The Slot Shrine erupts in gold light!', turn: prev.turn }] : []),
          { id: Math.random().toString(), text: `🎰 ${prize.label}`, turn: prev.turn },
          ...prev.logs,
        ].slice(0, 24),
      };
    });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      const job = pendingRef.current;
      pendingRef.current = null;
      if (job) grant(job);
    };
  }, []);

  const cost = slotShrineCost(gameState.currentFloor);
  const gold = gameState.player.stats.gold;
  const broke = gold < cost;

  const spin = () => {
    if (pendingRef.current || broke) return;
    const floor = gameState.currentFloor;
    const tier = rollSlotTier();
    const prize = resolveSlotPrize(tier, floor, cost, gameState.player.characterClass);
    pendingRef.current = { prize, tier, floor };
    setSpinning(true);
    setResult('');
    setGameState(prev => {
      if (!prev || prev.player.stats.gold < cost) return prev;
      return {
        ...prev,
        player: {
          ...prev.player,
          stats: { ...prev.player.stats, gold: prev.player.stats.gold - cost },
        },
      };
    });
    const started = Date.now();
    const duration = 500 + Math.floor(Math.random() * 301);
    timerRef.current = window.setInterval(() => {
      setReels([
        REEL_FACES[Math.floor(Math.random() * REEL_FACES.length)],
        REEL_FACES[Math.floor(Math.random() * REEL_FACES.length)],
        REEL_FACES[Math.floor(Math.random() * REEL_FACES.length)],
      ]);
      if (Date.now() - started < duration) return;
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      const job = pendingRef.current;
      pendingRef.current = null;
      const face = SLOT_REEL_FACE[tier];
      setReels([face, face, face]);
      setSpinning(false);
      setResult(prize.label);
      if (job) grant(job);
    }, 80);
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-black/60 backdrop-blur-sm ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-fuchsia-500/40 p-5 shadow-2xl w-96 max-w-[94vw] max-h-[90vh] overflow-y-auto ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-2 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-fuchsia-300">🎰 Slot Shrine</h2>
            <div className="text-[11px] text-muted-foreground mt-1">
              Spin: 🪙{cost} · You have 🪙{gold}
            </div>
          </div>
          <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded min-h-11">ESC</button>
        </div>

        <div className="flex justify-center gap-2 mb-3">
          {reels.map((face, i) => (
            <div
              key={i}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-black/40 border border-fuchsia-500/30 flex items-center justify-center text-4xl sm:text-5xl"
            >
              {face}
            </div>
          ))}
        </div>

        <div className="min-h-[1.25rem] text-center text-xs text-fuchsia-200 mb-3">
          {result}
        </div>

        <button
          type="button"
          disabled={spinning || broke}
          onClick={spin}
          className="w-full min-h-11 rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-fuchsia-500/30"
        >
          {spinning ? 'Spinning…' : `Spin 🪙${cost}`}
        </button>

        <CloseHintButton onClose={dismiss}>Leave</CloseHintButton>
      </div>
    </div>
  );
}
