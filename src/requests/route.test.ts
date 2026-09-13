/**
 * @jest-environment node
 */
/**
 * The route's half of the runtime's wire format: an envelope in, a status and
 * a JSON body out, and nothing from an action's insides leaking to a visitor.
 */
import { ActionError, type RequestContext } from "./contract";
import { createRequestRoute } from "./route";

const post = (body: unknown) =>
  new Request("https://funnel.example.com/api/funnel/request", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("createRequestRoute", () => {
  it("hands the action its payload and the context the page sent", async () => {
    let seen: { payload: unknown; context?: RequestContext } = { payload: undefined };
    const route = createRequestRoute({
      actions: {
        "plans.list": async (payload, context) => {
          seen = { payload, context };
          context.responseHeaders.append("Set-Cookie", "a=1");
          return { plans: [1] };
        },
      },
    });
    const response = await route(
      post({
        action: "plans.list",
        payload: { currency: "EUR" },
        context: { funnel: 12, design: "12", version: "v3", variant: "b", page: { funnel_currency: "EUR" }, extra: 1 },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("set-cookie")).toBe("a=1");
    expect(await response.json()).toEqual({ plans: [1] });
    expect(seen.payload).toEqual({ currency: "EUR" });
    expect(seen.context).toMatchObject({
      funnel: 12,
      design: "12",
      version: "v3",
      variant: "b",
      page: { funnel_currency: "EUR" },
    });
    expect(seen.context).not.toHaveProperty("extra");
  });

  it("is a 400 for a broken envelope or an action it does not answer", async () => {
    const route = createRequestRoute({ actions: {} });
    const broken = await route(post("{not json"));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ error: "invalid_argument" });
    const unknown = await route(post({ action: "leads.create" }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: "unknown_action" });
    expect((await route(post({ action: "api:4" }))).status).toBe(400);
  });

  it("answers an ActionError with its own status and body", async () => {
    const route = createRequestRoute({
      actions: {
        "payments.confirm": async () => {
          throw new ActionError(409, { error: "already_owned", action: "continue" });
        },
      },
    });
    const response = await route(post({ action: "payments.confirm" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_owned", action: "continue" });
  });

  it("answers anything else with a 500 that says nothing about why", async () => {
    const error = jest.fn();
    const route = createRequestRoute({
      actions: {
        "plans.list": async () => {
          throw new Error("postgres://secret@host");
        },
      },
      log: { info: () => {}, warn: () => {}, error },
    });
    const response = await route(post({ action: "plans.list" }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(error).toHaveBeenCalledWith("funnel_request_failed", expect.objectContaining({ action: "plans.list" }));
  });

  it("passes api:<id> to the host's project API call", async () => {
    const apiCall = jest.fn(async (id: number) => new Response(JSON.stringify({ id }), { status: 201 }));
    const route = createRequestRoute({ actions: {}, apiCall });
    const response = await route(post({ action: "api:42", payload: { a: 1 } }));
    expect(response.status).toBe(201);
    expect(apiCall).toHaveBeenCalledWith(42, { a: 1 }, expect.objectContaining({ request: expect.any(Request) }));
  });
});
