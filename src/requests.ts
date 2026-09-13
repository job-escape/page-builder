/**
 * `@job-escape/page-builder/requests` — the named requests a published design
 * makes, answered on the funnel's own server. **Beta.**
 *
 * One route per host, built from the same contract whichever backend the funnel
 * sells through:
 *
 *     import { createRequestRoute, nvsActions } from "@job-escape/page-builder/requests";
 *     export const POST = createRequestRoute({ actions: nvsActions({ baseUrl, apiKey, projectId }) });
 *
 * Server-only, and no Node built-ins: `fetch`, `Request`, `Response` and
 * `crypto.randomUUID` — a Node route and an edge function alike. It imports
 * nothing from the runtime, and the runtime nothing from it — the wire format
 * between them (`{ action, payload, context }`) is the whole of the coupling.
 */

export type {
  ActionHandler,
  ActionHandlers,
  ActionName,
  Json,
  Log,
  Payload,
  RequestContext,
} from "./requests/contract";
export { ACTION_NAMES, ActionError, buyerCountry, clientIp, cookie, silentLog } from "./requests/contract";

export type { RequestRouteOptions } from "./requests/route";
export { createRequestRoute } from "./requests/route";

export type { NvsConfig, NvsRpc } from "./requests/nvs/client";
export { NvsApiError, createNvsClient } from "./requests/nvs/client";
export type { PaymentErrorPolicy, CheckoutFailureAction } from "./requests/nvs/errors";
export { classifyPaymentError, checkoutErrorBody } from "./requests/nvs/errors";
export type { FunnelSubscription, NvsActionsOptions, PlatformProduct } from "./requests/nvs/actions";
export { isPaidStatus, isPlatformUserId, nvsActions, toFunnelSubscription } from "./requests/nvs/actions";

export type { JobescapeActionsOptions } from "./requests/jobescape/actions";
export { jobescapeActions, readCookieUser } from "./requests/jobescape/actions";
