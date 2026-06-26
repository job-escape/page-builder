import { describe, expect, it } from "@jest/globals";

import { DeclineCategory, classifyDecline } from "./classify-decline";

// Every raw decline_message observed since January 2026, paired with its
// expected category, copied verbatim from the "Message Mapping" sheet of the
// Decline-Reason Popups spec. The classifier MUST reproduce this sheet exactly
// — these are the production strings, and rule order was tuned against them.
//
// [rawMessage, expectedCategory]. The PayPal empty-message row is handled in a
// dedicated test below because it is keyed on payment method, not text.
const MESSAGE_MAPPING: [string, DeclineCategory][] = [
  ["51 : Insufficient funds/over credit limit", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["Insufficient Funds", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["59 : Suspected fraud", "BANK_SECURITY_BLOCK"],
  ["Insufficient funds", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["Suspected Fraud", "BANK_SECURITY_BLOCK"],
  ["82 : Policy", "GENERIC_BANK_DECLINE"],
  ["05 : Do not honor", "GENERIC_BANK_DECLINE"],
  ["Policy", "GENERIC_BANK_DECLINE"],
  ["83 : Fraud/Security", "BANK_SECURITY_BLOCK"],
  ["Security", "BANK_SECURITY_BLOCK"],
  ["N7 : Decline for CVV2 failure", "INVALID_CVV"],
  ["Declined - Do Not Honour", "GENERIC_BANK_DECLINE"],
  ["Do not honor", "GENERIC_BANK_DECLINE"],
  ["Invalid CVV2 code", "INVALID_CVV"],
  ["9G : Blocked by cardholder/contact cardholder", "GENERIC_BANK_DECLINE"],
  ["amex_scheme_not_configured", "UNSUPPORTED_CARD_TYPE"],
  ["78 : Blocked, first used", "CARD_RESTRICTED_OR_INACTIVE"],
  ["5C : Transaction not supported/blocked by issuer", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Restricted Card", "CARD_RESTRICTED_OR_INACTIVE"],
  ["79 : Life cycle", "EXPIRED_OR_OUTDATED_CARD"],
  ["Decline for CVV2 Failure", "INVALID_CVV"],
  ["54 : Expired card", "EXPIRED_OR_OUTDATED_CARD"],
  ["58 : Transaction not permitted to acquirer/terminal", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Transaction not supported/blocked by issuer", "CARD_RESTRICTED_OR_INACTIVE"],
  ["63 : Security violation", "BANK_SECURITY_BLOCK"],
  [
    "Could not find an acquirer account for the provided txvariant (interac_applepay), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["82 : Negative CAM, dCVV, iCVV, CVV, or CAVV results", "INVALID_CVV"],
  ["Transaction is declined by issuer", "GENERIC_BANK_DECLINE"],
  ["Security Violation", "BANK_SECURITY_BLOCK"],
  [
    "Could not find an acquirer account for the provided txvariant (amex_applepay), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["61 : Exceeds withdrawal amount limit", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  [
    "Could not find an acquirer account for the provided txvariant (amex), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["Authentication failed", "AUTHENTICATION_FAILED"],
  ["51 : Insufficient funds", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["46 : Closed account", "CARD_RESTRICTED_OR_INACTIVE"],
  ["30 : Format error", "INVALID_CARD_DETAILS"],
  ["62 : Restricted card", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Lifecycle", "EXPIRED_OR_OUTDATED_CARD"],
  ["Invalid Card Number", "INVALID_CARD_DETAILS"],
  [
    "Blocked, first use - transaction from new cardholder, and card not properly unblocked",
    "CARD_RESTRICTED_OR_INACTIVE",
  ],
  ["Format Error", "INVALID_CARD_DETAILS"],
  ["Invalid CardNumber", "INVALID_CARD_DETAILS"],
  ["Invalid card number", "INVALID_CARD_DETAILS"],
  ["Expired Card", "EXPIRED_OR_OUTDATED_CARD"],
  ["57 : Transaction not permitted to issuer/cardholder", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Invalid expiration date", "EXPIRED_OR_OUTDATED_CARD"],
  ["13 : Invalid amount", "INVALID_CARD_DETAILS"],
  ["Blocked by cardholder/contact cardholder", "GENERIC_BANK_DECLINE"],
  ["Exceeds Withdrawal Value/Amount Limits", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["100 : Deny", "GENERIC_BANK_DECLINE"],
  ["Transaction not Permitted to Terminal", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Antifraud service", "BANK_SECURITY_BLOCK"],
  ["14 : Invalid card number", "INVALID_CARD_DETAILS"],
  ["Transaction not Permitted to Cardholder", "CARD_RESTRICTED_OR_INACTIVE"],
  ["88 : Cryptographic failure", "TECHNICAL_ERROR"],
  ["FRAUD", "BANK_SECURITY_BLOCK"],
  ["43 : Stolen card", "BANK_SECURITY_BLOCK"],
  ["Invalid 3DS flow on the bank side", "AUTHENTICATION_FAILED"],
  ["51 : Decline", "GENERIC_BANK_DECLINE"],
  ["SA : Inactive card", "CARD_RESTRICTED_OR_INACTIVE"],
  ["03 : Invalid merchant", "CARD_RESTRICTED_OR_INACTIVE"],
  ["No security model", "BANK_SECURITY_BLOCK"],
  ["96 : System malfunction", "TECHNICAL_ERROR"],
  ["Payment details are not supported for this country/ MCC combination", "CARD_RESTRICTED_OR_INACTIVE"],
  ["41 : Lost card", "BANK_SECURITY_BLOCK"],
  ["Closed User Account", "CARD_RESTRICTED_OR_INACTIVE"],
  ["3D-Secure Authentication Required", "AUTHENTICATION_FAILED"],
  ["Closed Account", "CARD_RESTRICTED_OR_INACTIVE"],
  ["72 : Account Not Yet Activated", "CARD_RESTRICTED_OR_INACTIVE"],
  ["116 : Insufficient funds", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["Invalid Transaction", "TECHNICAL_ERROR"],
  ["Subscription error", "UNSUPPORTED_CARD_TYPE"],
  ["Invalid Merchant, or Merchant is not active", "CARD_RESTRICTED_OR_INACTIVE"],
  ["19 : Re-enter transaction", "TECHNICAL_ERROR"],
  ["93 : Transaction cannot be completed; violation of law", "CARD_RESTRICTED_OR_INACTIVE"],
  ["65 : Authentication required", "AUTHENTICATION_FAILED"],
  ["Account Not Yet Activated", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Invalid amount", "INVALID_CARD_DETAILS"],
  ["No Such Issuer", "INVALID_CARD_DETAILS"],
  ["Scheme compliance", "UNSUPPORTED_CARD_TYPE"],
  ["Exceeds Withdrawal Frequency Limit", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["3D secure verification failed", "AUTHENTICATION_FAILED"],
  ["Payment amount limit excess", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["65 : Exceeds withdrawal count limit", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  ["Issuer or Switch is Inoperative", "TECHNICAL_ERROR"],
  ["Suspected fraud", "BANK_SECURITY_BLOCK"],
  ["SR : Bad CVV2", "INVALID_CVV"],
  ["Transaction Cannot be Completed", "TECHNICAL_ERROR"],
  ["Pick Up Card (No Fraud)", "BANK_SECURITY_BLOCK"],
  [
    "Could not find an acquirer account for the provided txvariant (eftpos_australia_applepay), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["62 : Restricted Card", "CARD_RESTRICTED_OR_INACTIVE"],
  ["jcb_scheme_not_configured", "UNSUPPORTED_CARD_TYPE"],
  [
    "Could not find an acquirer account for the provided txvariant (discover_applepay), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["04 : Capture card", "BANK_SECURITY_BLOCK"],
  ["15 : Invalid issuer", "INVALID_CARD_DETAILS"],
  ["discover_scheme_not_configured", "UNSUPPORTED_CARD_TYPE"],
  ["System Malfunction", "TECHNICAL_ERROR"],
  ["12 : Invalid transaction", "TECHNICAL_ERROR"],
  [
    "Could not find an acquirer account for the provided txvariant (jcbcredit), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["122 : Invalid card security code (a.k.a., CID, 4DBC, 4CSC)", "INVALID_CVV"],
  ["07 : Pickup card, special condition", "BANK_SECURITY_BLOCK"],
  ["Lost Card - Pick Up", "BANK_SECURITY_BLOCK"],
  ["R0 : Stop Payment Order", "GENERIC_BANK_DECLINE"],
  ["Allowable PIN Tries Exceeded", "INSUFFICIENT_FUNDS_OR_LIMIT"],
  [
    "89 : Card Verification Value (all CVx, iCVx, dCVx routines) validation failed (no pic",
    "INVALID_CVV",
  ],
  ["98 : Card Validation failure (CVC2/CVV2) - Trackless Transactions", "INVALID_CVV"],
  ["CVC is not the right length", "INVALID_CVV"],
  ["Risk decline - Scheme Compliance - Excessive Retries", "BANK_SECURITY_BLOCK"],
  ["Invalid variant", "UNSUPPORTED_CARD_TYPE"],
  ["Invalid transaction", "TECHNICAL_ERROR"],
  ["Decline list - Card number", "INVALID_CARD_DETAILS"],
  ["91 : Issuer unavailable or switch inoperative", "TECHNICAL_ERROR"],
  ["70 : Contact Card Issuer", "GENERIC_BANK_DECLINE"],
  ["1A : Authentication Required", "AUTHENTICATION_FAILED"],
  ["Stolen Card - Pick Up", "BANK_SECURITY_BLOCK"],
  ["75 : Allowable number of PIN tries exceeded", "BANK_SECURITY_BLOCK"],
  ["6P : Verification data failed", "INVALID_CVV"],
  [
    "Could not find an acquirer account for the provided txvariant (diners), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["Re-enter Transaction or Transaction has been expired", "TECHNICAL_ERROR"],
  ["Restricted card", "CARD_RESTRICTED_OR_INACTIVE"],
  ["100 : Do not honor (general denial)", "GENERIC_BANK_DECLINE"],
  [
    "No specified acquirer account found for 'MerchantAccount.JobescapeCOM_US' for specified acquirer 'UACQ-Unspecified' with variant 'visastandarddebit' for unit 'USD' for Action 'AUTH'.",
    "UNSUPPORTED_CARD_TYPE",
  ],
  [
    "Could not find an acquirer account for the provided txvariant (jcb_applepay), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["Read timed out", "TECHNICAL_ERROR"],
  ["56 : No Card record", "INVALID_CARD_DETAILS"],
  ["Incorrect PIN", "BANK_SECURITY_BLOCK"],
  ["Refer to Card Issuer", "GENERIC_BANK_DECLINE"],
  ["43 : Stolen card, capture", "BANK_SECURITY_BLOCK"],
  ["diners_scheme_not_configured", "UNSUPPORTED_CARD_TYPE"],
  [
    "Could not find an acquirer account for the provided txvariant (jcbdebit), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["39 : No credit account", "INVALID_CARD_DETAILS"],
  ["200 : Deny - Pick up card", "BANK_SECURITY_BLOCK"],
  ["129 : Suspected counterfeit card", "BANK_SECURITY_BLOCK"],
  ["114 : No account of type requested", "INVALID_CARD_DETAILS"],
  ["119 : Transaction not permitted to cardholder", "CARD_RESTRICTED_OR_INACTIVE"],
  ["14 : Invalid Card Number", "INVALID_CARD_DETAILS"],
  ["55 : Invalid PIN", "BANK_SECURITY_BLOCK"],
  [
    "Could not find an acquirer account for the provided txvariant (discover), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  [
    "Could not find an acquirer account for the provided txvariant (cupcredit), currency (USD), and action (AUTH).",
    "UNSUPPORTED_CARD_TYPE",
  ],
  ["Call your bank", "GENERIC_BANK_DECLINE"],
  ["Card brand is not supported", "CARD_RESTRICTED_OR_INACTIVE"],
  ["Cardholder ID verification failed", "INVALID_CVV"],
  ["78 : Invalid/nonexistent Account specified (general)", "INVALID_CARD_DETAILS"],
  ["Invalid 3DS flow on the merchant side", "AUTHENTICATION_FAILED"],
  ["General decline", "GENERIC_BANK_DECLINE"],
  ["Pick Up Card, Special Conditions", "BANK_SECURITY_BLOCK"],
  ["Lost card", "BANK_SECURITY_BLOCK"],
  ["Invalid CardNumber - PAN length mismatch.", "INVALID_CARD_DETAILS"],
  ["Invalid Data", "INVALID_CARD_DETAILS"],
  ["SG : No account on file — absolute", "INVALID_CARD_DETAILS"],
  ["Unsupported cardType: ATM Only", "UNSUPPORTED_CARD_TYPE"],
  ["cvv_invalid", "INVALID_CVV"],
  ["upi_scheme_not_configured", "UNSUPPORTED_CARD_TYPE"],
];

describe("classifyDecline", () => {
  it("reproduces the Message Mapping sheet exactly", () => {
    const mismatches = MESSAGE_MAPPING.filter(
      ([message, expected]) => classifyDecline({ message }) !== expected,
    ).map(([message, expected]) => ({
      message,
      expected,
      actual: classifyDecline({ message }),
    }));

    expect(mismatches).toEqual([]);
  });

  // Primer can surface its own unified decline codes (SNAKE_CASE) instead of /
  // alongside the network text. Both providers proxy the same network codes, so
  // the classifier must map these too. Expected categories follow our 11-bucket
  // scheme (which groups some Primer codes — e.g. DO_NOT_HONOR/DECLINED → the
  // generic bank decline bucket).
  const PRIMER_UNIFIED_CODES: [string, DeclineCategory][] = [
    ["INVALID_CARD_NUMBER", "INVALID_CARD_DETAILS"],
    ["EXPIRED_CARD", "EXPIRED_OR_OUTDATED_CARD"],
    ["LOST_OR_STOLEN_CARD", "BANK_SECURITY_BLOCK"],
    ["SUSPECTED_FRAUD", "BANK_SECURITY_BLOCK"],
    ["REFER_TO_CARD_ISSUER", "GENERIC_BANK_DECLINE"],
    ["INSUFFICIENT_FUNDS", "INSUFFICIENT_FUNDS_OR_LIMIT"],
    ["WITHDRAWAL_LIMIT_EXCEEDED", "INSUFFICIENT_FUNDS_OR_LIMIT"],
    ["ISSUER_TEMPORARILY_UNAVAILABLE", "TECHNICAL_ERROR"],
    ["AUTHENTICATION_REQUIRED", "AUTHENTICATION_FAILED"],
    ["DO_NOT_HONOR", "GENERIC_BANK_DECLINE"],
    ["DECLINED", "GENERIC_BANK_DECLINE"],
  ];

  it("maps Primer unified decline codes to the right categories", () => {
    const mismatches = PRIMER_UNIFIED_CODES.filter(
      ([code, expected]) => classifyDecline({ message: code }) !== expected,
    ).map(([code, expected]) => ({ code, expected, actual: classifyDecline({ message: code }) }));

    expect(mismatches).toEqual([]);
  });

  it("classifies an empty PayPal decline as NO_MESSAGE_PAYPAL", () => {
    expect(classifyDecline({ message: "", method: "paypal-vault" })).toBe("NO_MESSAGE_PAYPAL");
    expect(classifyDecline({ message: null, method: "paypal" })).toBe("NO_MESSAGE_PAYPAL");
  });

  it("falls back to GENERIC_BANK_DECLINE for empty non-PayPal and unknown messages", () => {
    expect(classifyDecline({ message: "", method: "card" })).toBe("GENERIC_BANK_DECLINE");
    expect(classifyDecline({ message: undefined })).toBe("GENERIC_BANK_DECLINE");
    expect(classifyDecline({ message: "something never seen before" })).toBe(
      "GENERIC_BANK_DECLINE",
    );
  });

  it("strips the numeric/alnum prefix before matching", () => {
    expect(classifyDecline({ message: "51 : Insufficient funds" })).toBe(
      "INSUFFICIENT_FUNDS_OR_LIMIT",
    );
    expect(classifyDecline({ message: "N7 : Decline for CVV2 failure" })).toBe("INVALID_CVV");
  });

  it("runs CVV checks before the generic security match", () => {
    // "Negative CAM, dCVV, iCVV, CVV, or CAVV results" contains neither a
    // security word nor 'fraud', but does contain 'cvv' — CVV rule must win.
    expect(classifyDecline({ message: "82 : Negative CAM, dCVV, iCVV, CVV, or CAVV results" })).toBe(
      "INVALID_CVV",
    );
  });
});
