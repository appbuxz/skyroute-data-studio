import { createContext, useContext } from "react";
import type { Appearance } from "./theme";

export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
} | null>(null);

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("Appearance provider is required");
  return context;
}
