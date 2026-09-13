/**
 * The five actions against the NVS payments platform — SArt's backend.
 *
 * Each is the body of an existing `sart-funnel` route, moved rather than
 * rewritten, and each sends the platform exactly the RPC that route sends:
 *
 * | Action | Was | RPC |
 * |---|---|---|
 * | `leads.create` | `POST /api/user` | `GetOrCreateUser {email, name}` |
 * | `leads.update_name` | `POST /api/user/name` | `UpdateUserProfile {user_id, name}` |
 * | `plans.list` | `GET /api/subscriptions` | `ListProducts {active_only: true}`, cached |
 * | `payments.create_session` | `POST /api/payment-session` | `GetOrCreateUser` when needed, `CreatePaymentSession` |
 * | `payments.confirm` | `POST /api/payment-session/confirm` | `ConfirmPaymentSession` |
 *
 * The answers are the routes' answers, so a design maps the same fields a
 * hand-written container read.
 */
import { ActionError, buyerCountry, silentLog, text, type ActionHandlers, type Log } from "../contract";
import { createNvsClient, NvsApiError, type NvsConfig, type NvsRpc } from "./client";
import { checkoutErrorBody, toActionError } from "./errors";

// ─── The platform's shapes ───────────────────────────────────────────────────

export interface GetOrCreateUserResponse {
  userId: string;
  created?: boolean;
  /** int64 as a string; absent from platform builds that predate it. */
  analyticsId?: string;
}

export interface PlatformMoney {
  amountMinor: string;
  currency: string;
}

export interface PlatformProduct {
  id: string;
  code: string;
  name: string;
  price: PlatformMoney;
  billingPeriod?: string;
  frequency?: number;
  billingFrequency?: number;
  trialPrice?: PlatformMoney;
  trialBillingPeriod?: string;
  trialBillingFrequency?: number;
  active?: boolean;
}

export interface CreatePaymentSessionResponse {
  checkoutAttemptId: string;
  redirectUrl?: string;
  gatewayTransactionId?: string;
  initPayload?: string;
}

export interface ConfirmPaymentSessionResponse {
  status: string;
  subscriptionId?: string;
  invoiceId?: string;
  message?: string;
  type?: string;
  declineType?: string;
  code?: string;
  threeDsStatus?: string;
  mid?: string;
}

/** Statuses that mean the buyer has paid — `payment-status.ts`. */
export const PAID_STATUSES = new Set(["succeeded", "authorized", "captured", "settled"]);

