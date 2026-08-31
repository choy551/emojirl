import { GameState, Player } from '../game/types';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, useMobileHand } from './mobile/oneHandedLayout';
import { useDismissGuard } from '../hooks/useDismissGuard';

type WizardMode = 'nearest' | 'furthest' | 'manual' | 'holdfire';
type RangerMode = 'ranged' | 'melee' | 'flee';

interface TacticsMenuProps {
  player: Player;
  gameState: GameState;
  wizardTactics: { mode: WizardMode; manualTargetId: string | null };
  blinkTurn: number;
  trailblazeTurn: number;
  yeehawTurn: number;
  autoStealth: boolean;
  rangerMode: RangerMode;
  applyWizardMode: (mode: WizardMode) => void;
  enterBlinkTargetMode: () => void;
  applyNinjaMode: (stealth: boolean) => void;
  toggleAutoStealth: () => void;
  applyRangerMode: (mode: RangerMode) => void;
  handleCowboyTactics: () => void;
  onClose: () => void;
}

export function TacticsMenu({
  player, gameState, wizardTactics, blinkTurn, trailblazeTurn, yeehawTurn,
  autoStealth, rangerMode, applyWizardMode, enterBlinkTargetMode, applyNinjaMode,
  toggleAutoStealth, applyRangerMode, handleCowboyTactics, onClose,
}: TacticsMenuProps) {
  const hand = useMobileHand();
  const dismiss = useDismissGuard(onClose);
  return (
    <div
      className={`fixed inset-0 z-50 flex ${overlayFlexClass(hand)}`}
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-border shadow-2xl min-w-[260px] max-w-xs p-5 ${hand ? overlayPanelClass(hand) : 'rounded-xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="text-sm font-bold uppercase tracking-widest text-center mb-4 text-muted-foreground">
          {player.characterClass} Tactics
        </div>

        {/* Wizard */}
        {player.characterClass === '🧙' && (
          <div className="space-y-1.5">
            {([
              { n: 1, label: '🎯 Autofire — Nearest',  mode: 'nearest'  as const },
              { n: 2, label: '🎯 Autofire — Furthest', mode: 'furthest' as const },
              { n: 3, label: '🎯 Autofire — Manual',   mode: 'manual'   as const },
            ]).map(({ n, label, mode }) => (
              <button key={mode}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${wizardTactics.mode === mode ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'hover:bg-secondary/60'}`}
                onClick={() => { applyWizardMode(mode); onClose(); }}
              >
                <span className="font-mono text-muted-foreground w-4 shrink-0">{n}</span>
                {label}
                {wizardTactics.mode === mode && <span className="ml-auto text-violet-400">✓</span>}
              </button>
            ))}
            {(() => {
              const elapsed = gameState.turn - blinkTurn;
              const BLINK_ACTIVE = 3, BLINK_CD = 5;
              const isActive = wizardTactics.mode === 'holdfire' && elapsed < BLINK_ACTIVE;
              const onCooldown = elapsed < BLINK_ACTIVE + BLINK_CD;
              const remaining = onCooldown ? (BLINK_ACTIVE + BLINK_CD) - elapsed : 0;
              return (
                <button
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${isActive ? 'bg-violet-500/20 text-violet-200 font-semibold' : onCooldown ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/60'}`}
                  onClick={() => { applyWizardMode('holdfire'); if (!onCooldown) onClose(); }}
                >
                  <span className="font-mono text-muted-foreground w-4 shrink-0">4</span>
                  ✨ Blink — phase through gaps &amp; enemies
                  <span className="ml-auto text-[10px] font-mono">
                    {isActive ? <span className="text-violet-300">{BLINK_ACTIVE - elapsed}t left</span> : onCooldown ? <span className="text-zinc-400">{remaining}t</span> : <span className="text-violet-400">ready</span>}
                  </span>
                </button>
              );
            })()}
          </div>
        )}

        {/* Ninja */}
        {player.characterClass === '🥷' && (
          <div className="space-y-1.5">
            <button
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${(player.stats.blinkStrikeCooldown ?? 0) === 0 ? 'hover:bg-violet-500/20 text-violet-200' : 'opacity-50 cursor-default'}`}
              onClick={() => { if ((player.stats.blinkStrikeCooldown ?? 0) === 0) { enterBlinkTargetMode(); onClose(); } }}
            >
              <span className="font-mono text-muted-foreground w-4 shrink-0">1</span>
              ⚡ Blink Strike — teleport &amp; 2× damage
              <span className="ml-auto text-[10px] font-mono">
                {(player.stats.blinkStrikeCooldown ?? 0) === 0 ? <span className="text-violet-400">READY · X</span> : <span className="text-zinc-400">{player.stats.blinkStrikeCooldown}t</span>}
              </span>
            </button>
            {([
              { n: 2, label: '🤫 Stealth On — hug walls', active: !!gameState.stealthMode && !autoStealth, stealth: true  },
              { n: 3, label: '👁️ Stealth Off — move freely', active: !gameState.stealthMode && !autoStealth, stealth: false },
            ]).map(({ n, label, active, stealth }) => (
              <button key={n}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${active ? 'bg-slate-500/20 text-slate-200 font-semibold' : 'hover:bg-secondary/60'}`}
                onClick={() => { applyNinjaMode(stealth); onClose(); }}
              >
                <span className="font-mono text-muted-foreground w-4 shrink-0">{n}</span>
                {label}
                {active && <span className="ml-auto text-slate-400">✓</span>}
              </button>
            ))}
            <button
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${autoStealth ? 'bg-violet-500/20 text-violet-200 font-semibold' : 'hover:bg-secondary/60'}`}
              onClick={() => { toggleAutoStealth(); onClose(); }}
            >
              <span className="font-mono text-muted-foreground w-4 shrink-0">4</span>
              🧱 Auto-Stealth — wall-hug explore
              {autoStealth && <span className="ml-auto text-violet-400">✓</span>}
            </button>
          </div>
        )}

        {/* Ranger */}
        {player.characterClass === '🧝' && (
          <div className="space-y-1.5">
            {([
              { n: 1, label: '🏹 Ranged — auto-fire bow', active: rangerMode === 'ranged', mode: 'ranged' as const },
              { n: 2, label: '⚔️ Melee — conserve ammo',  active: rangerMode === 'melee',  mode: 'melee'  as const },
            ]).map(({ n, label, active, mode }) => (
              <button key={mode}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${active ? 'bg-green-500/20 text-green-200 font-semibold' : 'hover:bg-secondary/60'}`}
                onClick={() => { applyRangerMode(mode); onClose(); }}
              >
                <span className="font-mono text-muted-foreground w-4 shrink-0">{n}</span>
                {label}
                {active && <span className="ml-auto text-green-400">✓</span>}
              </button>
            ))}
            {(() => {
              const elapsed = gameState.turn - trailblazeTurn;
              const BLINK_ACTIVE = 3, BLINK_CD = 5;
              const isActive = rangerMode === 'flee' && elapsed < BLINK_ACTIVE;
              const onCooldown = elapsed < BLINK_ACTIVE + BLINK_CD;
              const remaining = onCooldown ? (BLINK_ACTIVE + BLINK_CD) - elapsed : 0;
              return (
                <button
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${isActive ? 'bg-green-500/20 text-green-200 font-semibold' : onCooldown ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/60'}`}
                  onClick={() => { applyRangerMode('flee'); if (!onCooldown) onClose(); }}
                >
                  <span className="font-mono text-muted-foreground w-4 shrink-0">3</span>
                  💨 Trailblaze — sprint 2 tiles
                  <span className="ml-auto text-[10px] font-mono">
                    {isActive ? <span className="text-green-300">{BLINK_ACTIVE - elapsed}t left</span> : onCooldown ? <span className="text-zinc-400">{remaining}t</span> : <span className="text-green-400">ready</span>}
                  </span>
                </button>
              );
            })()}
          </div>
        )}

        {/* Cowboy */}
        {player.characterClass === '🤠' && (() => {
          const ready = gameState.turn - yeehawTurn >= 45;
          return (
            <div className="space-y-1.5">
              <button
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${ready ? 'hover:bg-yellow-500/20' : 'opacity-40 cursor-not-allowed'}`}
                onClick={() => { if (ready) { handleCowboyTactics(); onClose(); } }}
              >
                <span className="font-mono text-muted-foreground w-4 shrink-0">1</span>
                🤠 YEEHAW! (+25 mood)
                <span className="ml-auto text-xs text-muted-foreground">
                  {ready ? 'ready!' : `${45 - (gameState.turn - yeehawTurn)}t`}
                </span>
              </button>
            </div>
          );
        })()}

        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
          press number to select · ESC or T to close
        </div>
      </div>
    </div>
  );
}
