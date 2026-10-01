/**
 * Where the visitor is, and what a screen may ask of that: the navigator, its
 * state, and the `nav` a screen's steps are handed — navigation plus the
 * things that must stop when the visitor leaves the screen they were asked
 * from (a wait, an animation, a request's "are they still here?").
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { FunnelManifest, FunnelNav, OnUnknown } from "../funnel-types";
import { playFrames } from "../motion";
import { createNavigator, type NavigationState, type Navigator } from "../navigation";
import type { FunnelStore } from "../store";

export function useNavigation({
  manifest,
  known,
  start,
  onUnknown,
  store,
}: {
  manifest: Pick<FunnelManifest, "entry" | "overlayDefaults">;
  known: ReadonlySet<string>;
  start: string | undefined;
  onUnknown: OnUnknown | undefined;
  store: FunnelStore;
}): { navigator: Navigator; navState: NavigationState; nav: FunnelNav } {
  /** Cancellers registered by whatever a screen started — see `onLeaveScreen`. */
  const owned = useRef(new Map<string, Array<() => void>>());

  /*
    Where to open, read once: the host's `start` when the funnel knows it, else
    the entry. Through a ref, so a host that later passes something else does
    not move a visitor who is already on their way.
  */
  const startAt = useRef(start);
  const opensOn =
    startAt.current && known.has(startAt.current) ? startAt.current : manifest.entry;

  const navigator = useMemo(
    () =>
      createNavigator({
        entry: opensOn,
        defaults: manifest.overlayDefaults,
        known,
        onUnknown: (target) => onUnknown?.("target", target),
        onLeaveScreen: (screen) => {
          // Anything the outgoing screen started stops here, before it can write
          // to state belonging to a screen nobody is on.
          owned.current.get(screen)?.forEach((cancel) => cancel());
          owned.current.delete(screen);
          // And what it set about itself — a button left on Loading, an error
          // left up — goes back to how it was designed for the next visit.
          store.forgetScreen(screen);
        },
      }),
    [opensOn, manifest.overlayDefaults, known, onUnknown, store],
  );

  const navState = useSyncExternalStore(navigator.subscribe, navigator.state, navigator.state);

  // A saved screen this funnel does not have: said once, so the host can see
  // how often a republish strands a returning visitor on the entry.
  useEffect(() => {
    const asked = startAt.current;
    if (asked && !known.has(asked)) onUnknown?.("target", asked);
    // Once, for the screen asked for at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigatorRef = useRef<Navigator | null>(null);
  navigatorRef.current = navigator;

  /** Register a canceller against the screen the visitor is on now. */
  const ownedByScreen = useCallback(
    (cancel: () => void): { screen: string; release: () => void } => {
      const screen = navigatorRef.current?.state().screen ?? "";
      const cancellers = owned.current.get(screen) ?? [];
      owned.current.set(screen, cancellers);
      cancellers.push(cancel);
      return {
        screen,
        release: () => {
          const at = cancellers.indexOf(cancel);
          if (at >= 0) cancellers.splice(at, 1);
        },
      };
    },
    [],
  );

  const nav: FunnelNav = useMemo(
    () => ({
      show: navigator.show,
      close: navigator.close,
      back: navigator.back,
      canGoBack: navigator.canGoBack,
      state: navigator.state,
      /*
        Owned by the screen underneath at the moment of asking — an overlay's
        wait included, since closing an overlay leaves the visitor where they
        were. Leaving that screen runs every canceller it owns (see
        `onLeaveScreen`), which answers this one `false`.
      */
      wait: (seconds: number) =>
        new Promise<boolean>((resolve) => {
          const screen = navigator.state().screen;
          const cancellers = owned.current.get(screen) ?? [];
          owned.current.set(screen, cancellers);
          const pending: { timer?: ReturnType<typeof setTimeout> } = {};
          const stop = (): void => {
            clearTimeout(pending.timer);
            resolve(false);
          };
          cancellers.push(stop);
          pending.timer = setTimeout(
            () => {
              const at = cancellers.indexOf(stop);
              if (at >= 0) cancellers.splice(at, 1);
              resolve(true);
            },
            Math.max(0, seconds) * 1000,
          );
        }),
      frames: (ms: number, onFrame: (progress: number) => void) => {
        const playing = playFrames(ms, onFrame);
        const { release } = ownedByScreen(playing.stop);
        void playing.done.then(release);
        return playing.done;
      },
      alive: () => {
        let gone = false;
        // Stays registered until the screen goes: a flag costs nothing, and the
        // list is emptied when the screen is left either way.
        ownedByScreen(() => {
          gone = true;
        });
        return () => !gone;
      },
    }),
    [navigator, ownedByScreen],
  );

  // Unmounted: nothing a screen started may go on writing to a funnel that is gone.
  useEffect(() => {
    const byScreen = owned.current;
    return () => {
      byScreen.forEach((cancellers) => cancellers.forEach((cancel) => cancel()));
      byScreen.clear();
    };
  }, []);

  return { navigator, navState, nav };
}
