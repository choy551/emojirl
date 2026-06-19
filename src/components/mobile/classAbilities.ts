import { Player } from '../../game/types';

// Mirrors the cooldown constants in useTacticsActions.ts (BLINK_ACTIVE + BLINK_CD).
const BLINK_TOTAL_CD = 8;
const YEEHAW_CD = 45;

export interface AbilityDescriptor {
  id: string;
  icon: string;
  label: string;
  /** Short status line: current mode or cooldown text. */
  detail?: string;
  disabled: boolean;
  /** True when toggled "on" (e.g. stealth active) for highlight styling. */
  active?: boolean;
  onUse: () => void;
}

export interface ClassAbilityArgs {
  player: Player;
  turn: number;
  blinkTurn: number;
  trailblazeTurn: number;
  yeehawTurn: number;
  rangerMode: 'ranged' | 'melee' | 'flee';
  wizardMode: 'nearest' | 'furthest' | 'manual' | 'holdfire';
  stealthOn: boolean;
  applyWizardMode: (mode: 'nearest' | 'furthest' | 'manual' | 'holdfire') => void;
  applyRangerMode: (mode: 'ranged' | 'melee' | 'flee') => void;
  handleCowboyTactics: () => void;
  handleBlinkStrike: () => void;
  applyNinjaMode: (stealth: boolean) => void;
}

export function getClassAbilities(args: ClassAbilityArgs): AbilityDescriptor[] {
  const {
    player, turn, blinkTurn, trailblazeTurn, yeehawTurn, rangerMode, wizardMode, stealthOn,
    applyWizardMode, applyRangerMode, handleCowboyTactics, handleBlinkStrike, applyNinjaMode,
  } = args;

  switch (player.characterClass) {
    case '🧙': {
      const remaining = BLINK_TOTAL_CD - (turn - blinkTurn);
      const onCd = remaining > 0 && blinkTurn > -900;
      const modeLabel = wizardMode === 'nearest' ? 'Nearest' : wizardMode === 'furthest' ? 'Furthest' : wizardMode === 'manual' ? 'Manual' : 'Hold';
      return [
        {
          id: 'wizard-blink', icon: '✨', label: 'Blink',
          detail: onCd ? `${remaining}t` : 'Ready',
          disabled: onCd,
          onUse: () => applyWizardMode('holdfire'),
        },
        {
          id: 'wizard-aim', icon: '🎯', label: 'Aim',
          detail: modeLabel,
          disabled: false,
          onUse: () => applyWizardMode(
            wizardMode === 'nearest' ? 'furthest' : wizardMode === 'furthest' ? 'manual' : 'nearest'
          ),
        },
      ];
    }
    case '🧝': {
      const remaining = BLINK_TOTAL_CD - (turn - trailblazeTurn);
      const onCd = remaining > 0 && trailblazeTurn > -900;
      const isRanged = rangerMode === 'ranged';
      return [
        {
          id: 'ranger-mode', icon: isRanged ? '🏹' : '⚔️', label: isRanged ? 'Ranged' : 'Melee',
          detail: 'Swap',
          disabled: false,
          onUse: () => applyRangerMode(isRanged ? 'melee' : 'ranged'),
        },
        {
          id: 'ranger-trailblaze', icon: '💨', label: 'Trailblaze',
          detail: onCd ? `${remaining}t` : 'Ready',
          disabled: onCd,
          onUse: () => applyRangerMode('flee'),
        },
      ];
    }
    case '🤠': {
      const remaining = YEEHAW_CD - (turn - yeehawTurn);
      const onCd = remaining > 0 && yeehawTurn > -900;
      return [
        {
          id: 'cowboy-yeehaw', icon: '🤠', label: 'YEEHAW',
          detail: onCd ? `${remaining}t` : 'Ready',
          disabled: onCd,
          onUse: handleCowboyTactics,
        },
      ];
    }
    case '🥷': {
      const cd = player.stats.blinkStrikeCooldown ?? 0;
      return [
        {
          id: 'ninja-blink-strike', icon: '⚡', label: 'Blink Strike',
          detail: cd > 0 ? `${cd}t` : 'Ready',
          disabled: cd > 0,
          onUse: handleBlinkStrike,
        },
        {
          id: 'ninja-stealth', icon: stealthOn ? '🤫' : '👁️', label: 'Stealth',
          detail: stealthOn ? 'On' : 'Off',
          disabled: false,
          active: stealthOn,
          onUse: () => applyNinjaMode(!stealthOn),
        },
      ];
    }
    default:
      return [];
  }
}
