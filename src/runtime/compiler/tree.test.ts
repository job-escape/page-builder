/**
 * The tree emitter, judged against the one that already works.
 *
 * The claim is not "this produces a tree" — that is trivially true and worth
 * nothing. It is that the tree carries everything the JavaScript carries, from
 * the same source, with the same manifest. So most of what follows compares the
 * two emitters rather than asserting a shape in isolation: a tree that has
 * drifted from the modules is the failure that matters, and it is the one a
 * snapshot would happily record.
 */
import { compile } from "./emit";
import { presentationOf, readsOf } from "./manifest";
import type { SourceFunnel } from "./source";
import { TREE_SCHEMA, compileToTree, emitScreenTree } from "./tree";

/** A funnel with a choice, a bound appearance, a branch, an overlay and an input. */
const source: SourceFunnel = {
  id: 1234,
  version: "v1",
  entry: "s_goal",
  variables: [
    { name: "goal", type: "string" },
    { name: "gear", type: "list<string>", min: 1, max: 2 },
    { name: "email", type: "string", sensitive: true },
  ],
  locales: { en: { "s_goal.title": "What's your goal?" } },
  screens: [
    {
      id: "s_goal",
      frames: [
        {
          id: "root",
          parent: null,
          kind: "frame",
          pos: "a0",
          props: { layout: "column", gap: 12 },
        },
        { id: "title", parent: "root", kind: "text", pos: "a0", textKey: "s_goal.title" },
        {
          id: "o1",
          parent: "root",
          kind: "frame",
          pos: "a1",
          props: { radius: 12 },
          bindings: {
            fill: {
              when: { op: "has", variable: "goal", value: "muscle" },
              whenTrue: "#eef2ff",
              whenFalse: "#fff",
            },
          },
          interactions: [
            {
              on: { event: "click" },
              do: [
                { type: "select", variable: "goal", value: "muscle" },
                { type: "show", target: "s_gear" },
              ],
            },
          ],
        },
        { id: "o1label", parent: "o1", kind: "text", pos: "a0", textKey: "s_goal.o1" },
        { id: "hero", parent: "root", kind: "image", pos: "a2", src: "https://cdn/x.png" },
      ],
    },
    {
      id: "s_gear",
      frames: [
        { id: "groot", parent: null, kind: "frame", pos: "a0" },
        { id: "field", parent: "groot", kind: "input", pos: "a0", variable: "email" },
        {
          id: "cta",
          parent: "groot",
          kind: "frame",
          pos: "a1",
          interactions: [
            {
              on: { event: "click" },
              do: [
                {
                  type: "conditional",
                  branches: [
                    {
                      when: { op: "meetsMin", variable: "gear" },
                      do: [{ type: "show", target: "s_done" }],
                    },
                    { do: [{ type: "show", target: "d_why", as: "overlay" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "d_why",
      overlay: { position: "bottom", dim: true },
      frames: [{ id: "wroot", parent: null, kind: "frame", pos: "a0" }],
    },
  ],
};

describe("the tree carries what the modules carry", () => {
  const tree = compileToTree(source);
  const js = compile(source);

  it("emits one screen per compiled module, and no others", () => {
    expect(Object.keys(tree.screens).sort()).toEqual(Object.keys(js.modules).sort());
  });

  it("builds the same manifest as the JavaScript emitter", () => {
    const { schema, ...shared } = tree.manifest;
    expect(schema).toBe(TREE_SCHEMA);
    expect(shared).toEqual(js.manifest);
  });

  it("keeps children in fractional-index order, as the modules do", () => {
    const root = tree.screens.s_goal.roots[0];
    expect(root.kind).toBe("frame");
    if (root.kind !== "frame") throw new Error("expected a frame");
    expect(root.children.map((child) => child.id)).toEqual(["title", "o1", "hero"]);
  });

  it("nests, rather than flattening the way the source rows are stored", () => {
    const root = tree.screens.s_goal.roots[0];
    if (root.kind !== "frame") throw new Error("expected a frame");
    const option = root.children.find((child) => child.id === "o1");
    if (option?.kind !== "frame") throw new Error("expected a frame");
    expect(option.children.map((child) => child.id)).toEqual(["o1label"]);
  });
});

describe("the tree is data, not code", () => {
  const tree = compileToTree(source);

  it("survives a JSON round trip, which is the whole point", () => {
    expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
  });

  it("carries a condition unevaluated, so a renderer without eval can read it", () => {
    const root = tree.screens.s_goal.roots[0];
    if (root.kind !== "frame") throw new Error("expected a frame");
    const option = root.children.find((child) => child.id === "o1");
    expect(option?.bindings?.fill.when).toEqual({
      op: "has",
      variable: "goal",
      value: "muscle",
    });
  });

  it("carries a branch as branches, not as an if it would have to parse", () => {
    const root = tree.screens.s_gear.roots[0];
    if (root.kind !== "frame") throw new Error("expected a frame");
    const cta = root.children.find((child) => child.id === "cta");
    expect(cta?.on?.[0]).toMatchObject({ type: "conditional" });
  });

  it("flattens interactions into one handler, as the emitted onClick does", () => {
    const root = tree.screens.s_goal.roots[0];
    if (root.kind !== "frame") throw new Error("expected a frame");
    const option = root.children.find((child) => child.id === "o1");
    expect(option?.on).toEqual([
      { type: "select", variable: "goal", value: "muscle" },
      { type: "show", target: "s_gear" },
    ]);
  });

  it("keeps copy out of the tree — a text node has a key and no words", () => {
    const serialized = JSON.stringify(tree.screens);
    expect(serialized).not.toContain("What's your goal?");
    expect(serialized).toContain("s_goal.title");
  });
});

describe("the tree emitter is deterministic", () => {
  it("produces identical bytes for the same source", () => {
    expect(JSON.stringify(compileToTree(source))).toBe(JSON.stringify(compileToTree(source)));
  });

  it("is unaffected by the order screens arrive in", () => {
    const reversed: SourceFunnel = { ...source, screens: [...source.screens].reverse() };
    expect(JSON.stringify(compileToTree(reversed).manifest)).toBe(
      JSON.stringify(compileToTree(source).manifest),
    );
  });
});

describe("the read set", () => {
  it("names the variables a screen's bindings depend on", () => {
    expect(readsOf(source.screens[0])).toEqual(["goal"]);
  });

  it("counts an input as a read, because it shows what the funnel holds", () => {
    expect(readsOf(source.screens[1])).toContain("email");
  });

  it("reaches into a conditional branch for the variables it tests", () => {
    expect(readsOf(source.screens[1])).toContain("gear");
  });

  it("is empty for a screen that reads nothing", () => {
    expect(readsOf(source.screens[2])).toEqual([]);
  });

  it("travels in the manifest, so a renderer can subscribe before fetching", () => {
    const { manifest } = compileToTree(source);
    expect(manifest.screens.find((screen) => screen.id === "s_goal")?.reads).toEqual(["goal"]);
  });
});

describe("the emitter is total", () => {
  it("emits a frame for a kind it does not recognise, rather than refusing", () => {
    const odd = emitScreenTree({
      id: "s_odd",
      frames: [{ id: "x", parent: null, kind: "video" as never, pos: "a0" }],
    });
    expect(odd.roots[0].kind).toBe("frame");
  });

  it("does not invent keys for a frame that carries nothing", () => {
    const bare = emitScreenTree({
      id: "s_bare",
      frames: [{ id: "x", parent: null, kind: "frame", pos: "a0" }],
    });
    expect(bare.roots[0]).toEqual({ id: "x", kind: "frame", children: [] });
  });

  it("falls back to an empty key rather than dropping a text node", () => {
    const bare = emitScreenTree({
      id: "s_bare",
      frames: [{ id: "t", parent: null, kind: "text", pos: "a0" }],
    });
    expect(bare.roots[0]).toMatchObject({ kind: "text", textKey: "" });
  });
});

describe("how a screen behaves as a surface", () => {
  /**
   * A funnel is not one kind of page — a paywall pins its button and must not
   * scroll, a loader is full bleed, an email form has to clear a keyboard. So
   * this travels per screen, and it travels in the artifact: the app cannot know
   * the screen ids of every funnel it might be asked to render.
   */
  it("scrolls unless a screen says otherwise", () => {
    expect(presentationOf(source.screens[0]).scroll).toBe(true);
    expect(presentationOf({ ...source.screens[0], presentation: { scroll: false } }).scroll).toBe(
      false,
    );
  });

  it("clears the system chrome unless a screen asks to bleed", () => {
    expect(presentationOf(source.screens[0]).bleed).toBe(false);
    expect(presentationOf({ ...source.screens[0], presentation: { bleed: true } }).bleed).toBe(true);
  });

  it("derives the keyboard from an input, rather than asking anyone", () => {
    // s_gear has the field; s_goal does not. Nobody authored either answer.
    expect(presentationOf(source.screens[1]).keyboard).toBe(true);
    expect(presentationOf(source.screens[0]).keyboard).toBe(false);
  });

  it("resolves every field, so a renderer never applies a default of its own", () => {
    // Two renderers each deciding what "absent" means is two renderers that
    // agree right up until one of them is edited.
    expect(Object.keys(presentationOf(source.screens[2])).sort()).toEqual([
      "bleed",
      "keyboard",
      "scroll",
      "statusBar",
    ]);
  });

  it("travels in the manifest, beside the rest of what a host needs up front", () => {
    const { manifest } = compileToTree(source);
    expect(manifest.screens.find((screen) => screen.id === "s_gear")?.presentation).toMatchObject({
      keyboard: true,
      scroll: true,
    });
  });
});
