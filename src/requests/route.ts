/**
 * The route a published design's `submit` steps reach — one handler per host.
 *
 * The runtime `POST`s `{ action, payload, context }` (`runtime/request`) and
 * reads the JSON it gets back, a non-2xx being a failure whose `error` it
 * reports. That wire format is the runtime's, and this is its other end: it
 * validates the envelope, finds the action, and turns what the action did into
 * the status and body the design's `into` / `errorInto` read.
 */
import { ActionError, silentLog, type ActionHandlers, type Log, type Payload, type RequestContext } from "./contract";

export type RequestRouteOptions = {
  /**
   * The named actions this host answers. An action not here is a 400.
   *
   * A function when the host serves more than one backend: it is handed the
   * request's context — `context.project` above all — and answers with the
   * handlers for it. Build the handler sets once, outside it; a set holds a
   * cache (the NVS catalogue) that a set built per request would throw away.
   */
  actions: ActionHandlers | ((context: RequestContext) => ActionHandlers);
  /**
   * `api:<id>` project API calls — funnel_backend's `design-api-calls/run`.
   * Absent, such an action is a 400 like any unknown one.
   */
  apiCall?: (id: number, payload: Payload, context: RequestContext) => Promise<Response>;
  log?: Log;
};

const json = (body: unknown, status = 200, extra?: Headers): Response => {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
};

/** A plain object, or null. */
function objectOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function createRequestRoute(options: RequestRouteOptions): (request: Request) => Promise<Response> {
  const log = options.log ?? silentLog;

  return async (request: Request): Promise<Response> => {
    let envelope: Record<string, unknown> | null;
    try {
      envelope = objectOf(await request.json());
    } catch {
      envelope = null;
    }
    const action = typeof envelope?.action === "string" ? envelope.action : "";
    if (!envelope || !action) {
      return json({ error: "invalid_argument", message: "Expected { action, payload, context }." }, 400);
    }

    const payload = objectOf(envelope.payload) ?? {};
    const sent = objectOf(envelope.context) ?? {};
    const context: RequestContext = {
      funnel: typeof sent.funnel === "string" || typeof sent.funnel === "number" ? sent.funnel : undefined,
      design: typeof sent.design === "string" || typeof sent.design === "number" ? sent.design : undefined,
      version: typeof sent.version === "string" ? sent.version : undefined,
      variant: typeof sent.variant === "string" ? sent.variant : undefined,
      project: typeof sent.project === "string" ? sent.project : undefined,
      page: objectOf(sent.page) ?? undefined,
      request,
      responseHeaders: new Headers(),
    };

    const apiCall = /^api:(\d+)$/.exec(action);
    if (apiCall) {
      if (!options.apiCall) return json({ error: "unknown_action", message: `Unknown action: ${action}` }, 400);
      return options.apiCall(Number(apiCall[1]), payload, context);
    }

    const actions = typeof options.actions === "function" ? options.actions(context) : options.actions;
    const handler = actions[action];
    if (!handler) {
      log.warn("funnel_request_unknown_action", { action });
      return json({ error: "unknown_action", message: `Unknown action: ${action}` }, 400);
    }

    try {
      const answer = await handler(payload, context);
      return json(answer, 200, context.responseHeaders);
    } catch (error) {
      if (error instanceof ActionError) {
        log.warn("funnel_request_refused", { action, status: error.status, error: error.body.error });
        return json(error.body, error.status, context.responseHeaders);
      }
      log.error("funnel_request_failed", {
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
    }
  };
}
