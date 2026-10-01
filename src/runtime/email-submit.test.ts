/**
 * The email step: `email` and `userId` written, the account asked for by name,
 * and the design's own branches run after.
 */
import { buildManifest } from "./compiler/manifest";
import type { SourceFunnel } from "./compiler/source";
import { EMAIL_SUBMIT_REQUEST, run, type ActionContext } from "./interpret";
import { RequestFailed } from "./request";
import { createFunnelStore } from "./store";

const table = {
  email: { name: "email", type: "string" as const, sensitive: true },
  userId: { name: "userId", type: "string" as const },
  typed: { name: "typed", type: "string" as const },
  problem: { name: "problem", type: "string" as const },
  code: { name: "code", type: "string" as const },
  status: { name: "status", type: "number" as const },
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
  email: { var: "typed" },
  onSuccess: [{ type: "set" as const, variable: "after", value: "success" }],
  // The failure steps read why from `$error`, which only they can see.
  onError: [
    { type: "set" as const, variable: "after", value: "error" },
    { type: "set" as const, variable: "problem", from: { var: "$error", path: "message" } },
    { type: "set" as const, variable: "code", from: { var: "$error", path: "code" } },
    { type: "set" as const, variable: "status", from: { var: "$error", path: "status" } },
  ],
};

describe("email_submit", () => {
  it("checks its argument, then writes email, asks for the account, and writes userId", async () => {
    const req = jest.fn(async () => ({ userId: "u-1", created: false }));
    const { state, ctx } = context(req as never);
    state.set("typed", " ana@example.com ");

    await run([step], ctx);

    expect(req).toHaveBeenCalledWith(EMAIL_SUBMIT_REQUEST, { email: "ana@example.com" });
    expect(state.get("email")).toBe("ana@example.com");
    expect(state.get("userId")).toBe("u-1");
    expect(state.get("after")).toBe("success");
    expect(state.get("$req.email_submit.status")).toBe("success");
  });

  it("sends nothing for what is not an address, and leaves the system email alone", async () => {
    const req = jest.fn();
    const { state, ctx } = context(req as never);
    state.set("email", "kept@example.com");
    state.set("typed", "ana@");

    await run([step], ctx);

    expect(req).not.toHaveBeenCalled();
    expect(state.get("email")).toBe("kept@example.com");
    expect(state.get("after")).toBe("error");
    expect(state.get("problem")).toBe("A valid email is required.");
    expect(state.get("code")).toBe("invalid_email");
    expect(state.get("status")).toBe(0);
  });

  it("sends nothing without an argument", async () => {
    const req = jest.fn();
    const { state, ctx } = context(req as never);
    state.set("email", "ana@example.com");

    await run([{ ...step, email: undefined } as never], ctx);

    expect(req).not.toHaveBeenCalled();
    expect(state.get("after")).toBe("error");
  });

  it("keeps a valid address and runs onError when the account cannot be had", async () => {
    const req = jest.fn(async () => {
      throw new RequestFailed("email.submit", 502, "platform unavailable", { error: "unavailable" });
    });
    const { state, ctx } = context(req as never);
    state.set("typed", "ana@example.com");

    await run([step], ctx);

    expect(state.get("email")).toBe("ana@example.com");
    expect(state.get("userId")).toBeNull();
    expect(state.get("after")).toBe("error");
    expect(state.get("problem")).toBe("platform unavailable");
    expect(state.get("code")).toBe("unavailable");
    expect(state.get("status")).toBe(502);
  });

  it("answers $error to the failure steps only", async () => {
    const req = jest.fn(async () => ({ userId: "u-1", created: false }));
    const { state, ctx } = context(req as never);
    state.set("typed", "ana@example.com");

    await run(
      [
        {
          ...step,
          onSuccess: [{ type: "set", variable: "problem", from: { var: "$error", path: "message" } }],
        },
      ],
      ctx,
    );

    expect(state.get("problem")).toBeNull();
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
              interactions: [{ on: { event: "click" }, do: [{ type: "email_submit", email: { var: "typed" }, onSuccess: [{ type: "show", target: "s_name" }] }] }],
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
