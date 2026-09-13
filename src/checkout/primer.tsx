/**
 * Primer, through its web components (`@primer-io/primer-js`).
 *
 * The event handling is funnel's `PrimerProvider`, kept where it was learned
 * the hard way and reduced to reports:
 *
 * - a wallet's `payment-start` fires on the **tap**, before the visitor has
 *   approved anything — so it is a `click`, and `purchase_click` waits for the
 *   processing flip (Apple / Google Pay) or the outcome (PayPal, whose
 *   processing flag flips at the tap too);
 * - one PayPal tap fires `payment-start` twice, and one closed popup arrives as
 *   up to three events seconds apart — each is reported once;
 * - a closed PayPal popup is a `cancel`, never a `decline`;
 * - every attempt carries an idempotency key, rotated after a decline so the
 *   retry is a new payment rather than the refused one again.
 */
import { createElement, useEffect, useMemo, useRef, type ReactElement } from "react";

import type { CheckoutMethod, CheckoutProps, PaymentReport, Trigger } from "./contract";

/** The host's `() => import("@primer-io/primer-js")`. */
export type PrimerLoader = () => Promise<{ loadPrimer: () => unknown }>;

const METHOD_OF: Record<string, CheckoutMethod | undefined> = {
  PAYMENT_CARD: "card",
  APPLE_PAY: "applepay",
  GOOGLE_PAY: "googlepay",
  PAYPAL: "paypal",
};

const CONTAINER_OF: Record<Exclude<CheckoutMethod, "card">, string> = {
  applepay: "APPLE_PAY",
  googlepay: "GOOGLE_PAY",
  paypal: "PAYPAL",
};

/** `isPaypalUserAbort`: the real abort events carry no method at all. */
export function isPaypalUserAbort(
  paymentMethodType: string | undefined,
  error?: { origin?: string; message?: string },
): boolean {
  if (paymentMethodType && paymentMethodType !== "PAYPAL") return false;
  if (!error) return false;
  return error.origin === "user" || /paypal payment was cancell?ed|cancell?ed by the user|popup clos/i.test(error.message ?? "");
}

let loading: Promise<unknown> | null = null;

