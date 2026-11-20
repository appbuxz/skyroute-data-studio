import { useEffect, useState, type ReactNode } from "react";
import { AppearanceContext } from "./appearance-context";
import {
  APPEARANCE_KEY,
  INTERFACE_STYLE_KEY,
  applyAppearance,
  applyInterfaceStyle,
  parseAppearance,
  readAppearance,
  readInterfaceStyle,
  parseInterfaceStyle,
  type Appearance,
  type InterfaceStyle,
} from "./theme";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setPreference] = useState<Appearance>(readAppearance);
  const [interfaceStyle, setStylePreference] = useState<InterfaceStyle>(readInterfaceStyle);

  useEffect(() => applyInterfaceStyle(interfaceStyle), [interfaceStyle]);

  useEffect(() => {
    applyAppearance(appearance);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => {
      if (appearance === "system") applyAppearance("system");
    };
    media.addEventListener("change", updateSystem);
    return () => media.removeEventListener("change", updateSystem);
  }, [appearance]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === APPEARANCE_KEY || event.key === null) {
        const preference = parseAppearance(event.newValue);
        setPreference(preference);
        applyAppearance(preference);
      }
      if (event.key === INTERFACE_STYLE_KEY || event.key === null) {
        const style = parseInterfaceStyle(event.newValue);
        setStylePreference(style);
        applyInterfaceStyle(style);
      }
    };
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  function setAppearance(preference: Appearance) {
    applyAppearance(preference);
    setPreference(preference);
    try {
      window.localStorage.setItem(APPEARANCE_KEY, preference);
    } catch {
      // Keep the selection working for this session when storage is unavailable.
    }
  }

  function setInterfaceStyle(style: InterfaceStyle) {
    applyInterfaceStyle(style);
    setStylePreference(style);
    try {
      window.localStorage.setItem(INTERFACE_STYLE_KEY, style);
    } catch {
      // Keep the selection working for this session when storage is unavailable.
    }
  }

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance, interfaceStyle, setInterfaceStyle }}>
      {children}
    </AppearanceContext.Provider>
  );
}
