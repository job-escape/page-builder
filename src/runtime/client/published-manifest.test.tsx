/**
 * The manifest handed over as published, and the screens fetched from it.
 *
 * A host passes what the console serves — the screen list, each screen's tree
 * address — and the runtime does the rest: reads presentations, opening steps
 * and where screens lead, and fetches a tree when its screen is needed. The
 * shape hosts used to reshape the manifest into keeps working.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { runtimeManifest, type PublishedManifest } from "../published-manifest";
import { Funnel } from "./funnel";
import { screensFromTree } from "./tree-screen";

const source: SourceFunnel = {
  id: "published",
  version: "v1",
  entry: "s_one",
  variables: [{ name: "opened", type: "boolean", default: false }],
  screens: [
    {
      id: "s_one",
      frames: [
        { id: "s_one", parent: null, kind: "frame", pos: "a0" },
        {
          id: "go",
          parent: "s_one",
          kind: "frame",
          pos: "a0",
          props: { testId: "go" },
          interactions: [{ on: { event: "click" }, do: [{ type: "show", target: "s_two" }] }],
        },
        { id: "one", parent: "s_one", kind: "text", pos: "a1", textKey: "one" },
      ],
    },
    {
      id: "s_two",
      presentation: { transition: "fade" },
      frames: [
        {
          id: "s_two",
          parent: null,
          kind: "text",
          pos: "a0",
          textKey: "two",
          interactions: [
            { on: { event: "load" }, do: [{ type: "set", variable: "opened", value: true }] },
          ],
        },
      ],
    },
  ],
  locales: { en: { one: "Screen one", two: "Screen two" } },
};

const compiled = compileToTree(source);
const url = (id: string) => `https://cdn.test/trees/${id}.json`;
/** What publish serves: the compiled manifest, each screen with its tree's address. */
const published: PublishedManifest = {
  ...compiled.manifest,
  screens: compiled.manifest.screens.map((one) => ({ ...one, tree: url(one.id) })),
};

/** The CDN: answers each tree's address with that tree, and records what was fetched. */
const cdn = (missing: string[] = []) => {
  const fetched: string[] = [];
  const gone = new Set(missing.map(url));
  const fetchMock = jest.fn(async (address: string) => {
    fetched.push(address);
    if (gone.delete(address)) return { ok: false, status: 404, json: async () => ({}) };
    const id = Object.keys(compiled.screens).find((one) => url(one) === address);
    return { ok: Boolean(id), status: id ? 200 : 404, json: async () => compiled.screens[id ?? ""] };
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  return fetched;
};

const settle = () => act(async () => {});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("runtimeManifest", () => {
  it("reads presentations, opening steps, where screens lead and their trees", () => {
    const read = runtimeManifest(published);
    expect(read.entry).toBe("s_one");
    expect(read.screens?.s_two?.transition).toBe("fade");
    expect(read.next).toEqual({ s_one: ["s_two"], s_two: [] });
    expect(read.trees).toEqual({ s_one: url("s_one"), s_two: url("s_two") });
    // The top-level `load` is the screen's opening step.
    expect(read.enter?.s_two).toEqual([{ type: "set", variable: "opened", value: true }]);
    expect(read.enter).not.toHaveProperty("s_one");
  });

  it("hands back a manifest already in the runtime's shape untouched", () => {
    const reshaped = runtimeManifest(published);
    expect(runtimeManifest(reshaped)).toBe(reshaped);
  });

  it("leaves out screens published without a tree", () => {
    const partial: PublishedManifest = {
      ...published,
      screens: published.screens.map((one) => (one.id === "s_two" ? { ...one, tree: undefined } : one)),
    };
    expect(runtimeManifest(partial).trees).toEqual({ s_one: url("s_one") });
  });
});

describe("<Funnel> with the manifest as published", () => {
  const mount = (screens = {}, extra: { prerender?: number } = {}) =>
    render(
      <Funnel manifest={published} screens={screens} locale={source.locales!.en} {...extra} />,
    );

  it("fetches the entry from its published tree", async () => {
    const fetched = cdn();
    mount();
    expect(await screen.findByText("Screen one")).toBeInTheDocument();
    expect(fetched).toEqual([url("s_one")]);
  });

  it("does not fetch a screen the host handed over", async () => {
    const fetched = cdn();
    const modules = screensFromTree(compiled);
    mount({ s_one: modules.s_one });
    await settle();
    expect(screen.getByText("Screen one")).toBeInTheDocument();
    expect(fetched).toEqual([]);
  });

  it("fetches the next screen on the way there", async () => {
    const fetched = cdn();
    mount();
    fireEvent.click(await screen.findByTestId("go"));
    expect(await screen.findByText("Screen two")).toBeInTheDocument();
    expect(fetched).toEqual([url("s_one"), url("s_two")]);
  });

  it("fetches ahead with prerender", async () => {
    const fetched = cdn();
    mount({}, { prerender: 1 });
    await screen.findByText("Screen one");
    await settle();
    expect(fetched).toEqual([url("s_one"), url("s_two")]);
  });

  it("fetches a missing tree again when it is wanted anew, not in a loop", async () => {
    const fetched = cdn(["s_two"]);
    mount({}, { prerender: 1 });
    await screen.findByText("Screen one");
    await settle();
    await settle();
    expect(fetched).toEqual([url("s_one"), url("s_two")]);

    fireEvent.click(screen.getByTestId("go"));
    expect(await screen.findByText("Screen two")).toBeInTheDocument();
    expect(fetched).toEqual([url("s_one"), url("s_two"), url("s_two")]);
  });

  it("keeps the visitor where they are across re-renders with the same manifest", async () => {
    cdn();
    const { rerender } = mount();
    fireEvent.click(await screen.findByTestId("go"));
    await screen.findByText("Screen two");

    rerender(<Funnel manifest={published} screens={{}} locale={source.locales!.en} />);
    await settle();

    expect(screen.getByText("Screen two")).toBeInTheDocument();
    expect(screen.queryByText("Screen one")).not.toBeInTheDocument();
  });
});
