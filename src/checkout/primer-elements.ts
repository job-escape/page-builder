/**
 * Primer's web components, declared so they can be written as tags.
 *
 * `@primer-io/primer-js` registers these as custom elements when the host's
 * loader runs (`primer.tsx`). The package ships JSX types of its own, but this
 * one does not depend on it — the host passes the SDK in, so a funnel that
 * sells through another gateway never has to install it. So the tags the
 * checkout draws are named here, with the attributes it sets on them and no
 * more: enough for `<primer-checkout client-token={…}>` to type-check.
 *
 * Every one takes what any element takes — `slot`, `style`, `data-*` — and
 * its children.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** The checkout's root, which also takes its options as a property. */
export type PrimerCheckoutElement = HTMLElement & { options?: unknown };

type Tag<Element extends HTMLElement = HTMLElement, Attributes = unknown> = DetailedHTMLProps<
  HTMLAttributes<Element>,
  Element
> &
  Attributes;

type PrimerElements = {
  /** The session the form pays into. A new token is a new checkout. */
  "primer-checkout": Tag<PrimerCheckoutElement, { "client-token": string }>;
  /** The layout: its `payments` slot is where the methods are drawn. */
  "primer-main": Tag;
  /** One method's own button — `APPLE_PAY`, `GOOGLE_PAY`, `PAYPAL`. */
  "primer-payment-method-container": Tag<HTMLElement, { include?: string }>;
  /** The card form; its `card-form-content` slot holds the fields and the button. */
  "primer-card-form": Tag<
    HTMLElement,
    { "should-show-cardholder-name"?: string; "should-require-cardholder-name"?: string }
  >;
  "primer-input-card-number": Tag;
  "primer-input-card-expiry": Tag;
  "primer-input-cvv": Tag;
  "primer-input-card-holder-name": Tag;
  "primer-billing-address": Tag;
  /** Why a payment did not go through, read from the checkout's own state. */
  "primer-error-message-container": Tag;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- how React's JSX types are extended
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an extension, not a new shape
    interface IntrinsicElements extends PrimerElements {}
  }
}
