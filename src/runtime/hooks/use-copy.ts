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
        params ? interpolate(value, params, (name) => onUnknown?.("param", name)) : value;

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
    [locale, fallbackLocale, onUnknown],
  );
  return useMemo<CopyLookup>(
    () =>
      Object.assign((key: string, params?: CopyParams) => t(key, params), {
        image: (src: string) => localizedImage(locale, src),
      }),
    [t, locale],
  );
}
