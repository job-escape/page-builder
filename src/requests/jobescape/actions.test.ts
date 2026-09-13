/**
 * @jest-environment node
 */
/**
 * What reaches JobEscape's users API when a design names an action.
 *
 * "The request to the backend must not change": each body here is the one the
 * quiz's own client code sends to the same path (`entities/user/api/*`,
 * `payments/primer/api.ts`, `payments/solidgate/api.ts`), key for key, so a
 * design and a hand-written quiz step are indistinguishable to the backend.
 */
import type { RequestContext } from "../contract";
import { jobescapeActions, readCookieUser } from "./actions";

type Call = { url: string; init: RequestInit };

function fakeFetch(answer: unknown = {}, status = 200) {
  const calls: Call[] = [];
  const doFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(answer), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, doFetch };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;

const USER = {
  id: 41,
  gender: "female",
  deviceId: "device-1",
  email: "cookie@example.com",
  answers: { goal: "remote" },
  geolocation: { ip: "1.2.3.4", country_code: "KZ", city: "Almaty" },
};

function contextWith(
  { cookies = {}, page }: { cookies?: Record<string, string>; page?: Record<string, unknown> } = {},
): RequestContext {
  const header = Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  return {
    request: new Request("https://funnels.jobescape.me/api/funnel/request", {
      method: "POST",
      headers: { cookie: header, "user-agent": "UA/1.0" },
    }),
    responseHeaders: new Headers(),
    page,
  };
}

const API = "https://api.example.com";

function actions(answer?: unknown, status?: number) {
  const { calls, doFetch } = fakeFetch(answer, status);
  const handlers = jobescapeActions({ usersApiUrl: API, fetch: doFetch, now: () => 1700000000000, uuid: () => "uuid-1" });
  return { calls, handlers };
}

describe("readCookieUser", () => {
  it("reads the whole cookie, and the chunks the middleware splits a large one into", () => {
    const json = JSON.stringify(USER);
    expect(readCookieUser(contextWith({ cookies: { user_data: json } }).request)).toEqual(USER);
    const chunked = contextWith({
      cookies: { user_data_count: "2", user_data_0: json.slice(0, 20), user_data_1: json.slice(20) },
    });
    expect(readCookieUser(chunked.request)).toEqual(USER);
  });

  it("is empty for no cookie, a missing chunk or broken JSON", () => {
    expect(readCookieUser(contextWith().request)).toEqual({});
    expect(readCookieUser(contextWith({ cookies: { user_data_count: "2", user_data_0: "{" } }).request)).toEqual({});
    expect(readCookieUser(contextWith({ cookies: { user_data: "{nope" } }).request)).toEqual({});
  });
});