/** One SDK boot per page, whichever checkout asks first. */
function boot(load: PrimerLoader): Promise<unknown> {
  loading ??= load()
    .then((sdk) => sdk.loadPrimer())
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

const newKey = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type PrimerEvent = CustomEvent<{
  isProcessing?: boolean;
  paymentMethodType?: string;
  continuePaymentCreation?: (options: { idempotencyKey: string }) => void;
  payment?: { id?: string };
  error?: { origin?: string; message?: string; code?: string };
}>;

export function PrimerCheckout({
  load,
  clientToken,
  methods,
  props,
  trigger,
}: {
  load: PrimerLoader;
  clientToken: string;
  methods: CheckoutMethod[];
  props: CheckoutProps;
  trigger: { current: Trigger };
}): ReactElement {
  const element = useRef<HTMLElement | null>(null);
  const idempotencyKey = useRef(newKey());

  const { cardholderName = false, billingAddress = false, applePayType = "buy", googlePayType = "buy" } = props;
  const paypal = props.paypalStyle;
  const options = useMemo(
    () => ({
      card: { cardholderName: { visible: cardholderName, required: cardholderName } },
      applePay: { buttonStyle: "black", buttonType: applePayType },
      googlePay: { buttonStyle: "black", buttonType: googlePayType, buttonSizeMode: "fill" },
      // `vault` makes the PayPal token reusable — without it every rebill fails.
      paypal: {
        vault: true,
        disableFunding: ["card", "paylater", "venmo", "credit"],
        style: { shape: paypal?.shape ?? "pill", height: paypal?.height ?? 50, tagline: false, ...(paypal?.color ? { color: paypal.color } : {}), ...(paypal?.label ? { label: paypal.label } : {}) },
      },
    }),
    [cardholderName, applePayType, googlePayType, paypal?.shape, paypal?.height, paypal?.color, paypal?.label],
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    boot(load).catch((error: unknown) => {
      void trigger.current("error", {
        gateway: "primer",
        method: "card",
        message: error instanceof Error ? error.message : "The payment form could not load.",
      });
    });
  }, [load, trigger]);

  useEffect(() => {
    const node = element.current as (HTMLElement & { options?: unknown }) | null;
    if (node) node.options = options;
  }, [options]);

  useEffect(() => {
    const checkout = element.current;
    if (!checkout) return undefined;

    let pendingWallet: "APPLE_PAY" | "GOOGLE_PAY" | "PAYPAL" | null = null;
    let wasProcessing = false;
    let lastPaypalCancelAt = 0;
    const report = (name: Parameters<Trigger>[0], values: Omit<PaymentReport, "gateway">) =>
      void trigger.current(name, { gateway: "primer", ...values });

    const flushPendingWallet = () => {
      if (!pendingWallet) return;
      const method = METHOD_OF[pendingWallet] ?? "card";
      pendingWallet = null;
      report("purchase_click", { method });
    };

    const cancelPaypalOnce = () => {
      const now = Date.now();
      if (now - lastPaypalCancelAt < 3000) return;
      lastPaypalCancelAt = now;
      report("cancel", { method: "paypal" });
    };

    const onStateChange = (event: Event) => {
      const isProcessing = Boolean((event as PrimerEvent).detail?.isProcessing);
      if (isProcessing && !wasProcessing && pendingWallet !== "PAYPAL") flushPendingWallet();
      wasProcessing = isProcessing;
    };

    const onPaymentStart = (event: Event) => {
      const { paymentMethodType = "", continuePaymentCreation } = (event as PrimerEvent).detail ?? {};
      if (paymentMethodType === "APPLE_PAY" || paymentMethodType === "GOOGLE_PAY" || paymentMethodType === "PAYPAL") {
        // An armed PayPal means the same tap firing twice.
        if (pendingWallet !== paymentMethodType) report("click", { method: METHOD_OF[paymentMethodType] ?? "card" });
        pendingWallet = paymentMethodType;
      } else {
        report("purchase_click", { method: METHOD_OF[paymentMethodType] ?? "card" });
      }
      continuePaymentCreation?.({ idempotencyKey: idempotencyKey.current });
    };

    const onSuccess = (event: Event) => {
      const { payment, paymentMethodType = "" } = (event as PrimerEvent).detail ?? {};
      flushPendingWallet();
      report("success", {
        method: METHOD_OF[paymentMethodType] ?? "card",
        ...(payment?.id ? { orderId: payment.id, paymentId: payment.id } : {}),
      });
    };

    const onFailure = (event: Event) => {
      const { error, paymentMethodType, payment } = (event as PrimerEvent).detail ?? {};
      if (isPaypalUserAbort(paymentMethodType, error)) {
        pendingWallet = null;
        cancelPaypalOnce();
        return;
      }
      flushPendingWallet();
      idempotencyKey.current = newKey();
      report("decline", {
        method: METHOD_OF[paymentMethodType ?? ""] ?? "card",
        ...(payment?.id ? { orderId: payment.id, paymentId: payment.id } : {}),
        message: error?.message || "Your payment did not go through. Please try again.",
        ...(error?.code ? { code: String(error.code) } : {}),
      });
    };

    const onCancel = (event: Event) => {
      const type = (event as PrimerEvent).detail?.paymentMethodType;
      pendingWallet = null;
      if (type === "PAYPAL") cancelPaypalOnce();
      else if (type === "APPLE_PAY" || type === "GOOGLE_PAY") report("cancel", { method: METHOD_OF[type] ?? "card" });
    };

    const onChallenge = () => report("challenge", { method: "card" });

    const listeners: Array<[string, (event: Event) => void]> = [
      ["primer:state-change", onStateChange],
      ["primer:payment-start", onPaymentStart],
      ["primer:payment-success", onSuccess],
      ["primer:payment-failure", onFailure],
      ["primer:payment-cancel", onCancel],
      ["primer:3ds-challenge", onChallenge],
    ];
    listeners.forEach(([name, listener]) => checkout.addEventListener(name, listener));
    return () => listeners.forEach(([name, listener]) => checkout.removeEventListener(name, listener));
  }, [clientToken, trigger]);

  const cardForm = createElement(
    "primer-card-form",
    {
      key: "card",
      "data-payment-method": "card",
      "should-show-cardholder-name": cardholderName ? "true" : undefined,
      "should-require-cardholder-name": cardholderName ? "true" : undefined,
    },
    createElement(
      "div",
      { slot: "card-form-content", style: { display: "flex", flexDirection: "column", gap: 16 } },
      createElement("primer-input-card-number"),
      createElement(
        "div",
        { style: { display: "flex", gap: 16 } },
        createElement("primer-input-card-expiry"),
        createElement("primer-input-cvv"),
      ),
      cardholderName ? createElement("primer-input-card-holder-name") : null,
      billingAddress ? createElement("primer-billing-address") : null,
      createElement(
        "button",
        {
          type: "submit",
          "data-button-type": "pay",
          style: {
            width: "100%",
            minHeight: 52,
            border: 0,
            borderRadius: 12,
            background: "#2563EB",
            color: "#FFFFFF",
            fontWeight: 600,
            cursor: "pointer",
            ...props.buttonStyle,
          },
        },
        props.buttonLabel || "Complete payment",
      ),
    ),
  );

  return createElement(
    "primer-checkout",
    {
      // A new token is a new session: the element is rebuilt rather than
      // re-pointed, so nothing from the previous plan's session survives.
      key: clientToken,
      ref: (node: HTMLElement | null) => {
        element.current = node;
        if (node) (node as HTMLElement & { options?: unknown }).options = optionsRef.current;
      },
      "client-token": clientToken,
      "data-checkout": "primer",
    },
    createElement(
      "primer-main",
      { slot: "main" },
      createElement(
        "div",
        { slot: "payments", style: { display: "flex", flexDirection: "column", gap: 12 } },
        methods.map((method) =>
          method === "card"
            ? cardForm
            : createElement("primer-payment-method-container", {
                key: method,
                include: CONTAINER_OF[method],
                "data-payment-method": method,
              }),
        ),
      ),
    ),
  );
}
