import { createContext, useContext } from "react";
import { createTranslator, type Language } from "./language";
export const LanguageContext = createContext({
  ...createTranslator("en"),
  setLanguage: (_language: Language) => {},
});
export function useLanguage() {
  return useContext(LanguageContext);
}
