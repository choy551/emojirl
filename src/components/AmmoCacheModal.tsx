import { GameState, EmojiItem } from '../game/types';
import { getItemBuyPrice, addToBag } from '../game/gameHelpers';

interface AmmoCacheModalProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  ammoCacheItems: EmojiItem[];
  setAmmoCacheItems: React.Dispatch<React.SetStateAction<EmojiItem[]>>;
  addLog: (text: string) => void;
  onClose: () => void;
}

export function AmmoCacheModal({ gameState, setGameState, ammoCacheItems, setAmmoCacheItems, addLog, onClose }: AmmoCacheModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-amber-600/40 rounded-xl p-5 shadow-2xl w-80 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-300">📦 Ammo Cache</h2>
            <div className="text-[10px] text-muted-foreground mt-0.5">Resupply before the boss</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
              <span className="text-base leading-none">💰</span>
              <span className="text-sm font-bold text-yellow-300 tabular-nums">{gameState.player.stats.gold}g</span>
            </div>
            <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">ESC</button>
          </div>
        </div>

        {/* Stock */}
        <div className="flex flex-col gap-1.5">
          {ammoCacheItems.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              {gameState.player.characterClass === '🤠' || gameState.player.characterClass === '🧝'
                ? 'Sold out!'
                : 'Nothing here for your class.'}
            </div>
          )}
          {ammoCacheItems.map(item => {
            const price = getItemBuyPrice(item, gameState.currentFloor);
            const canAfford = gameState.player.stats.gold >= price;
            return (
              <div key={item.id} className="group flex items-start gap-2 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 transition-all">
                <span className="text-xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold leading-tight">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug">{item.description}</div>
                </div>
                <button
                  disabled={!canAfford}
                  onClick={() => {
                    setGameState(prev => {
                      if (!prev) return prev;
                      if (prev.player.stats.gold < price) return prev;
                      const boughtItem = { ...item, id: `cache-bought-${Math.random().toString(36).slice(2)}` };
                      const newGold = prev.player.stats.gold - price;
                      const { inventory, bank } = addToBag(prev.player.inventory, prev.player.bank, boughtItem);
                      return { ...prev, player: { ...prev.player, stats: { ...prev.player.stats, gold: newGold }, inventory, bank } };
                    });
                    addLog(`📦 Bought ${item.emoji} ${item.name} for ${price}g!`);
                    setAmmoCacheItems(prev => prev.filter(i => i.id !== item.id));
                  }}
                  className={`shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                    canAfford
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                      : 'bg-secondary/10 border-border/30 text-red-400/60 cursor-not-allowed'
                  }`}
                >
                  {price}g
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground text-center">
          Esc or B to close
        </div>
      </div>
    </div>
  );
}
