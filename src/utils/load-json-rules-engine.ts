// json-rules-engine (~28kB) is only needed once conditional navigation/actions
// actually run, so load it lazily and cache the module promise. This keeps it
// out of the client's first-load bundle; BuilderClient warms it in the
// background (see usePreloadChunk) so the first condition evaluation is instant.
let cached: Promise<typeof import("json-rules-engine")> | null = null;

export const loadJsonRulesEngine = () => {
  if (!cached) {
    cached = import("json-rules-engine");
  }
  return cached;
};
