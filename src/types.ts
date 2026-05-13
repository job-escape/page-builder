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

export type ConditionRuleLeaf = {
  fact: string;
  operator: string;
  value: string;
  data_type?: BuilderKeyValueShape["data_type"] | null;
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

export type PixelStandardEventName = "PageView" | "Lead" | "InitiateCheckout" | "test_inititate";
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
  | PixelCustomTrackEvent
  | PixelStandardTrackEvent
  | PixelPurchaseTrackEvent;

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

export type BuilderPage<Extra extends object = object> = BuilderPageBase & Extra;

export type BuilderDialog = {
  id: number;
  design_url: string;
  mdx_url: string;
  type: string;
  uuid: string;
  html: string | null;
  force_mount?: boolean;
};

export type ComponentRegistryProps = { domNode: Element; config: HTMLReactParserOptions };
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
    factDataType?: string;
    __responseData?: string;
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

export interface OpenUrlAction {
  id: string;
  type: "open_url";
  params: {
    url: string;
  };
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
    link: string;
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
  any?: Array<{ fact: string; operator: string; value: string; data_type: string | null }>;
  all?: Array<{ fact: string; operator: string; value: string; data_type: string | null }>;
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
  | NextPageAction
  | PrevPageAction
  | OpenDialogAction
  | CloseDialogAction
  | HttpRequestAction
  | PlayAnimationAction
  | ScrollToAction
  | OpenUrlAction
  | SubmitFormAction
  | AnalyticsAction
  | SetTimeoutAction
  | GoToLink
  | PixelTrackAction
  | GtmPushAction
  | TiktokPushAction
  | AxonPushAction
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

export type ParamsOf<T extends LogicActionType> = Extract<LogicAction, { type: T }>["params"];

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
