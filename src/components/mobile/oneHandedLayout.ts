import { createContext, useContext, type CSSProperties } from 'react';
import type { ControlSettings } from '../../game/types';

export type HandSide = 'left' | 'right';

/** D-pad / thumb cluster side. */
export function controlSide(settings: ControlSettings): HandSide {
  return settings.dpadSide;
}

/** Context + ability cluster. Opposite the d-pad unless one-handed. */
export function actionSide(settings: ControlSettings): HandSide {
  if (settings.oneHanded) return settings.dpadSide;
  return settings.dpadSide === 'right' ? 'left' : 'right';
}

/** `dpadSide` when one-handed is on; otherwise centered overlays. */
export function overlayHand(settings: ControlSettings, isMobile: boolean): HandSide | null {
  if (!isMobile || !settings.oneHanded) return null;
  return settings.dpadSide;
}

export const MobileHandContext = createContext<HandSide | null>(null);

export function useMobileHand(): HandSide | null {
  return useContext(MobileHandContext);
}

export function overlayFlexClass(hand: HandSide | null | undefined): string {
  if (!hand) return 'items-center justify-center';
  return `items-end ${hand === 'right' ? 'justify-end' : 'justify-start'}`;
}

export function overlayPanelClass(hand: HandSide | null | undefined): string {
  if (!hand) return '';
  const round = hand === 'right' ? 'rounded-l-2xl rounded-r-none' : 'rounded-r-2xl rounded-l-none';
  return `${round} max-w-[min(22rem,90vw)] w-full max-h-[85vh]`;
}

export function overlayPanelStyle(hand: HandSide | null | undefined): CSSProperties {
  if (!hand) return {};
  return {
    paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
    ...(hand === 'right'
      ? { paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))' }
      : { paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))' }),
  };
}
