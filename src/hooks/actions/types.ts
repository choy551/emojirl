import type { MutableRefObject } from 'react';
import { GameState, Player } from '../../game/types';

export interface GameRefs {
  gameStateRef: MutableRefObject<GameState | null>;
  wizardTacticsRef: MutableRefObject<{ mode: 'nearest' | 'furthest' | 'manual' | 'holdfire'; manualTargetId: string | null }>;
  autoStealthRef: MutableRefObject<boolean>;
  rangerModeRef: MutableRefObject<'ranged' | 'melee' | 'flee'>;
  yeehawTurnRef: MutableRefObject<number>;
  lastCowboyFlavorTurnRef: MutableRefObject<number>;
  inspectedEnemyIdRef: MutableRefObject<string | null>;
  dirPickModeRef: MutableRefObject<'gun' | 'freeze' | 'boomerang' | 'bomb' | null>;
  boatConfirmedRef: MutableRefObject<boolean>;
  blinkTurnRef: MutableRefObject<number>;
  trailblazeTurnRef: MutableRefObject<number>;
  restaurantClosedRef: MutableRefObject<boolean>;
}

export interface GameSetters {
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  setWizardTactics: React.Dispatch<React.SetStateAction<{ mode: 'nearest' | 'furthest' | 'manual' | 'holdfire'; manualTargetId: string | null }>>;
  setAutoStealth: React.Dispatch<React.SetStateAction<boolean>>;
  setRangerMode: React.Dispatch<React.SetStateAction<'ranged' | 'melee' | 'flee'>>;
  setYeehawTurn: React.Dispatch<React.SetStateAction<number>>;
  setAutoExplore: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoRest: React.Dispatch<React.SetStateAction<boolean>>;
  setInspectedEnemyId: React.Dispatch<React.SetStateAction<string | null>>;
  setDirPickMode: React.Dispatch<React.SetStateAction<'gun' | 'freeze' | 'boomerang' | 'bomb' | null>>;
  setBagTab: React.Dispatch<React.SetStateAction<'hotbar' | 'equipment' | 'bank'>>;
  setBankOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setDrownWarnSlot: React.Dispatch<React.SetStateAction<number | null>>;
  setLastBoatWarnSlot: React.Dispatch<React.SetStateAction<number | null>>;
  setPendingFairyId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingMonkeyInteraction: React.Dispatch<React.SetStateAction<{ id: string; wants: string } | null>>;
  setPendingAdventurerInteraction: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingBearInteraction: React.Dispatch<React.SetStateAction<{ id: string; stage: 'neutral' | 'friendly'; offerId: string | null } | null>>;
  setBlinkTurn: React.Dispatch<React.SetStateAction<number>>;
  setTrailblazeTurn: React.Dispatch<React.SetStateAction<number>>;
}

export type AddLog = (text: string) => void;

export type ApplyMonkeyDropOnKill = (killed: any, p: Player) => Player;
