import { useEffect, useState, type ReactNode } from "react";
import { AppearanceContext } from "./appearance-context";
import {
  APPEARANCE_KEY,
  applyAppearance,
  parseAppearance,
  readAppearance,
  type Appearance,
} from "./theme";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setPreference] = useState<Appearance>(readAppearance);

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
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== APPEARANCE_KEY && event.key !== null)
      )
        return;
      const preference = parseAppearance(event.newValue);
      setPreference(preference);
      applyAppearance(preference);
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

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
