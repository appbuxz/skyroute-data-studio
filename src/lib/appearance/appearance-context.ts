import { createContext, useContext } from "react";
import type { Appearance, ColorPalette, InterfaceStyle } from "./theme";

export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  colorPalette: ColorPalette;
  setColorPalette: (palette: ColorPalette) => void;
  interfaceStyle: InterfaceStyle;
  setInterfaceStyle: (style: InterfaceStyle) => void;
} | null>(null);

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("Appearance provider is required");
  return context;
}
