// Server-safe entry: server components, types, pure utilities, model factory.
// Does not reference createContext / hooks / browser APIs.

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  BuilderPage,
  BuilderPageBase,
  BuilderDialog,
  BuilderKeyValue,
  BuilderKeyValueShape,
  ComponentRegisry,
  ComponentRegistryProps,
  LogicAction,
  LogicActionType,
  LogicRule,
  LogicValue,
  ParamsOf,
  WriteUserDataAction,
  WriteLocalStateAction,
  MapLocalStateAction,
  WriteResponseDataAction,
  NextPageAction,
  PrevPageAction,
  OpenDialogAction,
  CloseDialogAction,
  HttpRequestAction,
  PlayAnimationAction,
  ScrollToAction,
  PlayVideoAction,
  UnmuteVideoAction,
  OpenUrlAction,
  SubmitFormAction,
  AnalyticsAction,
  SetTimeoutAction,
  PixelTrackAction,
  GtmPushAction,
  SlideSwiperAction,
  SwiperSlideNextAction,
  SwiperSlidePrevAction,
  GoToLink,
  ConditionalAction,
  Answers,
  PrimitiveValue,
  StoredValue,
  RequestConfig,
  RequestEnv,
  RequestHeader,
  RequestStatus,
  RequestLifecycleAction,
  ResponseMapping,
  BodyField,
  StorageFormat,
  KeyValueDataType,
  KeyValueItem,
  KeyValueParams,
  KeyValueResponse,
  Condition,
  ConditionRuleGroup,
  ConditionRuleLeaf,
  NodeStateRule,
  NodeStatesValue,
  PixelTrackEvent,
  PixelStandardEventName,
  PixelPurchaseEventName,
  PixelBaseEventProps,
  PixelCustomTrackEvent,
  PixelStandardTrackEvent,
  PixelPurchaseTrackEvent,
} from "./types";
export { REQUEST_ENVS } from "./types";

// ─── Model factory (pure Effector; no browser APIs) ───────────────────────────
// Note: createBuilderClientModel uses effector-react's createGate which touches
// React createContext at import time, so it is NOT exported here. Import it
// from "@job-escape/page-builder/client" inside "use client" files instead.
// The BuilderClientModel type is re-exported because it is type-only.

export { default as createBuilderModel } from "./model/store";
export type { BuilderModel } from "./model/store";
export type { BuilderClientModel } from "./model/gate";
export { createLocalModel } from "./model/local-model";
export type { LocalModel } from "./model/local-model";

// ─── Server renderer (async server component) ────────────────────────────────

export { default as Builder } from "./ui/builder";

// ─── Pure utilities ──────────────────────────────────────────────────────────

export { tryParse } from "./utils/try-parse";
export { buildConditionFacts } from "./utils/build-condition-facts";
export { runCondition, getEngine } from "./utils/run-condition";
export { evaluateConditionalAction } from "./utils/evaluate-conditional-action";
export { applyValueTransforms } from "./utils/apply-value-transforms";
export type { ValueTransform } from "./utils/apply-value-transforms";
export { resolveValuePicker } from "./utils/resolve-value-picker";
export { classifyDecline, DECLINE_CATEGORIES } from "./utils/classify-decline";
export type { DeclineCategory } from "./utils/classify-decline";
export { buildRequestBodyObject } from "./utils/build-request-body-object";
export { resolveRequestBodyField } from "./utils/resolve-request-body-field";
export {
  hasRuleConditions,
  buildRuleConditions,
  createConditionEngine,
} from "./utils/condition-engine";
export { mapOperator } from "./utils/map-operator";
export {
  normalizePageHistory,
  pagePointsToPage,
  findPagePointingToPage,
  findPreviousOrderFallbackPage,
  resolvePreviousPage,
} from "./utils/previous-page";

// ─── cn helper (pure, safe on server) ────────────────────────────────────────

export { cn } from "./lib/cn";
