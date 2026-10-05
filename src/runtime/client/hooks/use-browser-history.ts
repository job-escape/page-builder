/**
 * The browser's Back and Forward, as the funnel's.
 *
 * A funnel is one page as far as a browser is concerned, so its Back left the
 * funnel altogether. With a `browserHistory` (the host saying what address a
 * screen has) each screen arrived on is a history entry of its own:
 *
 * - **Going on** pushes an entry at the screen's address.
 * - **The browser's Back** goes back in the funnel — or closes what is open
 *   over the screen, as the funnel's own back does, and stays where it is.
 * - **The design's own back** — a chevron in a header — is a move of its own:
 *   it opens the quiz's previous page and pushes an entry for it, and never
 *   steps the browser's history. It works the same whatever the browser holds.
 * - **The browser's Forward** opens the screen that entry was for.
 *
 * Entries are told apart by a counter kept in `history.state`, which is what
 * survives a reload: a page reopened on screen five still has four entries
 * behind it, and Back from there works.
 */
import { useEffect, useRef } from "react";

import type { NavigationState } from "../../navigation";

type Navigator = {
  show: (target: string, presentation?: { as?: "replace" | "overlay" }) => void;
  back: () => boolean;
  close: () => boolean;
  state: () => NavigationState;
  past?: () => readonly string[];
};

type Entry = { pbIndex: number; pbScreen: string };

const entryOf = (state: unknown): Entry | null => {
  const held = state as Partial<Entry> | null;
  return held && typeof held.pbIndex === "number" && typeof held.pbScreen === "string"
    ? { pbIndex: held.pbIndex, pbScreen: held.pbScreen }
    : null;
};

export function useBrowserHistory(
  /** A screen's address — absent, the funnel leaves the browser's history alone. */
  addressOf: ((screen: string) => string) | undefined,
  navigator: Navigator,
  navState: NavigationState,
): void {
  const enabled = Boolean(addressOf);
  const address = useRef(addressOf);
  address.current = addressOf;
  /** Which entry the visitor is on. */
  const index = useRef(0);
  const shown = useRef(navState.screen);
  /** The next arrival was the browser's doing — its entry is already current. */
  const fromBrowser = useRef(false);

  // The entry the page opened on: marked, and counted from where it already was.
  useEffect(() => {
    if (!enabled) return;
    const here = entryOf(window.history.state);
    index.current = here?.pbIndex ?? 0;
    window.history.replaceState(
      { ...(window.history.state ?? {}), pbIndex: index.current, pbScreen: shown.current },
      "",
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled || navState.screen === shown.current) return;
    shown.current = navState.screen;
    if (fromBrowser.current) {
      fromBrowser.current = false;
      return;
    }
    /*
      The design's own back is a move like any other, and is recorded as one:
      it never steps the browser's history. Stepping it tied the control to
      whatever the browser happened to hold: nothing, for a page opened by its
      address, and entries that no longer matched after a reload.
    */
    index.current += 1;
    window.history.pushState(
      { pbIndex: index.current, pbScreen: navState.screen },
      "",
      address.current?.(navState.screen),
    );
  }, [enabled, navState.screen, navState.direction]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onPop = (event: PopStateEvent) => {
      const entry = entryOf(event.state);
      if (!entry) return;
      const current = navigator.state();
      // One the visitor can dismiss, that is: an overlay that cannot be closed
      // goes with its screen — see `navigator.back`.
      const top = current.overlays[current.overlays.length - 1];
      if (entry.pbIndex < index.current && top && top.presentation.closeOnOutside !== false) {
        // Something is open over the screen: Back closes it, and the entry the
        // browser just left is put back — the visitor has not moved.
        navigator.close();
        window.history.pushState(
          { pbIndex: index.current, pbScreen: current.screen },
          "",
          address.current?.(current.screen),
        );
        return;
      }
      const back = entry.pbIndex < index.current;
      index.current = entry.pbIndex;
      if (entry.pbScreen === current.screen) return;
      fromBrowser.current = true;
      // Back through the funnel's own history when that is where it leads —
      // the entrance plays the other way — and straight to the screen when it
      // is not: once the design's back has been used the two no longer line up.
      const trail = navigator.past?.() ?? [];
      if (back && trail[trail.length - 1] === entry.pbScreen && navigator.back()) return;
      navigator.show(entry.pbScreen, { as: "replace" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled, navigator]);
}
