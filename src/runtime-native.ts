/**
 * `@job-escape/page-builder/runtime-native` — the React Native half of the
 * compiled-funnel runtime. **Beta.**
 *
 * A third entry beside `./runtime` and `./runtime-client`, split for the same
 * reason those two are: the pure semantics stay platform-free and testable
 * without any renderer, and everything that needs a platform lives behind its
 * own door. A web consumer never resolves `react-native`, and a native one never
 * resolves the DOM bricks.
 *
 * What is *not* duplicated is the important part. The store, the navigator, the
 * variable semantics, the conditions and actions, the tree walk and the funnel
 * state machine are all shared with web — this entry is four components, a host
 * and an overlay. If the two platforms ever behave differently, it is in here,
 * which is a small enough surface to hold in your head.
 */

export { Frame, Image, Input, Text, ui, configureNativeBricks, configureTokens } from "./runtime/native/bricks";
export type { NativeDeps } from "./runtime/native/bricks";

export { ScreenHost, DEFAULT_PRESENTATION, statusBarStyle } from "./runtime/native/screen-host";

export { DEFAULT_HOST, resolveHost } from "./runtime/native/host-config";
export type { HostConfig } from "./runtime/native/host-config";

export { Overlay } from "./runtime/native/overlay";

export { Funnel, useFunnel } from "./runtime/native/funnel";
export type {
  NativeFunnelProps,
  NativeScreenModule,
  NativeScreenProps,
} from "./runtime/native/funnel";

/**
 * The tree walk, unchanged from web.
 *
 * It only ever calls the `ui` catalogue it is handed, so the same file renders
 * with `View` and `Text` as it does with `div` and `span`.
 */
export { screenFromTree, screensFromTree } from "./runtime/client/tree-screen";
