/**
 * The email step: `email` and `userId` written, the account asked for by name,
 * and the design's own branches run after.
 */
import { buildManifest } from "./compiler/manifest";
import type { SourceFunnel } from "./compiler/source";
import { EMAIL_SUBMIT_REQUEST, run, type ActionContext } from "./interpret";
import { createFunnelStore } from "./store";

const table = {
  email: { name: "email", type: "string" as const, sensitive: true },
  userId: { name: "userId", type: "string" as const },
  typed: { name: "typed", type: "string" as const },
  problem: { name: "problem", type: "string" as const },
  after: { name: "after", type: "string" as const },
};

function context(req: ActionContext["req"]) {
  const state = createFunnelStore({ table });
  const shown: string[] = [];
  const ctx = {
    state,
    nav: { show: (target: string) => void shown.push(target), close: () => undefined },
    req,
  } as unknown as ActionContext;
  return { state, shown, ctx };
}

const step = {
  type: "email_submit" as const,
  onSuccess: [{ type: "set" as const, variable: "after", value: "success" }],
  onError: [{ type: "set" as const, variable: "after", value: "error" }],
  errorInto: "problem",
};

describe("email_submit", () => {
  it("sends the address, and writes email and the account's userId", async () => {
    const req = jest.fn(async () => ({ userId: "u-1", created: false }));
    const { state, ctx } = context(req as never);
    state.set("email", " ana@example.com ");

    await run([step], ctx);

    expect(req).toHaveBeenCalledWith(EMAIL_SUBMIT_REQUEST, { email: "ana@example.com" });
    expect(state.get("email")).toBe("ana@example.com");
    expect(state.get("userId")).toBe("u-1");
    expect(state.get("after")).toBe("success");
    expect(state.get("$req.email_submit.status")).toBe("success");
  });

  it("reads the address from where the step says, and writes it into email", async () => {
    const req = jest.fn(async () => ({ userId: "u-2" }));
    const { state, ctx } = context(req as never);
    state.set("typed", "bo@example.com");

    await run([{ ...step, email: { var: "typed" } }], ctx);

    expect(req).toHaveBeenCalledWith(EMAIL_SUBMIT_REQUEST, { email: "bo@example.com" });
    expect(state.get("email")).toBe("bo@example.com");
  });

  it("keeps the address and runs onError when the account cannot be had", async () => {
    const req = jest.fn(async () => {
      throw new Error("platform unavailable");
    });
    const { state, ctx } = context(req as never);
    state.set("email", "ana@example.com");

    await run([step], ctx);

    expect(state.get("email")).toBe("ana@example.com");
    expect(state.get("userId")).toBeNull();
    expect(state.get("after")).toBe("error");
    expect(state.get("problem")).toBe("platform unavailable");
  });

  it("sends nothing for a blank address, and runs onError", async () => {
    const req = jest.fn();
    const { state, ctx } = context(req as never);

    await run([step], ctx);

    expect(req).not.toHaveBeenCalled();
    expect(state.get("after")).toBe("error");
  });
});

describe("the manifest", () => {
  it("counts where the email step goes next as a screen it leads to", () => {
    const funnel: SourceFunnel = {
      id: "f",
      version: "v1",
      entry: "s_email",
      variables: [],
      screens: [
        {
          id: "s_email",
          frames: [
            {
              id: "go",
              parent: null,
              kind: "frame",
              pos: "a0",
              interactions: [{ on: { event: "click" }, do: [{ type: "email_submit", onSuccess: [{ type: "show", target: "s_name" }] }] }],
            },
          ],
        },
        { id: "s_name", frames: [] },
      ],
    };
    const manifest = buildManifest(funnel);
    expect(manifest.screens.find((screen) => screen.id === "s_email")?.next).toEqual(["s_name"]);
  });
});