describe("leads.create", () => {
  it("sends createUser's body to /new_users/get_or_create/", async () => {
    const { calls, handlers } = actions({ id: 41, email: "a@b.co", full_name: "Ann" });
    const context = contextWith({
      cookies: { user_data: JSON.stringify(USER), _fbp: "fb.1.2", _fbc: "fb.1.3" },
    });

    const answer = await handlers["leads.create"]!({ email: "A@B.co", consent: true }, context);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API}/new_users/get_or_create/`);
    expect(calls[0].init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-cache",
    });
    const { id: _id, ...userOtherProps } = USER;
    // Key order too: the body is the quiz's JSON.stringify, byte for byte.
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({
        email: "a@b.co",
        email_consent: true,
        gender: "f",
        client_ip_address: "1.2.3.4",
        country_code: "KZ",
        fb_event_id: "uuid-1",
        funnel_info: {
          ...userOtherProps,
          ...USER.geolocation,
          user_agent: "UA/1.0",
          email: "a@b.co",
          email_consent: true,
          fbp: "fb.1.2",
          fb_timestamp: 1700000000000,
          fbc: "fb.1.3",
        },
        device_id: "device-1",
      }),
    );
    expect(answer).toEqual({ userId: "41", email: "a@b.co", name: "Ann", fbEventId: "uuid-1" });
  });

  it("uses the design's event id, so the browser pixel and the server event deduplicate", async () => {
    const { calls, handlers } = actions({ id: 1 });
    await handlers["leads.create"]!({ email: "a@b.co", fbEventId: "evt-9" }, contextWith());
    expect(bodyOf(calls[0]).fb_event_id).toBe("evt-9");
    expect(bodyOf(calls[0]).gender).toBe("m");
  });

  it("refuses a missing email without calling the backend", async () => {
    const { calls, handlers } = actions();
    await expect(handlers["leads.create"]!({ email: "nope" }, contextWith())).rejects.toMatchObject({
      status: 400,
      body: { error: "invalid_argument" },
    });
    expect(calls).toHaveLength(0);
  });

  it("passes the backend's detail on, and a 5xx as a 502", async () => {
    const refused = actions({ detail: "Email is blocked" }, 400);
    await expect(refused.handlers["leads.create"]!({ email: "a@b.co" }, contextWith())).rejects.toMatchObject({
      status: 400,
      body: { error: "lead_failed", message: "Email is blocked" },
    });
    const down = actions({}, 503);
    await expect(down.handlers["leads.create"]!({ email: "a@b.co" }, contextWith())).rejects.toMatchObject({
      status: 502,
    });
  });
});

describe("leads.update_name", () => {
  it("sends addName's body, the email falling back to the cookie", async () => {
    const { calls, handlers } = actions({});
    const answer = await handlers["leads.update_name"]!(
      { name: "Ann" },
      contextWith({ cookies: { user_data: JSON.stringify(USER) } }),
    );
    expect(calls[0].url).toBe(`${API}/new_users/add_name/`);
    expect(calls[0].init.method).toBe("POST");
    expect(String(calls[0].init.body)).toBe(JSON.stringify({ name: "Ann", email: "cookie@example.com" }));
    expect(answer).toEqual({ saved: true });
  });

  it("never fails the chain: every way it comes to nothing is saved: false", async () => {
    expect(await actions().handlers["leads.update_name"]!({}, contextWith())).toEqual({ saved: false, reason: "no_name" });
    expect(await actions().handlers["leads.update_name"]!({ name: "Ann" }, contextWith())).toEqual({
      saved: false,
      reason: "no_user",
    });
    expect(await actions({}, 500).handlers["leads.update_name"]!({ name: "Ann", email: "a@b.co" }, contextWith())).toEqual({
      saved: false,
      reason: "platform_error",
    });
  });
});

describe("plans.list", () => {
  const PLANS = [{ id: 7, name: "4 Weeks", price_amount: 29.99 }];

  it("GETs /subscriptions/ in the payload's currency, else the page's, else USD", async () => {
    const one = actions(PLANS);
    expect(await one.handlers["plans.list"]!({ currency: "EUR" }, contextWith({ page: { funnel_currency: "GBP" } }))).toEqual({
      plans: PLANS,
    });
    expect(one.calls[0].url).toBe(`${API}/subscriptions/?price_currency=EUR`);
    expect(one.calls[0].init.method).toBeUndefined();
    expect(one.calls[0].init.headers).toEqual({ "Content-Type": "application/json" });

    const two = actions(PLANS);
    await two.handlers["plans.list"]!({}, contextWith({ page: { funnel_currency: "GBP" } }));
    expect(two.calls[0].url).toBe(`${API}/subscriptions/?price_currency=GBP`);

    const three = actions(PLANS);
    await three.handlers["plans.list"]!({}, contextWith());
    expect(three.calls[0].url).toBe(`${API}/subscriptions/?price_currency=USD`);
  });

  it("answers the backend's list untouched — the design maps it", async () => {
    const { handlers } = actions({ not: "a list" });
    expect(await handlers["plans.list"]!({}, contextWith())).toEqual({ plans: [] });
  });
});

describe("payments.create_session", () => {
  const PAGE = {
    pixel_ids: ["px1"],
    x_pixel_ids: ["x1"],
    "paywall-zip": true,
    "paywall-cardholder-name": false,
    funnel_currency: "USD",
  };
  const withUser = (page: Record<string, unknown> = PAGE) =>
    contextWith({ cookies: { user_data: JSON.stringify(USER) }, page });

  it("sends createPaymentSession's body to Primer", async () => {
    const { calls, handlers } = actions({ clientToken: "tok" });
    const answer = await handlers["payments.create_session"]!({ subscriptionId: 7 }, withUser());
    expect(calls[0].url).toBe(`${API}/primer/create_payment_session/`);
    expect(calls[0].init).toMatchObject({ method: "POST", cache: "no-cache" });
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({
        user_id: 41,
        trial_type: "standard",
        subscription_id: 7,
        country_code: "KZ",
        device_session_id: "device-1",
        ip: "1.2.3.4",
        email: "cookie@example.com",
        currency: "USD",
        metadata: { "paywall-zip": "true", "paywall-cardholder-name": "false" },
        pixel_ids: ["px1"],
        x_pixel_ids: ["x1"],
      }),
    );
    expect(answer).toEqual({ gateway: "primer", clientToken: "tok" });
  });

  it("updates the session it already has instead of opening a second", async () => {
    const { calls, handlers } = actions({ clientToken: "tok-2" });
    await handlers["payments.create_session"]!(
      { subscriptionId: "8", trialType: "chase", clientToken: "tok-1" },
      withUser({ pixel_ids: [], x_pixel_ids: [], is_3ds: true }),
    );
    expect(calls[0].url).toBe(`${API}/primer/update_session/`);
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({
        user_id: 41,
        trial_type: "chase",
        subscription_id: 8,
        country_code: "KZ",
        device_session_id: "device-1",
        client_token: "tok-1",
        currency: "USD",
        metadata: { is_3ds: "true" },
        pixel_ids: [],
        x_pixel_ids: [],
      }),
    );
  });

  it("omits metadata when no paywall flag is decided", async () => {
    const { calls, handlers } = actions({ clientToken: "tok" });
    await handlers["payments.create_session"]!({ subscriptionId: 7 }, withUser({}));
    expect(bodyOf(calls[0])).not.toHaveProperty("metadata");
  });

  it("asks Solidgate for merchant data when the page's paywall is Solidgate", async () => {
    const { calls, handlers } = actions({ responseDTO: { payment_intent: "pi", merchant: "m", signature: "s" } });
    const answer = await handlers["payments.create_session"]!(
      { subscriptionId: 7, zipCode: "050000" },
      withUser({ ...PAGE, payment_form: "solidgate" }),
    );
    expect(calls[0].url).toBe(`${API}/solidgate/payment_intent/`);
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({
        ip_address: "1.2.3.4",
        trial_type: "standard",
        subscription_id: 7,
        geo_country: "KZ",
        country_code: "KZ",
        email: "cookie@example.com",
        user_id: 41,
        ip: "1.2.3.4",
        zip_code: "050000",
        currency: "USD",
        pixel_ids: ["px1"],
        x_pixel_ids: ["x1"],
      }),
    );
    expect(answer).toEqual({ gateway: "solidgate", merchantData: { paymentIntent: "pi", merchant: "m", signature: "s" } });
  });

  it("opens a PayPal order through Solidgate's init_paypal", async () => {
    const { calls, handlers } = actions({ script_url: "https://paypal.example/sdk.js", order_id: "pp-1" });
    const answer = await handlers["payments.create_session"]!({ subscriptionId: 7, gateway: "paypal" }, withUser());
    expect(calls[0].url).toBe(`${API}/solidgate/init_paypal/`);
    expect(calls[0].init).toMatchObject({ method: "POST", cache: "no-cache" });
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({
        ip_address: "1.2.3.4",
        email: "cookie@example.com",
        trial_type: "standard",
        subscription_id: 7,
        currency: "USD",
        pixel_ids: ["px1"],
        x_pixel_ids: ["x1"],
      }),
    );
    expect(answer).toEqual({ gateway: "paypal", scriptUrl: "https://paypal.example/sdk.js", orderId: "pp-1" });
  });

  it("refuses without a user, a plan or an email", async () => {
    const { calls, handlers } = actions();
    await expect(handlers["payments.create_session"]!({ subscriptionId: 7 }, contextWith())).rejects.toMatchObject({
      status: 400,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("payments.confirm", () => {
  it("confirms a Primer order and says whether it paid", async () => {
    const { calls, handlers } = actions({
      token: "t",
      fb_event_id: "e",
      mid: "d4d7b345-bf19-453a-acdc-8ea68a5d4c44",
    });
    const answer = await handlers["payments.confirm"]!(
      { orderId: "ord-1" },
      contextWith({ page: { pixel_ids: ["px1"], x_pixel_ids: ["x1"], x_pixel: "xp" } }),
    );
    expect(calls[0].url).toBe(`${API}/primer/confirm_order/`);
    expect(calls[0].init).not.toHaveProperty("cache");
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({ order_id: "ord-1", pixel_ids: ["px1"], x_pixel_ids: ["x1"], x_pixel: "xp" }),
    );
    expect(answer).toEqual({ token: "t", fb_event_id: "e", mid: "solidgate", paid: true });
  });

  it("confirms a PayPal order", async () => {
    const { calls, handlers } = actions({ token: "t", ltv: 30 });
    const answer = await handlers["payments.confirm"]!(
      { orderId: "pp-1", gateway: "paypal" },
      contextWith({ page: { pixel_ids: ["px1"] } }),
    );
    expect(calls[0].url).toBe(`${API}/solidgate/confirm_paypal/`);
    expect(calls[0].init).toMatchObject({ cache: "no-cache" });
    expect(String(calls[0].init.body)).toBe(
      JSON.stringify({ order_id: "pp-1", is_paypal: true, pixel_ids: ["px1"], x_pixel_ids: [] }),
    );
    expect(answer).toEqual({ token: "t", ltv: 30, paid: true });
  });

  it("confirms a Solidgate order", async () => {
    const { calls, handlers } = actions({});
    const answer = await handlers["payments.confirm"]!({ orderId: "ord-2", gateway: "solidgate" }, contextWith());
    expect(calls[0].url).toBe(`${API}/solidgate/confirm_order/`);
    expect(String(calls[0].init.body)).toBe(JSON.stringify({ order_id: "ord-2", pixel_ids: [], x_pixel_ids: [] }));
    expect(answer).toEqual({ paid: false });
  });
});
