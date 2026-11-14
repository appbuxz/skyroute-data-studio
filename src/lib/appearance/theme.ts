export const APPEARANCE_KEY = "flight-analytics:appearance";
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
export const APPEARANCE_INIT_SCRIPT = `(()=>{try{const value=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});const dark=value==='dark'||(value!=='light'&&value!=='dark'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';}catch{const dark=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';}})();`;
