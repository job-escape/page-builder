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
 *
 * The card form's button is ours, so its waiting is ours to draw too: it spins
 * and cannot be pressed from the moment a payment is submitted until the
 * design has heard how it ended — which, for a payment the gateway took,
 * includes the platform settling it (`runtime/payment-session`).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { CheckoutMethod, CheckoutProps, PaymentReport, Trigger } from "./contract";
// The tags below are Primer's; this is what lets them be written as tags.
import type { PrimerCheckoutElement } from "./primer-elements";

/** Whether the visitor's system asks for dark — what the funnel's palette follows. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => setDark(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return dark;
}

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

/** The spinner's turn. Light DOM — the button is slotted, not in a shadow root. */
const SPIN = "pb-checkout-spin";
const SPIN_CSS = `@keyframes ${SPIN}{to{transform:rotate(360deg)}}`;

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
  const element = useRef<PrimerCheckoutElement | null>(null);
  const idempotencyKey = useRef(newKey());
  /** A payment is on its way: submitted, and its end not yet told to the design. */
  const [paying, setPaying] = useState(false);
  /*
    The gateway's own dark theme where the visitor's system asks for dark — the
    funnel around it is painted for that mode, and the form's labels were dark
    words on a dark sheet. On the element itself, by hand: a class on a custom
    element is not something every React writes the same way.
  */
  const dark = useSystemDark();
  useEffect(() => {
    element.current?.classList.toggle("primer-dark-theme", dark);
  });

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
    if (element.current) element.current.options = options;
  }, [options]);

  useEffect(() => {
    const checkout = element.current;
    if (!checkout) return undefined;

    let pendingWallet: "APPLE_PAY" | "GOOGLE_PAY" | "PAYPAL" | null = null;
    let wasProcessing = false;
    let lastPaypalCancelAt = 0;
    const report = (name: Parameters<Trigger>[0], values: Omit<PaymentReport, "gateway">) =>
      trigger.current(name, { gateway: "primer", ...values });
    /*
      Settling outlives the gateway's own processing: `success` is answered
      only after the platform confirmed the payment and the design's steps
      ran. Until then the gateway going quiet must not release the button.
    */
    let settling = false;
    const settled = (told: ReturnType<Trigger>) => {
      settling = true;
      void Promise.resolve(told)
        .catch(() => undefined)
        .then(() => {
          settling = false;
          setPaying(false);
        });
    };

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
      // Released only when the gateway *stops* working — another change of
      // its state, between the press and the work starting, is not the end.
      if (isProcessing) setPaying(true);
      else if (wasProcessing && !settling) setPaying(false);
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
        // The card's button was pressed: before the gateway says it is working.
        setPaying(true);
      }
      continuePaymentCreation?.({ idempotencyKey: idempotencyKey.current });
    };

    const onSuccess = (event: Event) => {
      const { payment, paymentMethodType = "" } = (event as PrimerEvent).detail ?? {};
      flushPendingWallet();
      setPaying(true);
      settled(
        report("success", {
          method: METHOD_OF[paymentMethodType] ?? "card",
          ...(payment?.id ? { orderId: payment.id, paymentId: payment.id } : {}),
        }),
      );
    };

    const onFailure = (event: Event) => {
      const { error, paymentMethodType, payment } = (event as PrimerEvent).detail ?? {};
      setPaying(false);
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
      setPaying(false);
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

  const cardForm = (
    <primer-card-form
      key="card"
      data-payment-method="card"
      should-show-cardholder-name={cardholderName ? "true" : undefined}
      should-require-cardholder-name={cardholderName ? "true" : undefined}
    >
      <div slot="card-form-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <primer-input-card-number />
        <div style={{ display: "flex", gap: 16 }}>
          <primer-input-card-expiry />
          <primer-input-cvv />
        </div>
        {cardholderName ? <primer-input-card-holder-name /> : null}
        {billingAddress ? <primer-billing-address /> : null}
        <button
          type="submit"
          data-button-type="pay"
          // Not pressable twice: a second press would be a second payment.
          disabled={paying}
          aria-busy={paying || undefined}
          data-paying={paying ? "" : undefined}
          style={{
            width: "100%",
            minHeight: 52,
            border: 0,
            borderRadius: 12,
            background: "#2563EB",
            color: "#FFFFFF",
            fontWeight: 600,
            cursor: paying ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            ...props.buttonStyle,
            ...(paying ? { opacity: 0.85 } : {}),
          }}
        >
          {paying ? (
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                flex: "none",
                borderRadius: "50%",
                border: "2px solid currentColor",
                borderRightColor: "transparent",
                animation: `${SPIN} 0.7s linear infinite`,
              }}
            />
          ) : null}
          {props.buttonLabel || "Complete payment"}
        </button>
        {paying ? <style>{SPIN_CSS}</style> : null}
      </div>
    </primer-card-form>
  );

  return (
    <primer-checkout
      // A new token is a new session: the element is rebuilt rather than
      // re-pointed, so nothing from the previous plan's session survives.
      key={clientToken}
      ref={(node) => {
        element.current = node;
        if (node) node.options = optionsRef.current;
      }}
      client-token={clientToken}
      data-checkout="primer"
    >
      <primer-main slot="main">
        <div slot="payments" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {methods.map((method) =>
            method === "card" ? (
              cardForm
            ) : (
              <primer-payment-method-container
                key={method}
                include={CONTAINER_OF[method]}
                data-payment-method={method}
              />
            ),
          )}
          {/* Why a payment did not go through, in the gateway's own words and
              its own element — it reads the checkout's state, so a refused card
              and a refused wallet both land here. A layout of our own does not
              get the one the default layout draws, and without it a refusal
              showed nothing: the report reaches the design, which may say
              nothing. */}
          <primer-error-message-container />
        </div>
      </primer-main>
    </primer-checkout>
  );
}
