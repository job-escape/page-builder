import { Element, HTMLReactParserOptions } from "html-react-parser";

import { FC } from "react";

export type BuilderKeyValueShape = {
  id: number;
  is_active: boolean;
  name: string;
  data_type: string;
};

export type BuilderKeyValue = {
  data_type: BuilderKeyValueShape["data_type"];
  name: BuilderKeyValueShape["name"];
};

export type ConditionValueType = "string" | "number" | "boolean";

export type ConditionRuleLeaf = {
  fact: string;
  operator: string;
  value: string;
  data_type?: BuilderKeyValueShape["data_type"] | null;
  value_type?: ConditionValueType | null;
};

export type ConditionRuleGroup = {
  any?: Array<ConditionRuleLeaf | ConditionRuleGroup>;
  all?: Array<ConditionRuleLeaf | ConditionRuleGroup>;
};

export type Condition = {
  id: number;
  condition: {
    rules: ConditionRuleGroup;
    nodeId: null | number;
    isDefault?: boolean;
  }[];
};

export type NodeStateRule = {
  name: string | number | null;
  rules: Condition["condition"][number]["rules"];
};

export type NodeStatesValue = NodeStateRule[];

// ─── Pixel adapter types ──────────────────────────────────────────────────────
// Library stays decoupled from Meta Pixel / Facebook SDK; the consumer plugs in
// an adapter that receives these events via the PixelAdapterProvider.

export type PixelStandardEventName =
  "PageView" | "Lead" | "InitiateCheckout" | "test_inititate";
export type PixelPurchaseEventName = "Purchase";

export type PixelBaseEventProps = {
  eventExtra?: { eventID: string };
  eventForLogger?: unknown;
};

export type PixelCustomTrackEvent = PixelBaseEventProps & {
  eventType: "trackCustom";
  eventName: string;
  eventProps?: Record<string, string>;
};

export type PixelStandardTrackEvent = PixelBaseEventProps & {
  eventType: "track";
  eventName: PixelStandardEventName;
  eventProps?: Record<string, string>;
};

export type PixelPurchaseTrackEvent = PixelBaseEventProps & {
  eventType: "track";
  eventName: PixelPurchaseEventName;
  eventProps: {
    currency: string;
    value: number;
    [key: string]: string | number;
  };
};

export type PixelTrackEvent =
  PixelCustomTrackEvent | PixelStandardTrackEvent | PixelPurchaseTrackEvent;

export type BuilderPageBase = {
  id: number;
  design_url: string;
  mdx_url: string;
  next_node_id?: number;
  order: number;
  tree_order: number;
  condition?: Condition;
  pageId: number;
};

export type BuilderPage<Extra extends object = object> = BuilderPageBase &
  Extra;

export type BuilderDialog = {
  id: number;
  design_url: string;
  mdx_url: string;
  type: string;
  uuid: string;
  html: string | null;
  force_mount?: boolean;
};

export type ComponentRegistryProps = {
  domNode: Element;
  config: HTMLReactParserOptions;
};
export type ComponentRegisry = Record<string, FC<ComponentRegistryProps>>;
export type PrimitiveValue = string | number | boolean;
export type StoredValue = PrimitiveValue | string[];

// ─── Individual action types ──────────────────────────────────────────────────

export interface WriteUserDataAction {
  id: string;
  type: "write_user_data";
  params: {
    fact: string;
    factDataType?: string;
    source?: "manual" | "trigger" | "date_now" | "date.now()";
    value?: string;
    valueDataType?: string;
    valueTransforms?: string[];
  };
}

export interface WriteLocalStateAction {
  id: string;
  type: "write_local_state";
  params: {
    fact?: string;
    factName?: string;
    source?: "manual" | "trigger" | "uuid_v4" | "date_now" | "date.now()";
    value?: string;
    valueDataType?: string;
    valueTransforms?: string[];
  };
}

export interface MapLocalStateAction {
  id: string;
  type: "map_local_state";
  params: {
    factName: string;
    path: string;
    __responseData?: string;
  };
}

export interface WriteResponseDataAction {
  id: string;
  type: "write_response_data";
  params: {
    factName: string;
    path: string;
    // The editor's FactPicker stores the data_type under `${paramKey}DataType`,
    // i.e. `factNameDataType` here. `factDataType` is accepted as a fallback.
    factNameDataType?: string;
    factDataType?: string;
    __responseData?: string;
  };
}

export interface GbFeatureAction {
  id: string;
  type: "gb_feature";
  params: {
    featureName: string;
    // Destination key. When `factDataType` is "local" it is a local-state key,
    // otherwise it is a user-data fact name.
    fact: string;
    factDataType?: string;
  };
}

export interface NextPageAction {
  id: string;
  type: "next_page";
  params: Record<string, never>;
}

export interface PrevPageAction {
  id: string;
  type: "prev_page";
  params: Record<string, never>;
}

export interface OpenDialogAction {
  id: string;
  type: "open_dialog";
  params: {
    dialogId: string;
  };
}

export interface CloseDialogAction {
  id: string;
  type: "close_dialog";
  params: Record<string, never>;
}

