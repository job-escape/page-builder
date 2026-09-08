/**
 * Which words a visitor gets, and where they come from.
 *
 * Every host asked this question and each answered it differently — or, in the
 * web funnel's case, did not ask it at all and handed `manifest.locales.en` to
 * every visitor on earth. So the answer lives once, here, and the three hosts
 * differ only in *how they learn what the visitor wants*: a `?lang=` on the
 * web, the device's own setting on a phone. That part is genuinely theirs and
 * is not in this file.
 *
 * **Two shapes, on purpose.** A manifest may carry its words inline
 * (`locales`) or point at a file per locale (`localeBundles`), and this reads
 * either without the caller knowing which. Every artifact published so far is
 * the first shape; the second exists so a visitor fetches the one language
 * they are reading instead of all twelve. A host written against this today
 * keeps working when publish starts emitting bundles, which is the whole
 * reason the two lanes could be built at the same time.
 *
 * **The default locale is always inline.** It is the fallback, and a fallback
 * that could itself fail to arrive is not one — so it costs no fetch and
 * cannot be the thing that breaks.
 */
import type { FunnelManifest } from "./compiler/manifest";
import type { RichText } from "./rich-text";

/** The locale an artifact is assumed to be authored in when it does not say. */
export const DEFAULT_LOCALE = "en";

/**
 * Base languages whose script runs right to left.
 *
 * Kept here rather than only in the manifest because an artifact published
 * before `localeMeta` existed still has to lay out Arabic correctly, and the
 * answer for a base language does not vary by funnel. `localeMeta` overrides
 * it where a publish has an opinion.
 */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi"]);

export type TextDirection = "ltr" | "rtl";

export type LoadedLocale = {
  /**
   * The locale actually being rendered — which is not always the one asked
   * for. Null only when the manifest carries no words at all.
   */
  code: string | null;
  /** The words for `code`. */
  locale: Record<string, RichText>;
  /** The default locale's words, for `t()` to fall through to. */
  fallback: Record<string, RichText>;
  dir: TextDirection;
};

export type LoadLocaleOptions = {
  /** Swappable so a test does not need a network, and a host can add caching. */
  fetchImpl?: typeof fetch;
  /**
   * A locale that was asked for and could not be served, with why.
   *
   * Not an exception: a funnel that renders in the wrong language is a funnel
   * a visitor can still finish, and throwing here would trade a translation
   * problem for a blank page.
   */
  onProblem?: (code: string, reason: string) => void;
};

/** The default locale this artifact falls back to. */
export function defaultLocaleOf(manifest: FunnelManifest): string {
  return manifest.defaultLocale ?? DEFAULT_LOCALE;
}

/** Every locale this artifact can serve, inline or by pointer. */
export function availableLocales(manifest: FunnelManifest): string[] {
  return [
    ...new Set([
      ...Object.keys(manifest.locales ?? {}),
      ...Object.keys(manifest.localeBundles ?? {}),
    ]),
  ];
}

/**
 * A requested tag, resolved to something this artifact actually has.
 *
 * Exact match first so `pt-br` and `es-419` win as themselves, then the base
 * language so `es-MX` lands on `es` rather than on nothing. Unknown tags
 * answer null and the caller falls back — never an error, because the tag
 * came from a URL a stranger typed or a phone nobody configured.
 */
export function resolveLocale(
  manifest: FunnelManifest,
  requested: string | null | undefined,
): string | null {
  if (!requested) return null;
  const available = new Set(availableLocales(manifest));
  const tag = requested.trim().toLowerCase().replace(/_/g, "-");
  if (!tag) return null;
  if (available.has(tag)) return tag;
  const base = tag.split("-")[0];
  return base && available.has(base) ? base : null;
}

/** Which way a locale's script runs. */
export function directionOf(manifest: FunnelManifest, code: string | null): TextDirection {
  if (!code) return "ltr";
  const declared = manifest.localeMeta?.[code]?.dir;
  if (declared) return declared;
  return RTL_LANGUAGES.has(code.split("-")[0] ?? "") ? "rtl" : "ltr";
}

async function wordsFor(
  manifest: FunnelManifest,
  code: string,
  options: LoadLocaleOptions,
): Promise<Record<string, RichText> | null> {
  const inline = manifest.locales?.[code];
  if (inline) return inline;

  const url = manifest.localeBundles?.[code];
  if (!url) return null;

  try {
    const get = options.fetchImpl ?? fetch;
    const answer = await get(url);
    if (!answer.ok) {
      options.onProblem?.(code, `bundle responded ${answer.status}`);
      return null;
    }
    return (await answer.json()) as Record<string, RichText>;
  } catch (cause) {
    options.onProblem?.(code, `bundle did not load: ${String(cause)}`);
    return null;
  }
}

/**
 * The words to render, for a visitor who asked for `requested`.
 *
 * Degrades in one direction only — towards the default locale, never towards
 * nothing. A tag that matches no locale, and a bundle that does not load, both
 * end the same way: the visitor reads the funnel in the language it was
 * authored in, and `onProblem` says so to whoever is watching.
 */
export async function loadLocale(
  manifest: FunnelManifest,
  requested: string | null | undefined,
  options: LoadLocaleOptions = {},
): Promise<LoadedLocale> {
  const defaultCode = defaultLocaleOf(manifest);
  const fallback = manifest.locales?.[defaultCode] ?? {};

  const wanted = resolveLocale(manifest, requested);
  if (!wanted || wanted === defaultCode) {
    return {
      code: manifest.locales?.[defaultCode] || manifest.localeBundles?.[defaultCode]
        ? defaultCode
        : null,
      locale: fallback,
      fallback,
      dir: directionOf(manifest, defaultCode),
    };
  }

  const words = await wordsFor(manifest, wanted, options);
  if (!words) {
    // Fully to the default, including its direction: rendering English words
    // right-to-left because Arabic was asked for is worse than either.
    return { code: defaultCode, locale: fallback, fallback, dir: directionOf(manifest, defaultCode) };
  }

  return { code: wanted, locale: words, fallback, dir: directionOf(manifest, wanted) };
}
