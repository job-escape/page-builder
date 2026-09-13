/**
 * The NVS payments platform, over Connect-RPC JSON — one wrapper for every call.
 *
 * Ported from `sart-funnel`'s `shared/api/server/nvs-client.ts`, which is the
 * newer of the two copies (funnel's still blind-retries a 429). The rules are
 * the platform's contract and are kept exactly:
 *
 * - always `POST`, JSON body, `Authorization: Bearer <key>` and `X-Project-Id`;
 * - `internal` / `unavailable` retried twice with a growing backoff, and one
 *   retry of a sporadic `unauthenticated`;
 * - `resource_exhausted` (429) retried **only** when `Retry-After` says when and
 *   the wait fits inside a visitor's request — never on a blind backoff, which
 *   drains a bucket that is already empty;
 * - the error envelope becomes an `NvsApiError`, carrying the platform's
 *   `reason` / `category` enum when it sends one.
 *
 * What changed is only where the configuration and the logger come from: the
 * host passes them in, so the package reads no environment of its own.
 */
import { silentLog, type Log } from "../contract";

export type NvsConfig = {
  /** `NVS_API_BASE_URL` — the hub, without a trailing slash. */
  baseUrl: string;
  /** `NVS_API_KEY`. */
  apiKey: string;
  /** `NVS_PROJECT_ID`. */
  projectId: string;
  log?: Log;
  /** Injected in tests. */
  fetch?: typeof fetch;
  /** Injected in tests, so a retry does not really wait. */
  sleep?: (ms: number) => Promise<void>;
};

export type KnownNvsErrorCode =
  | "unauthenticated"
  | "permission_denied"
  | "invalid_argument"
  | "failed_precondition"
  | "not_found"
  | "resource_exhausted"
  | "internal"
  | "unavailable";

export interface NvsErrorDetail {
  type?: string;
  value?: string;
  debug?: { reason?: string; category?: string };
}

export interface NvsErrorEnvelope {
  code: KnownNvsErrorCode | (string & NonNullable<unknown>);
  message: string;
  details?: NvsErrorDetail[];
}

export const PAYMENT_ERROR_DETAIL_TYPE = "payments.v1.ErrorDetail";

/** Connect sends the bare proto type name; a google.rpc encoder prefixes it. */
const paymentErrorDetail = (details?: NvsErrorDetail[]) =>
  details?.find((detail) => detail.type?.endsWith(PAYMENT_ERROR_DETAIL_TYPE))?.debug;

export class NvsApiError extends Error {
  readonly code: string;

  readonly httpStatus: number;

  /** Stable enum for *why* the platform refused; absent on legacy paths. */
  readonly reason?: string;

  /** The reason's family — what to do when the reason itself is unknown. */
  readonly category?: string;

  constructor(envelope: NvsErrorEnvelope, httpStatus: number) {
    super(envelope.message);
    this.name = "NvsApiError";
    this.code = envelope.code;
    this.httpStatus = httpStatus;
    const detail = paymentErrorDetail(envelope.details);
    this.reason = detail?.reason;
    this.category = detail?.category;
  }
}

const RETRYABLE_CODES = new Set(["internal", "unavailable"]);
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
/** Ceiling on honouring `Retry-After` inside a visitor's request. */
const MAX_RETRY_AFTER_MS = 5000;

const backoffMs = (attempt: number) => BASE_BACKOFF_MS * (attempt + 1);

function headerNumber(response: Response, name: string): number | undefined {
  const raw = response.headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110). */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(header);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

/** Credentials inside platform payloads — never written to a log. Both spellings. */
const NVS_SECRET_KEYS = new Set([
  "initPayload",
  "init_payload",
  "clientToken",
  "client_token",
  "tokens",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
]);

/** A payload's shape for a log line: keys kept, secrets and personal values redacted. */
function describe(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 5).map(describe);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      NVS_SECRET_KEYS.has(key) || /email/i.test(key) ? "[redacted]" : describe(entry),
    ]),
  );
}

export type NvsRpc = <TResponse>(procedure: string, body: Record<string, unknown>) => Promise<TResponse>;

export function createNvsClient(config: NvsConfig): NvsRpc {
  const log = config.log ?? silentLog;
  const doFetch = config.fetch ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async function nvsRpc<TResponse>(procedure: string, body: Record<string, unknown>): Promise<TResponse> {
    const url = `${config.baseUrl}${procedure}`;

    for (let attempt = 0; ; attempt += 1) {
      const startedAt = Date.now();
      let response: Response;
      try {
        // eslint-disable-next-line no-await-in-loop
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            "X-Project-Id": config.projectId,
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(backoffMs(attempt));
          continue;
        }
        log.error("nvs_rpc_network_error", {
          procedure,
          request: describe(body),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (response.ok) {
        // eslint-disable-next-line no-await-in-loop
        const data = (await response.json()) as TResponse;
        log.info("nvs_rpc", {
          procedure,
          status: response.status,
          request: describe(body),
          response: describe(data),
          durationMs: Date.now() - startedAt,
        });
        return data;
      }

      let envelope: NvsErrorEnvelope;
      try {
        // eslint-disable-next-line no-await-in-loop
        envelope = (await response.json()) as NvsErrorEnvelope;
      } catch {
        envelope = { code: "internal", message: `HTTP ${response.status}` };
      }

      const rateLimited = envelope.code === "resource_exhausted";
      const retryAfter = rateLimited ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
      const retryAfterTooLong = retryAfter !== undefined && retryAfter > MAX_RETRY_AFTER_MS;
      const retryable = rateLimited
        ? retryAfter !== undefined && !retryAfterTooLong
        : RETRYABLE_CODES.has(envelope.code) || (envelope.code === "unauthenticated" && attempt === 0);
      const willRetry = retryable && attempt < MAX_RETRIES;

      const detail = paymentErrorDetail(envelope.details);
      log.error("nvs_rpc_error", {
        procedure,
        status: response.status,
        code: envelope.code,
        message: envelope.message,
        request: describe(body),
        response: describe(envelope),
        reason: detail?.reason,
        category: detail?.category,
        attempt,
        willRetry,
        retryAfterMs: retryAfter,
        ...(rateLimited
          ? {
              rateLimitPerMinute: headerNumber(response, "x-ratelimit-limit"),
              rateLimitRemaining: headerNumber(response, "x-ratelimit-remaining"),
              rateLimitResetAt: headerNumber(response, "x-ratelimit-reset"),
            }
          : {}),
      });

      if (willRetry) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(retryAfter ?? backoffMs(attempt));
        continue;
      }

      throw new NvsApiError(envelope, response.status);
    }
  };
}