export interface HttpRequestAction {
  id: string;
  type: "http_request";
  params: {
    request: string; // JSON stringified RequestConfig
  };
}

export interface PlayAnimationAction {
  id: string;
  type: "play_animation";
  params: {
    animationId: string;
  };
}

export interface ScrollToAction {
  id: string;
  type: "scroll_to";
  params: {
    targetId?: string;
    containerId?: string;
    block?: ScrollLogicalPosition;
    behavior?: ScrollBehavior;
    behaviour?: ScrollBehavior;
    inline?: ScrollLogicalPosition;
  };
}

export interface PlayVideoAction {
  id: string;
  type: "play_video";
  params: {
    targetId?: string;
    withSound?: boolean;
    restart?: boolean;
  };
}

export interface UnmuteVideoAction {
  id: string;
  type: "unmute_video";
  params: {
    targetId?: string;
  };
}

export interface OpenUrlAction {
  id: string;
  type: "open_url";
  params: {
    url: string;
  };
}

export interface OpenIntercomAction {
  id: string;
  type: "open_intercom";
  params: Record<string, never>;
}

export interface RefreshSessionAction {
  id: string;
  type: "refresh_session";
  params: Record<string, never>;
}

export interface OpenCookieBannerAction {
  id: string;
  type: "open_cookie_banner";
  params: Record<string, never>;
}

export interface SubmitFormAction {
  id: string;
  type: "submit_form";
  params: Record<string, never>;
}

export interface AnalyticsAction {
  id: string;
  type: "analytics";
  params: {
    event: string;
    fields?: {
      id: string;
      localName: string;
      analyticsName: string;
      storeType: "manual" | "local" | "fact";
    }[];
  };
}

export interface SetTimeoutAction {
  id: string;
  type: "set_timeout";
  params: {
    delay: string | number;
    actions: LogicAction[];
  };
}

export interface PixelTrackAction {
  id: string;
  type: "pixel_track";
  params: {
    eventName: string;
    eventId?: string;
    eventIdDataType?: string;
    fields?: {
      id: string;
      localName: string;
      analyticsName: string;
      storeType: "manual" | "local" | "fact";
    }[];
  };
}

export interface GtmPushAction {
  id: string;
  type: "gtm_push";
  params: {
    event: string;
    fields?: {
      id: string;
      localName: string;
      analyticsName: string;
      storeType: "manual" | "local" | "fact";
    }[];
  };
}

export interface TiktokPushAction {
  id: string;
  type: "tiktok_push";
  params: {
    event: string;
    fields?: {
      id: string;
      localName: string;
      analyticsName: string;
      storeType: "manual" | "local" | "fact";
    }[];
  };
}

export interface AxonPushAction {
  id: string;
  type: "axon_push";
  params: {
    event: string;
    fields?: {
      id: string;
      localName: string;
      analyticsName: string;
      storeType: "manual" | "local" | "fact";
    }[];
  };
}

export interface XPushAction {
  id: string;
  type: "x_push";
  params: {
    event: string;
    fields?: {
      id: string;
      localName: string;
      analyticsName: string;
      storeType: "manual" | "local" | "fact";
    }[];
  };
}

export interface SlideSwiperAction {
  id: string;
  type: "slide_swiper";
  params: {
    swiper_id: string;
    slide_index: number;
  };
}

export interface SwiperSlideNextAction {
  id: string;
  type: "swiper_slide_next";
  params: {
    swiper_id: string;
  };
}

export interface SwiperSlidePrevAction {
  id: string;
  type: "swiper_slide_prev";
  params: {
    swiper_id: string;
  };
}

export interface GoToLink {
  id: string;
  type: "go_to_link";
  params: {
    /** Literal URL (supports `${answer_key}` interpolation). */
    link?: string;
    /**
     * Named link type resolved to a concrete URL by the host (brand/legal-entity
     * specific, e.g. "privacy" / "terms" / "subscription" / "login" / "support").
     * When set it takes precedence over `link`.
     */
    linkType?: string;
  };
}

export interface SetSelectedSubscriptionAction {
  id: string;
  type: "set_selected_subscription";
  params: {
    mode: "by_id" | "next_bigger";
    subscriptionId?: string;
    selectionType?: "standard" | "chase" | "super_chase";
  };
}

export interface SpinStartAction {
  id: string;
  type: "spin_start";
  params: {
    wheel_id: string;
  };
}

export interface SlidesNextAction {
  id: string;
  type: "slides_next";
  params: {
    slides_id: string;
  };
}

export interface SlidesPrevAction {
  id: string;
  type: "slides_prev";
  params: {
    slides_id: string;
  };
}

export interface SlidesGotoAction {
  id: string;
  type: "slides_goto";
  params: {
    slides_id: string;
    slide_index: number | string;
  };
}

export type StorageFormat = {
  any?: Array<{
    fact: string;
    operator: string;
    value: string;
    data_type: string | null;
    value_type?: ConditionValueType | null;
  }>;
  all?: Array<{
    fact: string;
    operator: string;
    value: string;
    data_type: string | null;
    value_type?: ConditionValueType | null;
  }>;
};

