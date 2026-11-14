import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LanguageContext } from "./language-context";
import { LANGUAGE_KEY, createTranslator, readLanguage, type Language } from "./language";
export function LanguageProvider({ children }: { children: ReactNode }) {
  // English on the server and first client render keeps hydration deterministic.
  const [language, setPreference] = useState<Language>("en");
  useEffect(() => {
    const stored = readLanguage();
    setPreference(stored);
    document.documentElement.lang = stored;
  }, []);
  const translator = useMemo(() => createTranslator(language), [language]);
  function setLanguage(value: Language) {
    setPreference(value);
    document.documentElement.lang = value;
    try {
      window.localStorage.setItem(LANGUAGE_KEY, value);
    } catch {
      /* Selection remains usable for this session. */
    }
  }
  return (
    <LanguageContext.Provider value={{ ...translator, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
