/**
 * The checkout a host registers for a design's `checkout` slot.
 *
 * `createCheckout` takes the SDKs from the host rather than importing them:
 * a bundler resolves even a dynamic import at build time, so a package that
 * named `@solidgate/react-sdk` would fail the build of a host that sells only
 * through Primer. Each host passes the loaders for the gateways it has.
 *
 *     const Checkout = createCheckout({
 *       primer: () => import("@primer-io/primer-js"),
 *       solidgate: () => import("@solidgate/react-sdk"),
 *     });
 *     <Funnel components={{ checkout: Checkout }} … />
 */
import { createElement, useEffect, useRef, type ReactElement } from "react";

import { methodsOf, sessionOf, type CheckoutProps, type Trigger } from "./contract";
import { PaypalCheckout } from "./paypal";
import { PrimerCheckout, type PrimerLoader } from "./primer";
import { SolidgateCheckout, type SolidgateLoader } from "./solidgate";

export type CheckoutLoaders = {
  primer?: PrimerLoader;
  solidgate?: SolidgateLoader;
};

export function createCheckout(loaders: CheckoutLoaders): (props: CheckoutProps) => ReactElement | null {
  function Checkout(props: CheckoutProps): ReactElement | null {
    // The slot hands a new `trigger` every render; the gateways read the latest.
    const trigger = useRef<Trigger>(props.trigger ?? (() => undefined));
    trigger.current = props.trigger ?? (() => undefined);

    const session = sessionOf(props.session, props.gateway);
    const methods = methodsOf(props.methods);
    const missing =
      session && ((session.gateway === "primer" && !loaders.primer) || (session.gateway === "solidgate" && !loaders.solidgate));

    useEffect(() => {
      if (!missing || !session) return;
      void trigger.current("error", {
        gateway: session.gateway,
        method: methods[0] ?? "card",
        message: "This payment method is not available here.",
      });
      // Once per gateway that is missing, not once per render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [missing, session?.gateway]);

    if (!session) {
      return createElement("div", {
        "data-checkout": "pending",
        "aria-busy": true,
        style: { width: "100%", minHeight: props.placeholderHeight ?? 52 },
      });
    }
    if (missing) return null;

    if (session.gateway === "primer" && loaders.primer && session.clientToken) {
      return createElement(PrimerCheckout, {
        load: loaders.primer,
        clientToken: session.clientToken,
        methods,
        props,
        trigger,
      });
    }
    if (session.gateway === "solidgate" && loaders.solidgate && session.merchantData) {
      return createElement(SolidgateCheckout, {
        load: loaders.solidgate,
        merchantData: session.merchantData,
        // Solidgate's PayPal is its own session (`gateway: "paypal"`).
        methods: methods.filter((method) => method !== "paypal"),
        props,
        trigger,
      });
    }
    if (session.gateway === "paypal" && session.scriptUrl) {
      return createElement(PaypalCheckout, {
        scriptUrl: session.scriptUrl,
        orderId: session.orderId,
        style: props.paypalStyle,
        trigger,
      });
    }
    return null;
  }
  return Checkout;
}
