/**
 * The five actions against JobEscape's users API — funnel's backend.
 *
 * The quiz makes these calls from the browser today; a design makes them through
 * the funnel's own server instead, so an address never ships in a public file.
 * What reaches the users API is what the quiz sends, key for key:
 *
 * | Action | Quiz code it mirrors | Upstream |
 * |---|---|---|
 * | `leads.create` | `entities/user/api/createUser.tsx` | `POST /new_users/get_or_create/` |
 * | `leads.update_name` | `entities/user/api/add-name.ts` | `POST /new_users/add_name/` |
 * | `plans.list` | `entities-v2/subscription/api/get-subscriptions.ts` | `GET /subscriptions/?price_currency=` |
 * | `payments.create_session` | `payments/primer/api.ts`, `payments/solidgate/api.ts` | `/primer/create_payment_session/` or `update_session/`, or `/solidgate/payment_intent/` |
 * | `payments.confirm` | the same files | `/primer/confirm_order/` or `/solidgate/confirm_order/` |
 *
 * The values the browser used to reach for itself come from where a server
 * finds them: the `user_data` cookie the middleware keeps (answers, geo, device
 * id), the `_fbp` / `_fbc` cookies, the request's user agent, and — for what
 * only the page knows, GrowthBook's pixel ids and paywall flags — the `page`
 * the host forwards in its request context (`pixel_ids`, `x_pixel_ids`,
 * `x_pixel`, `paywall-zip`, `paywall-cardholder-name`, `is_3ds`,
 * `funnel_currency`, `payment_form`).
 */
import { ActionError, cookie, number, silentLog, text, type ActionHandlers, type Log, type Payload, type RequestContext } from "../contract";

export type JobescapeActionsOptions = {
  /** `NEXT_PUBLIC_API_URL` — the users API, without a trailing slash. */
  usersApiUrl: string;
  /** The cookie the middleware keeps the visitor in. */
  userCookie?: string;
  log?: Log;
  /**
   * The users API answered with who this visitor is. The quiz merges that into
   * the `user_data` cookie (`patchUser`); a host that wants the same does it
   * here, appending to `context.responseHeaders`.
   */
  onUser?: (user: { id: number; email?: string; full_name?: string; funnel_info?: unknown }, context: RequestContext) => void;
  /** Injected in tests. */
  fetch?: typeof fetch;
  now?: () => number;
  uuid?: () => string;
};

type CookieUser = Record<string, unknown> & {
  id?: unknown;
  gender?: unknown;
  deviceId?: unknown;
  geolocation?: { ip?: string; country_code?: string; [key: string]: unknown };
};

/**
 * The visitor as the middleware stores them — `user_data`, or its chunks
 * `user_data_count` / `user_data_<i>` when it outgrew one cookie. The same
 * reading `userMiddleware.getCookieUser` does.
 */
export function readCookieUser(request: Request, name = "user_data"): CookieUser {
  const count = Number.parseInt(cookie(request, `${name}_count`) ?? "0", 10);
  let json = "";
  if (!count) {
    json = cookie(request, name) ?? "";
  } else {
    for (let index = 0; index < count; index += 1) {
      const part = cookie(request, `${name}_${index}`);
      if (!part) return {};
      json += part;
    }
  }
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed !== null && typeof parsed === "object" ? (parsed as CookieUser) : {};
  } catch {
    return {};
  }
}

const page = (context: RequestContext, key: string): unknown => context.page?.[key];

