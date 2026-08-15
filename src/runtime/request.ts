/**
 * The one helper a compiled funnel calls to reach a backend.
 *
 * Everything else the compiler emits is raw JavaScript — real `if`s, real
 * `await`s, no interpreter. This is the deliberate exception, and the reason is
 * not convenience: a compiled module is a public file on a CDN, so it can hold
 * *no* secret and no address that implies one. It carries a **name**.
 *
 *     await request("leads.create", { email: get("email") })
 *
 * `leads.create` is resolved by the funnel's own backend, which knows the URL,
 * holds the key, and decides whether this funnel may call it. Nothing about the
 * destination survives into the artifact. Rename an endpoint, rotate a key,
 * point it at a different vendor — no funnel is recompiled and no published file
 * changes.
 *
 * The second reason is that every call needs the same three things — a timeout,
 * an error normalised into something a designer's branch can test, and a log
 * line with a stable name so a failing integration is visible. Generating those
 * forty times would be forty chances to generate them differently.
 */

export type RequestOptions = {
  /** Where named destinations are resolved. Set once by the host app. */
  endpoint?: string;
  /** Abandoned after this. A funnel that hangs has lost the visitor anyway. */
  timeoutMs?: number;
  /** Identifies the funnel to the backend, so it can authorise the call. */
  context?: Record<string, string | number>;
};

export class RequestFailed extends Error {
  readonly action: string;

  readonly status: number;

  constructor(action: string, status: number, message: string) {
    super(message);
    this.name = "RequestFailed";
    this.action = action;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT = 15_000;

let options: RequestOptions = {};

/** Configure once, at mount. The compiled module never sees any of this. */
export function configureRequests(next: RequestOptions): void {
  options = { ...options, ...next };
}

/**
 * Call a named action with a payload built from the visitor's answers.
 *
 * Resolves to whatever the backend returned, so generated code can read fields
 * off it directly. Throws `RequestFailed` — one type, always, whether the cause
 * was a timeout, a network drop or a 500 — because a designer's error branch
 * should not have to know which.
 */
export async function request(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const endpoint = options.endpoint;
  if (!endpoint) {
    throw new RequestFailed(action, 0, "This funnel has no request endpoint configured.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The name and the data, and nothing else. The backend supplies the URL,
      // the credentials and the decision about whether this is allowed.
      body: JSON.stringify({ action, payload, context: options.context ?? {} }),
      signal: controller.signal,
    });

    const text = await response.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const message =
        typeof body.error === "string" ? body.error : `The request failed (${response.status}).`;
      // Stable event name: alerting selects on it, so renaming it breaks
      // whatever is watching a funnel's integrations.
      console.error("funnel_request_failed", { action, status: response.status });
      throw new RequestFailed(action, response.status, message);
    }

    return body;
  } catch (cause) {
    if (cause instanceof RequestFailed) throw cause;

    const aborted = cause instanceof DOMException && cause.name === "AbortError";
    console.error("funnel_request_failed", { action, status: 0, aborted });
    throw new RequestFailed(
      action,
      0,
      aborted ? "That took too long. Please try again." : "Something went wrong. Please try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}
