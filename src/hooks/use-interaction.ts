import { useUnit } from "effector-react";
import { v4 as uuidv4 } from "uuid";

import { useLogger } from "next-axiom";

import { useRef } from "react";

import { slideNext, slidePrev, slideTo } from "../model/swiper-store";
import { useInteractionAnalytics } from "../providers/interaction-analytics-context";
import { useInteractionOptions } from "../providers/interaction-options-context";
import { usePixelAdapter } from "../providers/pixel-context";
import { useTagManagerAdapter } from "../providers/tag-manager-context";
import {
  Answers,
  ConditionalAction,
  GtmPushAction,
  LogicAction,
  LogicValue,
  MapLocalStateAction,
  PixelTrackAction,
  PrimitiveValue,
  RequestConfig,
  RequestEnv,
  RequestLifecycleAction,
  RequestStatus,
  WriteResponseDataAction,
} from "../types";
import { applyValueTransforms } from "../utils/apply-value-transforms";
import { buildConditionFacts } from "../utils/build-condition-facts";
import { buildRequestBodyObject } from "../utils/build-request-body-object";
import { evaluateConditionalAction } from "../utils/evaluate-conditional-action";
import { resolveValuePicker } from "../utils/resolve-value-picker";
import { tryParse } from "../utils/try-parse";

import { useBuilderModel } from "./use-builder-model";
import { useLocalModel } from "./use-local-model";
import { useNavigation } from "./use-navigation";
import { usePage } from "./use-page";

// ─── Per-action option types ──────────────────────────────────────────────────

export interface WriteUserDataOptions {
  getValue: (factName: string) => PrimitiveValue | undefined;
}

export interface OpenDialogOptions {
  getDialogId?: (dialogId: string) => string;
}

export interface SetSelectedSubscriptionOptions {
  resolve: (params: {
    mode: "by_id" | "next_bigger";
    subscriptionId?: string;
    selectionType?: "standard" | "chase" | "super_chase";
  }) => void;
}

export interface InteractionOptions {
  write_user_data?: WriteUserDataOptions;
  open_dialog?: OpenDialogOptions;
  set_selected_subscription?: SetSelectedSubscriptionOptions;
}

interface ActionContext {
  triggerPayload?: unknown;
}

const getFactKey = (fact: string, factDataType?: string): string =>
  factDataType ? `${factDataType}-${fact}` : fact;

