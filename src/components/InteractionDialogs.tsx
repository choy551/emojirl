import { GameState } from '../game/types';
import { addToBag } from '../game/gameHelpers';

type SetGameState = React.Dispatch<React.SetStateAction<GameState | null>>;

interface MonkeyDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  interaction: { id: string; wants: string };
  onClose: () => void;
}

export function MonkeyInteractionDialog({ gameState, setGameState, interaction, onClose }: MonkeyDialogProps) {
  const monkey = gameState.enemies.find(e => e.id === interaction.id);
  if (!monkey) return null;
  const { wants } = interaction;
  const stolenCount = monkey.stolenEmojis?.length ?? 0;
  const wantsItemIdx = gameState.player.inventory.findIndex(i => !i.consumed && i.emoji === wants);
  const playerHasIt = wantsItemIdx !== -1;

  const handleGive = () => {
    if (!playerHasIt) return;
    setGameState(prev => {
      if (!prev) return prev;
      const itemIdx = prev.player.inventory.findIndex(i => !i.consumed && i.emoji === wants);
      if (itemIdx === -1) return prev;
      const remainingInv = prev.player.inventory.filter((_, i) => i !== itemIdx);
      const { inventory: _inv, bank: _bnk } = addToBag(remainingInv, prev.player.bank, ...(monkey.stolenEmojis ?? []));
      return {
        ...prev,
        player: { ...prev.player, inventory: _inv, bank: _bnk },
        enemies: prev.enemies.filter(e => e.id !== interaction.id),
        logs: [{ id: Math.random().toString(), text: `🐒 ${monkey.name} happily takes the ${wants} and drops your emojis! 🎉`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  const handleAttack = () => {
    setGameState(prev => {
      if (!prev) return prev;
      const idx = prev.enemies.findIndex(e => e.id === interaction.id);
      if (idx === -1) return prev;
      const newEnemies = [...prev.enemies];
      newEnemies[idx] = { ...newEnemies[idx], engaged: true, tag: 'Hostile' as const };
      return {
        ...prev,
        enemies: newEnemies,
        logs: [{ id: Math.random().toString(), text: `🐒 ${monkey.name} shrieks and bares its teeth — it's hostile now!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-amber-400/40 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{monkey.emoji}</div>
          <div className="text-sm font-bold text-amber-300 mb-2">{monkey.name}</div>
          <div className="text-xs text-muted-foreground leading-relaxed italic">
            "Oo oo! Give {wants}... give {wants}!"
          </div>
          {stolenCount > 0 && (
            <div className="mt-2 text-xs text-amber-400/80">
              Holding <span className="font-semibold">{stolenCount}</span> stolen emoji{stolenCount !== 1 ? 's' : ''}: {(monkey.stolenEmojis ?? []).map(s => s.emoji).join('')}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <button
            className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
              playerHasIt
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/35 cursor-pointer'
                : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
            }`}
            onClick={handleGive}
            disabled={!playerHasIt}
          >
            {playerHasIt
              ? `Give ${wants} — get your emojis back`
              : `Give ${wants} — you don't have one`}
          </button>
          <button
            className="w-full py-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-colors"
            onClick={handleAttack}
          >
            ⚔️ Attack — turns it hostile
          </button>
          <button
            className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            Back away slowly 🤫
          </button>
        </div>
      </div>
    </div>
  );
}

interface FairyDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  fairyId: string;
  onClose: () => void;
}

export function FairyInteractionDialog({ gameState, setGameState, fairyId, onClose }: FairyDialogProps) {
  const fairy = gameState.enemies.find(e => e.id === fairyId);
  if (!fairy) return null;
  const handleYes = () => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        player: { ...prev.player, stats: { ...prev.player.stats, hp: prev.player.stats.maxHp } },
        enemies: prev.enemies.filter(e => e.id !== fairyId),
        logs: [{ id: Math.random().toString(), text: `🧚‍♀️ ${fairy.name} heals you to full HP! ✨`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-pink-400/40 rounded-xl p-6 shadow-2xl max-w-xs w-full mx-4">
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{fairy.emoji}</div>
          <div className="text-sm font-bold text-pink-300 mb-2">{fairy.name}</div>
          <div className="text-xs text-muted-foreground leading-relaxed italic">
            "Hehe, you look tired~ Want me to heal you? ✨"
          </div>
        </div>
        <div className="flex gap-3">
          <button
            className="flex-1 py-2.5 rounded-lg bg-pink-500/20 border border-pink-400/40 text-pink-200 text-sm font-semibold hover:bg-pink-500/35 transition-colors"
            onClick={handleYes}
          >
            Yes please 💗
          </button>
          <button
            className="flex-1 py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            No thanks 🤚
          </button>
        </div>
      </div>
    </div>
  );
}

interface AdventurerDialogProps {
  gameState: GameState;
  setGameState: SetGameState;
  adventurerId: string;
  onClose: () => void;
}

const ADV_LINES: Record<string, string> = {
  '🧙': `Hm, you seem capable~ I've been wandering these floors researching arcane theory. A little company wouldn't hurt. Have anything shiny for me?`,
  '🥷': `You actually spotted me. I'm impressed. I need someone worth walking alongside — prove it. What've you got?`,
  '🧝': `I've been riding solo for too long. My arrows fly true and I know these floors well. Trade me something good and I'm yours.`,
  '🤠': `Howdy, partner~ Reckon these here dungeons ain't no place to ride alone. Got anything worth a handshake deal?`,
  '🧑‍🎤': `Oh~! A protagonist! My ballad needs a hero to follow around. I'll trade my loyalty for one little trinket~`,
};
const ADV_COLORS: Record<string, string> = {
  '🧙': 'text-violet-300',
  '🥷': 'text-slate-300',
  '🧝': 'text-emerald-300',
  '🤠': 'text-amber-300',
  '🧑‍🎤': 'text-pink-300',
};
const ADV_BORDER: Record<string, string> = {
  '🧙': 'border-violet-400/40',
  '🥷': 'border-slate-400/40',
  '🧝': 'border-emerald-400/40',
  '🤠': 'border-amber-400/40',
  '🧑‍🎤': 'border-pink-400/40',
};
const ADV_FRIENDLY_LINES: Record<string, string> = {
  '🧙': `Oh, it's you! I was hoping you'd come by~ I'm ready to travel with you, no strings attached!`,
  '🥷': `I've already decided I like you. Don't make me regret it. Let's move.`,
  '🧝': `I've been waiting for the right person. Looks like that's you — shall we?`,
  '🤠': `Well, I reckon you're exactly the kind of partner I was lookin' for. Ready when you are, partner~`,
  '🧑‍🎤': `I had a good feeling about you! The ballad practically writes itself. Come on, let's go~`,
};

export function AdventurerInteractionDialog({ gameState, setGameState, adventurerId, onClose }: AdventurerDialogProps) {
  const adv = gameState.enemies.find(e => e.id === adventurerId);
  if (!adv) return null;
  const fav = adv.favoriteEmoji ?? '❓';
  const isAlreadyFriendly = adv.tag === 'Friendly';
  const playerHasIt = gameState.player.inventory.some(i => !i.consumed && i.emoji === fav);

  const flavorLine = ADV_LINES[adv.emoji] ?? `Hey, adventurer! These floors are rough alone. Got something to share?`;
  const nameColor = ADV_COLORS[adv.emoji] ?? 'text-cyan-300';
  const borderColor = ADV_BORDER[adv.emoji] ?? 'border-cyan-400/40';
  const friendlyLine = ADV_FRIENDLY_LINES[adv.emoji] ?? `I'm already on your side — let's go!`;

  const handleGive = () => {
    if (!playerHasIt) return;
    setGameState(prev => {
      if (!prev) return prev;
      const itemIdx = prev.player.inventory.findIndex(i => !i.consumed && i.emoji === fav);
      if (itemIdx === -1) return prev;
      const newInventory = prev.player.inventory.filter((_, idx) => idx !== itemIdx);
      return {
        ...prev,
        player: { ...prev.player, inventory: newInventory },
        enemies: prev.enemies.map(e =>
          e.id === adventurerId
            ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: true }
            : e
        ),
        logs: [{ id: Math.random().toString(), text: `🤝 ${adv.emoji} ${adv.name} beams with joy! "${fav}?! For me?!" — joins as your companion!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  const handleAcceptFriendly = () => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        enemies: prev.enemies.map(e =>
          e.id === adventurerId
            ? { ...e, tag: 'Friendly' as const, engaged: false, isRecruited: true }
            : e
        ),
        logs: [{ id: Math.random().toString(), text: `🤝 ${adv.emoji} ${adv.name} grins warmly — joins as your companion!`, turn: prev.turn }, ...prev.logs].slice(0, 24),
      };
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-card border ${borderColor} rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4`}>
        <div className="text-center mb-5">
          <div className="text-5xl mb-2">{adv.emoji}</div>
          <div className={`text-sm font-bold ${nameColor} mb-3`}>{adv.name}</div>
          <div className="text-xs text-muted-foreground leading-relaxed italic px-1">
            "{isAlreadyFriendly ? friendlyLine : flavorLine}"
          </div>
        </div>
        <div className="space-y-2">
          {isAlreadyFriendly ? (
            <button
              className="w-full py-2.5 rounded-lg border bg-cyan-500/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 text-sm font-semibold transition-colors"
              onClick={handleAcceptFriendly}
            >
              Accept companion 🤝
            </button>
          ) : (
            <button
              className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                playerHasIt
                  ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 cursor-pointer'
                  : 'bg-slate-700/30 border-slate-600/30 text-slate-500 cursor-not-allowed'
              }`}
              onClick={handleGive}
              disabled={!playerHasIt}
            >
              {playerHasIt
                ? `Recruit — give ${fav} 🤝`
                : `Recruit — need ${fav} (you don't have one)`}
            </button>
          )}
          <button
            className="w-full py-2.5 rounded-lg bg-slate-500/20 border border-slate-400/30 text-slate-300 text-sm font-semibold hover:bg-slate-500/30 transition-colors"
            onClick={onClose}
          >
            Exit dialogue 👋
          </button>
        </div>
      </div>
    </div>
  );
}