export const isPaidStatus = (status: string | undefined): boolean => status !== undefined && PAID_STATUSES.has(status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The platform's own user id — a uuid. The legacy users API's row numbers are not. */
export const isPlatformUserId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

const ANALYTICS_ID = /^[1-9]\d{0,18}$/;

function readAnalyticsId(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return ANALYTICS_ID.test(trimmed) ? trimmed : undefined;
}

/** initPayload arrives as base64-encoded JSON bytes. */
function decodeInitPayload(initPayload: string): { clientToken: string; clientTokenExpiresAt?: string } {
  const decoded =
    typeof Buffer !== "undefined"
      ? Buffer.from(initPayload, "base64").toString("utf8")
      : new TextDecoder().decode(Uint8Array.from(atob(initPayload), (char) => char.charCodeAt(0)));
  return JSON.parse(decoded) as { clientToken: string; clientTokenExpiresAt?: string };
}

// ─── The catalogue, as a design reads it ─────────────────────────────────────

/** `subscriptions-mapper.ts` — the funnel's plan shape, from a platform product. */
export interface FunnelSubscription {
  id: string;
  code: string;
  name: string;
  price_amount: number;
  price_currency: string;
  price_currency_symbol: string;
  billing_cycle_interval: string;
  billing_cycle_frequency: number;
  trial_standard_price_amount: number;
  trial_standard_discount: number;
  trial_cycle_frequency: number;
  trial_price_chase_amount: number;
  trial_chase_discount: number;
  trial_price_super_chase_amount: number;
  trial_super_chase_discount: number;
  trial_timeout_price_amount: number;
  saved_amount: number;
  is_default: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

const toInterval = (period: string | undefined): string =>
  period ? period.replace(/^BILLING_PERIOD_/, "").toLowerCase() : "";

function toMajor(amountMinor: string | undefined): number {
  const minor = Number(amountMinor);
  return Number.isFinite(minor) ? minor / 100 : 0;
}

export function toFunnelSubscription(product: PlatformProduct, index: number): FunnelSubscription {
  const price = toMajor(product.price?.amountMinor);
  const trial = product.trialPrice ? toMajor(product.trialPrice.amountMinor) : price;
  const currency = product.price?.currency ?? "USD";
  const discount = price > 0 ? Math.round((1 - trial / price) * 100) : 0;
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    price_amount: price,
    price_currency: currency,
    price_currency_symbol: CURRENCY_SYMBOLS[currency] ?? currency,
    billing_cycle_interval: toInterval(product.billingPeriod),
    billing_cycle_frequency: product.billingFrequency ?? product.frequency ?? 0,
    trial_standard_price_amount: trial,
    trial_standard_discount: discount,
    trial_cycle_frequency: product.trialBillingFrequency ?? 0,
    trial_price_chase_amount: trial,
    trial_chase_discount: discount,
    trial_price_super_chase_amount: trial,
    trial_super_chase_discount: discount,
    trial_timeout_price_amount: trial,
    saved_amount: Math.round((price - trial) * 100) / 100,
    is_default: index === 0,
  };
}

const FRESH_MS = 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

/**
 * `product-catalog.ts`: fresh for an hour, served stale up to a day while a
 * refresh fails, no retry within a minute of a failure, one refresh in flight.
 * One catalogue per client, so two hosts in one process never share one.
 */
function createCatalog(rpc: NvsRpc, log: Log) {
  let catalog: { products: PlatformProduct[]; loadedAt: number } | null = null;
  let inflight: Promise<{ products: PlatformProduct[]; loadedAt: number }> | null = null;
  let failedAt = 0;

  const refresh = () => {
    inflight ??= rpc<{ products?: PlatformProduct[] }>("/payments.v1.ServiceAccountService/ListProducts", {
      active_only: true,
    })
      .then(({ products = [] }) => {
        catalog = { products: products.filter((product) => product.active === true), loadedAt: Date.now() };
        failedAt = 0;
        return catalog;
      })
      .catch((error: unknown) => {
        failedAt = Date.now();
        throw error;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return async function sellable(): Promise<PlatformProduct[]> {
    const now = Date.now();
    const cached = catalog;
    const age = cached ? now - cached.loadedAt : Number.POSITIVE_INFINITY;
    if (cached && age < FRESH_MS) return cached.products;
    const stale = cached && age < STALE_MS ? cached : null;
    if (stale && failedAt > 0 && now - failedAt < RETRY_AFTER_FAILURE_MS) return stale.products;
    try {
      return (await refresh()).products;
    } catch (error) {
      log.warn("product_catalog_stale", {
        servingStale: stale !== null,
        catalogAgeMs: cached ? age : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      if (stale) return stale.products;
      throw error;
    }
  };
}

// ─── The actions ─────────────────────────────────────────────────────────────

export type NvsActionsOptions = NvsConfig & {
  /**
   * The sale is real — tell whoever needs to know (sart-funnel reports it to
   * Herald for the ad platforms) and answer with the lifetime value the
   * browser's Purchase pixel should carry. A failure costs that and nothing
   * else: the payment is taken either way.
   */
  onPaid?: (paid: {
    request: Request;
    checkoutAttemptId: string;
    gatewayPaymentId?: string;
    productCode?: string;
    mid?: string;
    userId?: string;
  }) => Promise<number | undefined>;
  /** Injected in tests. */
  idempotencyKey?: () => string;
};

export function nvsActions(options: NvsActionsOptions): ActionHandlers {
  const log = options.log ?? silentLog;
  const rpc = createNvsClient(options);
  const sellable = createCatalog(rpc, log);
  const newKey = options.idempotencyKey ?? (() => crypto.randomUUID());

  const getOrCreateUser = (email: string, name?: string) =>
    rpc<GetOrCreateUserResponse>("/auth.v1.ServiceAccountService/GetOrCreateUser", { email, name });

  return {
    /** `/api/user`: an email in, the platform's identity out. */
    "leads.create": async (payload) => {
      const email = text(payload, "email");
      if (!email || !email.includes("@")) {
        throw new ActionError(400, { error: "invalid_argument", message: "A valid email is required." });
      }
      try {
        const result = await getOrCreateUser(email, text(payload, "name"));
        const analyticsId = readAnalyticsId(result.analyticsId);
        if (!analyticsId) log.warn("user_analytics_id_missing", { userId: result.userId });
        log.info("user_resolved", { userId: result.userId, created: result.created === true });
        return {
          userId: result.userId,
          ...(analyticsId ? { analyticsId } : {}),
          created: result.created === true,
        };
      } catch (error) {
        return toActionError(error);
      }
    },

    /**
     * `/api/user/name`: never a non-2xx for a real request — a submit chain that
     * fails leaves the visitor stuck on the name step, and a name is worth none
     * of that. Every way it comes to nothing is `saved: false` with a reason.
     */
    "leads.update_name": async (payload) => {
      const name = text(payload, "name");
      if (!name) return { saved: false, reason: "no_name" };
      const claimed = text(payload, "userId") ?? "";
      if (!isPlatformUserId(claimed)) {
        log.warn("user_name_user_id_not_platform", { claimedUserId: claimed });
        return { saved: false, reason: "no_user" };
      }
      try {
        await rpc<Record<string, never>>("/auth.v1.ServiceAccountService/UpdateUserProfile", {
          user_id: claimed,
          name,
        });
      } catch (error) {
        log.warn("user_name_not_saved", {
          userId: claimed,
          error: error instanceof Error ? error.message : String(error),
        });
        return { saved: false, reason: "platform_error" };
      }
      log.info("user_name_saved", { userId: claimed });
      return { saved: true };
    },

    /** `/api/subscriptions`: the sellable catalogue, as funnel plans. */
    "plans.list": async () => {
      try {
        const products = await sellable();
        return { plans: products.map(toFunnelSubscription) };
      } catch (error) {
        return toActionError(error);
      }
    },

    /** `/api/payment-session`: a product code and an email in, a Primer client token out. */
    "payments.create_session": async (payload, context) => {
      const email = text(payload, "email");
      const productCode = text(payload, "productCode");
      const productIdGiven = text(payload, "productId");
      const name = text(payload, "name");
      if ((!productCode && !productIdGiven) || !email) {
        throw new ActionError(400, {
          error: "invalid_argument",
          message: "productCode (or productId) and email are required.",
        });
      }

      // Stage and production sell the same plans under different ids, so the
      // code is resolved against this environment's catalogue. A code it does
      // not sell stops the checkout before any money moves.
      let productId: string;
      if (productCode) {
        let products: PlatformProduct[];
        try {
          products = await sellable();
        } catch (error) {
          return toActionError(error);
        }
        const product = products.find((candidate) => candidate.code === productCode);
        if (!product) {
          log.error("product_code_unresolved", {
            productCode,
            knownCodes: products.map((candidate) => candidate.code).filter(Boolean).sort(),
          });
          throw new ActionError(400, {
            error: "product_unavailable",
            message: "This plan is not available right now.",
            action: "unavailable",
          });
        }
        productId = product.id;
      } else {
        productId = productIdGiven as string;
      }

      // An id that is not the platform's is the same as none: content can point
      // the email step at the legacy users API, whose ids are row numbers.
      const claimed = text(payload, "userId");
      let userId = isPlatformUserId(claimed) ? claimed : undefined;
      if (claimed && !userId) log.warn("checkout_user_id_not_platform", { claimedUserId: claimed });
      if (!userId) {
        try {
          ({ userId } = await getOrCreateUser(email, name));
        } catch (error) {
          return toActionError(error);
        }
      }

      const { origin } = new URL(context.request.url);
      const country = buyerCountry(context.request);
      try {
        const session = await rpc<CreatePaymentSessionResponse>(
          "/payments.v1.ServiceAccountService/CreatePaymentSession",
          {
            user_id: userId,
            product_id: productId,
            idempotency_key: newKey(),
            gateway: "primer",
            success_url: `${origin}/checkout/success`,
            failure_url: `${origin}/checkout/failed`,
            customer_email: email,
            ...(country ? { country_code: country } : {}),
          },
        );
        log.info("payment_session_created", { userId, productId, checkoutAttemptId: session.checkoutAttemptId });

        if (session.redirectUrl) {
          return { checkoutAttemptId: session.checkoutAttemptId, redirectUrl: session.redirectUrl, userId };
        }
        if (!session.initPayload) {
          log.error("payment_session_missing_init_payload", { checkoutAttemptId: session.checkoutAttemptId });
          throw new ActionError(502, { error: "internal" });
        }
        const { clientToken } = decodeInitPayload(session.initPayload);
        return { checkoutAttemptId: session.checkoutAttemptId, clientToken, userId };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        return toActionError(error, (refused: NvsApiError) => checkoutErrorBody(refused, log));
      }
    },

    /** `/api/payment-session/confirm`: the attempt's status, and `ltv` when it paid. */
    "payments.confirm": async (payload, context) => {
      const checkoutAttemptId = text(payload, "checkoutAttemptId");
      if (!checkoutAttemptId) {
        throw new ActionError(400, { error: "invalid_argument", message: "checkoutAttemptId is required." });
      }
      const gatewayPaymentId = text(payload, "gatewayPaymentId");
      const claimedUserId = text(payload, "userId");
      const sessionUserId = isPlatformUserId(claimedUserId) ? claimedUserId : undefined;

      let result: ConfirmPaymentSessionResponse;
      try {
        result = await rpc<ConfirmPaymentSessionResponse>(
          "/payments.v1.ServiceAccountService/ConfirmPaymentSession",
          {
            checkout_attempt_id: checkoutAttemptId,
            ...(gatewayPaymentId ? { gateway_payment_id: gatewayPaymentId } : {}),
          },
        );
      } catch (error) {
        return toActionError(error, (refused: NvsApiError) => checkoutErrorBody(refused, log));
      }

      log.info("payment_session_confirmed", {
        checkoutAttemptId,
        status: result.status,
        declineCode: result.code,
        userId: sessionUserId,
        userIdRejected: Boolean(claimedUserId) && !sessionUserId,
      });

      const paid = isPaidStatus(result.status);
      if (!paid || !options.onPaid) return { ...result, paid };

      let ltv: number | undefined;
      try {
        ltv = await options.onPaid({
          request: context.request,
          checkoutAttemptId,
          gatewayPaymentId,
          productCode: text(payload, "productCode"),
          mid: result.mid,
          userId: sessionUserId,
        });
      } catch (error) {
        log.error("conversion_report_failed", {
          checkoutAttemptId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return ltv === undefined ? { ...result, paid } : { ...result, paid, ltv };
    },
  };
}
