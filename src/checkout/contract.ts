/**
 * What a checkout reports, and what it is given.
 *
 * A checkout is a slot (`runtime/client/tree-screen`): the design binds its
 * props — the session a `payments.create_session` request put in a variable,
 * the methods to offer, the button's words — and the checkout reports back by
 * name. Everything that follows a report is the design's: which analytics
 * event, which pixel, whether to confirm and where to go. The checkout decides
 * none of it; it mounts the gateway, and says what happened.
 */

/**
 * The reports, in the order a purchase makes them.
 *
 * - `click` — a method was tapped and its sheet or popup opened (wallets, PayPal).
 *   Nothing is paid yet; a closed sheet follows as `cancel`.
 * - `purchase_click` — a payment was really submitted: the card form's button,
 *   or a wallet sheet the visitor approved.
 * - `challenge` — the bank asked for 3-D Secure.
 * - `success` — the gateway took the payment. `$payment.orderId` is what
 *   `payments.confirm` confirms.
 * - `decline` — the gateway refused it. `$payment.message` / `code` say why.
 * - `cancel` — the visitor closed a wallet sheet or the PayPal popup.
 * - `error` — the checkout could not do its job: no gateway for the session,
 *   or the gateway failed without a payment.
 */
export const CHECKOUT_TRIGGERS = [
  "click",
  "purchase_click",
  "challenge",
  "success",
  "decline",
  "cancel",
  "error",
] as const;

export type CheckoutTrigger = (typeof CHECKOUT_TRIGGERS)[number];

export const CHECKOUT_METHODS = ["card", "applepay", "googlepay", "paypal"] as const;

export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number];

export type Gateway = "primer" | "solidgate" | "paypal";

/** What a report carries — `$payment.*` in the design's steps. */
export type PaymentReport = {
  gateway: Gateway;
  method: CheckoutMethod;
  /** The order `payments.confirm` takes: Primer's payment id, Solidgate's order id. */
  orderId?: string;
  paymentId?: string;
  message?: string;
  code?: string;
};

/**
 * A session as a named request answers it — `payments.create_session` in
 * `page-builder/requests`, either backend:
 * `{ gateway: "primer", clientToken }`, `{ gateway: "solidgate", merchantData }`,
 * `{ gateway: "paypal", scriptUrl, orderId }`.
 */
export type CheckoutSession = {
  gateway?: Gateway;
  clientToken?: string;
  merchantData?: { paymentIntent: string; merchant: string; signature: string };
  scriptUrl?: string;
  orderId?: string;
};

export type PaypalStyle = {
  label?: "paypal" | "checkout" | "buynow" | "pay" | "installment";
  shape?: "pill" | "rect" | "sharp";
  color?: "gold" | "blue" | "silver" | "black" | "white";
  height?: number;
};

export type Trigger = (name: CheckoutTrigger, values?: PaymentReport) => Promise<boolean> | void;

/** The props a design can bind on a checkout, and the slot's `trigger`. */
export type CheckoutProps = {
  /** The session variable. Absent or empty, the checkout draws its placeholder. */
  session?: unknown;
  /** Overrides the session's own gateway. */
  gateway?: string;
  /** Which methods, in the order drawn: `"applepay,card"` or a list. Default all. */
  methods?: string | string[];
  /** The card form's button. */
  buttonLabel?: string;
  buttonStyle?: Record<string, string | number>;
  cardholderName?: boolean;
  billingAddress?: boolean;
  applePayType?: string;
  googlePayType?: string;
  paypalStyle?: PaypalStyle;
  /** Drawn while there is no session yet. */
  placeholderHeight?: number;
  trigger?: Trigger;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

/** The session a design bound, read defensively: a variable holds whatever the answer was. */
export function sessionOf(value: unknown, gateway?: string): (CheckoutSession & { gateway: Gateway }) | null {
  const session: CheckoutSession = isObject(value)
    ? {
        gateway: nonEmpty(value.gateway) as Gateway | undefined,
        clientToken: nonEmpty(value.clientToken),
        merchantData: isObject(value.merchantData)
          ? (value.merchantData as CheckoutSession["merchantData"])
          : undefined,
        scriptUrl: nonEmpty(value.scriptUrl),
        orderId: nonEmpty(value.orderId),
      }
    : // A bare client token is a Primer session.
      { clientToken: nonEmpty(value) };

  const chosen =
    (gateway === "primer" || gateway === "solidgate" || gateway === "paypal" ? gateway : undefined) ??
    session.gateway ??
    (session.clientToken ? "primer" : session.merchantData ? "solidgate" : session.scriptUrl ? "paypal" : undefined);

  if (chosen === "primer" && session.clientToken) return { ...session, gateway: chosen };
  if (chosen === "solidgate" && session.merchantData) return { ...session, gateway: chosen };
  if (chosen === "paypal" && session.scriptUrl) return { ...session, gateway: chosen };
  return null;
}

/** The methods to draw, in order, without repeats or unknown names. */
export function methodsOf(value: unknown): CheckoutMethod[] {
  const names = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const methods = names
    .map((name) => String(name).toLowerCase().replace(/[\s_-]/g, ""))
    .map((name) => (name === "creditcard" ? "card" : name))
    .filter((name): name is CheckoutMethod => (CHECKOUT_METHODS as readonly string[]).includes(name));
  const unique = [...new Set(methods)];
  return unique.length ? unique : [...CHECKOUT_METHODS];
}