const getActionDataType = (source?: string, valueDataType?: string): string | undefined => {
  if (valueDataType) {
    return valueDataType;
  }

  if (source === "trigger") {
    return "trigger";
  }

  if (source === "date_now" || source === "date.now()") {
    return source;
  }

  return undefined;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function injectResponseData<T extends { params: { __responseData?: string } }>(
  action: T,
  responseData: any,
): T {
  return {
    ...action,
    params: {
      ...action.params,
      __responseData: JSON.stringify(responseData ?? null),
    },
  };
}

function wait(delay: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

const BASE_URLS: Record<RequestEnv, string> = {
  users: process.env.NEXT_PUBLIC_API_URL ?? "",
  funnel: process.env.NEXT_PUBLIC_FUNNEL_API_URL ?? "",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useInteraction = () => {
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const page = usePage();
  const interactionAnalytics = useInteractionAnalytics();
  const pixel = usePixelAdapter();
  const tagManager = useTagManagerAdapter();
  const logger = useLogger().with({ page_id: page.id });
  const { next, prev } = useNavigation();
  const { setActiveDialog, dialogs, setAnswers, answers, setLocalState, localStates } = useUnit({
    setActiveDialog: model.setActiveDialogEvt,
    dialogs: model.$dialogs,
    setAnswers: model.setAnswerEvt,
    answers: model.$answers,
    setLocalState: localModel.setLocalStateEvt,
    localStates: localModel.$localStates,
  });
  const screenIndex = useUnit(model.$screenIndex);
  const ambientOptions = useInteractionOptions();
  const answersRef = useRef(answers);
  const localStatesRef = useRef(localStates);

  answersRef.current = answers;
  localStatesRef.current = localStates;

  const createInteraction = (callerOptions?: InteractionOptions) => {
    const options: InteractionOptions = {
      ...(ambientOptions ?? {}),
      ...(callerOptions ?? {}),
    };
    let localUser: Record<string, PrimitiveValue | string[]> = {};
    let runtimeAnswers: Record<string, PrimitiveValue | string[]> = {
      ...(answersRef.current ?? {}),
    };
    let runtimeLocalStates: Record<string, PrimitiveValue | string[]> = {
      ...(localStatesRef.current ?? {}),
    };
    let isInteractionPending = false;
    const pendingTimeoutActions = new Set<Promise<void>>();

    const getRuntimeFacts = (): Answers => buildConditionFacts(runtimeAnswers, runtimeLocalStates);
    const getAnalyticsContext = () => ({
      answers: runtimeAnswers,
      localStates: runtimeLocalStates,
      page,
      screenIndex,
    });

    // ── async so http_request can await fetch ─────────────────────────────────
    const runAction = async (action: LogicAction, context?: ActionContext): Promise<void> => {
      switch (action.type) {
        case "write_local_state": {
          const { fact, factName, source, value, valueDataType, valueTransforms } = action.params;
          const key = fact ?? factName;
          if (key === undefined) {
            logger.warn("write_local_state action missing key", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              source,
            });
            break;
          }

          const resolvedDataType = getActionDataType(source, valueDataType);
          const resolvedValue =
            source === "uuid_v4" || valueDataType === "uuid_v4"
              ? uuidv4()
              : (resolveValuePicker({
                  value,
                  dataType: resolvedDataType,
                  answers: runtimeAnswers,
                  localStates: runtimeLocalStates,
                  triggerPayload: context?.triggerPayload,
                }) ?? (resolvedDataType === undefined ? value : undefined));
          const nextValue = applyValueTransforms(resolvedValue, valueTransforms);

          if (nextValue === undefined) {
            logger.warn("write_local_state action missing value", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              key,
              source,
            });
            break;
          }

          if (key !== undefined && nextValue !== null && nextValue !== undefined) {
            runtimeLocalStates = { ...runtimeLocalStates, [key]: nextValue };
            setLocalState({ key, value: nextValue });
          }
          break;
        }

        case "map_local_state": {
          const { factName, path, __responseData } = action.params;
          if (!factName || !path) break;

          const responseData = tryParse(__responseData ?? "null");
          const value = getNestedValue(responseData, path);

          if (value !== undefined) {
            const stringValue = String(value);
            runtimeLocalStates = { ...runtimeLocalStates, [factName]: stringValue };
            setLocalState({ key: factName, value: stringValue });
          }
          break;
        }

        case "write_response_data": {
          const { factName, path, factDataType, __responseData } = action.params;
          if (!factName || !path) break;

          const responseData = tryParse(__responseData ?? "null");
          const value = getNestedValue(responseData, path);
          if (value !== undefined) {
            const key = getFactKey(factName, factDataType);
            localUser = { ...localUser, [key]: value };
            runtimeAnswers = { ...runtimeAnswers, [key as keyof Answers]: value };

            setAnswers({ key, value });
          }
          break;
        }

        case "go_to_link": {
          const { link } = action.params;
          if (!link) {
            logger.warn("go_to_link action missing link", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });

            break;
          }

          window.location.href = link;

          break;
        }

        case "write_user_data": {
          const { fact, factDataType, source, value, valueDataType, valueTransforms } =
            action.params;
          logger.info("write_user_data action triggered", {
            action_type: action.type,
            fact,
            source,
          });
          if (!fact) {
            logger.warn("write_user_data action missing fact", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          const key = getFactKey(fact, factDataType);
          const resolvedDataType = getActionDataType(source, valueDataType);

          const resolvedValue = applyValueTransforms(
            resolveValuePicker({
              value,
              dataType: resolvedDataType,
              answers: runtimeAnswers,
              localStates: runtimeLocalStates,
              triggerPayload: context?.triggerPayload,
            }) ??
              (resolvedDataType === undefined
                ? options?.write_user_data?.getValue(key)
                : undefined),
            valueTransforms,
          );

          if (resolvedValue !== undefined) {
            localUser = { ...localUser, [key]: resolvedValue };
            runtimeAnswers = { ...runtimeAnswers, [key as keyof Answers]: resolvedValue };
            setAnswers({ key, value: resolvedValue });
          }
          break;
        }

        case "open_dialog": {
          const rawId = action.params.dialogId;
          const dialogId = options?.open_dialog?.getDialogId?.(rawId) ?? rawId;
          const dialog = dialogs?.find((d) => d.uuid === dialogId);
          if (dialog) {
            setActiveDialog(dialog.uuid);
          } else {
            logger.warn("open_dialog target dialog not found", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              available_dialog_ids: dialogs?.map((d) => d.uuid) ?? [],
              dialog_id: dialogId,
            });
          }
          break;
        }

        case "close_dialog": {
          setActiveDialog(null);
          break;
        }

        case "scroll_to": {
          if (typeof window === "undefined" || typeof document === "undefined") {
            break;
          }

          const { targetId, containerId, block, behavior, behaviour, inline } = action.params;
          const elementId = containerId ?? targetId;

          if (!elementId) {
            logger.warn("scroll_to action missing target id", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          const element = document.getElementById(elementId);
          if (!element) {
            logger.warn("scroll_to target element not found", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              element_id: elementId,
            });
            break;
          }

          element.scrollIntoView({
            block,
            behavior: behaviour ?? behavior,
            inline,
          });
          break;
        }

        case "http_request": {
          const requestConfig = tryParse<RequestConfig>(action.params.request);
          if (!requestConfig) {
            logger.error("http_request action config is invalid", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              raw_request: action.params.request,
            });
            break;
          }

          const fullUrl = `${BASE_URLS[requestConfig.env] ?? ""}${requestConfig.url}`;
          logger.info("http_request action started", {
            action_type: action.type,
            action_params: action.params,
            answers: runtimeAnswers,
            local_states: runtimeLocalStates,
            url: fullUrl,
            method: requestConfig.method,
            env: requestConfig.env,
            request_url: requestConfig.url,
            request_headers_count: requestConfig.headers.length,
            lifecycle_actions_count: requestConfig.lifecycleActions.length,
          });

          // ── Headers ────────────────────────────────────────────────────────
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          for (const h of requestConfig.headers) {
            if (h.key && h.value) headers[h.key] = h.value;
          }

          // ── Body ───────────────────────────────────────────────────────────
          const bodyObject = buildRequestBodyObject({
            fields: tryParse(requestConfig.body) ?? [],
            answers: runtimeAnswers,
            localStates: runtimeLocalStates,
            triggerPayload: context?.triggerPayload,
          });

          // ── Pending lifecycle ──────────────────────────────────────────────
          await runLifecycle(requestConfig.lifecycleActions, "pending", runAction, context);

          // ── Fetch ──────────────────────────────────────────────────────────
          const extraHeaders = model.getHttpRequestHeaders?.() ?? {};
          try {
            const res = await fetch(fullUrl, {
              method: requestConfig.method,
              headers: {
                ...extraHeaders,
                ...headers,
              },
              body: requestConfig.method !== "GET" ? JSON.stringify(bodyObject) : undefined,
            });

            // ── Parse response body once ───────────────────────────────────
            let responseData: any = null;
            try {
              responseData = await res.json();
            } catch {
              /* non-JSON response */
            }

            // ── Match specific status first, then generic ──────────────────
            const specificKey = `${res.ok ? "success" : "error"}_${res.status}` as RequestStatus;
            const genericKey: RequestStatus = res.ok ? "success" : "error";

            const matched =
              requestConfig.lifecycleActions.find((b) => b.status === specificKey) ??
              requestConfig.lifecycleActions.find((b) => b.status === genericKey);

            logger[res.ok ? "info" : "warn"]("http_request action completed", {
              action_type: action.type,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              url: fullUrl,
              method: requestConfig.method,
              status: res.status,
              ok: res.ok,
              matched_lifecycle_status: matched?.status ?? null,
              response_has_body: responseData !== null,
            });

            if (matched) {
              for (const a of matched.actions) {
                if (!a.type) continue;
                const enriched =
                  a.type === "map_local_state" || a.type === "write_response_data"
                    ? injectResponseData(
                        a as MapLocalStateAction | WriteResponseDataAction,
                        responseData,
                      )
                    : (a as LogicAction);
                await runAction(enriched, context);
              }
            }
          } catch (error) {
            logger.error("http_request action failed", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              url: fullUrl,
              method: requestConfig.method,
              env: requestConfig.env,
              error,
            });
            await runLifecycle(requestConfig.lifecycleActions, "error_network", runAction, context);
          }

          break;
        }

        case "conditional": {
          const conditionalAction = action as ConditionalAction;
          const { conditions, thenActions, elseActions } = conditionalAction.params;
          const matched = await evaluateConditionalAction(conditions, getRuntimeFacts());
          const actionsToRun = matched ? thenActions : elseActions;

          await runActions(actionsToRun, context);
          break;
        }

        case "analytics": {
          const analyticsAction = action;
          const event = analyticsAction.params.event;

          if (!interactionAnalytics) {
            logger.warn("analytics action provider is missing", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              event,
            });
            break;
          }

          if (!event) {
            logger.warn("analytics action missing event name", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          const fields = (analyticsAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>((acc, field) => {
            if (!field.analyticsName) return acc;

            let resolvedValue: unknown;

            switch (field.storeType) {
              case "local":
                resolvedValue = runtimeLocalStates[field.localName];
                break;
              case "fact":
                resolvedValue = runtimeAnswers[field.localName as keyof Answers];
                break;
              case "manual":
              default:
                resolvedValue = field.localName;
                break;
            }

            acc[field.analyticsName] = resolvedValue;
            return acc;
          }, {});

          const triggerPayloadProps =
            context?.triggerPayload && typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          const props = {
            ...(interactionAnalytics.getProps?.(getAnalyticsContext()) ?? {}),
            ...triggerPayloadProps,
            ...resolvedFields,
          };

          interactionAnalytics.track(event, props);
          break;
        }

        case "set_timeout": {
          const delay = Number(action.params.delay);
          const timeoutAction = wait(Number.isFinite(delay) ? Math.max(0, delay) : 0).then(() =>
            runActions(action.params.actions, context),
          );

          pendingTimeoutActions.add(timeoutAction);
          timeoutAction.then(
            () => pendingTimeoutActions.delete(timeoutAction),
            () => pendingTimeoutActions.delete(timeoutAction),
          );
          break;
        }

        case "pixel_track": {
          const pixelTrackAction = action as PixelTrackAction;
          const { eventName, eventId, eventIdDataType } = pixelTrackAction.params;
          if (!eventName) {
            logger.warn("pixel_track action missing event name", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          const resolvedEventId = resolveValuePicker({
            value: eventId,
            dataType: eventIdDataType,
            answers: runtimeAnswers,
            localStates: runtimeLocalStates,
            triggerPayload: context?.triggerPayload,
          });

          if (eventId && eventIdDataType && !resolvedEventId) {
            logger.warn("pixel_track event id could not be resolved", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              event_name: eventName,
              event_id: eventId,
              event_id_data_type: eventIdDataType,
            });
          }

          const eventExtra = resolvedEventId ? { eventID: String(resolvedEventId) } : undefined;

          if (
            eventName === "PageView" ||
            eventName === "Lead" ||
            eventName === "InitiateCheckout" ||
            eventName === "test_inititate"
          ) {
            pixel.track({
              eventType: "track",
              eventName,
              eventExtra,
            });
            break;
          }

          pixel.track({
            eventType: "trackCustom",
            eventName,
            eventExtra,
          });
          break;
        }

        case "gtm_push": {
          const gtmPushAction = action as GtmPushAction;
          const event = gtmPushAction.params.event;

          if (!event) {
            logger.warn("gtm_push action missing event name", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          const fields = (gtmPushAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>((acc, field) => {
            if (!field.analyticsName) return acc;

            let resolvedValue: unknown;

            switch (field.storeType) {
              case "local":
                resolvedValue = runtimeLocalStates[field.localName];
                break;
              case "fact":
                resolvedValue = runtimeAnswers[field.localName as keyof Answers];
                break;
              case "manual":
              default:
                resolvedValue = field.localName;
                break;
            }

            acc[field.analyticsName] = resolvedValue;
            return acc;
          }, {});

          const triggerPayloadProps =
            context?.triggerPayload && typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          tagManager.pushEvent(event, {
            ...triggerPayloadProps,
            ...resolvedFields,
          });
          break;
        }

        // ── Swiper ────────────────────────────────────────────────────────────
        case "slide_swiper": {
          const { swiper_id: swiperId, slide_index: slideIndex } = action.params;

          if (!swiperId || slideIndex === undefined) {
            logger.warn("slide_to action missing id or index", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          const resolvedIndex = Number(slideIndex);

          if (!Number.isFinite(resolvedIndex) || resolvedIndex < 0) {
            logger.warn("slide_to action index is invalid", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
              resolved_index: resolvedIndex,
            });
            break;
          }

          slideTo({ id: swiperId, index: resolvedIndex });
          break;
        }

        case "swiper_slide_next": {
          const { swiper_id: swiperId } = action.params;

          if (!swiperId) {
            logger.warn("swiper_slide_next action missing id", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          slideNext({ id: swiperId });
          break;
        }

        case "swiper_slide_prev": {
          const { swiper_id: swiperId } = action.params;

          if (!swiperId) {
            logger.warn("swiper_slide_prev action missing id", {
              action_type: action.type,
              action_params: action.params,
              answers: runtimeAnswers,
              local_states: runtimeLocalStates,
            });
            break;
          }

          slidePrev({ id: swiperId });
          break;
        }

        case "next_page": {
          next(localUser);
          break;
        }

        case "prev_page": {
          prev();
          break;
        }

        case "set_selected_subscription": {
          const resolve = options?.set_selected_subscription?.resolve;
          if (!resolve) {
            logger.warn("set_selected_subscription action has no host resolver", {
              action_type: action.type,
              action_params: action.params,
            });
            break;
          }
          const { mode, subscriptionId, selectionType } = action.params;
          if (mode === "by_id" && !subscriptionId) {
            logger.warn("set_selected_subscription by_id missing subscriptionId", {
              action_type: action.type,
              action_params: action.params,
            });
            break;
          }
          resolve({ mode, subscriptionId, selectionType });
          break;
        }

        default:
          break;
      }
    };

    const runActions = (actions: LogicAction[], context?: ActionContext): Promise<void> =>
      actions.reduce(
        (promise, currentAction) => promise.then(() => runAction(currentAction, context)),
        Promise.resolve(),
      );

    const waitPendingTimeoutActions = async (): Promise<void> => {
      while (pendingTimeoutActions.size > 0) {
        await Promise.all(Array.from(pendingTimeoutActions));
      }
    };

    const runInteractionIfIdle = async (callback: () => Promise<void>): Promise<void> => {
      if (isInteractionPending) return;

      isInteractionPending = true;
      try {
        await callback();
        await waitPendingTimeoutActions();
      } finally {
        isInteractionPending = false;
      }
    };

    const handleAction = async (action: LogicAction, triggerPayload?: unknown): Promise<void> => {
      await runInteractionIfIdle(async () => {
        await runAction(action, { triggerPayload });
      });
    };

    const handleTrigger = async (
      trigger: string,
      logicValue: LogicValue,
      triggerPayload?: unknown,
    ): Promise<void> => {
      await runInteractionIfIdle(async () => {
        await runActions(
          logicValue.filter((rule) => rule.trigger === trigger).flatMap((rule) => rule.actions),
          { triggerPayload },
        );
      });
    };

    return { handleAction, handleTrigger };
  };

  return { createInteraction };
};

// ─── Run lifecycle block by status ────────────────────────────────────────────

async function runLifecycle(
  blocks: RequestLifecycleAction[],
  status: RequestStatus,
  handleAction: (action: LogicAction, context?: ActionContext) => Promise<void>,
  context?: ActionContext,
): Promise<void> {
  const block = blocks.find((b) => b.status === status);
  if (!block) return;
  for (const action of block.actions) {
    if (action.type) await handleAction(action as LogicAction, context);
  }
}
