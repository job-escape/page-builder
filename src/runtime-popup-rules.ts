/**
 * `@job-escape/page-builder/popup-rules` — popups authored in console, shown by
 * a host when its own analytics say so. **Beta.**
 *
 * Everything a host needs except drawing: the rule types console serves, their
 * evaluation, the queue (`createPopupRules`), what it remembers
 * (`createPopupMemory`, over storage the host provides), the fetch, and the
 * design a popup opens as a `<Funnel>` manifest. The webapp draws it with
 * `runtime-client`, the mobile app with `runtime-native` — one implementation
 * of *when* a popup opens, where there used to be one per app.
 *
 * React appears only in `popupHostScreen`, the invisible screen a popup opens
 * over; no DOM and no native element, so both platforms import this entry.
 */
export type {
  EventFilter,
  FilterValue,
  HeardEvent,
  PopupRule,
  PopupRulesResponse,
  RuleCondition,
  RuleGroup,
  RuleNode,
  RuleSubject,
  SubscriptionRecord,
  VisitorFacts,
} from "./runtime/popup-rules/types";

export {
  allMatches,
  conditionState,
  evaluateNode,
  firstMatch,
  ruleHolds,
} from "./runtime/popup-rules/evaluate";

export { subscriptionFacts } from "./runtime/popup-rules/subscription-facts";

export type { PopupMemory, PopupStore } from "./runtime/popup-rules/memory";
export { createPopupMemory, memoryStore } from "./runtime/popup-rules/memory";

export type { PopupRulesController } from "./runtime/popup-rules/controller";
export { createPopupRules } from "./runtime/popup-rules/controller";

export { fetchPopupRules } from "./runtime/popup-rules/fetch";

export type { LoadedPopup, PopupManifest } from "./runtime/popup-rules/design";
export {
  POPUP_HOST_SCREEN,
  loadPopupDesign,
  popupEventProps,
  popupFunnelManifest,
  popupHostScreen,
} from "./runtime/popup-rules/design";
