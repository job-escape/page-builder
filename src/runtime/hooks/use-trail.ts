import { z } from "zod";
import { useEffect, useRef } from "react";

import type { Navigator } from "../navigation";

/** What the tab keeps of the way here. */
const Trail = z.object({ screen: z.string(), past: z.array(z.string()) });

/**
 * The screens behind this one, kept for the tab. A reload reopens the screen
 * the visitor was on (the host's `start`), but the way they came was only in
 * memory — so after a refresh the design's back control had nowhere to go.
 * `sessionStorage`, because that is exactly its life: it survives a reload and
 * ends with the tab. Read once, and only when the screen opened on is the one
 * the trail was left at; written on every arrival. A funnel that saves nothing
 * (`persist={false}`, so no `funnelId`) keeps no trail either.
 */
export function useTrail(
  funnelId: string | number | undefined,
  navigator: Pick<Navigator, "restore" | "past">,
  screen: string,
): void {
  const trailKey = funnelId ? `jb_funnel_trail_${funnelId}` : null;
  const trailRead = useRef(false);
  useEffect(() => {
    if (!trailKey) return;
    try {
      if (!trailRead.current) {
        trailRead.current = true;
        const saved = Trail.safeParse(JSON.parse(window.sessionStorage.getItem(trailKey) ?? "null"));
        if (saved.success && saved.data.screen === screen) navigator.restore(saved.data.past);
      }
      window.sessionStorage.setItem(trailKey, JSON.stringify({ screen, past: navigator.past() }));
    } catch {
      // No storage — a private window, or a platform without one. Back simply
      // has no memory across a reload there, as before.
    }
  }, [trailKey, navigator, screen]);
}
