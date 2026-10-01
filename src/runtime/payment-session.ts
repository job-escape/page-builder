/**
 * The payment session's wire, and the funnel's half of opening one.
 *
 * A payment form (the `checkout` slot) cannot be drawn until the payments
 * platform has opened a session for this visitor and this plan. A design does
 * not wire that: publish marks every screen with a payment form — on it, or on
 * a dialog it opens — and the funnel opens the session when the visitor gets
 * to one, puts it in the system variable `paymentSession`, and the form reads
 * it. Requests of their own, to routes of their own, the way the email step's
 * is: `payment.session` to open one, `payment.confirm` once the gateway has
 * taken the payment.
 *
 * **What a session is opened for.** The visitor's email (the system `email`,
 * which the email step sets) and a plan: the one in the system variable
 * `selectedSubscription` when a design puts the chosen plan there, else the plan
 * `subscriptions` marks as the default, else the first. A different plan is a
 * different session — the platform has no "change the plan of this one" — so
 * choosing another while on the screen opens a new one.
 *
 * The host's routes (`requests/payment-session`) answer with the same shapes,
 * declared again on their side: `src/runtime` and the rest of the package may
 * not import each other (`isolation.test`).
 */
import { z } from "zod";

import { EmailAddress } from "./email-submit";
import { hasRoute } from "./request";

/** Opens a session. */
export const PAYMENT_SESSION_ACTION = "payment.session";
/** Settles one, once the gateway reports a payment. */
export const PAYMENT_CONFIRM_ACTION = "payment.confirm";

/** Where the opened session is put — what a payment form is bound to. */
export const PAYMENT_SESSION_VARIABLE = "paymentSession";
/** The plan the visitor chose, when a design keeps it — an entry of `subscriptions`. */
export const SUBSCRIPTION_VARIABLE = "selectedSubscription";
/**
 * The plans on offer — a list the host loads and hands the funnel (`values`).
 * Read here only to find the default plan when none was chosen.
 */
export const SUBSCRIPTIONS_VARIABLE = "subscriptions";

/** What `payment.session` is sent. */
export const PaymentSessionPayload = z.object({
  /** The plan's code — resolved against the environment's catalogue on the host. */
  productCode: z.string().min(1),
  email: EmailAddress,
  /** The account the email step found or made, when there is one. */
  userId: z.string().min(1).optional(),
});
export type PaymentSessionPayload = z.infer<typeof PaymentSessionPayload>;

/**
 * What it answers. An embedded gateway gives a `clientToken` the form mounts
 * with; a hosted one gives a `redirectUrl` instead. Other properties are let
 * through as they came.
 */
export const PaymentSessionResponse = z.looseObject({
  /** The platform's name for this attempt — what `payment.confirm` settles. */
  checkoutAttemptId: z.string().min(1),
  clientToken: z.string().min(1).optional(),
  redirectUrl: z.string().min(1).optional(),
  /** The account the session was opened for, resolved on the host. */
  userId: z.string().min(1).optional(),
});
export type PaymentSessionResponse = z.infer<typeof PaymentSessionResponse>;

/** What `payment.confirm` is sent. */
export const PaymentConfirmPayload = z.object({
  checkoutAttemptId: z.string().min(1),
  /** The gateway's own id for the payment, as the form reported it. */
  gatewayPaymentId: z.string().min(1).optional(),
  productCode: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});
export type PaymentConfirmPayload = z.infer<typeof PaymentConfirmPayload>;

/** What it answers: the attempt's status, and why when it failed. */
export const PaymentConfirmResponse = z.looseObject({
  status: z.string().min(1),
  /** Whether that status is a payment taken — the host's reading of it. */
  paid: z.boolean().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  /** What the sale was reported as being worth, for the browser's own pixel. */
  ltv: z.number().optional(),
});
export type PaymentConfirmResponse = z.infer<typeof PaymentConfirmResponse>;

/** The statuses that are a payment taken. */
const PAID = new Set(["succeeded", "authorized", "captured", "settled"]);
/** The statuses that are a payment refused, and will not become anything else. */
const REFUSED = new Set(["failed", "canceled"]);

/** How a confirm reads: paid, refused, or still being settled. */
export function paymentOutcome(answer: PaymentConfirmResponse): "paid" | "refused" | "pending" {
  if (answer.paid === true || PAID.has(answer.status)) return "paid";
  if (REFUSED.has(answer.status)) return "refused";
  return "pending";
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The code of the plan a session is opened for: the chosen one, else the
 * default of those offered, else the first — or null while there is none.
 */
export function planCodeOf(chosen: unknown, offered: unknown): string | null {
  const code = (plan: unknown): string | null => {
    const value = record(plan)?.code;
    return typeof value === "string" && value ? value : null;
  };
  const picked = code(chosen);
  if (picked) return picked;
  const plans = Array.isArray(offered) ? offered : [];
  return code(plans.find((plan) => record(plan)?.is_default === true)) ?? code(plans[0]);
}

/** How many times a payment still being settled is asked about again. */
export const CONFIRM_POLLS = 3;
/** And how long between them. */
export const CONFIRM_POLL_MS = 2000;

/** A checkout's report, as far as settling it reads and adds to it. */
type Report = Record<string, unknown>;

/**
 * Settles the payment a form just reported, and says what the design should
 * hear: `success` with the attempt's status (and the sale's worth, when the
 * host reported one), `decline` when the platform refused it, `error` when it
 * could not be settled. Null where the funnel did not open the session — no
 * confirm route, or no session — and the design's own steps confirm.
 *
 * A payment still being settled is asked about again a few times: a card that
 * went through 3-D Secure is `pending` for a moment before it is `captured`.
 */
export async function settlePayment(
  req: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>,
  state: { get: (name: string) => unknown },
  report: Report,
): Promise<{ name: "success" | "decline" | "error"; report: Report } | null> {
  if (!hasRoute(PAYMENT_CONFIRM_ACTION)) return null;
  const session = record(state.get(PAYMENT_SESSION_VARIABLE));
  const attempt = session?.checkoutAttemptId;
  if (typeof attempt !== "string" || !attempt) return null;

  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;
  const payload = {
    checkoutAttemptId: attempt,
    gatewayPaymentId: text(report.paymentId) ?? text(report.orderId),
    productCode: text(session?.productCode),
    userId: text(state.get("userId")),
  };

  for (let asked = 0; ; asked += 1) {
    let answer;
    try {
      answer = PaymentConfirmResponse.safeParse(await req(PAYMENT_CONFIRM_ACTION, payload));
    } catch (failure) {
      return {
        name: "error",
        report: {
          ...report,
          message: failure instanceof Error ? failure.message : String(failure),
          code: "confirm_failed",
        },
      };
    }
    if (!answer.success) {
      return {
        name: "error",
        report: { ...report, message: "The payment could not be confirmed.", code: "invalid_response" },
      };
    }
    const { status, message, code, ltv } = answer.data;
    const outcome = paymentOutcome(answer.data);
    if (outcome === "paid") {
      return {
        name: "success",
        report: { ...report, status, checkoutAttemptId: attempt, ...(ltv === undefined ? {} : { ltv }) },
      };
    }
    if (outcome === "refused") {
      return {
        name: "decline",
        report: { ...report, status, message: message ?? "Payment declined.", ...(code ? { code } : {}) },
      };
    }
    if (asked >= CONFIRM_POLLS) {
      return {
        name: "error",
        report: {
          ...report,
          status,
          message: "Payment is still processing. Please check back shortly.",
          code: "pending",
        },
      };
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, CONFIRM_POLL_MS);
    });
  }
}