export interface ConditionalAction {
  id: string;
  type: "conditional";
  params: {
    conditions: StorageFormat;
    thenActions: LogicAction[];
    elseActions: LogicAction[];
  };
}

// ─── Discriminated union ──────────────────────────────────────────────────────

export type LogicAction =
  | WriteUserDataAction
  | WriteLocalStateAction
  | MapLocalStateAction
  | WriteResponseDataAction
  | GbFeatureAction
  | NextPageAction
  | PrevPageAction
  | OpenDialogAction
  | CloseDialogAction
  | HttpRequestAction
  | PlayAnimationAction
  | ScrollToAction
  | PlayVideoAction
  | UnmuteVideoAction
  | OpenUrlAction
  | OpenIntercomAction
  | RefreshSessionAction
  | OpenCookieBannerAction
  | SubmitFormAction
  | AnalyticsAction
  | SetTimeoutAction
  | GoToLink
  | PixelTrackAction
  | GtmPushAction
  | TiktokPushAction
  | AxonPushAction
  | XPushAction
  | ConditionalAction
  | SlideSwiperAction
  | SwiperSlideNextAction
  | SwiperSlidePrevAction
  | SetSelectedSubscriptionAction
  | SpinStartAction
  | SlidesNextAction
  | SlidesPrevAction
  | SlidesGotoAction;

// ─── Action type string union ─────────────────────────────────────────────────

export type LogicActionType = LogicAction["type"];

// ─── Param extractor helper ───────────────────────────────────────────────────

export type ParamsOf<T extends LogicActionType> = Extract<
  LogicAction,
  { type: T }
>["params"];

export interface LogicRule {
  id: string;
  trigger: string;
  actions: LogicAction[];
}

export type LogicValue = LogicRule[];

export type Answers = Record<
  `${BuilderKeyValue["data_type"]}-${BuilderKeyValue["name"]}`,
  StoredValue | string[]
>;

export type RequestEnv = "users" | "funnel";

export const REQUEST_ENVS: { value: RequestEnv; label: string }[] = [
  { value: "users", label: "Users" },
  { value: "funnel", label: "Funnel" },
];

export interface BodyField {
  id: string;
  key: string;
  value?: string;
  valueDataType?: string;
  factName?: string;
  spreadAnswers?: boolean;
  /**
   * Send this field as a JSON array instead of a scalar.
   *
   * Multi-select answers are stored as arrays but reach a request body already
   * joined into `"a,b,c"` (see `normalizeAnswerValue`), which is what most
   * endpoints expect. An endpoint that wants a real list — e.g. DRF's
   * `ListField` — cannot read that string, so this flag splits it back on
   * commas and emits `["a","b","c"]`.
   *
   * Opt-in per field: every existing body field keeps its scalar shape.
   */
  asArray?: boolean;
}

export interface RequestHeader {
  id: string;
  key: string;
  value: string;
}

export interface ResponseMapping {
  id: string;
  path: string;
  factName: string;
}

/**
 * Normalized timing envelope for every network request the builder makes.
 * Logged to Axiom under a single `request_timing` message so latency across
 * all request kinds can be queried in one place:
 *   request_timing | summarize p95=percentile(duration_ms, 95) by kind
 */
export interface RequestTiming {
  kind: "mdx" | "page" | "pages_by_order" | "dialog" | "http_action";
  duration_ms: number;
  ok: boolean;
  page_id?: number;
  url?: string;
  status?: number;
  method?: string;
  lang?: string;
  order?: number;
  /** http_action only: utm_source from the runtime answers, for attribution. */
  utm_source?: PrimitiveValue | string[];
  /** http_action only: email from the runtime answers. */
  email?: PrimitiveValue | string[];
  /** http_action only: language from the runtime answers. */
  language?: PrimitiveValue | string[];
  /** http_action only: full window.location.href at request time. */
  href?: string;
  /** http_action only: the outbound request body that was sent. */
  request_body?: unknown;
}

export type RequestStatus =
  | "pending"
  | "success"
  | "success_200"
  | "success_201"
  | "error"
  | "error_400"
  | "error_401"
  | "error_403"
  | "error_404"
  | "error_422"
  | "error_500"
  | "error_network";

export interface RequestLifecycleAction {
  id: string;
  status: RequestStatus;
  actions: LogicAction[];
}

export interface RequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  env: RequestEnv;
  headers: RequestHeader[];
  body: string; // JSON stringified BodyField[]
  timeout: number;
  responseMappings: ResponseMapping[];
  lifecycleActions: RequestLifecycleAction[];
}

export type KeyValueDataType =
  | "funnel_data"
  | "onboarding_data"
  | "upsell_data"
  | "selling_data"
  | "unsub_data";

export interface KeyValueItem {
  id: number;
  name: string;
  is_active: boolean;
  data_type: KeyValueDataType | null;
}

export interface KeyValueResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: KeyValueItem[];
}

export interface KeyValueParams {
  data_type?: KeyValueDataType;
  is_active?: boolean;
  name?: string;
  page?: number;
}
