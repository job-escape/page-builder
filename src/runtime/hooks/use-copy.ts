import { useCallback, useMemo } from "react";

import type { CopyLookup, OnUnknown } from "../funnel-types";
import { localizedImage } from "../locale";
import { interpolate, type CopyParams, type RichText } from "../rich-text";

/**
 * The locale lookup a screen is handed as `t`: the words for a key in the
 * active language, the default language's when it has none, and the picture
 * to draw for a source in that language (`t.image`).
 */
export function useCopy(
  locale: Record<string, RichText>,
  fallbackLocale: Record<string, RichText> | undefined,
  onUnknown: OnUnknown | undefined,
): CopyLookup {
  /*
    The design's own words, by what they say in the language it was written in.

    A text that shows an answer — "Current status: {status}" — is handed the
    answer's value, and a value is what the option was authored as: "Business
    owner", whatever language the visitor reads. But that phrase is also the
    option's label, which has a translation. So a value that is exactly one of
    the design's texts is shown as that text in the visitor's language; one
    that is not — a name, a number, an email — goes in as it came.
  */
  const said = useMemo(() => {
    if (!fallbackLocale || fallbackLocale === locale) return null;
    const keys = new Map<string, string>();
    Object.entries(fallbackLocale).forEach(([key, text]) => {
      if (typeof text === "string" && text && !keys.has(text) && typeof locale[key] === "string") {
        keys.set(text, key);
      }
    });
    return keys.size > 0 ? keys : null;
  }, [locale, fallbackLocale]);

  const shown = useCallback(
    (given: CopyParams): CopyParams => {
      if (!said) return given;
      const out: Record<string, string | number> = {};
      Object.entries(given).forEach(([name, value]) => {
        const known = typeof value === "string" ? said.get(value) : undefined;
        out[name] = known ? (locale[known] as string) : value;
      });
      return out;
    },
    [said, locale],
  );

  const t = useCallback(
    (key: string, params?: CopyParams) => {
      /**
       * Filled only when a caller passed parameters.
       *
       * Copy that has never been interpolated is never scanned, so a headline
       * that genuinely contains `{braces}` reads exactly as it always has —
       * which is what makes this safe to add to a runtime that already serves
       * published artifacts.
       */
      const fill = (value: RichText): RichText =>
        params ? interpolate(value, shown(params), (name) => onUnknown?.("param", name)) : value;

      const value = locale[key];
      if (value !== undefined) return fill(value);
      /**
       * Reported before the fallback is tried, not instead of it.
       *
       * A key the active locale cannot answer is the fact worth logging
       * whether or not something else could — a locale that has quietly
       * rotted still renders, and silence is how it stays rotten. The
       * customer sees words either way; the operator sees the gap.
       */
      onUnknown?.("key", key);
      const fallback = fallbackLocale?.[key];
      if (fallback !== undefined) return fill(fallback);
      // Never show a raw key to a customer; an empty string is less wrong.
      return "";
    },
    [locale, fallbackLocale, onUnknown, shown],
  );
  return useMemo<CopyLookup>(
    () =>
      Object.assign((key: string, params?: CopyParams) => t(key, params), {
        image: (src: string) => localizedImage(locale, src),
        said: (words: string) => {
          const known = said?.get(words);
          return known ? (locale[known] as string) : words;
        },
      }),
    [t, locale, said],
  );
}
