/**
 * Screens a host hands over when they are needed rather than all at once.
 *
 * A published funnel is split per screen, and a host that fetched every tree
 * before drawing the first would make the entry wait for the whole funnel. So a
 * host may pass the screens it has and a `loadScreen` for the rest: this asks
 * for the screen the visitor is on, any overlay open over it, and whichever
 * screens the funnel is about to prerender — and nothing else.
 *
 * No JSX and no platform imports, so React Native can use it unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Fetch one screen by id. `null` or a rejection is "not now": the screen is
 * asked for again the next time it is wanted — arriving on it, or it coming
 * back into the prerender window — never in a loop.
 */
export type LoadScreen<Module> = (id: string) => Promise<Module | null | undefined>;

export function useLoadedScreens<Module>({
  screens,
  loadScreen,
  wanted,
}: {
  /** What the host handed over up front. Always wins over a loaded copy. */
  screens: Record<string, Module>;
  loadScreen?: LoadScreen<Module>;
  /** The ids needed now, most urgent first. */
  wanted: readonly string[];
}): Record<string, Module> {
  const [loaded, setLoaded] = useState<Record<string, Module>>({});
  /** Asked for and not yet answered — so a re-render does not ask twice. */
  const asking = useRef(new Set<string>());
  /**
   * Screens that failed, with what was wanted when they did. Asked again only
   * once that changes — not every time some other screen arrives.
   */
  const failed = useRef(new Map<string, string>());
  /*
    Through a ref: hosts write the loader inline, which is a new function every
    render, and asking again on every render is what `asking` would then have
    to absorb.
  */
  const loader = useRef(loadScreen);
  loader.current = loadScreen;
  const lazy = Boolean(loadScreen);
  const key = wanted.join("\n");

  useEffect(() => {
    const load = loader.current;
    if (!load) return;
    key.split("\n").forEach((id) => {
      if (!id || screens[id] || loaded[id] || asking.current.has(id)) return;
      if (failed.current.get(id) === key) return;
      asking.current.add(id);
      const settle = (module: Module | null | undefined): void => {
        asking.current.delete(id);
        if (!module) {
          failed.current.set(id, key);
          return;
        }
        failed.current.delete(id);
        setLoaded((held) => (held[id] ? held : { ...held, [id]: module }));
      };
      load(id).then(settle, () => settle(null));
    });
  }, [key, lazy, screens, loaded]);

  return useMemo(() => ({ ...loaded, ...screens }), [loaded, screens]);
}
