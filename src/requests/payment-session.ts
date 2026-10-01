/**
 * The payment session's routes — what the funnel asks to open a session for a
 * screen with a payment form (`payment.session`), and to settle it once the
 * gateway reports a payment (`payment.confirm`).
 *
 * Routes of their own, the way the email step's is: each request is its
 * payload and nothing else, checked against one shape, and each answer has one
 * shape (`runtime/payment-session`). What they do is the platform actions
 * already here (`nvsActions`): the plan's code resolved against this
 * environment's catalogue, the account found or made from the email, the
 * buyer's country read off the edge — none of which the browser is trusted to
 * say.
 *
 * Server-only: the platform key never leaves the host.
 */
import { z } from "zod";

import { ActionError, silentLog, type ActionHandler, type Log, type RequestContext } from "./contract";
import { nvsActions, type NvsActionsOptions } from "./nvs/actions";

export const PAYMENT_SESSION_ACTION = "payment.session";
export const PAYMENT_CONFIRM_ACTION = "payment.confirm";

/*
  This end of the wire. The funnel parses with the schemas in
  `runtime/payment-session`; these are the same shapes, written again because
  `src/runtime` and the rest of the package may not import each other
  (`runtime/isolation.test`). Change one and change the other.
*/

/** What opening a session is sent — and nothing beside it. */
const PaymentSessionPayload = z.strictObject({
  productCode: z.string().min(1),
  email: z.string().trim().pipe(z.email()),
  userId: z.string().min(1).optional(),
});

/** What settling one is sent. */
const PaymentConfirmPayload = z.strictObject({
  checkoutAttemptId: z.string().min(1),
  gatewayPaymentId: z.string().min(1).optional(),
  productCode: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A route around one platform action: the body checked, the action's answer or its refusal sent back. */
function routeFor(
  name: string,
  schema: z.ZodType<Record<string, unknown>>,
  handler: ActionHandler | undefined,
  log: Log,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const checked = schema.safeParse(body);
    if (!checked.success || !handler) {
      return json({ error: "invalid_argument", message: "The request could not be read." }, 400);
    }
    // What only the server knows about the request: its address, for the
    // return links, and its headers, for the buyer's country.
    const context: RequestContext = { request, responseHeaders: new Headers() };
    try {
      return json(await handler(checked.data, context));
    } catch (error) {
      if (error instanceof ActionError) {
        log.warn("payment_request_refused", { name, status: error.status, error: error.body.error });
        return json(error.body, error.status);
      }
      log.error("payment_request_failed", {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
    }
  };
}

/**
 * The two routes, made together so they share one platform client and one
 * catalogue.
 *
 *     // app/api/payment-session/route.ts          → POST = routes.session
 *     // app/api/payment-session/confirm/route.ts  → POST = routes.confirm
 *     const routes = createPaymentRoutes({ baseUrl, apiKey, projectId });
 *
 * The page sends there once told where they are:
 * `configureRequests({ routes: { "payment.session": "/api/payment-session",
 * "payment.confirm": "/api/payment-session/confirm" } })`.
 */
export function createPaymentRoutes(options: NvsActionsOptions): {
  session: (request: Request) => Promise<Response>;
  confirm: (request: Request) => Promise<Response>;
} {
  const log = options.log ?? silentLog;
  const actions = nvsActions(options);
  return {
    session: routeFor(PAYMENT_SESSION_ACTION, PaymentSessionPayload, actions["payments.create_session"], log),
    confirm: routeFor(PAYMENT_CONFIRM_ACTION, PaymentConfirmPayload, actions["payments.confirm"], log),
  };
}
