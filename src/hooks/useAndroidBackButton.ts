import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface OverlayLayer {
  id: string;
  isOpen: () => boolean;
  close: () => void;
}

/** Close the innermost open overlay. Returns its id, or null if nothing was open. */
export function closeTopOverlay(layers: OverlayLayer[]): string | null {
  for (const layer of layers) {
    if (layer.isOpen()) {
      layer.close();
      return layer.id;
    }
  }
  return null;
}

/**
 * Hardware/gesture Back on Android, and the browser Back button on mobile web:
 * close the topmost menu first. Only leave the game when nothing is open.
 */
export function useAndroidBackButton(closeTop: () => boolean, onExitGame: () => void) {
  const closeRef = useRef(closeTop);
  closeRef.current = closeTop;
  const exitRef = useRef(onExitGame);
  exitRef.current = onExitGame;

  useEffect(() => {
    const consume = (): boolean => closeRef.current();

    if (Capacitor.isNativePlatform()) {
      const listener = App.addListener('backButton', () => {
        if (consume()) return;
        exitRef.current();
      });
      return () => { listener.then(l => l.remove()); };
    }

    // Mobile browsers / PWA: Back pops history. Keep a sentinel entry so the
    // first Back stays on /game and can close a menu instead of leaving.
    history.pushState({ emojirlStay: true }, '');
    const onPopState = () => {
      if (consume()) {
        history.pushState({ emojirlStay: true }, '');
        return;
      }
      exitRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
