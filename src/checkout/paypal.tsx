/**
 * PayPal through Solidgate: the script `init_paypal` answers with, booted in a
 * frame of its own.
 *
 * Funnel's `PaypalButtonUI`, reduced to reports. The frame is not decoration:
 * Primer ships its own copy of PayPal's machinery (zoid, FraudNet), and two
 * copies in one window eat each other's handshakes — the Solidgate button
 * freezes before it paints, near-certainly on a warm reload. A same-origin
 * frame is a realm of its own, and removing it tears the whole SDK down.
 */
import { createElement, useEffect, useRef, type ReactElement } from "react";

import type { PaypalStyle, PaymentReport, Trigger } from "./contract";

const MIN_HEIGHT = 52;

type OrderEvent = CustomEvent<{ data?: { error?: unknown } }>;

function refusalMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { recommended_message_for_user: forUser, message } = error as Record<string, unknown>;
    if (typeof forUser === "string" && forUser) return forUser;
    if (typeof message === "string" && message) return message;
  }
  return "Your payment did not go through. Please try again.";
}

export function PaypalCheckout({
  scriptUrl,
  orderId,
  style,
  trigger,
}: {
  scriptUrl: string;
  orderId?: string;
  style?: PaypalStyle;
  trigger: { current: Trigger };
}): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  const orderRef = useRef(orderId);
  orderRef.current = orderId;

  useEffect(() => {
    const host = container.current;
    if (!host) return undefined;

    const frame = document.createElement("iframe");
    frame.title = "PayPal";
    frame.setAttribute("style", `border:0;display:block;width:100%;height:${MIN_HEIGHT}px;overflow:hidden;`);
    host.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return undefined;
    }
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8">' +
        "<style>html,body{margin:0;padding:0;overflow:hidden;}html{scrollbar-width:none;}html::-webkit-scrollbar{display:none;}</style>" +
        '</head><body><div id="paypal-button"></div></body></html>',
    );
    doc.close();

    const button = doc.getElementById("paypal-button") as HTMLElement;
    const report = (name: Parameters<Trigger>[0], values: Omit<PaymentReport, "gateway" | "method"> = {}) =>
      void trigger.current(name, {
        gateway: "paypal",
        method: "paypal",
        ...(orderRef.current ? { orderId: orderRef.current } : {}),
        ...values,
      });

    const listeners: Array<[string, (event: Event) => void]> = [
      ["button-click", () => report("click")],
      ["button-cancel", () => report("cancel")],
      ["order-started-processing", () => report("purchase_click")],
      [
        "order-processed",
        (event) => {
          const error = (event as OrderEvent).detail?.data?.error;
          if (error) report("decline", { message: refusalMessage(error) });
          else report("success");
        },
      ],
    ];
    listeners.forEach(([name, listener]) => button.addEventListener(name, listener));

    // The frame follows the button's real height: shorter scrolls inside it,
    // taller leaves dead space under it.
    const sync = () => {
      const next = Math.max(Math.round(button.getBoundingClientRect().height), MIN_HEIGHT);
      if (`${next}px` !== frame.style.height) frame.style.height = `${next}px`;
    };
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    resize?.observe(button);

    // The widget reads its own tag's dataset for the button's look.
    const script = doc.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    const look = styleRef.current;
    if (look?.label) script.setAttribute("data-label", look.label);
    script.setAttribute("data-shape", look?.shape ?? "pill");
    if (look?.color) script.setAttribute("data-color", look.color);
    if (look?.height) script.setAttribute("data-height", String(look.height));
    doc.body.appendChild(script);

    return () => {
      resize?.disconnect();
      listeners.forEach(([name, listener]) => button.removeEventListener(name, listener));
      // A new order is a new button: the old one would pay for the previous plan.
      frame.remove();
    };
  }, [scriptUrl, trigger]);

  return createElement("div", { ref: container, "data-checkout": "paypal", "data-payment-method": "paypal" });
}
