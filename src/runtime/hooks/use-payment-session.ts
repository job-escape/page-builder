import { useEffect, useRef } from "react";

import type { FunnelManifest } from "../funnel-types";
import {
  PAYMENT_SESSION_ACTION,
  PAYMENT_SESSION_VARIABLE,
  PaymentSessionResponse,
  SUBSCRIPTION_VARIABLE,
  SUBSCRIPTIONS_VARIABLE,
  planCodeOf,
} from "../payment-session";
import { hasRoute, request } from "../request";
import type { FunnelStore } from "../store";
import type { VariableTable, VariableValue } from "../types";

/**
 * The payment session, opened when the visitor is on a screen that needs one
 * — a payment form on it, or on a dialog it opens (`manifest.payments`) — so
 * the form is ready by the time it is looked at. For the plan the design chose
 * (`selectedSubscription`), else the default of those offered, and the email
 * the funnel collected; put in `paymentSession`, which the form is bound to.
 *
 * One per plan and email: the same pair again is the session already open,
 * and another plan chosen while here is a new one — the old is cleared first,
 * so the form never offers to charge for the plan just left. Only for a design
 * that declares the variable and a host that said where it answers.
 *
 * Called on every render of the funnel, which redraws on any change to the
 * store — that is how a newly chosen plan is noticed.
 */
export function usePaymentSession(
  payments: FunnelManifest["payments"],
  screen: string,
  store: FunnelStore,
  table: VariableTable,
): void {
  const sells =
    Boolean(payments?.[screen]) &&
    table[PAYMENT_SESSION_VARIABLE] !== undefined &&
    hasRoute(PAYMENT_SESSION_ACTION);
  const read = (name: string): VariableValue => (table[name] ? store.get(name) : null);
  const planCode = sells
    ? planCodeOf(read(SUBSCRIPTION_VARIABLE), read(SUBSCRIPTIONS_VARIABLE))
    : null;
  const buyerEmail = sells ? read("email") : null;
  const sessionFor =
    planCode && typeof buyerEmail === "string" && buyerEmail ? `${planCode}\n${buyerEmail}` : null;
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    // Off a payment screen, or nothing to open one with yet: a failed attempt
    // is forgotten, so coming back tries again.
    if (!sessionFor || !planCode || typeof buyerEmail !== "string") {
      if (store.get(`$req.${PAYMENT_SESSION_ACTION}.status`) === "error") openedFor.current = null;
      return;
    }
    if (openedFor.current === sessionFor) return;
    openedFor.current = sessionFor;
    store.set(PAYMENT_SESSION_VARIABLE, null);
    store.setStatus(PAYMENT_SESSION_ACTION, "pending");
    const buyerId = read("userId");
    request(PAYMENT_SESSION_ACTION, {
      productCode: planCode,
      email: buyerEmail,
      ...(typeof buyerId === "string" && buyerId ? { userId: buyerId } : {}),
    })
      .then((answer) => {
        // Another plan was chosen while this one was being opened.
        if (openedFor.current !== sessionFor) return;
        const parsed = PaymentSessionResponse.safeParse(answer);
        if (!parsed.success) {
          store.setStatus(PAYMENT_SESSION_ACTION, "error", "The payment session could not be read.");
          return;
        }
        // With the plan it is for, so confirming can say which was bought.
        store.set(PAYMENT_SESSION_VARIABLE, { ...parsed.data, productCode: planCode });
        if (parsed.data.userId && !read("userId")) store.set("userId", parsed.data.userId);
        store.setStatus(PAYMENT_SESSION_ACTION, "success");
      })
      .catch((failure: unknown) => {
        if (openedFor.current !== sessionFor) return;
        // `request` has already logged it, by name.
        store.setStatus(
          PAYMENT_SESSION_ACTION,
          "error",
          failure instanceof Error ? failure.message : String(failure),
        );
      });
    // `read` and `table` are the store's own; the key is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFor, store]);
}
