/**
 * Which screens the funnel has, can fetch, and draws — the web `Funnel`'s side
 * of `runtime/screen-loader`.
 */
import { useMemo } from "react";

import type { FunnelManifest } from "../../funnel-core";
import type { NavigationState } from "../../navigation";
import { useLoadedScreens, type LoadScreen } from "../../screen-loader";
import type { ScreenModule } from "../funnel";
import { screenFromTree } from "../tree-screen";

/**
 * A published screen, fetched and built. A failed fetch or a body that is not
 * a tree answers `null`, which the loader treats as "ask again next time".
 */
async function fetchScreen(url: string): Promise<ScreenModule | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const tree = (await response.json()) as Parameters<typeof screenFromTree>[0];
  return tree && Array.isArray(tree.roots) ? screenFromTree(tree) : null;
}

/**
 * How screens are fetched, and which ones the navigator may go to.
 *
 * Fetched by the host's `loadScreen`, else from the trees the manifest
 * publishes. Known: what the host handed over and, when the rest can be
 * fetched, every screen the manifest lists — never what has loaded so far. The
 * navigator is rebuilt when the known set changes, and a rebuilt navigator
 * starts at the entry: a set that grew with every fetched screen would send
 * the visitor back to the start each time one arrived. Keyed by the ids rather
 * than by the objects for the same reason — a host writing `screens={{}}`
 * hands over a new object every render.
 */
export function useScreenSource({
  manifest,
  screens,
  loadScreen,
}: {
  manifest: FunnelManifest;
  screens: Record<string, ScreenModule>;
  loadScreen?: LoadScreen<ScreenModule>;
}): { load?: LoadScreen<ScreenModule>; known: ReadonlySet<string> } {
  const trees = manifest.trees;
  const fromTrees = useMemo<LoadScreen<ScreenModule> | undefined>(
    () =>
      trees && Object.keys(trees).length
        ? async (id) => (trees[id] ? fetchScreen(trees[id]!) : null)
        : undefined,
    [trees],
  );
  const load = loadScreen ?? fromTrees;

  const knownIds = [
    ...Object.keys(screens),
    ...(load ? Object.keys(manifest.screens ?? {}) : []),
  ]
    .sort()
    .join("\n");
  const known = useMemo(() => new Set(knownIds.split("\n").filter(Boolean)), [knownIds]);

  return { load, known };
}

/**
 * The screens to have now: the current one, any overlay over it, and the
 * first `prerender` the current one leads to, in the manifest's order. A tap
 * that goes anywhere else builds that screen on arrival.
 */
export function useScreensAhead({
  manifest,
  navState,
  prerender,
  screens,
  load,
}: {
  manifest: FunnelManifest;
  navState: NavigationState;
  prerender: number;
  screens: Record<string, ScreenModule>;
  load?: LoadScreen<ScreenModule>;
}): { ahead: string[]; loaded: Record<string, ScreenModule> } {
  const ahead = useMemo(
    () =>
      prerender > 0
        ? [...new Set(manifest.next?.[navState.screen] ?? [])]
            .filter((id) => id !== navState.screen)
            .slice(0, prerender)
        : [],
    [prerender, manifest.next, navState.screen],
  );
  const loaded = useLoadedScreens({
    screens,
    loadScreen: load,
    wanted: [navState.screen, ...navState.overlays.map((overlay) => overlay.id), ...ahead],
  });
  return { ahead, loaded };
}
