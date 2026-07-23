import { Condition } from "../types";

/**
 * Returns the node id of the default branch, as a string, or null when there is
 * no default branch.
 *
 * Condition evaluation is asynchronous (it awaits a lazily-loaded rules engine),
 * so on first render the matched branch is not known yet. Seeding a condition's
 * rendered branch with this default — instead of rendering nothing — avoids an
 * empty/white gap while the engine resolves. The default branch is also what
 * `runCondition` falls back to when no rule matches, so showing it optimistically
 * is consistent with the resolved result in the common case.
 */
export const getDefaultBranchNodeId = (
  branches: Condition["condition"],
): string | null => {
  const defaultBranch = branches.find((branch) => branch.isDefault);
  return defaultBranch?.nodeId ? String(defaultBranch.nodeId) : null;
};
