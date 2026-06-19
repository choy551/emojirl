import { useCallback, useEffect, useState } from 'react';
import { ControlSettings, DEFAULT_CONTROL_SETTINGS } from '../game/types';

const STORAGE_KEY = 'emojirl_controls';
const LEGACY_DPAD_SIDE_KEY = 'emojirl_dpad_side';

function loadSettings(): ControlSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_CONTROL_SETTINGS };
  let parsed: Partial<ControlSettings> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw) as Partial<ControlSettings>;
  } catch {
    parsed = {};
  }
  // Migrate the legacy standalone d-pad side preference if present and not yet set.
  const legacySide = localStorage.getItem(LEGACY_DPAD_SIDE_KEY);
  const dpadSide = parsed.dpadSide ?? (legacySide === 'left' ? 'left' : legacySide === 'right' ? 'right' : DEFAULT_CONTROL_SETTINGS.dpadSide);
  return { ...DEFAULT_CONTROL_SETTINGS, ...parsed, dpadSide };
}

export function useControlSettings() {
  const [settings, setSettings] = useState<ControlSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      // Keep the legacy key in sync so VirtualDpad's initial read stays correct.
      localStorage.setItem(LEGACY_DPAD_SIDE_KEY, settings.dpadSide);
    } catch {
      /* ignore quota / private-mode write failures */
    }
  }, [settings]);

  const setSetting = useCallback(<K extends keyof ControlSettings>(key: K, value: ControlSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleSetting = useCallback((key: keyof ControlSettings) => {
    setSettings(prev => {
      const cur = prev[key];
      if (typeof cur !== 'boolean') return prev;
      return { ...prev, [key]: !cur };
    });
  }, []);

  return { settings, setSetting, toggleSetting };
}
