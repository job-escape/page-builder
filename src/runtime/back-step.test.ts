/**
 * The back step: the back gesture a designer can put on a control.
 */
import { emitScreen } from "./compiler/emit";
import { run, type ActionContext } from "./interpret";

const context = (nav: Partial<ActionContext["nav"]>): ActionContext =>
  ({
    state: { get: () => null, set: () => undefined, select: () => undefined },
    nav: { show: () => undefined, close: () => undefined, ...nav },
    req: (async () => ({})) as never,
  }) as unknown as ActionContext;

describe("the back step", () => {
  it("goes back through the navigator", async () => {
    const calls: string[] = [];
    await run([{ type: "back" }], context({ back: () => calls.push("back") > 0, close: () => calls.push("close") && undefined }));
    expect(calls).toEqual(["back"]);
  });

  it("closes the top overlay on a host that has no back", async () => {
    const calls: string[] = [];
    await run([{ type: "back" }], context({ back: undefined, close: () => { calls.push("close"); } }));
    expect(calls).toEqual(["close"]);
  });

  it("compiles to the screen's nav.back()", () => {
    const code = emitScreen({
      id: "s1",
      name: "Quiz",
      frames: [
        {
          id: "f1",
          name: "Back",
          parent: null,
          kind: "frame",
          pos: "a0",
          props: {},
          textKey: null,
          bindings: {},
          interactions: [{ on: { event: "click" }, do: [{ type: "back" }] }],
        },
      ],
    });
    expect(code).toContain("nav.back();");
  });
});
