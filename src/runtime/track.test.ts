/**
 * The track step: a conversion's key handed to the host's pixels, from either
 * renderer, and never in the visitor's way.
 */
import { emitScreen } from "./compiler/emit";
import { readsOf, visitorFactsOf } from "./compiler/manifest";
import { run, type ActionContext } from "./interpret";
import { analytics, configureTracking, track } from "./track";

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
    expect(code).toContain("function Screen({ ui, c, t, state, nav, req, track, analytics })");
    expect(code).toContain('if (track) track("lead");');
    // Fired, not awaited: the handler stays synchronous.
    expect(code).toContain("onClick: () =>");
  });
});

describe("the analytics sender", () => {
  afterEach(() => configureTracking({ analytics: undefined }));

  it("hands the host the event and its properties", () => {
    const seen: unknown[] = [];
    configureTracking({ analytics: (event, properties) => seen.push([event, properties]) });
    analytics("quiz_completed", { goal: "career" });
    expect(seen).toEqual([["quiz_completed", { goal: "career" }]]);
  });

  it("never throws at the visitor, and logs a sender that rejects", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    configureTracking({
      analytics: () => {
        throw new Error("collector down");
      },
    });
    expect(() => analytics("quiz_completed")).not.toThrow();
    configureTracking({ analytics: () => Promise.reject(new Error("offline")) });
    analytics("quiz_completed");
    await new Promise((settle) => setTimeout(settle, 0));
    expect(logged).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledWith(
      "funnel_analytics_failed",
      expect.objectContaining({ event: "quiz_completed", message: "offline" }),
    );
    logged.mockRestore();
  });

  it("does nothing with no sender configured", () => {
    expect(() => analytics("quiz_completed")).not.toThrow();
  });
});

describe("an analytics step", () => {
  afterEach(() => configureTracking({ analytics: undefined }));

  const step = {
    type: "analytics" as const,
    event: "plan_chosen",
    properties: {
      plan: { var: "plan" },
      source: { lit: "paywall" },
      country: { visitor: "country" },
    },
  };

  it("reads its properties when a tree runs it, and goes on", async () => {
    const seen: unknown[] = [];
    configureTracking({ analytics: (event, properties) => seen.push([event, properties]) });
    const shown: string[] = [];
    const ctx = context();
    ctx.state.get = (name) => (name === "plan" ? "pro" : null);
    ctx.state.visitorValue = (property) => (property === "country" ? "KZ" : null);
    ctx.nav.show = (target) => shown.push(target);
    await run([step, { type: "show", target: "s_checkout" }], ctx);
    expect(seen).toEqual([["plan_chosen", { plan: "pro", source: "paywall", country: "KZ" }]]);
    expect(shown).toEqual(["s_checkout"]);
  });

  it("uses the context's own sender when it has one", async () => {
    const seen: string[] = [];
    await run([{ type: "analytics", event: "opened" }], {
      ...context(),
      analytics: (event) => seen.push(event),
    });
    expect(seen).toEqual(["opened"]);
  });

  it("compiles to a call on the screen's analytics service, reading state as it runs", () => {
    const code = emitScreen({
      id: "s1",
      name: "Paywall",
      frames: [
        {
          id: "f1",
          name: "Choose",
          parent: null,
          kind: "frame",
          pos: "a0",
          props: {},
          textKey: null,
          bindings: {},
          interactions: [{ on: { event: "click" }, do: [step] }],
        },
      ],
    });
    expect(code).toContain(
      'if (analytics) analytics("plan_chosen", { "plan": state.get("plan"), "source": "paywall", "country": state.visitorValue("country") });',
    );
    expect(code).toContain("onClick: () =>");
  });

  it("compiles an event with no properties", () => {
    const code = emitScreen({
      id: "s1",
      name: "Paywall",
      frames: [
        {
          id: "f1",
          name: "Choose",
          parent: null,
          kind: "frame",
          pos: "a0",
          props: {},
          textKey: null,
          bindings: {},
          interactions: [{ on: { event: "click" }, do: [{ type: "analytics", event: "opened" }] }],
        },
      ],
    });
    expect(code).toContain('if (analytics) analytics("opened", {});');
  });

  it("names what it reads, so the store declares the answers and the host looks up the facts", () => {
    const screen = {
      id: "s1",
      name: "Paywall",
      frames: [
        {
          id: "f1",
          name: "Choose",
          parent: null,
          kind: "frame" as const,
          pos: "a0",
          interactions: [
            {
              on: { event: "click" as const },
              do: [
                {
                  type: "submit" as const,
                  action: "api:1",
                  // Inside an API call's success, where a lead is reported.
                  onSuccess: [step],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(readsOf(screen)).toEqual(["plan"]);
    expect(visitorFactsOf({ screens: [screen] } as never)).toEqual(["country"]);
  });
});
