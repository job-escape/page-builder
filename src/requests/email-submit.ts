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
 * What it is sent, answers and refuses with is `runtime/email-submit` — the
 * schemas the step parses with; the runtime writes the answer's `userId` into
 * the design's system variable of that name.
 *
 * Server-only: the platform key never leaves the host.
 */
import {
  EMAIL_SUBMIT_ACTION,
  EmailSubmitPayload,
  type EmailSubmitResponse,
} from "../runtime/email-submit";

import { ActionError, silentLog, type ActionHandlers, type Log } from "./contract";
import { createNvsClient, type NvsConfig } from "./nvs/client";
import { readAnalyticsId, type GetOrCreateUserResponse } from "./nvs/actions";
import { toActionError } from "./nvs/errors";

export { EMAIL_SUBMIT_ACTION };

/** Handlers answering `email.submit`, to spread into a host's request route. */
export function emailSubmitHandlers(config: NvsConfig, log: Log = config.log ?? silentLog): ActionHandlers {
  const rpc = createNvsClient({ ...config, log });

  return {
    [EMAIL_SUBMIT_ACTION]: async (payload) => {
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
        const answer: EmailSubmitResponse = {
          userId: result.userId,
          created: result.created === true,
          ...(analyticsId ? { analyticsId } : {}),
        };
        return answer;
      } catch (error) {
        return toActionError(error);
      }
    },
  };
}
