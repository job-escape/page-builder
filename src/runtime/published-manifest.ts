/**
 * The published manifest, read by the runtime itself.
 *
 * A host used to reshape the artifact before handing it over — the screen list
 * into a map of presentations, the opening steps into a map of their own — and
 * every field it did not copy was a field the runtime could not use without
 * the host changing too. Handing the manifest over as published puts that
 * reshaping here, once, so a new field is a change to this package and to no
 * host.
 *
 * The reshaped form is still accepted and passed through untouched, so a host
 * written before this keeps working without knowing it exists.
 *
 * No JSX and no platform imports: both `Funnel`s and the server read it.
 */
import type { FunnelManifest as PublishedManifest } from "./compiler/manifest";
import type { FunnelManifest } from "./funnel-core";

export type { PublishedManifest };

/** What `<Funnel>` accepts: the manifest as published, or as a host reshaped it. */
export type AnyManifest = FunnelManifest | PublishedManifest;

/** The published shape carries its screens as a list; the reshaped one as a map. */
export function isPublishedManifest(manifest: AnyManifest): manifest is PublishedManifest {
  return Array.isArray((manifest as { screens?: unknown }).screens);
}

/**
 * The manifest as the runtime reads it.
 *
 * The same object back for one already in the runtime's shape. Call it through
 * `useMemo` on the manifest: a new object per render would be a new screen set
 * per render, and the navigator is rebuilt — and the visitor sent back to the
 * entry — whenever that changes.
 */
export function runtimeManifest(manifest: AnyManifest): FunnelManifest {
  if (!isPublishedManifest(manifest)) return manifest;
  const { screens } = manifest;
  const map = <T>(pick: (screen: PublishedManifest["screens"][number]) => T | undefined) =>
    Object.fromEntries(
      screens.flatMap((screen) => {
        const value = pick(screen);
        return value === undefined ? [] : [[screen.id, value] as const];
      }),
    ) as Record<string, T>;

  return {
    entry: manifest.entry,
    version: manifest.version,
    variables: manifest.variables,
    overlayDefaults: manifest.overlayDefaults,
    screens: map((screen) => screen.presentation),
    enter: map((screen) => (screen.enter?.length ? screen.enter : undefined)),
    next: map((screen) => screen.next),
    trees: map((screen) => screen.tree || undefined),
    tokens: manifest.tokens,
    defaultMode: manifest.defaultMode,
    themes: manifest.themes,
    defaultVariant: manifest.defaultVariant,
  };
}
