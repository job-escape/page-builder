/**
 * `@job-escape/page-builder/runtime` — the compiled-funnel runtime. **Beta.**
 *
 * A separate entry point from `.` and `./client`, and deliberately so. The
 * shipped surface renders serialized HTML through a component registry and is
 * consumed by `funnel` and `frontend-alpha` at pinned 0.2.x versions. This one
 * is what compiled funnel modules call — see `docs/funnel-as-code.md` in the
 * editor repository.
 *
 * **Isolation is enforced, not promised.** `src/runtime/isolation.test.ts`
 * fails if anything here imports the existing surface, if anything there imports
 * this, or if `runtime` appears in `index.ts` / `server.ts` / `client.ts`. So a
 * consumer installing the package cannot reach this code by accident, and a
 * change here cannot alter what a pinned consumer resolves.
 *
 * Beta means the shape may change without a major bump. Published under the
 * `beta` dist-tag so `latest` continues to resolve to the 0.2.x line.
 */

export type {
  VariableDecl,
  VariableTable,
  VariableType,
  VariableValue,
} from "./runtime/types";

export { isListType } from "./runtime/types";

export {
  atMax,
  count,
  defaultFor,
  emptyFor,
  has,
  initialState,
  isEmpty,
  isSet,
  meetsMin,
  select,
} from "./runtime/variables";

export type { PersistenceOptions, StoredAnswers } from "./runtime/persistence";

export {
  DEFAULT_DAYS,
  MAX_BYTES,
  clear,
  cookieName,
  deserialize,
  read,
  serialize,
  write,
} from "./runtime/persistence";

export type { FunnelStore, FunnelStoreOptions, RequestStatus } from "./runtime/store";

export { createFunnelStore } from "./runtime/store";

export type {
  NavigationState,
  Navigator,
  NavigatorOptions,
  OverlayFrame,
  Presentation,
} from "./runtime/navigation";

export { createNavigator } from "./runtime/navigation";

export type {
  CheckFunction,
  Comparison,
  SourceAction,
  SourceBinding,
  SourceCondition,
  SourceEvent,
  SourceFrame,
  SourceFunnel,
  SourceInteraction,
  SourceScreen,
  SourceScreenPresentation,
  SourceValue,
  ValueFunction,
} from "./runtime/compiler/source";

/** The functions a condition may call — one definition for both renderers. */
export { call, check, compare } from "./runtime/functions";

export type { CompiledFunnel } from "./runtime/compiler/emit";
export { compile, emitCondition, emitScreen } from "./runtime/compiler/emit";

export type {
  FunnelManifest,
  ScreenIndex,
  ScreenPresentation,
} from "./runtime/compiler/manifest";
export { buildManifest, presentationOf, readsOf } from "./runtime/compiler/manifest";

/**
 * The second emitter: the same compile, as data rather than as JavaScript.
 *
 * Additive on purpose. `compile` is unchanged and web keeps using it; this is
 * what a runtime whose engine cannot evaluate downloaded code reads instead —
 * React Native's Hermes being the case that forced it. Both come from one
 * traversal and one manifest builder, so the two artifacts cannot describe
 * different funnels.
 */
export type { CompiledTree, ScreenTree, TreeNode } from "./runtime/compiler/tree";
export { TREE_SCHEMA, compileToTree, emitScreenTree } from "./runtime/compiler/tree";

/**
 * Reading a tree: the same conditions and actions the emitter writes as
 * JavaScript, evaluated instead. No React and no DOM — a native runtime gets
 * this unchanged and only the drawing differs.
 */
export type { ActionContext, ConditionState } from "./runtime/interpret";
export { evaluate, run, showPresentation, valueOf } from "./runtime/interpret";

/**
 * Copy that carries its own emphasis.
 *
 * Pure data and pure readers — no React, so this sits in the server-safe entry
 * beside the compiler that writes it and the interpreter that reads it. The
 * two renderers pick it up through their own entries.
 */
export type { CopyParams, RichText, TextLink, TextMarks, TextRun } from "./runtime/rich-text";
export { interpolate, isRuns, normalizeRuns, plainOf, runsOf } from "./runtime/rich-text";

/**
 * Which words a visitor gets. One answer for three hosts — see
 * `runtime/locale` for why it is not each host's to decide.
 */
export type { LoadedLocale, LoadLocaleOptions, TextDirection } from "./runtime/locale";
export {
  availableLocales,
  DEFAULT_LOCALE,
  defaultLocaleOf,
  directionOf,
  loadLocale,
  resolveLocale,
} from "./runtime/locale";

export type { RequestOptions } from "./runtime/request";

/**
 * The one call a compiled module makes to a backend, and the host app's hook
 * for telling it where that is. The module names an action; this decides what
 * the name resolves to — see `runtime/request`.
 */
export { RequestFailed, configureRequests, request } from "./runtime/request";

/**
 * The palette an artifact carries, and the two ways a renderer spends it.
 *
 * `tokens` reaches the manifest from publish, which resolves the design's token
 * set server-side — so a device never walks a `{blue.600}` alias, and React
 * Native, which has no cascade to walk one with, can draw a design at all.
 *
 * Web spreads `tokenCustomProperties` into a style so the CSS a design already
 * stores (`background: var(--bg-brand-solid)`) resolves; native hands the same
 * table to `resolveColor`. One table, two spendings, no second source of truth.
 */
export type { ResolvedTokens, TokenLookup } from "./runtime/style/tokens";
export { chooseMode, resolveColor } from "./runtime/style/tokens";
export { cssVarFromTokenPath, tokenCustomProperties } from "./runtime/style/emit-css";
export { tokensForVariant } from "./runtime/style/tokens";

/**
 * Which brand a visitor sees. Its own cookie, because the answers cookie is
 * discarded on a content republish and an assignment must survive one.
 */
export type { VariantChoice } from "./runtime/variant";
export {
  VARIANT_DAYS,
  chooseVariant,
  clearVariant,
  readVariant,
  variantCookieName,
  writeVariant,
} from "./runtime/variant";
