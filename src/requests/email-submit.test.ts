/**
 * @jest-environment node
 */
/**
 * `email.submit`: an email in, the visitor's platform account out — always
 * from the payments platform, whatever project the design belongs to.
 */
import { ActionError, type RequestContext } from "./contract";
import { EMAIL_SUBMIT_ACTION, emailSubmitHandlers } from "./email-submit";

const HUB = "https://hub.example.com";
const USER_ID = "6f1c1a2e-6a0b-4c55-9d7e-1f2a3b4c5d6e";

function platform(reply: { status?: number; body: unknown }) {
  const calls: { procedure: string; body: Record<string, unknown> }[] = [];
  const doFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ procedure: String(url).slice(HUB.length), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { calls, doFetch };
}

const context = (): RequestContext => ({
  request: new Request("https://funnel.example.com/api/funnel/request", { method: "POST" }),
  responseHeaders: new Headers(),
});

const handler = (doFetch: typeof fetch) =>
  emailSubmitHandlers({ baseUrl: HUB, apiKey: "key", projectId: "p1", fetch: doFetch })[
    EMAIL_SUBMIT_ACTION
  ]!;

describe("email.submit", () => {
  it("asks the platform's GetOrCreateUser for the account, and answers its id", async () => {
    const { calls, doFetch } = platform({ body: { userId: USER_ID, created: true, analyticsId: "4242" } });
    const answer = await handler(doFetch)({ email: " ana@example.com " }, context());

    expect(calls).toEqual([
      { procedure: "/auth.v1.ServiceAccountService/GetOrCreateUser", body: { email: "ana@example.com" } },
    ]);
    expect(answer).toEqual({ userId: USER_ID, created: true, analyticsId: "4242" });
  });

  it.each(["not-an-email", "ana@", "@example.com", "ana@example"])(
    "refuses %s, without asking the platform",
    async (email) => {
      const { calls, doFetch } = platform({ body: {} });
      await expect(handler(doFetch)({ email }, context())).rejects.toBeInstanceOf(ActionError);
      expect(calls).toEqual([]);
    },
  );

  it("answers a platform refusal as an ActionError with the platform's status", async () => {
    const { doFetch } = platform({ status: 400, body: { code: "invalid_argument", message: "bad email" } });
    await expect(handler(doFetch)({ email: "ana@example.com" }, context())).rejects.toMatchObject({ status: 400 });
  });
});
