/**
 * @jest-environment node
 */
/**
 * What reaches the NVS platform when a design names an action.
 *
 * Each RPC here is the one `sart-funnel`'s route sends for the same step
 * (`/api/user`, `/api/user/name`, `/api/subscriptions`, `/api/payment-session`,
 * `/api/payment-session/confirm`); the answers are those routes' answers.
 */
import type { RequestContext } from "../contract";
import { nvsActions, toFunnelSubscription, type PlatformProduct } from "./actions";

type Call = { url: string; init: RequestInit };
type Reply = { status?: number; body: unknown; headers?: Record<string, string> };

const HUB = "https://hub.example.com";
const USER_ID = "6f1c1a2e-6a0b-4c55-9d7e-1f2a3b4c5d6e";

function platform(replies: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const doFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const procedure = String(url).slice(HUB.length);
    const planned = replies[procedure];
    const reply = Array.isArray(planned) ? planned.shift() : planned;
    if (!reply) throw new Error(`unplanned call ${procedure}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  }) as typeof fetch;
  return { calls, doFetch };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;
const procedureOf = (call: Call) => call.url.slice(HUB.length);

function contextFor(headers: Record<string, string> = {}): RequestContext {
  return {
    request: new Request("https://sart.example.com/api/funnel/request", { method: "POST", headers }),
    responseHeaders: new Headers(),
  };
}

const PRODUCTS: PlatformProduct[] = [
  {
    id: "prod-1",
    code: "4w",
    name: "4 Weeks",
    price: { amountMinor: "2999", currency: "USD" },
    billingPeriod: "BILLING_PERIOD_WEEK",
    billingFrequency: 4,
    trialPrice: { amountMinor: "699", currency: "USD" },
    trialBillingFrequency: 1,
    active: true,
  },
  { id: "prod-2", code: "old", name: "Old", price: { amountMinor: "100", currency: "USD" }, active: false },
];

function actions(replies: Record<string, Reply | Reply[]>, extra: Partial<Parameters<typeof nvsActions>[0]> = {}) {
  const { calls, doFetch } = platform(replies);
  const handlers = nvsActions({
    baseUrl: HUB,
    apiKey: "key",
    projectId: "proj",
    fetch: doFetch,
    sleep: async () => {},
    idempotencyKey: () => "idem-1",
    ...extra,
  });
  return { calls, handlers };
}

const initPayload = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

describe("the RPC envelope", () => {
  it("POSTs JSON with the key and the project, uncached", async () => {
    const { calls, handlers } = actions({
      "/auth.v1.ServiceAccountService/GetOrCreateUser": { body: { userId: USER_ID, created: true, analyticsId: "77" } },
    });
    await handlers["leads.create"]!({ email: "a@b.co" }, contextFor());
    expect(calls[0].init).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer key", "X-Project-Id": "proj" },
      body: JSON.stringify({ email: "a@b.co" }),
      cache: "no-store",
    });
  });

  it("retries an unavailable platform, but not a 429 without Retry-After", async () => {
    const flaky = actions({
      "/auth.v1.ServiceAccountService/GetOrCreateUser": [
        { status: 503, body: { code: "unavailable", message: "down" } },
        { body: { userId: USER_ID } },
      ],
    });
    await expect(flaky.handlers["leads.create"]!({ email: "a@b.co" }, contextFor())).resolves.toMatchObject({
      userId: USER_ID,
    });
    expect(flaky.calls).toHaveLength(2);

    const limited = actions({
      "/auth.v1.ServiceAccountService/GetOrCreateUser": { status: 429, body: { code: "resource_exhausted", message: "slow" } },
    });
    await expect(limited.handlers["leads.create"]!({ email: "a@b.co" }, contextFor())).rejects.toMatchObject({
      status: 429,
      body: { error: "resource_exhausted" },
    });
    expect(limited.calls).toHaveLength(1);
  });
});

describe("leads.create", () => {
  it("is GetOrCreateUser {email, name}, answering /api/user's shape", async () => {
    const { calls, handlers } = actions({
      "/auth.v1.ServiceAccountService/GetOrCreateUser": { body: { userId: USER_ID, created: true, analyticsId: "77" } },
    });
    const answer = await handlers["leads.create"]!({ email: "a@b.co", name: "Ann" }, contextFor());
    expect(procedureOf(calls[0])).toBe("/auth.v1.ServiceAccountService/GetOrCreateUser");
    expect(String(calls[0].init.body)).toBe(JSON.stringify({ email: "a@b.co", name: "Ann" }));
    expect(answer).toEqual({ userId: USER_ID, analyticsId: "77", created: true });
  });

  it("a platform auth failure is our key's fault: 502", async () => {
    const { handlers } = actions({
      "/auth.v1.ServiceAccountService/GetOrCreateUser": { status: 401, body: { code: "unauthenticated", message: "no" } },
    });
    await expect(handlers["leads.create"]!({ email: "a@b.co" }, contextFor())).rejects.toMatchObject({ status: 502 });
  });
});

describe("leads.update_name", () => {
  it("is UpdateUserProfile {user_id, name} for a platform user, and saved: false otherwise", async () => {
    const { calls, handlers } = actions({ "/auth.v1.ServiceAccountService/UpdateUserProfile": { body: {} } });
    expect(await handlers["leads.update_name"]!({ userId: USER_ID, name: "Ann" }, contextFor())).toEqual({ saved: true });
    expect(String(calls[0].init.body)).toBe(JSON.stringify({ user_id: USER_ID, name: "Ann" }));

    expect(await handlers["leads.update_name"]!({ userId: "41", name: "Ann" }, contextFor())).toEqual({
      saved: false,
      reason: "no_user",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("plans.list", () => {
  it("is ListProducts {active_only: true}, the active ones mapped to funnel plans, cached", async () => {
    const { calls, handlers } = actions({
      "/payments.v1.ServiceAccountService/ListProducts": { body: { products: PRODUCTS } },
    });
    const answer = await handlers["plans.list"]!({}, contextFor());
    await handlers["plans.list"]!({}, contextFor());
    expect(calls).toHaveLength(1);
    expect(String(calls[0].init.body)).toBe(JSON.stringify({ active_only: true }));
    expect(answer).toEqual({ plans: [toFunnelSubscription(PRODUCTS[0], 0)] });
  });

  it("maps a product the way subscriptions-mapper did", () => {
    expect(toFunnelSubscription(PRODUCTS[0], 0)).toEqual({
      id: "prod-1",
      code: "4w",
      name: "4 Weeks",
      price_amount: 29.99,
      price_currency: "USD",
      price_currency_symbol: "$",
      billing_cycle_interval: "week",
      billing_cycle_frequency: 4,
      trial_standard_price_amount: 6.99,
      trial_standard_discount: 77,
      trial_cycle_frequency: 1,
      trial_price_chase_amount: 6.99,
      trial_chase_discount: 77,
      trial_price_super_chase_amount: 6.99,
      trial_super_chase_discount: 77,
      trial_timeout_price_amount: 6.99,
      saved_amount: 23,
      is_default: true,
    });
  });
});

describe("payments.create_session", () => {
  const LIST = { "/payments.v1.ServiceAccountService/ListProducts": { body: { products: PRODUCTS } } };

  it("resolves the code, creates the user when the id is not the platform's, and opens a Primer session", async () => {
    const { calls, handlers } = actions({
      ...LIST,
      "/auth.v1.ServiceAccountService/GetOrCreateUser": { body: { userId: USER_ID } },
      "/payments.v1.ServiceAccountService/CreatePaymentSession": {
        body: { checkoutAttemptId: "att-1", initPayload: initPayload({ clientToken: "tok" }) },
      },
    });
    const answer = await handlers["payments.create_session"]!(
      { productCode: "4w", email: "a@b.co", userId: "41" },
      contextFor({ "x-vercel-ip-country": "kz" }),
    );
    expect(calls.map(procedureOf)).toEqual([
      "/payments.v1.ServiceAccountService/ListProducts",
      "/auth.v1.ServiceAccountService/GetOrCreateUser",
      "/payments.v1.ServiceAccountService/CreatePaymentSession",
    ]);
    expect(String(calls[2].init.body)).toBe(
      JSON.stringify({
        user_id: USER_ID,
        product_id: "prod-1",
        idempotency_key: "idem-1",
        gateway: "primer",
        success_url: "https://sart.example.com/checkout/success",
        failure_url: "https://sart.example.com/checkout/failed",
        customer_email: "a@b.co",
        country_code: "KZ",
      }),
    );
    expect(answer).toEqual({ checkoutAttemptId: "att-1", clientToken: "tok", userId: USER_ID });
  });

  it("keeps a platform user id, and sends no country the edge could not place", async () => {
    const { calls, handlers } = actions({
      ...LIST,
      "/payments.v1.ServiceAccountService/CreatePaymentSession": {
        body: { checkoutAttemptId: "att-2", redirectUrl: "https://pay.example.com/r" },
      },
    });
    const answer = await handlers["payments.create_session"]!(
      { productCode: "4w", email: "a@b.co", userId: USER_ID },
      contextFor({ "x-vercel-ip-country": "XX" }),
    );
    expect(calls).toHaveLength(2);
    expect(bodyOf(calls[1])).not.toHaveProperty("country_code");
    expect(answer).toEqual({ checkoutAttemptId: "att-2", redirectUrl: "https://pay.example.com/r", userId: USER_ID });
  });

  it("stops before any money moves on a code this environment does not sell", async () => {
    const { calls, handlers } = actions(LIST);
    await expect(
      handlers["payments.create_session"]!({ productCode: "old", email: "a@b.co", userId: USER_ID }, contextFor()),
    ).rejects.toMatchObject({ status: 400, body: { error: "product_unavailable", action: "unavailable" } });
    expect(calls.map(procedureOf)).toEqual(["/payments.v1.ServiceAccountService/ListProducts"]);
  });

  it("tells the checkout what to do about a refusal it has a policy for", async () => {
    const { handlers } = actions({
      ...LIST,
      "/payments.v1.ServiceAccountService/CreatePaymentSession": {
        status: 400,
        body: {
          code: "failed_precondition",
          message: "product already owned",
          details: [{ type: "payments.v1.ErrorDetail", debug: { reason: "ERROR_REASON_ALREADY_OWNED" } }],
        },
      },
    });
    await expect(
      handlers["payments.create_session"]!({ productCode: "4w", email: "a@b.co", userId: USER_ID }, contextFor()),
    ).rejects.toMatchObject({
      status: 400,
      body: { error: "already_owned", action: "continue", message: "You are already subscribed to this plan." },
    });
  });
});

describe("payments.confirm", () => {
  it("is ConfirmPaymentSession, and a paid attempt reports the sale for its ltv", async () => {
    const onPaid = jest.fn(async () => 29.99);
    const { calls, handlers } = actions(
      {
        "/payments.v1.ServiceAccountService/ConfirmPaymentSession": { body: { status: "succeeded", mid: "m-1" } },
      },
      { onPaid },
    );
    const answer = await handlers["payments.confirm"]!(
      { checkoutAttemptId: "att-1", gatewayPaymentId: "gp-1", productCode: "4w", userId: USER_ID },
      contextFor(),
    );
    expect(String(calls[0].init.body)).toBe(JSON.stringify({ checkout_attempt_id: "att-1", gateway_payment_id: "gp-1" }));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutAttemptId: "att-1", gatewayPaymentId: "gp-1", productCode: "4w", mid: "m-1", userId: USER_ID }),
    );
    expect(answer).toEqual({ status: "succeeded", mid: "m-1", paid: true, ltv: 29.99 });
  });

  it("a failed report costs the ltv and nothing else", async () => {
    const { handlers } = actions(
      { "/payments.v1.ServiceAccountService/ConfirmPaymentSession": { body: { status: "authorized" } } },
      { onPaid: async () => Promise.reject(new Error("herald down")) },
    );
    expect(await handlers["payments.confirm"]!({ checkoutAttemptId: "att-1" }, contextFor())).toEqual({
      status: "authorized",
      paid: true,
    });
  });

  it("an unpaid attempt is answered, not refused", async () => {
    const { handlers } = actions({
      "/payments.v1.ServiceAccountService/ConfirmPaymentSession": { body: { status: "declined", code: "05" } },
    });
    expect(await handlers["payments.confirm"]!({ checkoutAttemptId: "att-1" }, contextFor())).toEqual({
      status: "declined",
      code: "05",
      paid: false,
    });
  });
});
