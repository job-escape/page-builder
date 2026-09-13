/**
 * `@job-escape/page-builder/checkout` — the checkout a design's `checkout` slot
 * draws. **Beta.**
 *
 * It mounts the gateway a session names — Primer (card, Apple Pay, Google Pay,
 * PayPal), Solidgate (card and wallets) or Solidgate's PayPal — and reports what
 * happened by name (`CHECKOUT_TRIGGERS`), with `$payment.*` for the design's
 * steps to read. It fires no analytics, confirms no order and navigates
 * nowhere: those are steps a designer authors on each report.
 *
 * Client-only. It imports no payment SDK — the host passes its loaders to
 * `createCheckout` — and nothing from the runtime: a slot's props and its
 * `trigger` are the whole of the coupling.
 */

export type {
  CheckoutMethod,
  CheckoutProps,
  CheckoutSession,
  CheckoutTrigger,
  Gateway,
  PaymentReport,
  PaypalStyle,
  Trigger,
} from "./checkout/contract";
export { CHECKOUT_METHODS, CHECKOUT_TRIGGERS, methodsOf, sessionOf } from "./checkout/contract";

export type { CheckoutLoaders } from "./checkout/checkout";
export { createCheckout } from "./checkout/checkout";
export type { PrimerLoader } from "./checkout/primer";
export type { SolidgateLoader } from "./checkout/solidgate";
