// json-rules-engine is imported STATICALLY so it is bundled into the quiz's main
// client JS rather than fetched as a separate on-demand chunk.
//
// Why this matters: navigation awaits `runCondition` → the engine. When the
// engine lived in a `import("json-rules-engine")` dynamic chunk, that import
// could *pend indefinitely* under connection-pool saturation — which peaks right
// before the loader/paywall, where subscriptions, dialog MDX, analytics,
// tracking pixels and payment SDKs all compete for the browser's ~6 connections
// per host. A pending import left `next()` stuck on its `await` with no error and
// no `nav_start`, so the click did nothing until the chunk finally arrived
// (~2 min) — the "stuck before the loader" freeze. A static import is already in
// memory when the first condition runs, so `runCondition` never waits on the
// network. `engine.run()` stays async but is purely in-memory.
import * as JsonRulesEngine from "json-rules-engine";

// Kept as an async function so existing call sites (`await loadJsonRulesEngine()`)
// and the background `usePreloadChunk` warm are unchanged — it now resolves
// immediately instead of triggering a network fetch.
export const loadJsonRulesEngine = (): Promise<typeof import("json-rules-engine")> =>
  Promise.resolve(JsonRulesEngine);
