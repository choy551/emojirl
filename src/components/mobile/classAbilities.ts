import { Player } from '../../game/types';
import { applyEquipmentAndPassives } from '../../game/inventory';
import { blinkStrikeMultiplierPercent, critStat, overkillStatusPhrase } from '../../game/blinkStrike';
import { genieBloodcastEnabled, genieOverchannelEnabled, isArcaneCaster, isFencer, isHitman, isRoyalGuard } from '../../game/prestige';

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
  /** 44px-tall target for a thumb. Used by Genie cast switches. */
  roomy?: boolean;
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
  cycleVoidAttack?: () => void;
  beginUnmake?: () => void;
  unmakeSpent?: boolean;
  voidAttackMode?: 'melee' | 'ranger' | 'wizard';
  handleBackdash: () => void;
  handleLunge: () => void;
  handleExecuteContract: () => void;
  handleGuardianStance: () => void;
  toggleGenieCast?: (which: 'bloodcast' | 'overchannel') => void;
}

export function getClassAbilities(args: ClassAbilityArgs): AbilityDescriptor[] {
  const {
    player, turn, blinkTurn, trailblazeTurn, yeehawTurn, rangerMode, wizardMode, stealthOn,
    applyWizardMode, applyRangerMode, handleCowboyTactics, handleBlinkStrike, applyNinjaMode,
    cycleVoidAttack, beginUnmake, unmakeSpent, voidAttackMode,
    handleBackdash, handleLunge, handleExecuteContract, handleGuardianStance,
    toggleGenieCast,
  } = args;

  if (isArcaneCaster(player.characterClass) && player.characterClass !== '🧙') {
    const remaining = BLINK_TOTAL_CD - (turn - blinkTurn);
    const onCd = remaining > 0 && blinkTurn > -900;
    const bloodOn = genieBloodcastEnabled(player);
    const overOn = genieOverchannelEnabled(player);
    return [
      {
        id: 'genie-blink', icon: '✨', label: 'Blink',
        detail: onCd ? `${remaining}t` : 'Ready',
        disabled: onCd,
        onUse: () => applyWizardMode('holdfire'),
      },
      {
        id: 'genie-aim', icon: '🔥', label: 'Aim',
        detail: wizardMode,
        disabled: false,
        onUse: () => applyWizardMode(wizardMode === 'nearest' ? 'furthest' : wizardMode === 'furthest' ? 'manual' : 'nearest'),
      },
      {
        id: 'genie-bloodcast', icon: '🩸', label: 'Bloodcast',
        detail: bloodOn ? 'On' : 'Off',
        disabled: false,
        active: bloodOn,
        roomy: true,
        onUse: () => toggleGenieCast?.('bloodcast'),
      },
      {
        id: 'genie-overchannel', icon: '🔥', label: 'Overchannel',
        detail: overOn ? 'On' : 'Off',
        disabled: false,
        active: overOn,
        roomy: true,
        onUse: () => toggleGenieCast?.('overchannel'),
      },
    ];
  }
  if (isFencer(player.characterClass)) {
    const back = player.stats.backdashCooldown ?? 0;
    const lunge = player.stats.lungeCooldown ?? 0;
    return [
      { id: 'fencer-back', icon: '🤺', label: 'Backdash', detail: back > 0 ? `${back}t` : 'Ready', disabled: back > 0, onUse: handleBackdash },
      { id: 'fencer-lunge', icon: '⚔️', label: 'Lunge', detail: lunge > 0 ? `${lunge}t` : 'Ready', disabled: lunge > 0, onUse: handleLunge },
    ];
  }
  if (isHitman(player.characterClass)) {
    const cd = player.stats.executeCooldown ?? 0;
    return [
      { id: 'hitman-execute', icon: '🕴️', label: 'Execute', detail: cd > 0 ? `${cd}t` : 'Ready', disabled: cd > 0, onUse: handleExecuteContract },
      { id: 'hitman-stealth', icon: stealthOn ? '🤫' : '👁️', label: 'Stealth', detail: stealthOn ? 'On' : 'Off', disabled: false, active: stealthOn, onUse: () => applyNinjaMode(!stealthOn) },
    ];
  }
  if (isRoyalGuard(player.characterClass)) {
    const up = player.stats.guardianStanceTurns ?? 0;
    const cd = player.stats.guardianStanceCooldown ?? 0;
    return [
      { id: 'guard-mode', icon: rangerMode === 'ranged' ? '🏹' : '⚔️', label: rangerMode === 'ranged' ? 'Ranged' : 'Melee', detail: 'Swap', disabled: false, onUse: () => applyRangerMode(rangerMode === 'ranged' ? 'melee' : 'ranged') },
      { id: 'guard-stance', icon: '💂', label: 'Stance', detail: up > 0 ? `${up}t` : cd > 0 ? `${cd}t` : 'Ready', disabled: up > 0 || cd > 0, onUse: handleGuardianStance },
    ];
  }

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
      const pct = blinkStrikeMultiplierPercent(critStat(applyEquipmentAndPassives(player).stats.luck), player.stats.blinkTalents);
      const overkill = overkillStatusPhrase(player.stats);
      const detailCore = cd > 0 ? `${pct}% · ${cd}t` : `${pct}% · Ready`;
      return [
        {
          id: 'ninja-blink-strike', icon: '⚡', label: 'Blink Strike',
          detail: overkill ? `${detailCore} · ${overkill}` : detailCore,
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
    case '👤': {
      const mode = voidAttackMode ?? 'melee';
      const modeLabel = mode === 'ranger' ? 'Ranger' : mode === 'wizard' ? 'Wizard' : 'Melee';
      const modeIcon = mode === 'ranger' ? '🏹' : mode === 'wizard' ? '🎯' : '⚔️';
      return [
        {
          id: 'void-attack-mode', icon: modeIcon, label: modeLabel,
          detail: 'Cycle',
          disabled: false,
          active: mode !== 'melee',
          onUse: () => cycleVoidAttack?.(),
        },
        {
          id: 'void-unmake', icon: '🕳️', label: 'Unmake',
          detail: unmakeSpent ? 'Spent' : 'U',
          disabled: !!unmakeSpent,
          onUse: () => beginUnmake?.(),
        },
      ];
    }
    default:
      return [];
  }
}
