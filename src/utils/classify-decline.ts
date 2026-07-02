// Classify a raw processor decline (`decline_message`, plus payment method for
// the empty-message PayPal case) into one of a fixed set of internal categories.
//
// Rules come from the "Matching Rules" sheet of the Decline-Reason Popups spec.
// Processor messages are not standardized (200+ distinct strings), so we strip
// the numeric prefix ("51 : ") and walk ordered case-insensitive substring rules
// — first match wins; anything unmatched falls back to GENERIC_BANK_DECLINE.
// Order matters (e.g. CVV checks run before the generic security match), and
// `classify-decline.test.ts` reproduces the spec's "Message Mapping" sheet 1:1.
//
// Both Primer and Solidgate proxy the same Visa/Mastercard codes, so one text
// classifier covers both. Primer may also send its unified SNAKE_CASE codes
// (https://primer.io/docs/concepts/decline-codes); most match the text needles,
// and the few that differ only by an underscore have an explicit needle below.

export const DECLINE_CATEGORIES = [
  "INSUFFICIENT_FUNDS_OR_LIMIT",
  "BANK_SECURITY_BLOCK",
  "GENERIC_BANK_DECLINE",
  "CARD_RESTRICTED_OR_INACTIVE",
  "NO_MESSAGE_PAYPAL",
  "INVALID_CVV",
  "INVALID_CARD_DETAILS",
  "EXPIRED_OR_OUTDATED_CARD",
  "UNSUPPORTED_CARD_TYPE",
  "AUTHENTICATION_FAILED",
  "TECHNICAL_ERROR",
] as const;

export type DeclineCategory = (typeof DECLINE_CATEGORIES)[number];

const FALLBACK_CATEGORY: DeclineCategory = "GENERIC_BANK_DECLINE";

// Rule 2 (NO_MESSAGE) is keyed on the payment method, not text — PayPal
// declines arrive with an empty decline_message. We match PayPal loosely
// (e.g. "paypal", "paypal-vault") so the channel naming stays flexible.
const isPaypalMethod = (method: string | null | undefined): boolean =>
  typeof method === "string" && method.toLowerCase().includes("paypal");

// Rule 1: strip a leading processor code such as "51 : ", "N7 : ", "5C : ".
const stripCodePrefix = (message: string): string =>
  message.replace(/^[0-9A-Za-z]{1,3}\s*:\s*/, "");

// Rules 3-12, in order. First substring hit wins. All needles are lowercase;
// the haystack is lowercased before matching.
const ORDERED_RULES: { category: DeclineCategory; needles: string[] }[] = [
  {
    category: "INSUFFICIENT_FUNDS_OR_LIMIT",
    needles: [
      "insufficient", // also matches Primer INSUFFICIENT_FUNDS
      "over credit limit",
      "exceeds withdrawal",
      "amount limit",
      "withdrawal frequency",
      "withdrawal_limit", // Primer WITHDRAWAL_LIMIT_EXCEEDED
      // "Allowable PIN Tries Exceeded" → funds/limit, but
      // "Allowable number of PIN tries exceeded" → security; the narrower
      // needle lets only the former match here and drops the latter to the
      // security rule below (which matches on bare "pin").
      "allowable pin tries",
    ],
  },
  {
    category: "INVALID_CVV",
    needles: [
      "cvv",
      "cvc",
      "cid",
      "security code",
      "card validation",
      "verification data",
      "cvx",
      // "Cardholder ID verification failed" → CVV. Kept narrow so the 3DS
      // "...verification failed" strings still fall through to AUTHENTICATION.
      "id verification",
    ],
  },
  {
    category: "EXPIRED_OR_OUTDATED_CARD",
    needles: [
      "expired card",
      "expired_card", // Primer EXPIRED_CARD
      "expiration date",
    ],
  },
  {
    category: "INVALID_CARD_DETAILS",
    needles: [
      "invalid card",
      "invalid_card", // Primer INVALID_CARD_NUMBER
      "invalid cardnumber",
      "invalid data",
      "no such issuer",
      "invalid issuer",
      "format error",
      "invalid amount",
      "no card record",
      "no account",
      "no credit account",
      "nonexistent account",
      "decline list", // "Decline list - Card number" — before the bare "decline" generic rule
    ],
  },
  {
    category: "BANK_SECURITY_BLOCK",
    needles: [
      "fraud",
      "suspected",
      "security",
      "stolen",
      "lost card",
      "pick up",
      "pickup card", // "Pickup card, special condition" (no space variant)
      "capture card",
      "antifraud",
      "risk decline",
      "pin",
    ],
  },
  {
    category: "GENERIC_BANK_DECLINE",
    needles: [
      "do not honor",
      "do not honour",
      "deny",
      "decline", // bare "decline"
      "policy",
      "contact card issuer",
      "blocked by cardholder",
      "stop payment",
      "declined by issuer",
      "call your bank",
      "life cycle",
      "lifecycle",
    ],
  },
  {
    category: "CARD_RESTRICTED_OR_INACTIVE",
    needles: [
      "not permitted",
      "not supported",
      "blocked by issuer",
      "restricted card",
      "violation of law",
      "blocked, first use",
      "inactive",
      "not yet activated",
      "closed",
      "invalid merchant",
      "mcc combination",
    ],
  },
  {
    category: "AUTHENTICATION_FAILED",
    needles: ["3d", "authentication"],
  },
  {
    category: "UNSUPPORTED_CARD_TYPE",
    needles: [
      "acquirer account",
      "scheme_not_configured",
      "invalid variant",
      "no security model",
      "subscription error",
      "scheme compliance",
      "unsupported cardtype",
    ],
  },
  {
    category: "TECHNICAL_ERROR",
    needles: [
      "system malfunction",
      "issuer unavailable",
      "temporarily_unavailable", // Primer ISSUER_TEMPORARILY_UNAVAILABLE
      "switch",
      "re-enter",
      "cannot be completed",
      "cryptographic",
      "invalid transaction",
      "invalid 3ds flow",
      "timed out",
    ],
  },
];

/**
 * Classify a raw processor decline into an internal category usable by funnel
 * conditions. Pure function — same inputs always yield the same category.
 *
 * @param message Raw `decline_message` from Primer/Solidgate (may be empty).
 * @param method  Payment method (e.g. "card", "paypal-vault", "applepay").
 *                Only consulted for the empty-message PayPal special case.
 */
export const classifyDecline = ({
  message,
  method,
}: {
  message?: string | null;
  method?: string | null;
}): DeclineCategory => {
  const trimmed = (message ?? "").trim();

  // Rule 2: empty message + PayPal → its own category.
  if (trimmed === "" && isPaypalMethod(method)) {
    return "NO_MESSAGE_PAYPAL";
  }

  if (trimmed === "") {
    return FALLBACK_CATEGORY;
  }

  // Rule 1: strip the numeric/alnum prefix before matching.
  const haystack = stripCodePrefix(trimmed).toLowerCase();

  for (const rule of ORDERED_RULES) {
    if (rule.needles.some((needle) => haystack.includes(needle))) {
      return rule.category;
    }
  }

  // Rule 13: fallback.
  return FALLBACK_CATEGORY;
};
