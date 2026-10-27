import { getLocales } from 'expo-localization';
import { create } from 'zustand';

import { ApiError } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';

import { en, type Messages } from './en';
import { fil } from './fil';

export type { Messages, Rich } from './en';

export type Lang = 'en' | 'fil';

/** Shown in each language's own name, so people can find theirs. */
export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fil', label: 'Filipino', short: 'FIL' },
];

const MESSAGES: Record<Lang, Messages> = { en, fil };
const KEY = 'ruta.lang';

/** Filipino when the device is set to Filipino or Tagalog, otherwise English. */
function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'fil' || code === 'tl' ? 'fil' : 'en';
  } catch {
    return 'en';
  }
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: deviceLang(),
  setLang: (lang) => {
    set({ lang });
    setItem(KEY, lang);
  },
}));

/** Applies a language the user picked earlier, which wins over the device language. */
export async function restoreLang() {
  const saved = await getItem(KEY);
  if (saved === 'en' || saved === 'fil') useLangStore.setState({ lang: saved });
}

/** UI text in the current language; re-renders the component when it changes. */
export function useT(): Messages {
  return MESSAGES[useLangStore((s) => s.lang)];
}

/**
 * Words for a failed API call. The server answers in English, so connection and rate-limit
 * failures use translated text; other server messages show as sent.
 */
export function apiErrorText(e: unknown, t: Messages, fallback = t.common.somethingWrong): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.status === 0) return t.common.noConnection;
  if (e.status === 429) return t.common.tooMany;
  return e.message;
}
