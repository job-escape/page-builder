/**
 * What `<Funnel>` draws: the screen the visitor is on, the screens drawn ahead
 * of them, and the overlays open over it.
 */
import type { ReactNode } from "react";

import { useBeforePaint } from "../funnel-core";
import { useOpeningSteps } from "../hooks/use-opening-steps";
import type { SourceAction } from "../compiler/source";

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
  enter,
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
  /** Each screen's opening steps — run from inside it, see `Opening`. */
  enter?: Record<string, SourceAction[]>;
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
                {current ? <Restore state={services.state} /> : null}
                {current ? <Opening enter={enter} services={services} screen={id} /> : null}
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
          <Restore state={services.state} />
          <Opening enter={enter} services={services} screen={navState.screen} />
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

/**
 * Reads what the visitor saved, once the screen it sits in has hydrated.
 *
 * Inside the screen rather than in `<Funnel>` because React hydrates an
 * `<Activity>` after the funnel around it has committed: a restore run by the
 * funnel would reach the screen first, and the screen would hydrate with
 * answers the server — which cannot read the cookie — never drew. Here, the
 * screen has matched the server's HTML before the answers arrive. Before
 * paint, so a funnel drawn only in the browser never shows its defaults.
 */
/**
 * Runs a screen's opening steps, once the screen it sits in has hydrated.
 *
 * Inside the screen for the reason `Restore` is: the funnel's own effects fire
 * before React has hydrated the screen, so a step that sets a value — a
 * question's progress — changed the store first, the screen then hydrated with
 * a value the server never drew, and React leaves an attribute that differs at
 * hydration as the server wrote it: the header's bar stayed at 0% for good.
 * After `Restore` (a layout effect), so the steps run over what was saved.
 */
function Opening({
  enter,
  services,
  screen,
}: {
  enter?: Record<string, SourceAction[]>;
  services: ScreenProps;
  screen: string;
}): null {
  useOpeningSteps(enter, services, screen, afterPaint);
  return null;
}

/**
 * After the frame that painted the screen: two animation frames, since the
 * first runs before that paint. Falls back to a timer where frames are not
 * being produced — a background tab — so the steps are late, never lost.
 */
function afterPaint(run: () => void): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(once);
  });
  const timer = setTimeout(once, 250);
  return () => {
    done = true;
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
    clearTimeout(timer);
  };
}

function Restore({ state }: { state: ScreenProps["state"] }): null {
  useBeforePaint(() => {
    state.restore();
  }, [state]);
  return null;
}
