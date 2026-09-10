/**
 * A wait, and a screen's opening steps — the two halves of "after a delay".
 *
 * The property that matters is the stop: a wait whose screen was left must end
 * the flow it is in, in the emitted module and in the interpreter alike, or a
 * loader that moves somebody on keeps doing it from a screen they already left.
 */
import { run, type ActionContext } from "../interpret";
import { emitScreen } from "./emit";
import type { SourceAction, SourceFunnel, SourceScreen } from "./source";
import { compileToTree } from "./tree";

/** Just enough of a context for `run`: a map for state, a wait that answers as told. */
function context(waitAnswers: boolean) {
  const values: Record<string, unknown> = {};
  const ctx = {
    state: {
      get: (name: string) => values[name] ?? null,
      set: (name: string, value: unknown) => {
        values[name] = value;
      },
      select: (name: string, value: string) => {
        values[name] = value;
      },
    },
    nav: { show: jest.fn(), close: jest.fn(), wait: jest.fn(async () => waitAnswers) },
    req: jest.fn(),
  } as unknown as ActionContext;
  return { ctx, values };
}

const steps: SourceAction[] = [
  { type: "set", variable: "x", value: "before" },
  { type: "wait", seconds: 2 },
  { type: "set", variable: "x", value: "after" },
];

const screenWith = (actions: SourceAction[], event: "click" | "load" = "click"): SourceScreen => ({
  id: "s_wait",
  frames: [
    {
      id: "s_wait",
      parent: null,
      kind: "frame",
      pos: "a0",
      interactions: [{ on: { event }, do: actions }],
    },
  ],
});

const funnel = (screens: SourceScreen[]): SourceFunnel => ({
  id: 1,
  version: "v1",
  entry: screens[0].id,
  variables: [{ name: "x", type: "string" }],
  screens,
});

describe("a wait in the interpreter", () => {
  it("goes on when the screen is still there", async () => {
    const { ctx, values } = context(true);
    await expect(run(steps, ctx)).resolves.toBe(true);
    expect(values.x).toBe("after");
    expect(ctx.nav.wait).toHaveBeenCalledWith(2);
  });

  it("leaves everything after it undone when the screen was left", async () => {
    const { ctx, values } = context(false);
    await expect(run(steps, ctx)).resolves.toBe(false);
    expect(values.x).toBe("before");
  });

  it("stops the list around a branch as well as the branch", async () => {
    const { ctx, values } = context(false);
    await run(
      [
        { type: "conditional", branches: [{ do: steps }] },
        { type: "set", variable: "y", value: "outside" },
      ],
      ctx,
    );
    expect(values.x).toBe("before");
    expect(values.y).toBeUndefined();
  });
});

describe("a wait in the emitted module", () => {
  it("awaits nav.wait, and returns from the handler when it answers false", () => {
    const module = emitScreen(
      screenWith([
        { type: "wait", seconds: 2 },
        { type: "show", target: "s_next" },
      ]),
    );
    expect(module).toContain("onClick: async () =>");
    expect(module).toContain("await (nav.wait ? nav.wait(2) :");
    expect(module).toContain(") return;");
  });

  it("leaves a screen's opening steps out of its module", () => {
    const module = emitScreen(screenWith([{ type: "set", variable: "x", value: "y" }], "load"));
    expect(module).not.toContain("onClick");
    expect(module).not.toContain('state.set("x"');
  });
});

describe("a screen's opening steps", () => {
  it("travel in the manifest as `enter`, in order, and what they reach is reachable", () => {
    const opening: SourceAction[] = [
      { type: "wait", seconds: 1 },
      { type: "show", target: "s_next" },
    ];
    const { manifest } = compileToTree(
      funnel([screenWith(opening, "load"), { id: "s_next", frames: [] }]),
    );
    const entry = manifest.screens.find((screen) => screen.id === "s_wait");
    expect(entry?.enter).toEqual(opening);
    expect(entry?.next).toEqual(["s_next"]);
  });

  it("are absent from a screen that does nothing on opening", () => {
    const { manifest } = compileToTree(
      funnel([screenWith([{ type: "show", target: "s_next" }]), { id: "s_next", frames: [] }]),
    );
    expect(manifest.screens.find((screen) => screen.id === "s_wait")).not.toHaveProperty("enter");
  });
});
