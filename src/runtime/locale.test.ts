/**
 * Which words a visitor gets.
 *
 * All three hosts choose a language through this one function, and it is the
 * only place that decides what happens when they cannot have the one they
 * asked for. The property worth holding is that it degrades in exactly one
 * direction — towards the language the funnel was authored in, never towards
 * nothing — because the alternative is a blank screen for a visitor whose tag
 * we did not recognise.
 */
import { availableLocales, defaultLocaleOf, directionOf, loadLocale, resolveLocale } from "./locale";
import type { FunnelManifest } from "./compiler/manifest";

const manifest = (over: Partial<FunnelManifest> = {}): FunnelManifest =>
  ({
    version: "v1",
    entry: "s1",
    variables: [],
    overlayDefaults: {},
    visitorFacts: [],
    screens: [],
    locales: { en: { "a.text": "Pick one" } },
    ...over,
  }) as FunnelManifest;

const answering = (body: unknown, ok = true) =>
  jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body }) as never;

describe("resolving a tag", () => {
  it("takes an exact match first, so a regional variant wins as itself", () => {
    const m = manifest({ locales: { en: {}, "pt-br": {}, pt: {} } });

    expect(resolveLocale(m, "pt-BR")).toBe("pt-br");
  });

  it("falls back to the base language", () => {
    const m = manifest({ locales: { en: {}, es: {} } });

    expect(resolveLocale(m, "es-MX")).toBe("es");
  });

  it("tolerates the underscore spelling a phone might send", () => {
    const m = manifest({ locales: { en: {}, "pt-br": {} } });

    expect(resolveLocale(m, "pt_BR")).toBe("pt-br");
  });

  it("answers nothing for a tag this funnel does not have", () => {
    // The tag came from a URL a stranger typed or a phone nobody configured,
    // so this is never an error.
    expect(resolveLocale(manifest(), "de")).toBeNull();
    expect(resolveLocale(manifest(), "")).toBeNull();
    expect(resolveLocale(manifest(), null)).toBeNull();
  });

  it("counts a language it can only reach by fetching", () => {
    const m = manifest({ localeBundles: { de: "https://cdn/de.json" } });

    expect(availableLocales(m).sort()).toEqual(["de", "en"]);
    expect(resolveLocale(m, "de")).toBe("de");
  });
});

describe("direction", () => {
  it("knows a right-to-left script without being told", () => {
    // An artifact published before `localeMeta` existed still has to lay out
    // Arabic correctly.
    expect(directionOf(manifest(), "ar")).toBe("rtl");
    expect(directionOf(manifest(), "ar-EG")).toBe("rtl");
    expect(directionOf(manifest(), "es")).toBe("ltr");
  });

  it("lets a publish overrule it", () => {
    const m = manifest({ localeMeta: { es: { dir: "rtl" } } });

    expect(directionOf(m, "es")).toBe("rtl");
  });

  it("says left-to-right when there is no locale at all", () => {
    expect(directionOf(manifest(), null)).toBe("ltr");
  });
});

describe("loading", () => {
  it("reads a language carried inline", async () => {
    const m = manifest({ locales: { en: { a: "Pick" }, es: { a: "Elige" } } });

    const loaded = await loadLocale(m, "es");

    expect(loaded.code).toBe("es");
    expect(loaded.locale).toEqual({ a: "Elige" });
    // The default travels with it, because that is what `t()` falls through to.
    expect(loaded.fallback).toEqual({ a: "Pick" });
  });

  it("fetches a language that lives in its own file", async () => {
    const m = manifest({ localeBundles: { de: "https://cdn/de.json" } });
    const fetchImpl = answering({ "a.text": "Such eins aus" });

    const loaded = await loadLocale(m, "de", { fetchImpl });

    expect(loaded.locale).toEqual({ "a.text": "Such eins aus" });
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn/de.json");
  });

  it("does not fetch for the language already inline", async () => {
    const fetchImpl = answering({});

    await loadLocale(manifest(), "en", { fetchImpl });

    // The default is the fallback, and a fallback that could fail to arrive is
    // not one.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives the default language when the tag matches nothing", async () => {
    const loaded = await loadLocale(manifest(), "de");

    expect(loaded.code).toBe("en");
    expect(loaded.locale).toEqual({ "a.text": "Pick one" });
  });

  it("gives the default language when the bundle will not load", async () => {
    const m = manifest({ localeBundles: { de: "https://cdn/de.json" } });
    const onProblem = jest.fn();

    const loaded = await loadLocale(m, "de", { fetchImpl: answering(null, false), onProblem });

    expect(loaded.locale).toEqual({ "a.text": "Pick one" });
    expect(onProblem).toHaveBeenCalledWith("de", expect.stringContaining("404"));
  });

  it("falls all the way back, direction included", async () => {
    // Rendering English words right-to-left because Arabic was asked for is
    // worse than either.
    const m = manifest({ localeBundles: { ar: "https://cdn/ar.json" } });

    const loaded = await loadLocale(m, "ar", { fetchImpl: answering(null, false) });

    expect(loaded.code).toBe("en");
    expect(loaded.dir).toBe("ltr");
  });

  it("survives a network that throws rather than answers", async () => {
    const m = manifest({ localeBundles: { de: "https://cdn/de.json" } });
    const fetchImpl = jest.fn().mockRejectedValue(new Error("offline")) as never;

    const loaded = await loadLocale(m, "de", { fetchImpl });

    expect(loaded.code).toBe("en");
  });

  it("honours a funnel written in something other than English", async () => {
    const m = manifest({ defaultLocale: "de", locales: { de: { a: "Eins" } } });

    expect(defaultLocaleOf(m)).toBe("de");
    expect((await loadLocale(m, "fr")).locale).toEqual({ a: "Eins" });
  });
});
