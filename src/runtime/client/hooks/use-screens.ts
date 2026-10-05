/**
 * Which screens the funnel has, can fetch, and draws — the web `Funnel`'s side
 * of `runtime/screen-loader`.
 */
import { useEffect, useMemo } from "react";

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

/** Trees already asked for, by address — one request each for as long as the page lives. */
const warmed = new Set<string>();

/**
 * The pictures asked for ahead, held for as long as the page lives.
 *
 * Held, not just requested. A picture nothing refers to can be dropped by the
 * browser as soon as it has loaded, and then the screen that draws it leans on
 * the HTTP cache alone — which a visitor's browser may not keep (a private
 * window under pressure, developer tools with the cache off). While one of
 * these is alive and decoded, an `<img>` with the same address is painted from
 * memory in the frame it appears.
 */
const held = new Map<string, HTMLImageElement>();

/** Ask for a picture now, keep it, and have it decoded before anything draws it. */
function hold(src: string): void {
  if (held.has(src) || typeof Image === "undefined") return;
  const picture = new Image();
  picture.decoding = "async";
  picture.src = src;
  held.set(src, picture);
  // Decoded ahead as well as fetched: the first paint of a large picture is
  // otherwise a blank box for the frames the decode takes.
  picture.decode?.().catch(() => {});
}

/** How long the current screen has the network to itself before the warming starts. */
const WARM_AFTER_MS = 300;

/** The most screens warmed from one screen: a branch that fans out is not a reason to fetch a funnel. */
const WARM_AT_MOST = 12;

/** Every picture a published tree draws that is fetched from somewhere. */
function picturesOf(nodes: unknown, into: Set<string>): Set<string> {
  if (!Array.isArray(nodes)) return into;
  nodes.forEach((node) => {
    if (!node || typeof node !== "object") return;
    const { props, src, children } = node as { props?: { src?: unknown }; src?: unknown; children?: unknown };
    [props?.src, src].forEach((one) => {
      // A `data:` picture is already here; only an address is worth asking for early.
      if (typeof one === "string" && /^(https?:)?\/\//.test(one)) into.add(one);
    });
    picturesOf(children, into);
  });
  return into;
}

/** Ask for a tree and the pictures in it, so the browser has them before they are drawn. */
function warm(url: string): void {
  if (warmed.has(url)) return;
  warmed.add(url);
  fetch(url)
    .then((response) => (response.ok ? response.json() : null))
    .then((tree: { roots?: unknown } | null) => {
      if (!tree) return;
      picturesOf(tree.roots, new Set()).forEach(hold);
    })
    // A warm that fails costs nothing: the screen is fetched again when it is needed.
    .catch(() => warmed.delete(url));
}

/**
 * Fetch what the visitor is about to need, one step further than is drawn.
 *
 * `prerender` draws the next screens hidden, which requests their pictures —
 * but only once the visitor has *arrived* on the screen before, so a quick tap
 * outruns it, and a dialog was never part of it at all: its tree was fetched
 * when it opened, and its picture after that. So from every screen this asks
 * for the trees — and through them the pictures — of the dialogs it can open,
 * the screens it leads to, and what *those* lead to and open. Only fetched,
 * never built: the browser's cache is what makes the later draw immediate.
 *
 * Nothing happens for a host that did not turn `prerender` on, or whose
 * manifest names no published trees.
 */
function useWarmAhead(manifest: FunnelManifest, screen: string, prerender: number): void {
  const { trees, next, overlays } = manifest;
  useEffect(() => {
    if (prerender <= 0 || !trees || typeof window === "undefined") return undefined;
    // A dialog of this screen can open the moment it is drawn — a loader that
    // stops to ask something — so those are asked for at once, not after the pause.
    (overlays?.[screen] ?? []).forEach((id) => {
      const url = trees[id];
      if (url) warm(url);
    });
    const near = next?.[screen] ?? [];
    const far = near.flatMap((id) => [...(overlays?.[id] ?? []), ...(next?.[id] ?? [])]);
    const wanted = [...new Set([...near, ...far])].filter((id) => id !== screen).slice(0, WARM_AT_MOST);
    const timer = setTimeout(() => {
      wanted.forEach((id) => {
        const url = trees[id];
        if (url) warm(url);
      });
    }, WARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, [prerender, trees, next, overlays, screen]);
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
  useWarmAhead(manifest, navState.screen, prerender);
  const loaded = useLoadedScreens({
    screens,
    loadScreen: load,
    wanted: [navState.screen, ...navState.overlays.map((overlay) => overlay.id), ...ahead],
  });
  return { ahead, loaded };
}
