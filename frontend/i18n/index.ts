import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import ko from "./ko.json";
import en from "./en.json";

const languageDetector = {
  type: "languageDetector" as const,
  async: false,
  detect: () => {
    const locale = Localization.getLocales()[0]?.languageCode ?? "ko";
    const supported = ["ko", "en"];
    return supported.includes(locale) ? locale : "ko";
  },
  init: () => {},
  cacheUserLanguage: () => {},
};

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v3",
    resources: { ko: { translation: ko }, en: { translation: en } },
    fallbackLng: "ko",
    interpolation: { escapeValue: false },
  });

export default i18n;
export const supportedLanguages = ["ko", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];
