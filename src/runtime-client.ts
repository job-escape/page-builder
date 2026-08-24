/**
 * `@job-escape/page-builder/runtime-client` — the React half of the
 * compiled-funnel runtime. **Beta.**
 *
 * Split from `./runtime` the same way `./client` is split from `.`: the pure
 * semantics stay server-safe and testable without a DOM, and everything that
 * needs React lives here behind a `"use client"` banner.
 *
 * Isolated from the shipped surface — see `src/runtime/isolation.test.ts`.
 */

export { Frame, Image, Input, Text, ui } from "./runtime/client/bricks";
export type { FrameProps, ImageProps, InputProps, TextProps, Ui } from "./runtime/client/bricks";

export { Funnel, useFunnel } from "./runtime/client/funnel";
export type {
  FunnelManifest,
  FunnelNav,
  FunnelProps,
  ScreenModule,
  ScreenProps,
} from "./runtime/client/funnel";

export { Overlay } from "./runtime/client/overlay";

/**
 * A screen tree, as a screen module — so `<Funnel>` cannot tell it from a
 * compiled one, and an app can hand it a mix of both.
 *
 * The walk only ever calls `props.ui.*`, and the catalogue arrives as an
 * argument, so React Native reuses it verbatim with a native `ui`.
 */
export { screenFromTree, screensFromTree } from "./runtime/client/tree-screen";
