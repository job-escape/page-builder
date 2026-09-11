/**
 * The track step: a conversion's key handed to the host's pixels, from either
 * renderer, and never in the visitor's way.
 */
import { emitScreen } from "./compiler/emit";
import { run, type ActionContext } from "./interpret";
import { configureTracking, track } from "./track";

const context = (): ActionContext =>
  ({
    state: {
      get: () => null,
      set: () => undefined,
      select: () => undefined,
    },
    nav: { show: () => undefined, close: () => undefined },
    req: (async () => ({})) as never,
  }) as unknown as ActionContext;

describe("the tracker", () => {
  afterEach(() => configureTracking({ track: undefined }));

  it("hands the host the conversion's key", () => {
    const seen: string[] = [];
    configureTracking({ track: (event) => seen.push(event) });
    track("lead");
    expect(seen).toEqual(["lead"]);
  });

  it("is one tracker for every copy of the module", () => {
    // Each entry bundles its own copy; the host configures through one and
    // `<Funnel>` fires through another.
    const seen: string[] = [];
    configureTracking({ track: (event) => seen.push(event) });
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const copy = require("./track") as typeof import("./track");
      copy.track("purchase");
    });
    expect(seen).toEqual(["purchase"]);
  });

  it("never throws at the visitor when a pixel does", () => {
    configureTracking({
      track: () => {
        throw new Error("pixel down");
      },
    });
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => track("lead")).not.toThrow();
    expect(logged).toHaveBeenCalledWith("funnel_track_failed", expect.objectContaining({ event: "lead" }));
    logged.mockRestore();
  });

  it("does nothing with no tracker configured", () => {
    expect(() => track("lead")).not.toThrow();
  });
});

describe("a track step", () => {
  afterEach(() => configureTracking({ track: undefined }));

  it("fires through the configured tracker when a tree runs it, and goes on", async () => {
    const seen: string[] = [];
    configureTracking({ track: (event) => seen.push(event) });
    const shown: string[] = [];
    const ctx = context();
    ctx.nav.show = (target) => shown.push(target);
    await run(
      [
        { type: "track", event: "lead" },
        { type: "show", target: "s_thanks" },
      ],
      ctx,
    );
    expect(seen).toEqual(["lead"]);
    expect(shown).toEqual(["s_thanks"]);
  });

  it("uses the context's own tracker when it has one", async () => {
    const seen: string[] = [];
    await run([{ type: "track", event: "purchase" }], { ...context(), track: (e) => seen.push(e) });
    expect(seen).toEqual(["purchase"]);
  });

  it("compiles to a call on the screen's track service", () => {
    const code = emitScreen({
      id: "s1",
      name: "Lead",
      frames: [
        {
          id: "f1",
          name: "Submit",
          parent: null,
          kind: "frame",
          pos: "a0",
          props: {},
          textKey: null,
          bindings: {},
          interactions: [{ on: { event: "click" }, do: [{ type: "track", event: "lead" }] }],
        },
      ],
    });
    expect(code).toContain("function Screen({ ui, c, t, state, nav, req, track })");
    expect(code).toContain('if (track) track("lead");');
    // Fired, not awaited: the handler stays synchronous.
    expect(code).toContain("onClick: () =>");
  });
});
