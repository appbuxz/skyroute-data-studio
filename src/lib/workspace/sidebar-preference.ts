export const SIDEBAR_PREFERENCE_KEY = "flight-analytics:sidebar";

export function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "collapsed";
  } catch {
    return false;
  }
}
