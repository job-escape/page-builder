/**
 * Solidgate, through its React form (`@solidgate/react-sdk`).
 *
 * The callbacks are funnel's `SolidgateCardForm`, reduced to reports. What it
 * learned stays: Solidgate names a wallet's order by several spellings; a
 * wallet's submit is attributed from the order status, once, not from the card
 * `onSubmit`; code `3.13` on a wallet is the visitor closing the sheet, not a
 * decline. What it did after a success — confirm the order, fire pixels,
 * redirect — is the design's now.
 */
import { createElement, useEffect, useRef, useState, type ComponentType, type ReactElement } from "react";

import type { CheckoutMethod, CheckoutProps, CheckoutSession, PaymentReport, Trigger } from "./contract";

/** The host's `() => import("@solidgate/react-sdk")`. */
export type SolidgateLoader = () => Promise<{ default: ComponentType<Record<string, unknown>> }>;

const DEFAULT_STYLES = {
  form_body: { width: "98%", display: "block", "max-width": "none" },
  submit_button: {
    "background-color": "#2563EB",
    "border-radius": "8px",
    color: "#FAFAFA",
    width: "100%",
    "font-weight": "500",
    "text-transform": "capitalize",
  },
};

/** camelCase to the SDK's kebab-case style dictionary. */
function kebab(style?: Record<string, string | number>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(style ?? {}).map(([key, value]) => [key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`), String(value)]),
  );
}

/** `normalizeOrderMethod`. */
export function solidgateMethod(raw?: unknown): CheckoutMethod | null {
  if (typeof raw !== "string" || !raw) return null;
  const name = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (name.includes("google")) return "googlepay";
  if (name.includes("apple")) return "applepay";
  if (name.includes("paypal")) return "paypal";
  if (name.includes("card") || name === "form") return "card";
  return null;
}

type SdkEvent = {
  entity?: string;
  code?: string | number;
  message?: string;
  order?: { order_id?: string; method?: string };
  response?: { order?: { method?: string } };
  target?: { name?: string; interaction?: string };
};

const OFFSCREEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
  left: -9999,
  top: -9999,
} as const;

export function SolidgateCheckout({
  load,
  merchantData,
  methods,
  props,
  trigger,
}: {
  load: SolidgateLoader;
  merchantData: NonNullable<CheckoutSession["merchantData"]>;
  methods: CheckoutMethod[];
  props: CheckoutProps;
  trigger: { current: Trigger };
}): ReactElement {
  const [Payment, setPayment] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const applePay = useRef<HTMLDivElement>(null);
  const googlePay = useRef<HTMLDivElement>(null);
  const lastWallet = useRef<"applepay" | "googlepay" | null>(null);
  const orderMethod = useRef<CheckoutMethod | null>(null);
  const walletSubmitted = useRef(false);
  const processed = useRef(false);

  useEffect(() => {
    let live = true;
    load()
      .then((sdk) => {
        if (live) setPayment(() => sdk.default);
      })
      .catch((error: unknown) => {
        void trigger.current("error", {
          gateway: "solidgate",
          method: "card",
          message: error instanceof Error ? error.message : "The payment form could not load.",
        });
      });
    return () => {
      live = false;
    };
  }, [load, trigger]);

  // A new session is a new attempt.
  useEffect(() => {
    processed.current = false;
    walletSubmitted.current = false;
    orderMethod.current = null;
  }, [merchantData]);

  const report = (name: Parameters<Trigger>[0], values: Omit<PaymentReport, "gateway">) =>
    void trigger.current(name, { gateway: "solidgate", ...values });

  const entityMethod = (entity?: string): CheckoutMethod | null =>
    entity === "applebtn" || entity === "applepay" ? "applepay" : entity === "googlebtn" || entity === "googlepay" ? "googlepay" : null;

  const methodOf = (event: SdkEvent): CheckoutMethod =>
    orderMethod.current ?? lastWallet.current ?? entityMethod(event.entity) ?? "card";

  const offersCard = methods.includes("card");
  const walletSlot = (method: "applepay" | "googlepay") =>
    createElement("div", {
      key: method,
      ref: method === "applepay" ? applePay : googlePay,
      "data-payment-method": method,
      style: { width: "100%" },
    });

  const form = Payment
    ? createElement(Payment, {
        key: "form",
        merchantData,
        styles: {
          ...DEFAULT_STYLES,
          submit_button: { ...DEFAULT_STYLES.submit_button, ...kebab(props.buttonStyle) },
        },
        width: "100%",
        formParams: { submitButtonText: props.buttonLabel || "Confirm payment" },
        ...(methods.includes("applepay")
          ? { applePayButtonParams: { color: "black", type: props.applePayType ?? "buy" }, applePayContainerRef: applePay }
          : {}),
        ...(methods.includes("googlepay")
          ? { googlePayButtonParams: { color: "black", type: props.googlePayType ?? "buy" }, googlePayContainerRef: googlePay }
          : {}),
        onInteraction: (event: SdkEvent) => {
          const { name, interaction } = event.target ?? {};
          const wallet = name === "applePay" ? "applepay" : name === "googlePay" ? "googlepay" : null;
          if (wallet && interaction === "click") {
            lastWallet.current = wallet;
            report("click", { method: wallet });
          } else if (wallet && interaction === "pageClose") {
            if (lastWallet.current === wallet) lastWallet.current = null;
            report("cancel", { method: wallet });
          } else if (interaction === "click") {
            lastWallet.current = null;
          }
        },
        onOrderStatus: (event: SdkEvent) => {
          const method = solidgateMethod(event.response?.order?.method) ?? entityMethod(event.entity) ?? lastWallet.current;
          if (method) orderMethod.current = method;
          if (method && method !== "card" && !walletSubmitted.current) {
            walletSubmitted.current = true;
            report("purchase_click", { method });
          }
        },
        onSubmit: (event: SdkEvent) => {
          const method = methodOf(event);
          if (method !== "card") return;
          report("purchase_click", { method });
        },
        onSuccess: (event: SdkEvent) => {
          if (processed.current) return;
          const method = methodOf(event);
          const orderId = event.order?.order_id;
          lastWallet.current = null;
          orderMethod.current = null;
          walletSubmitted.current = false;
          if (!orderId) {
            report("error", { method, message: "Something went wrong. Please try again." });
            return;
          }
          processed.current = true;
          report("success", { method, orderId });
        },
        onFail: (event: SdkEvent) => {
          if (processed.current) return;
          const method = methodOf(event);
          const code = event.code === undefined || event.code === null ? undefined : String(event.code);
          if ((method === "applepay" || method === "googlepay") && code === "3.13") return;
          lastWallet.current = null;
          orderMethod.current = null;
          walletSubmitted.current = false;
          report("decline", {
            method,
            message: event.message || "Your payment did not go through. Please try again.",
            ...(code ? { code } : {}),
          });
        },
        onError: () => {
          if (processed.current) return;
          report("error", { method: "card", message: "Something went wrong. Please try again." });
        },
      })
    : null;

  const slots = methods.filter((method): method is "applepay" | "googlepay" => method === "applepay" || method === "googlepay");

  return createElement(
    "div",
    { "data-checkout": "solidgate", style: { position: "relative", display: "flex", flexDirection: "column", gap: 12 } },
    ...methods.flatMap((method) => {
      if (method === "card") {
        return [createElement("div", { key: "card", "data-payment-method": "card" }, form)];
      }
      return method === "applepay" || method === "googlepay" ? [walletSlot(method)] : [];
    }),
    // Without a card, the form still has to mount for the wallets to: kept
    // measurable off-screen, since Solidgate skips init inside display:none.
    !offersCard && slots.length ? createElement("div", { key: "form", style: OFFSCREEN }, form) : null,
  );
}