/** `buildPaywallMetadata`: undecided flags are omitted, never defaulted. */
function paywallMetadata(context: RequestContext): { metadata: Record<string, string> } | Record<string, never> {
  const flag = (key: string) => {
    const value = page(context, key);
    return typeof value === "boolean" ? value : undefined;
  };
  const zip = flag("paywall-zip");
  const cardholder = flag("paywall-cardholder-name");
  const threeDs = flag("is_3ds");
  const metadata: Record<string, string> = {
    ...(zip !== undefined ? { "paywall-zip": String(zip) } : {}),
    ...(cardholder !== undefined ? { "paywall-cardholder-name": String(cardholder) } : {}),
    ...(threeDs === undefined ? {} : { is_3ds: String(threeDs) }),
  };
  return Object.keys(metadata).length > 0 ? { metadata } : {};
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The quiz reports Solidgate's merchant id as the word — `primer/api.ts`. */
const SOLIDGATE_MID = "d4d7b345-bf19-453a-acdc-8ea68a5d4c44";

/** A users-API failure as the design sees it: its `detail`, never a stack. */
async function refusal(response: Response, fallback: string): Promise<never> {
  const data = (await response.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null;
  const detail = Array.isArray(data?.detail) ? data?.detail.join(", ") : data?.detail;
  const message = typeof detail === "string" && detail ? detail : typeof data?.message === "string" ? data.message : undefined;
  throw new ActionError(response.status >= 500 ? 502 : response.status || 502, {
    error: fallback,
    message: message ?? "Something went wrong. Please try again.",
  });
}

export function jobescapeActions(options: JobescapeActionsOptions): ActionHandlers {
  const log = options.log ?? silentLog;
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => Date.now());
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const api = options.usersApiUrl;
  const userCookie = options.userCookie ?? "user_data";

  const post = (path: string, body: Record<string, unknown>, cache?: RequestCache) =>
    doFetch(`${api}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(cache ? { cache } : {}),
      body: JSON.stringify(body),
    });

  /** Payment gateway: the design's word, else the page's `payment_form` (GrowthBook `paywall`), else Primer. */
  const gatewayOf = (payload: Payload, context: RequestContext): "primer" | "solidgate" => {
    const chosen = text(payload, "gateway") ?? (typeof page(context, "payment_form") === "string" ? String(page(context, "payment_form")) : "");
    return chosen === "solidgate" ? "solidgate" : "primer";
  };

  return {
    /** `createUser`: the quiz's email step, as a server call. */
    "leads.create": async (payload, context) => {
      const email = text(payload, "email");
      if (!email || !email.includes("@")) {
        throw new ActionError(400, { error: "invalid_argument", message: "A valid email is required." });
      }
      const consent = payload.consent === true || payload.email_consent === true;
      const user = readCookieUser(context.request, userCookie);
      const { id: _id, ...userOtherProps } = user;
      const geolocation = user.geolocation ?? {};
      const fbEventId = text(payload, "fbEventId") ?? uuid();

      const response = await post(
        "/new_users/get_or_create/",
        {
          email: email.toLowerCase(),
          email_consent: !!consent,
          gender: user.gender === "female" ? "f" : "m",
          client_ip_address: geolocation.ip,
          country_code: geolocation.country_code,
          fb_event_id: fbEventId,
          funnel_info: {
            ...userOtherProps,
            ...user.geolocation,
            user_agent: context.request.headers.get("user-agent") ?? "",
            email: email.toLowerCase(),
            email_consent: consent,
            fbp: cookie(context.request, "_fbp"),
            fb_timestamp: now(),
            fbc: cookie(context.request, "_fbc"),
          },
          device_id: user.deviceId,
        },
        "no-cache",
      );
      if (!response.ok) return refusal(response, "lead_failed");

      const created = (await response.json()) as { id: number; email?: string; full_name?: string; funnel_info?: unknown };
      options.onUser?.(created, context);
      log.info("user_resolved", { userId: created.id });
      return {
        userId: String(created.id),
        email: created.email ?? email.toLowerCase(),
        name: created.full_name ?? "",
        fbEventId,
      };
    },

    /** `addName`: fire-and-forget in the quiz; here, `saved` says what happened and nothing blocks. */
    "leads.update_name": async (payload, context) => {
      const name = text(payload, "name");
      if (!name) return { saved: false, reason: "no_name" };
      const email = text(payload, "email") ?? (typeof readCookieUser(context.request, userCookie).email === "string"
        ? String(readCookieUser(context.request, userCookie).email)
        : undefined);
      if (!email) return { saved: false, reason: "no_user" };
      try {
        const response = await post("/new_users/add_name/", { name, email });
        if (!response.ok) {
          log.warn("user_name_not_saved", { status: response.status });
          return { saved: false, reason: "platform_error" };
        }
      } catch (error) {
        log.warn("user_name_not_saved", { error: error instanceof Error ? error.message : String(error) });
        return { saved: false, reason: "platform_error" };
      }
      return { saved: true };
    },

    /** `getSubscriptions(currency)`: the plans, in the funnel's currency. */
    "plans.list": async (payload, context) => {
      const currency =
        text(payload, "currency") ??
        (typeof page(context, "funnel_currency") === "string" ? String(page(context, "funnel_currency")) : undefined) ??
        "USD";
      const url = new URL(`${api}/subscriptions/`);
      url.searchParams.set("price_currency", currency);
      const response = await doFetch(url.toString(), { headers: { "Content-Type": "application/json" } });
      if (!response.ok) return refusal(response, "plans_unavailable");
      const plans = (await response.json()) as unknown;
      return { plans: Array.isArray(plans) ? plans : [] };
    },

    /**
     * Primer's `createPaymentSession` (or `updatePrimerPaymentSession` when the
     * design already holds a client token), or Solidgate's `getMerchantData`.
     */
    "payments.create_session": async (payload, context) => {
      const user = readCookieUser(context.request, userCookie);
      const geolocation = user.geolocation ?? {};
      const userId = number(payload, "userId") ?? number(user as Payload, "id");
      const subscriptionId = number(payload, "subscriptionId");
      const email = text(payload, "email") ?? (typeof user.email === "string" ? user.email : undefined);
      if (userId === undefined || subscriptionId === undefined || !email) {
        throw new ActionError(400, {
          error: "invalid_argument",
          message: "userId, subscriptionId and email are required.",
        });
      }
      const trialType = text(payload, "trialType") ?? "standard";
      const currency =
        text(payload, "currency") ??
        (typeof page(context, "funnel_currency") === "string" ? String(page(context, "funnel_currency")) : "USD");
      const countryCode = geolocation.country_code;
      const ip = geolocation.ip;
      const pixelIds = list(page(context, "pixel_ids"));
      const xPixelIds = list(page(context, "x_pixel_ids"));

      if (gatewayOf(payload, context) === "solidgate") {
        const response = await post(
          "/solidgate/payment_intent/",
          {
            ip_address: ip,
            trial_type: trialType,
            subscription_id: subscriptionId,
            geo_country: countryCode,
            country_code: countryCode,
            email,
            user_id: userId,
            ip,
            zip_code: text(payload, "zipCode") ?? geolocation.zip ?? "",
            currency,
            pixel_ids: pixelIds,
            x_pixel_ids: xPixelIds,
          },
          "no-cache",
        );
        if (!response.ok) return refusal(response, "payment_session_failed");
        const data = (await response.json()) as { responseDTO: { payment_intent: string; merchant: string; signature: string } };
        return {
          gateway: "solidgate",
          merchantData: {
            paymentIntent: data.responseDTO.payment_intent,
            merchant: data.responseDTO.merchant,
            signature: data.responseDTO.signature,
          },
        };
      }

      const deviceSessionId = typeof user.deviceId === "string" && user.deviceId ? user.deviceId : uuid();
      const clientToken = text(payload, "clientToken");
      const response = clientToken
        ? await post(
            "/primer/update_session/",
            {
              user_id: userId,
              trial_type: trialType,
              subscription_id: subscriptionId,
              country_code: countryCode,
              device_session_id: deviceSessionId,
              client_token: clientToken,
              currency,
              ...paywallMetadata(context),
              pixel_ids: pixelIds,
              x_pixel_ids: xPixelIds,
            },
            "no-cache",
          )
        : await post(
            "/primer/create_payment_session/",
            {
              user_id: userId,
              trial_type: trialType,
              subscription_id: subscriptionId,
              country_code: countryCode,
              device_session_id: deviceSessionId,
              ip,
              email,
              currency,
              ...paywallMetadata(context),
              pixel_ids: pixelIds,
              x_pixel_ids: xPixelIds,
            },
            "no-cache",
          );
      if (!response.ok) return refusal(response, "payment_session_failed");
      const data = (await response.json()) as { clientToken: string };
      return { gateway: "primer", clientToken: data.clientToken };
    },

    /** Primer's `confirmPaymentOrder`, or Solidgate's `checkPayment`. */
    "payments.confirm": async (payload, context) => {
      const orderId = text(payload, "orderId");
      if (!orderId) throw new ActionError(400, { error: "invalid_argument", message: "orderId is required." });
      const pixelIds = list(page(context, "pixel_ids"));
      const xPixelIds = list(page(context, "x_pixel_ids"));

      if (gatewayOf(payload, context) === "solidgate") {
        const response = await post(
          "/solidgate/confirm_order/",
          { order_id: orderId, pixel_ids: pixelIds, x_pixel_ids: xPixelIds },
          "no-cache",
        );
        if (!response.ok) return refusal(response, "payment_not_confirmed");
        const data = (await response.json()) as { token?: string; fb_event_id?: string; ltv?: number };
        return { ...data, paid: Boolean(data.token) };
      }

      const response = await post("/primer/confirm_order/", {
        order_id: orderId,
        pixel_ids: pixelIds,
        x_pixel_ids: xPixelIds,
        x_pixel: page(context, "x_pixel"),
      });
      if (!response.ok) return refusal(response, "payment_not_confirmed");
      const data = (await response.json()) as { token?: string; fb_event_id?: string; mid?: string; ltv?: number };
      return { ...data, mid: data.mid === SOLIDGATE_MID ? "solidgate" : data.mid, paid: Boolean(data.token) };
    },
  };
}
