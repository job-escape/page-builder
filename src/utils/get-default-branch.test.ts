import { Condition } from "../types";

import { getDefaultBranchNodeId } from "./get-default-branch";

const branch = (
  nodeId: Condition["condition"][number]["nodeId"],
  isDefault?: boolean,
): Condition["condition"][number] => ({
  rules: { all: [] },
  nodeId,
  ...(isDefault === undefined ? {} : { isDefault }),
});

describe("getDefaultBranchNodeId", () => {
  it("returns the default branch node id as a string", () => {
    const branches = [
      branch("410996bf-7aeb-46ba-9539-4337f035a8f9", true),
      branch("beeaf943-54a0-465e-a00e-758dc18905d8"),
    ];

    expect(getDefaultBranchNodeId(branches)).toBe(
      "410996bf-7aeb-46ba-9539-4337f035a8f9",
    );
  });

  it("picks the default branch regardless of its position", () => {
    const branches = [
      branch("non-default-a"),
      branch("the-default", true),
      branch("non-default-b"),
    ];

    expect(getDefaultBranchNodeId(branches)).toBe("the-default");
  });

  it("stringifies a numeric node id", () => {
    const branches = [branch(42, true)];

    expect(getDefaultBranchNodeId(branches)).toBe("42");
  });

  it("returns null when there is no default branch", () => {
    const branches = [branch("a"), branch("b")];

    expect(getDefaultBranchNodeId(branches)).toBeNull();
  });

  it("returns null for an empty branch list", () => {
    expect(getDefaultBranchNodeId([])).toBeNull();
  });

  it("returns null when the default branch has a null node id", () => {
    const branches = [branch(null, true)];

    expect(getDefaultBranchNodeId(branches)).toBeNull();
  });
});
