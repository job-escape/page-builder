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
