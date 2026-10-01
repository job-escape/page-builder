/**
 * `email.submit` — what the design's email step (`email_submit`) asks for: the
 * visitor's account on the payments platform, by their email.
 *
 * Its own action rather than `leads.create`, which a host answers from
 * whichever backend the design's project sells through — for a JobEscape
 * design that is the legacy users API. This one always asks the platform:
 * `GetOrCreateUser`, which finds the account an email already has or makes
 * one, and answers the same account for the same email every time.
 *
 * The answer is `EmailSubmitResponse` — exactly what the step parses for
 * (`runtime/email-submit`); the runtime writes its `userId` into the design's
 * system variable of that name.
 *
 * Server-only: the platform key never leaves the host.
 */
import { z } from "zod";

import { ActionError, silentLog, type ActionHandlers, type Log } from "./contract";
import { createNvsClient, type NvsConfig } from "./nvs/client";
import { readAnalyticsId, type GetOrCreateUserResponse } from "./nvs/actions";
import { toActionError } from "./nvs/errors";

export const EMAIL_SUBMIT_ACTION = "email.submit";

/*
  This end of the step's wire. The step parses with the schemas in
  `runtime/email-submit`; these are the same shapes, written again because
  `src/runtime` and the rest of the package may not import each other
  (`runtime/isolation.test`). Change one and change the other.
*/

/**
 * What the step sends: the address, spaces around it dropped, then checked —
 * and nothing beside it. A body carrying anything else is refused.
 */
const EmailSubmitPayload = z.strictObject({ email: z.string().trim().pipe(z.email()) });

/** What this answers — `EmailSubmitResponse` in `runtime/email-submit`. */
export type EmailSubmitResponse = {
  /** The account's id on the payments platform — the system variable `userId`. */
  userId: string;
  /** True when this email had no account until now. */
  created: boolean;
  /** int64 as a string; absent from platform builds that predate it. */
  analyticsId?: string;
};

/** The account for a `{ email }` body — or an `ActionError` saying why not. */
function emailSubmit(config: NvsConfig, log: Log): (payload: unknown) => Promise<EmailSubmitResponse> {
  const rpc = createNvsClient({ ...config, log });

  return async (payload) => {
    // The same check the step makes before it asks, made again here.
    const checked = EmailSubmitPayload.safeParse(payload);
    if (!checked.success) {
      throw new ActionError(400, { error: "invalid_argument", message: "A valid email is required." });
    }
    const { email } = checked.data;
    try {
      const result = await rpc<GetOrCreateUserResponse>("/auth.v1.ServiceAccountService/GetOrCreateUser", {
        email,
      });
      const analyticsId = readAnalyticsId(result.analyticsId);
      if (!analyticsId) log.warn("user_analytics_id_missing", { userId: result.userId });
      log.info("email_submitted", { userId: result.userId, created: result.created === true });
      return {
        userId: result.userId,
        created: result.created === true,
        ...(analyticsId ? { analyticsId } : {}),
      };
    } catch (error) {
      return toActionError(error);
    }
  };
}

/**
 * Handlers answering `email.submit` on a host's shared request route — for a
 * host that has not given the step a route of its own (`createEmailSubmitRoute`).
 */
export function emailSubmitHandlers(config: NvsConfig, log: Log = config.log ?? silentLog): ActionHandlers {
  const answer = emailSubmit(config, log);
  return { [EMAIL_SUBMIT_ACTION]: (payload) => answer(payload) };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The email step's own route: a `POST` whose body is `{ "email": "…" }` and
 * nothing else, answered with `EmailSubmitResponse` — or a refusal's
 * `{ error, message }` under its status.
 *
 *     // app/api/user/email/route.ts
 *     export const POST = createEmailSubmitRoute(nvsConfig, logger);
 *
 * The page sends there once told where it is:
 * `configureRequests({ routes: { "email.submit": "/api/user/email" } })`.
 */
export function createEmailSubmitRoute(
  config: NvsConfig,
  log: Log = config.log ?? silentLog,
): (request: Request) => Promise<Response> {
  const answer = emailSubmit(config, log);

  return async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    try {
      return json(await answer(body));
    } catch (error) {
      if (error instanceof ActionError) {
        log.warn("email_submit_refused", { status: error.status, error: error.body.error });
        return json(error.body, error.status);
      }
      log.error("email_submit_failed", { error: error instanceof Error ? error.message : String(error) });
      return json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
    }
  };
}
