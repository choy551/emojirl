import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface AndroidBackButtonHandlers {
  dirPickMode: string | null;
  setDirPickMode: (v: null) => void;
  statsExpanded: boolean;
  setStatsExpanded: (v: boolean) => void;
  actionsMenuOpen: boolean;
  setActionsMenuOpen: (v: boolean) => void;
  shopOpen: boolean;
  setShopOpen: (v: boolean) => void;
  bankOpen: boolean;
  setBankOpen: (v: boolean) => void;
  ammoCacheOpen: boolean;
  setAmmoCacheOpen: (v: boolean) => void;
  restaurantOpen: boolean;
  setRestaurantOpen: (v: boolean) => void;
  logOpen: boolean;
  setLogOpen: (v: boolean) => void;
  tacticsMenuOpen: boolean;
  setTacticsMenuOpen: (v: boolean) => void;
  gotoMenuOpen: boolean;
  setGotoMenuOpen: (v: boolean) => void;
  showRTFM: boolean;
  setShowRTFM: (v: boolean) => void;
  optionsOpen: boolean;
  setOptionsOpen: (v: boolean) => void;
  pauseMenuOpen: boolean;
  setPauseMenuOpen: (v: boolean) => void;
  onNavigateHome: () => void;
}

/**
 * Handles the Android hardware/gesture back button while in-game.
 * Closes open modals in priority order (innermost first).
 * If nothing is open, navigates home so the app is not killed mid-run.
 * Only registers the listener when running on a native Android platform.
 */
export function useAndroidBackButton(handlers: AndroidBackButtonHandlers) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('backButton', () => {
      const {
        dirPickMode, setDirPickMode,
        statsExpanded, setStatsExpanded,
        actionsMenuOpen, setActionsMenuOpen,
        shopOpen, setShopOpen,
        bankOpen, setBankOpen,
        ammoCacheOpen, setAmmoCacheOpen,
        restaurantOpen, setRestaurantOpen,
        logOpen, setLogOpen,
        tacticsMenuOpen, setTacticsMenuOpen,
        gotoMenuOpen, setGotoMenuOpen,
        showRTFM, setShowRTFM,
        optionsOpen, setOptionsOpen,
        pauseMenuOpen, setPauseMenuOpen,
        onNavigateHome,
      } = handlers;

      if (dirPickMode !== null)  { setDirPickMode(null);          return; }
      if (statsExpanded)         { setStatsExpanded(false);        return; }
      if (actionsMenuOpen)       { setActionsMenuOpen(false);      return; }
      if (shopOpen)              { setShopOpen(false);             return; }
      if (bankOpen)              { setBankOpen(false);             return; }
      if (ammoCacheOpen)         { setAmmoCacheOpen(false);        return; }
      if (restaurantOpen)        { setRestaurantOpen(false);       return; }
      if (logOpen)               { setLogOpen(false);              return; }
      if (tacticsMenuOpen)       { setTacticsMenuOpen(false);      return; }
      if (gotoMenuOpen)          { setGotoMenuOpen(false);         return; }
      if (showRTFM)              { setShowRTFM(false);             return; }
      if (optionsOpen)           { setOptionsOpen(false);          return; }
      if (pauseMenuOpen)         { setPauseMenuOpen(false);        return; }

      onNavigateHome();
    });

    return () => {
      listener.then(l => l.remove());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    handlers.dirPickMode,
    handlers.statsExpanded,
    handlers.actionsMenuOpen,
    handlers.shopOpen,
    handlers.bankOpen,
    handlers.ammoCacheOpen,
    handlers.restaurantOpen,
    handlers.logOpen,
    handlers.tacticsMenuOpen,
    handlers.gotoMenuOpen,
    handlers.showRTFM,
    handlers.optionsOpen,
    handlers.pauseMenuOpen,
  ]);
}
