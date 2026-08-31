import { ControlSettings } from '../game/types';
import { overlayFlexClass, overlayPanelClass, overlayPanelStyle, overlayHand } from './mobile/oneHandedLayout';
import { useDismissGuard } from '../hooks/useDismissGuard';

interface OptionsMenuProps {
  settings: ControlSettings;
  setSetting: <K extends keyof ControlSettings>(key: K, value: ControlSettings[K]) => void;
  toggleSetting: (key: keyof ControlSettings) => void;
  isMobile: boolean;
  onClose: () => void;
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-secondary/40 border border-border/40 hover:bg-secondary/60 active:scale-[0.98] transition-all text-left"
    >
      <span className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/50 leading-tight">{hint}</span>}
      </span>
      <span
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export function OptionsMenu({ settings, setSetting, toggleSetting, isMobile, onClose }: OptionsMenuProps) {
  const hand = overlayHand(settings, isMobile);
  const dismiss = useDismissGuard(onClose);
  return (
    <div
      className={`fixed inset-0 z-[60] flex bg-black/70 backdrop-blur-sm ${overlayFlexClass(hand)}`}
      onClick={dismiss}
      onPointerDown={dismiss}
    >
      <div
        className={`bg-card border border-border shadow-2xl w-80 max-w-[92vw] max-h-[85vh] overflow-y-auto flex flex-col ${hand ? overlayPanelClass(hand) : 'rounded-2xl'}`}
        style={overlayPanelStyle(hand)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-border/50 text-center sticky top-0 bg-card z-10">
          <div className="text-3xl mb-1">⚙️</div>
          <h2 className="text-base font-bold uppercase tracking-widest text-foreground">Options</h2>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Control settings</p>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">Movement</div>
            <ToggleRow
              label={isMobile ? 'Tap tile to move' : 'Click tile to move'}
              hint={isMobile ? 'Tap a tile to auto-walk there' : 'Click a tile to walk, attack, or interact'}
              checked={settings.tapTileToMove}
              onChange={() => toggleSetting('tapTileToMove')}
            />
            {isMobile && (
              <>
                <ToggleRow label="Swipe to move" hint="Swipe on the board to step / bump" checked={settings.swipeToMove} onChange={() => toggleSetting('swipeToMove')} />
                <ToggleRow label="Edge tap to move" hint="Tap near a screen edge to step that way" checked={settings.edgeTap} onChange={() => toggleSetting('edgeTap')} />
              </>
            )}
          </div>

          {isMobile ? (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">On-screen controls</div>
                <ToggleRow label="Virtual D-pad" hint="9-key numpad-style movement pad" checked={settings.showDpad} onChange={() => toggleSetting('showDpad')} />
                <ToggleRow label="Context buttons" hint="Use + expanded Act menu" checked={settings.showContextButtons} onChange={() => toggleSetting('showContextButtons')} />
                <ToggleRow label="Ability buttons" hint="Quick class ability buttons" checked={settings.showAbilityButtons} onChange={() => toggleSetting('showAbilityButtons')} />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">Layout</div>
                <ToggleRow
                  label="One-handed mode"
                  hint="Park d-pad, actions, hotbar, and menus on one side for thumb reach"
                  checked={settings.oneHanded}
                  onChange={() => toggleSetting('oneHanded')}
                />
                <button
                  onClick={() => setSetting('dpadSide', settings.dpadSide === 'right' ? 'left' : 'right')}
                  className="w-full flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-secondary/40 border border-border/40 hover:bg-secondary/60 active:scale-[0.98] transition-all text-left"
                >
                  <span className="flex flex-col">
                    <span className="text-xs font-medium text-foreground">{settings.oneHanded ? 'Thumb side' : 'D-pad side'}</span>
                    <span className="text-[10px] text-muted-foreground/50 leading-tight">
                      {settings.oneHanded ? 'Which side every control sits on' : 'Which corner the d-pad sits in'}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-primary uppercase">{settings.dpadSide}</span>
                </button>
              </div>
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground/50 bg-secondary/20 border border-border/40 rounded-lg px-3 py-2 leading-snug">
              D-pad, swipe, and on-screen buttons appear on phones and tablets.
            </p>
          )}
        </div>

        <div className="p-4 pt-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
