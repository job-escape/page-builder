/**
 * The golden artifact: the exact bytes a publish POSTs, checked in.
 *
 * Read by *two* repositories. This one asserts the compiler still produces it;
 * the constructor's publish tests post it instead of a hand-written manifest.
 * That is the whole point — both suites were green while the two sides of the
 * seam disagreed about the shape, because neither had ever seen the other's
 * idea of it. A field added here and dropped there now turns a test red on the
 * side that dropped it.
 *
 * Regenerate deliberately, never automatically:
 *
 *   UPDATE_ARTIFACT_FIXTURE=1 npx jest artifact-fixture
 *
 * then copy `fixtures/published-funnel.json` into the constructor beside its
 * publish tests. Copying is manual because the repositories are separate, and a
 * fixture that updated itself would defeat the check it exists to make.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { compileToTree } from "./tree";
import { source } from "./fixture";

const GOLDEN = join(__dirname, "..", "..", "..", "fixtures", "published-funnel.json");

/** Sorted keys: the constructor content-addresses what it stores, so bytes that
 *  depend on key order would make a diff appear out of nothing. */
const canonical = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe("the published artifact", () => {
  const tree = compileToTree(source);
  const artifact = { manifest: tree.manifest, trees: tree.screens };

  it("matches the fixture both repositories read", () => {
    if (process.env.UPDATE_ARTIFACT_FIXTURE) {
      writeFileSync(GOLDEN, canonical(artifact));
    }

    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof artifact;
    expect(artifact).toEqual(golden);
  });

  it("carries what the constructor's serializer reads", () => {
    // Named explicitly rather than left to the deep-equal above, because these
    // are the keys the other side indexes by — a rename here is a publish that
    // stores nothing and answers 201.
    expect(Object.keys(artifact).sort()).toEqual(["manifest", "trees"]);
    expect(artifact.manifest.entry).toBeTruthy();
    expect(Array.isArray(artifact.manifest.screens)).toBe(true);
    expect(artifact.manifest.screens[0]).toHaveProperty("id");
    expect(Object.keys(artifact.trees).length).toBeGreaterThan(0);
  });
});
