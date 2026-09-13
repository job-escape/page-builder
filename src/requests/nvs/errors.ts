/**
 * What a visitor is told when the platform refuses — ported from `sart-funnel`'s
 * `payment-error.ts`, `checkout-error.ts` and `route-helpers.ts`, unchanged in
 * meaning: the enum first, the English message only where the enum is not sent
 * yet, and a raw platform message never shown to anybody.
 */
import { ActionError, silentLog, type Log } from "../contract";
import { NvsApiError } from "./client";

export const ErrorReason = {
  ALREADY_OWNED: "ERROR_REASON_ALREADY_OWNED",
  REPEATED_CHECKOUT: "ERROR_REASON_REPEATED_CHECKOUT",
  SESSION_NOT_PENDING: "ERROR_REASON_SESSION_NOT_PENDING",
  PRODUCT_TYPE_MISMATCH: "ERROR_REASON_PRODUCT_TYPE_MISMATCH",
  CURRENCY_MISMATCH: "ERROR_REASON_CURRENCY_MISMATCH",
  TARGET_PRODUCT_INACTIVE: "ERROR_REASON_TARGET_PRODUCT_INACTIVE",
  GATEWAY_UPDATE_UNSUPPORTED: "ERROR_REASON_GATEWAY_UPDATE_UNSUPPORTED",
  GATEWAY_UPDATE_FAILED: "ERROR_REASON_GATEWAY_UPDATE_FAILED",
  NO_PAYMENT_METHOD: "ERROR_REASON_NO_PAYMENT_METHOD",
  GATEWAY_DECLINED: "ERROR_REASON_GATEWAY_DECLINED",
  PRODUCT_INACTIVE: "ERROR_REASON_PRODUCT_INACTIVE",
  GATEWAY_PRODUCT_MAPPING_MISSING: "ERROR_REASON_GATEWAY_PRODUCT_MAPPING_MISSING",
} as const;

export const ErrorCategory = {
  ALREADY_SATISFIED: "ERROR_CATEGORY_ALREADY_SATISFIED",
  NOT_ALLOWED: "ERROR_CATEGORY_NOT_ALLOWED",
  CALLER_ERROR: "ERROR_CATEGORY_CALLER_ERROR",
  GATEWAY_DECLINED: "ERROR_CATEGORY_GATEWAY_DECLINED",
  CONFIGURATION: "ERROR_CATEGORY_CONFIGURATION",
} as const;

export type CheckoutFailureAction = "continue" | "blocked" | "new_session" | "card_error" | "unavailable";

export interface PaymentErrorPolicy {
  error: string;
  message: string;
  action: CheckoutFailureAction;
}

const CATEGORY_POLICY: Record<string, { action: CheckoutFailureAction; message: string } | undefined> = {
  [ErrorCategory.ALREADY_SATISFIED]: { action: "continue", message: "You already have access to this plan." },
  [ErrorCategory.NOT_ALLOWED]: { action: "blocked", message: "This purchase is not available on your account." },
  [ErrorCategory.CALLER_ERROR]: { action: "new_session", message: "Something went wrong. Please try again." },
  [ErrorCategory.GATEWAY_DECLINED]: {
    action: "card_error",
    message: "Your payment was declined. Please try another card.",
  },
  [ErrorCategory.CONFIGURATION]: {
    action: "unavailable",
    message: "This plan is temporarily unavailable. Please try again later.",
  },
};

const REASON_CATEGORY: Record<string, string | undefined> = {
  [ErrorReason.ALREADY_OWNED]: ErrorCategory.ALREADY_SATISFIED,
  [ErrorReason.REPEATED_CHECKOUT]: ErrorCategory.NOT_ALLOWED,
  [ErrorReason.SESSION_NOT_PENDING]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.PRODUCT_TYPE_MISMATCH]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.CURRENCY_MISMATCH]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.TARGET_PRODUCT_INACTIVE]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.GATEWAY_UPDATE_UNSUPPORTED]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.GATEWAY_UPDATE_FAILED]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.NO_PAYMENT_METHOD]: ErrorCategory.CALLER_ERROR,
  [ErrorReason.GATEWAY_DECLINED]: ErrorCategory.GATEWAY_DECLINED,
  [ErrorReason.PRODUCT_INACTIVE]: ErrorCategory.CONFIGURATION,
  [ErrorReason.GATEWAY_PRODUCT_MAPPING_MISSING]: ErrorCategory.CONFIGURATION,
};

const REASON_MESSAGE: Record<string, string | undefined> = {
  [ErrorReason.ALREADY_OWNED]: "You are already subscribed to this plan.",
  [ErrorReason.REPEATED_CHECKOUT]:
    "You already have an active subscription. Contact support if you need to change it.",
  [ErrorReason.NO_PAYMENT_METHOD]: "We need a payment method before we can continue.",
};

const toCode = (enumValue: string) => enumValue.replace(/^ERROR_(REASON|CATEGORY)_/, "").toLowerCase();

export function classifyPaymentError(detail: { reason?: string; category?: string }): PaymentErrorPolicy | undefined {
  const { reason, category } = detail;
  const policy =
    (category === undefined ? undefined : CATEGORY_POLICY[category]) ??
    (reason === undefined ? undefined : CATEGORY_POLICY[REASON_CATEGORY[reason] ?? ""]);
  if (!policy) return undefined;
  const named = reason ?? category;
  return {
    error: named === undefined ? "unknown" : toCode(named),
    message: (reason === undefined ? undefined : REASON_MESSAGE[reason]) ?? policy.message,
    action: policy.action,
  };
}

export function reasonFromLegacyMessage(message: string): string | undefined {
  if (/already owned/i.test(message)) return ErrorReason.ALREADY_OWNED;
  if (/repeated checkout is not allowed/i.test(message)) return ErrorReason.REPEATED_CHECKOUT;
  if (/target product is not active/i.test(message)) return ErrorReason.TARGET_PRODUCT_INACTIVE;
  return undefined;
}

/** What the browser is told about a refused checkout, or undefined to use the generic wording. */
export function checkoutErrorBody(error: NvsApiError, log: Log = silentLog): PaymentErrorPolicy | undefined {
  const policy =
    classifyPaymentError({ reason: error.reason, category: error.category }) ??
    classifyPaymentError({ reason: reasonFromLegacyMessage(error.message) });
  if (!policy) return undefined;
  if (policy.action === "unavailable") {
    log.error("payment_checkout_misconfigured", {
      code: error.code,
      reason: error.reason,
      category: error.category,
      message: error.message,
    });
  }
  return policy;
}

function publicMessage(code: string): string {
  switch (code) {
    case "failed_precondition":
      return "This action is currently unavailable.";
    case "invalid_argument":
      return "Invalid request.";
    case "resource_exhausted":
      return "Too many requests. Please try again in a moment.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/**
 * A platform failure as the `ActionError` the route answers with — the status
 * rule of `toErrorResponse`: 502 for a platform 5xx or an `unauthenticated`
 * (our key, not the visitor's fault), otherwise the platform's own status.
 * Anything that is not a platform error is rethrown for the route's 500.
 */
export function toActionError(
  error: unknown,
  override?: (error: NvsApiError) => PaymentErrorPolicy | undefined,
): never {
  if (error instanceof NvsApiError) {
    const status = error.httpStatus >= 500 || error.code === "unauthenticated" ? 502 : error.httpStatus;
    const body = override?.(error) ?? { error: error.code, message: publicMessage(error.code) };
    throw new ActionError(status, body as { error: string; message?: string });
  }
  throw error;
}
