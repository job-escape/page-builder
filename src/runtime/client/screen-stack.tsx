/**
 * What `<Funnel>` draws: the screen the visitor is on, the screens drawn ahead
 * of them, and the overlays open over it.
 */
import type { ReactNode } from "react";

import type { ScreenPresentation } from "../compiler/manifest";
import type { NavigationState } from "../navigation";
import { Activity } from "./activity";
import type { ScreenModule, ScreenProps } from "./funnel";
import { Overlay } from "./overlay";
import { DEFAULT_PRESENTATION, ScreenHost } from "./screen-host";

export function ScreenStack({
  navState,
  loaded,
  ahead,
  prerender,
  presentations,
  services,
  onDismiss,
}: {
  navState: NavigationState;
  /** Every screen available now, handed over or fetched. */
  loaded: Record<string, ScreenModule>;
  /** The screens to draw hidden ahead of the current one. */
  ahead: readonly string[];
  prerender: number;
  presentations?: Record<string, ScreenPresentation>;
  services: ScreenProps;
  onDismiss: () => void;
}): ReactNode {
  const presentationOf = (id: string) => presentations?.[id] ?? DEFAULT_PRESENTATION;
  const Current = loaded[navState.screen];
  // A local, so the check below narrows it inside the `map` too.
  const Screens = Activity;

  return (
    <>
      {/* The screen's own surface. Overlays get their own, from `Overlay`. */}
      {Screens && prerender > 0 ? (
        /*
          Every screen in its own `<Activity>`, keyed by the screen — the current
          one visible, the ones ahead hidden. Arriving on a screen drawn ahead
          flips the same element to visible rather than mounting a new one, and
          an element going from `display: none` to shown starts its CSS
          animation, so the entrance still plays. The screen being left is
          dropped, as it always was.

          Always this shape while prerendering, even with nothing ahead yet: a
          current screen that moved from a bare host into an `<Activity>` when
          the next one arrived would be a different element, remounted, with
          its `load` steps run twice.
        */
        [navState.screen, ...ahead.filter((id) => loaded[id])].map((id) => {
          const Module = loaded[id];
          const current = id === navState.screen;
          return (
            <Screens key={id} mode={current ? "visible" : "hidden"}>
              <ScreenHost
                presentation={presentationOf(id)}
                direction={current ? navState.direction : "forward"}
              >
                {Module ? <Module {...services} /> : null}
              </ScreenHost>
            </Screens>
          );
        })
      ) : (
        /* Keyed by the screen, so each arrival mounts a host that plays the
           screen's entrance — see `ScreenHost`. */
        <ScreenHost
          key={navState.screen}
          presentation={presentationOf(navState.screen)}
          direction={navState.direction}
        >
          {Current ? <Current {...services} /> : null}
        </ScreenHost>
      )}
      {navState.overlays.map((overlay) => {
        const Frame = loaded[overlay.id];
        if (!Frame) return null;
        return (
          <Overlay key={overlay.id} presentation={overlay.presentation} onDismiss={onDismiss}>
            <Frame {...services} />
          </Overlay>
        );
      })}
    </>
  );
}
