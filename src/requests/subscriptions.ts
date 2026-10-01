/**
 * `subscriptions.list` — what the funnel asks for when it starts, to fill the
 * design's `subscriptions` variable: the subscription plans this visitor is
 * offered.
 *
 * Its own route rather than an action on the shared one, the way the email
 * step's is: the request is nothing but the question, and the answer has one
 * shape (`runtime/subscriptions`).
 *
 * **Which plans is the host's decision.** The catalogue is every recurring
 * product the project sells; a host that offers some of them — a feature flag
 * naming product codes, per visitor — says which through `codes`. The plans
 * come back in the order the codes are given, so the flag decides the order of
 * the cards too. No `codes`, or one that answers nothing, is the whole list.
 *
 * Server-only: the platform key never leaves the host.
 */
import { silentLog, type Log } from "./contract";
import { NvsApiError, type NvsConfig } from "./nvs/client";
import { nvsSubscriptions, type FunnelSubscription } from "./nvs/actions";

export const SUBSCRIPTIONS_ACTION = "subscriptions.list";

/** What this answers — `SubscriptionsResponse` in `runtime/subscriptions`. */
export type SubscriptionsResponse = { subscriptions: FunnelSubscription[] };

export type SubscriptionsRouteOptions = NvsConfig & {
  /**
   * The product codes of the plans this visitor is offered, in the order to
   * show them — the host's feature flag, read for the request. Null or
   * undefined offers every plan.
   */
  codes?: (
    request: Request,
  ) => Promise<readonly string[] | null | undefined> | readonly string[] | null | undefined;
};

/**
 * The plans named by `codes`, in that order — or all of them when there are
 * none to go by. The first one offered is the default, whichever it is: a
 * paywall always has a plan to start selected.
 */
export function pickSubscriptions(
  all: readonly FunnelSubscription[],
  codes: readonly string[] | null | undefined,
  log: Log = silentLog,
): FunnelSubscription[] {
  if (!codes) return [...all];
  const byCode = new Map(all.map((plan) => [plan.code, plan]));
  const unknown = codes.filter((code) => !byCode.has(code));
  // A code the catalogue does not sell: a flag naming a retired plan, or one
  // from another environment. Said, because the card it meant is not shown.
  if (unknown.length) {
    log.warn("subscription_codes_unknown", { unknown, known: [...byCode.keys()].sort() });
  }
  const seen = new Set<string>();
  return codes
    .filter((code) => byCode.has(code) && !seen.has(code) && Boolean(seen.add(code)))
    .map((code, index) => ({ ...(byCode.get(code) as FunnelSubscription), is_default: index === 0 }));
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The subscriptions route: a `POST` with nothing to say, answered with
 * `{ subscriptions: [...] }` — or a refusal's `{ error, message }` under its
 * status.
 *
 *     // app/api/subscriptions/route.ts
 *     export const POST = createSubscriptionsRoute({ ...nvsConfig, codes: flagCodes });
 *
 * The page asks there once told where it is:
 * `configureRequests({ routes: { "subscriptions.list": "/api/subscriptions" } })`.
 */
export function createSubscriptionsRoute(
  options: SubscriptionsRouteOptions,
): (request: Request) => Promise<Response> {
  const log = options.log ?? silentLog;
  const load = nvsSubscriptions(options);

  return async (request) => {
    try {
      const [all, codes] = await Promise.all([load(), options.codes?.(request)]);
      const subscriptions = pickSubscriptions(all, codes, log);
      log.info("subscriptions_listed", {
        offered: subscriptions.map((plan) => plan.code),
        filtered: Boolean(codes),
      });
      const answer: SubscriptionsResponse = { subscriptions };
      return json(answer);
    } catch (error) {
      if (error instanceof NvsApiError) {
        log.warn("subscriptions_refused", { status: error.httpStatus, error: error.code });
        return json({ error: error.code, message: "The plans could not be loaded." }, 502);
      }
      log.error("subscriptions_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
    }
  };
}
