import { useEffect, useRef } from "react";

import type { SourceAction } from "../compiler/source";
import type { FunnelServices } from "../funnel-types";
import { run } from "../interpret";

/**
 * A screen's opening steps, each time it opens — the entry on the first
 * render, then every screen navigated to, going back included. Keyed on the
 * screen id alone, with the rest read through a ref, so a new store or a new
 * manifest object does not re-open the screen the visitor is already on.
 */
export function useOpeningSteps<Ui, Component>(
  enter: Record<string, SourceAction[]> | undefined,
  services: FunnelServices<Ui, Component>,
  screen: string,
  /**
   * Run them once the screen has been painted, not in the commit that showed
   * it. A step that sets a value the screen draws — a question's progress —
   * otherwise lands before the first paint, and a bar bound to it appears at
   * its new width with nothing to glide from. The web passes this; a caller
   * that leaves it out runs them at once, as before.
   */
  afterPaint?: (run: () => void) => () => void,
): void {
  const opening = useRef({ enter, services });
  useEffect(() => {
    opening.current = { enter, services };
  });
  useEffect(() => {
    const start = () => {
      const { enter: steps, services: current } = opening.current;
      const actions = steps?.[screen];
      if (actions?.length) {
        void run(actions, { state: current.state, nav: current.nav, req: current.req });
      }
    };
    if (afterPaint) return afterPaint(start);
    start();
    return undefined;
    // `afterPaint` is the caller's constant — the screen is what this follows.
  }, [screen]);
}
