// json-rules-engine (~28kB) is only needed once conditional navigation/actions
// actually run, so load it lazily and cache the module promise. This keeps it
// out of the client's first-load bundle; BuilderClient warms it in the
// background (see usePreloadChunk) so the first condition evaluation is instant.
let cached: Promise<typeof import("json-rules-engine")> | null = null;

export const loadJsonRulesEngine = () => {
  if (!cached) {
    // Don't memoize a failed chunk load: a rejected promise would brick every
    // condition evaluation for the rest of the session. Reset so the next
    // caller retries the network request.
    cached = import("json-rules-engine").catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
};
