import { ZodiacRuler, ZodiacState, ZODIAC_GLYPH, pledgeRuler, abandonRuler } from '../game/zodiac';
import { useDialogHotkeys } from '../hooks/useDialogHotkeys';

const NAMES: Record<ZodiacRuler, string> = {
  taurus: 'Taurus',
  leo: 'Leo',
  aquarius: 'Aquarius',
  scorpio: 'Scorpio',
};

interface Props {
  altar: ZodiacRuler;
  zodiac: ZodiacState;
  onChange: (next: ZodiacState, log: string) => void;
  onClose: () => void;
}

export function ZodiacAltarDialog({ altar, zodiac, onChange, onClose }: Props) {
  useDialogHotkeys(undefined, onClose);
  const glyph = ZODIAC_GLYPH[altar];
  const pledged = zodiac.ruler;
  const same = pledged === altar;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-card border border-violet-400/50 rounded-xl p-5 max-w-xs w-full mx-4 shadow-2xl text-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-4xl mb-1">{glyph}</div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-violet-200 mb-1">Ecumenical Temple</h2>
        <p className="text-xs text-white/80 mb-4">
          {same
            ? `You are pledged to ${NAMES[altar]}. Piety ${zodiac.piety}%.`
            : pledged
              ? `Pledged to ${NAMES[pledged]} ${ZODIAC_GLYPH[pledged]} ${zodiac.piety}%. This altar is ${NAMES[altar]}.`
              : `Pledge ${NAMES[altar]}? You may follow only one Ruler.`}
        </p>
        <div className="flex flex-col gap-2">
          {!pledged && (
            <button
              className="w-full min-h-11 text-sm font-bold rounded-lg bg-violet-600/80 border border-violet-300/50 text-white"
              onClick={() => {
                onChange(pledgeRuler(zodiac, altar), `${glyph} You pledge yourself to ${NAMES[altar]}.`);
                onClose();
              }}
            >
              Pledge {glyph} {NAMES[altar]}
            </button>
          )}
          {pledged && !same && (
            <button
              className="w-full min-h-11 text-sm font-bold rounded-lg bg-violet-600/80 border border-violet-300/50 text-white"
              onClick={() => {
                onChange(pledgeRuler(abandonRuler(zodiac), altar), `${glyph} You leave ${NAMES[pledged]} and pledge ${NAMES[altar]}.`);
                onClose();
              }}
            >
              Switch to {glyph} {NAMES[altar]}
            </button>
          )}
          {pledged && (
            <button
              className="w-full min-h-11 text-sm rounded-lg bg-secondary/40 border border-border/60"
              onClick={() => {
                onChange(abandonRuler(zodiac), `You abandon ${NAMES[pledged]}. The temple holds no wrath.`);
                onClose();
              }}
            >
              Abandon
            </button>
          )}
          <button className="w-full min-h-11 text-sm rounded-lg text-muted-foreground" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
