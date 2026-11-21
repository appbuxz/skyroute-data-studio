export const COLOR_PALETTE_KEY = "flight-analytics:color-palette";
export const COLOR_PALETTES = ["cobalt", "jade", "violet", "graphite", "candy-rose", "original"] as const;
export type ColorPalette = (typeof COLOR_PALETTES)[number];
const DEFAULT_COLOR_PALETTE: ColorPalette = "cobalt";

export function parseColorPalette(value: string | null): ColorPalette {
  return COLOR_PALETTES.includes(value as ColorPalette)
    ? (value as ColorPalette)
    : DEFAULT_COLOR_PALETTE;
}

export function readColorPalette(): ColorPalette {
  if (typeof window === "undefined") return DEFAULT_COLOR_PALETTE;
  try {
    return parseColorPalette(window.localStorage.getItem(COLOR_PALETTE_KEY));
  } catch {
    return DEFAULT_COLOR_PALETTE;
  }
}

export function applyColorPalette(palette: ColorPalette) {
  document.documentElement.dataset.colorPalette = palette;
}

export const APPEARANCE_KEY = "flight-analytics:appearance";
export const INTERFACE_STYLE_KEY = "flight-analytics:interface-style";
export const INTERFACE_STYLES = ["current", "client-first", "analyst", "agency-desk"] as const;
export type InterfaceStyle = (typeof INTERFACE_STYLES)[number];

export function parseInterfaceStyle(value: string | null): InterfaceStyle {
  return INTERFACE_STYLES.includes(value as InterfaceStyle) ? (value as InterfaceStyle) : "current";
}

export function readInterfaceStyle(): InterfaceStyle {
  if (typeof window === "undefined") return "current";
  try {
    return parseInterfaceStyle(window.localStorage.getItem(INTERFACE_STYLE_KEY));
  } catch {
    return "current";
  }
}

export function applyInterfaceStyle(style: InterfaceStyle) {
  document.documentElement.dataset.interfaceStyle = style;
}

export const APPEARANCES = ["light", "dark", "system"] as const;
export type Appearance = (typeof APPEARANCES)[number];

export function parseAppearance(value: string | null): Appearance {
  return APPEARANCES.includes(value as Appearance) ? (value as Appearance) : "system";
}

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return "system";
  try {
    return parseAppearance(window.localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return "system";
  }
}

export function applyAppearance(appearance: Appearance) {
  const dark =
    appearance === "dark" ||
    (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

// Runs before the stylesheet/React hydration, including direct private-page loads.
export const APPEARANCE_INIT_SCRIPT = `(()=>{
  let mode, style, palette;
  try {
    mode=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});
    style=localStorage.getItem(${JSON.stringify(INTERFACE_STYLE_KEY)});
    palette=localStorage.getItem(${JSON.stringify(COLOR_PALETTE_KEY)});
  } catch {}
  const dark=mode==='dark'||(mode!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const root=document.documentElement;
  root.classList.toggle('dark',dark);
  root.style.colorScheme=dark?'dark':'light';
  root.dataset.colorPalette=${JSON.stringify(COLOR_PALETTES)}.includes(palette)?palette:${JSON.stringify(DEFAULT_COLOR_PALETTE)};
  root.dataset.interfaceStyle=${JSON.stringify(INTERFACE_STYLES)}.includes(style)?style:'current';
})();`;
