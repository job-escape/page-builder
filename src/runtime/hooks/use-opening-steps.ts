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
): void {
  const opening = useRef({ enter, services });
  useEffect(() => {
    opening.current = { enter, services };
  });
  useEffect(() => {
    const { enter: steps, services: current } = opening.current;
    const actions = steps?.[screen];
    if (actions?.length) {
      void run(actions, { state: current.state, nav: current.nav, req: current.req });
    }
  }, [screen]);
}
