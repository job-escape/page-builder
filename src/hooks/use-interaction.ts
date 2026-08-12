import { useUnit } from "effector-react";
import { v4 as uuidv4 } from "uuid";

import { useRef } from "react";

import { slideNext, slidePrev, slideTo } from "../model/swiper-store";
import { useLogger } from "../utils/logger";
import { useInteractionAnalytics } from "../providers/interaction-analytics-context";
import { useInteractionOptions } from "../providers/interaction-options-context";
import { useAxonPixelAdapter } from "../providers/axon-pixel-context";
import { usePixelAdapter } from "../providers/pixel-context";
import { useTagManagerAdapter } from "../providers/tag-manager-context";
import { useTiktokPixelAdapter } from "../providers/tiktok-pixel-context";
import { useXPixelAdapter } from "../providers/x-pixel-context";
import {
  Answers,
  AxonPushAction,
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
  RequestTiming,
  TiktokPushAction,
  WriteResponseDataAction,
  XPushAction,
} from "../types";
import { applyValueTransforms } from "../utils/apply-value-transforms";
import { findAuthoredElement } from "../utils/authored-element";
import { buildConditionFacts } from "../utils/build-condition-facts";
import { buildRequestBodyObject } from "../utils/build-request-body-object";
import { deepMergeAll } from "../utils/deep-merge";
import { evaluateConditionalAction } from "../utils/evaluate-conditional-action";
import { resolveValuePicker } from "../utils/resolve-value-picker";
import { setByPath } from "../utils/set-by-path";
import { tryParse } from "../utils/try-parse";

import { useBuilderModel } from "./use-builder-model";
import { useLocalModel } from "./use-local-model";
import { useNavigation } from "./use-navigation";
import { usePage } from "./use-page";

// ─── Per-action option types ──────────────────────────────────────────────────

export interface WriteUserDataOptions {
  getValue: (factName: string) => PrimitiveValue | undefined;
}

export interface GbFeatureOptions {
  // Resolve a GrowthBook feature value by name. Lives in the host app because
  // page-builder is GrowthBook-agnostic (same pattern as write_user_data).
  getFeatureValue: (
    featureName: string,
  ) => PrimitiveValue | string[] | undefined;
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

export interface SpinStartOptions {
  startSpin: (params: { wheelId: string }) => void;
}

export interface SlidesOptions {
  next: (params: { id: string }) => void;
  prev: (params: { id: string }) => void;
  goto: (params: { id: string; index: number }) => void;
}

export interface OpenIntercomOptions {
  open: () => void;
}

export interface GoToLinkOptions {
  // Resolve a named link type (e.g. "privacy" / "terms" / "subscription" /
  // "login" / "support") to a concrete URL. Lives in the host because the URL
  // set is legal-entity/brand-specific (page-builder stays host-agnostic). When
  // the action carries a plain `link`, this is not used.
  resolveLink?: (linkType: string) => string | undefined;
}

export interface OpenCookieBannerOptions {
  // Host-provided consent re-open. When present it fully replaces the built-in
  // Cookiebot.renew() so the host can branch (e.g. landing-CBID opens its own
  // modal instead of Cookiebot). Absent → the built-in renew runs.
  open?: () => void;
}

export interface RefreshSessionOptions {
  refresh: () => Promise<void> | void;
}

export interface InteractionOptions {
  write_user_data?: WriteUserDataOptions;
  gb_feature?: GbFeatureOptions;
  open_dialog?: OpenDialogOptions;
  open_intercom?: OpenIntercomOptions;
  go_to_link?: GoToLinkOptions;
  open_cookie_banner?: OpenCookieBannerOptions;
  refresh_session?: RefreshSessionOptions;
  set_selected_subscription?: SetSelectedSubscriptionOptions;
  spin_start?: SpinStartOptions;
  slides?: SlidesOptions;
}

interface ActionContext {
  triggerPayload?: unknown;
}

const getFactKey = (fact: string, factDataType?: string): string =>
  factDataType ? `${factDataType}-${fact}` : fact;

const getActionDataType = (
  source?: string,
  valueDataType?: string,
): string | undefined => {
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

// The full answers object is too large/noisy to ship to Axiom on every
// http_request, so we log only this curated allow-list — attribution,
// device, and identity fields we actually need to debug an outbound payload.
const LOGGED_ANSWER_KEYS = [
  "country_code",
  "country_name",
  "deviceId",
  "device_type",
  "fb-pixel",
  "fb_timestamp",
  "fbc",
  "fbclid",
  "fbp",
  "gender",
  "email",
  "id",
  "lang",
  "quiz_version",
  "user_agent",
  "utm_ad",
  "utm_adgroupid",
  "utm_adset",
  "utm_assetgroup",
  "utm_button",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_keyword",
  "utm_medium",
  "utm_placement",
  "utm_source",
  "utm_tag",
  "utm_term",
] as const;

const pickLoggedAnswers = (
  answers: Record<string, PrimitiveValue | string[]>,
): Record<string, PrimitiveValue | string[]> =>
  LOGGED_ANSWER_KEYS.reduce<Record<string, PrimitiveValue | string[]>>(
    (acc, key) => {
      if (answers[key] !== undefined) acc[key] = answers[key];
      return acc;
    },
    {},
  );

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useInteraction = () => {
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const page = usePage();
  const interactionAnalytics = useInteractionAnalytics();
  const pixel = usePixelAdapter();
  const tagManager = useTagManagerAdapter();
  const tiktokPixel = useTiktokPixelAdapter();
  const xPixel = useXPixelAdapter();
  const axonPixel = useAxonPixelAdapter();
  const logger = useLogger().with({ page_id: page.id });
  const { next, prev } = useNavigation();
  const {
    setActiveDialog,
    dialogs,
    setAnswers,
    answers,
    setLocalState,
    localStates,
    subscriptionFacts,
  } = useUnit({
    setActiveDialog: model.setActiveDialogEvt,
    dialogs: model.$dialogs,
    setAnswers: model.setAnswerEvt,
    answers: model.$answers,
    setLocalState: localModel.setLocalStateEvt,
    localStates: localModel.$localStates,
    subscriptionFacts: model.$subscriptionFacts,
  });
  // Scope-bind so swiper commands land in the same @effector/next scope that
  // SwiperView reads from via `useUnit($swiperCommands)`. Calling the imported
  // events directly fires on the un-scoped global store and the SwiperView
  // never sees the command. Same gotcha as `spin_start`.
  const handleSlideTo = useUnit(slideTo);
  const handleSlideNext = useUnit(slideNext);
  const handleSlidePrev = useUnit(slidePrev);
  const screenIndex = useUnit(model.$screenIndex);
  const ambientOptions = useInteractionOptions();
  const answersRef = useRef(answers);
  const localStatesRef = useRef(localStates);
  const subscriptionFactsRef = useRef(subscriptionFacts);

  answersRef.current = answers;
  localStatesRef.current = localStates;
  subscriptionFactsRef.current = subscriptionFacts;

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
    // Subscription facts only change between interactions (on plan selection), so a
    // snapshot at interaction start is sufficient.
    const runtimeSubscriptionFacts: Record<string, PrimitiveValue> = {
      ...(subscriptionFactsRef.current ?? {}),
    };
    let isInteractionPending = false;
    const pendingTimeoutActions = new Set<Promise<void>>();

    const getRuntimeFacts = (): Answers =>
      buildConditionFacts(
        runtimeAnswers,
        runtimeLocalStates,
        runtimeSubscriptionFacts,
      );
    const getAnalyticsContext = () => ({
      answers: runtimeAnswers,
      localStates: runtimeLocalStates,
      page,
      screenIndex,
    });

    // ── async so http_request can await fetch ─────────────────────────────────
    const runAction = async (
      action: LogicAction,
      context?: ActionContext,
    ): Promise<void> => {
      switch (action.type) {
        case "write_local_state": {
          const {
            fact,
            factName,
            source,
            value,
            valueDataType,
            valueTransforms,
          } = action.params;
          const key = fact ?? factName;
          if (key === undefined) {
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
          const nextValue = applyValueTransforms(
            resolvedValue,
            valueTransforms,
          );

          if (nextValue === undefined) {
            break;
          }

          if (
            key !== undefined &&
            nextValue !== null &&
            nextValue !== undefined
          ) {
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
            runtimeLocalStates = {
              ...runtimeLocalStates,
              [factName]: stringValue,
            };
            setLocalState({ key: factName, value: stringValue });
          }
          break;
        }

        case "write_response_data": {
          const {
            factName,
            path,
            factNameDataType,
            factDataType,
            __responseData,
          } = action.params;
          if (!factName || !path) break;

          const responseData = tryParse(__responseData ?? "null");
          const value = getNestedValue(responseData, path);
          if (value !== undefined) {
            const key = getFactKey(factName, factNameDataType ?? factDataType);
            localUser = { ...localUser, [key]: value };
            runtimeAnswers = {
              ...runtimeAnswers,
              [key as keyof Answers]: value,
            };

            setAnswers({ key, value });
          }
          break;
        }

        case "go_to_link": {
          const { link, linkType } = action.params;

          // Named link type (e.g. "privacy"/"terms"/"login") → host resolves the
          // concrete URL, which is legal-entity/brand-specific. Takes precedence
          // over a literal `link` so content can stay brand-agnostic.
          if (linkType) {
            const resolved = options?.go_to_link?.resolveLink?.(linkType);
            if (resolved) {
              window.location.href = resolved;
            }
            break;
          }

          if (!link) {
            break;
          }

          const resolvedLink = link.replace(
            /\$\{([^}]+)\}/g,
            (_match, rawKey) => {
              const key = rawKey.trim();
              const value = runtimeAnswers[key as keyof Answers];
              if (value === undefined || value === null) return "";
              if (Array.isArray(value)) return value.join(",");
              return String(value);
            },
          );

          window.location.href = resolvedLink;

          break;
        }

        case "write_user_data": {
          const {
            fact,
            factDataType,
            source,
            value,
            valueDataType,
            valueTransforms,
          } = action.params;
          if (!fact) {
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
            runtimeAnswers = {
              ...runtimeAnswers,
              [key as keyof Answers]: resolvedValue,
            };
            setAnswers({ key, value: resolvedValue });
          }
          break;
        }

        case "gb_feature": {
          const { featureName, fact, factDataType } = action.params;

          if (!featureName || !fact) {
            break;
          }

          const getFeatureValue = options?.gb_feature?.getFeatureValue;
          if (!getFeatureValue) {
            break;
          }

          const featureValue = getFeatureValue(featureName);
          if (featureValue === undefined || featureValue === null) {
            break;
          }

          // factDataType === "local" → local state; otherwise → user data fact.
          if (factDataType === "local") {
            runtimeLocalStates = {
              ...runtimeLocalStates,
              [fact]: featureValue,
            };
            setLocalState({ key: fact, value: featureValue });
          } else {
            const key = getFactKey(fact, factDataType);
            localUser = { ...localUser, [key]: featureValue };
            runtimeAnswers = {
              ...runtimeAnswers,
              [key as keyof Answers]: featureValue,
            };
            setAnswers({ key, value: featureValue });
          }
          break;
        }

        case "open_dialog": {
          const rawId = action.params.dialogId;
          const dialogId = options?.open_dialog?.getDialogId?.(rawId) ?? rawId;
          const dialog = dialogs?.find((d) => d.uuid === dialogId);
          if (dialog) {
            setActiveDialog(dialog.uuid);
          }
          break;
        }

        case "close_dialog": {
          setActiveDialog(null);
          break;
        }

        case "open_intercom": {
          const opener = options?.open_intercom?.open;
          if (opener) {
            opener();
          }
          break;
        }

        case "refresh_session": {
          const refresh = options?.refresh_session?.refresh;
          if (refresh) {
            try {
              await refresh();
            } catch {
              // refresh_session action failed; ignore and continue
            }
          }
          break;
        }

        case "open_cookie_banner": {
          // Re-open the consent banner. When the host supplies an opener it wins,
          // so the host can branch (e.g. landing-CBID opens its own modal). Absent
          // → the built-in Cookiebot renew runs. Cookiebot is a domain-wide CMP
          // (loaded once in the host's root layout), so the same consent state is
          // shared across the landing and every funnel page — this just re-prompts.
          const hostOpen = options?.open_cookie_banner?.open;
          if (hostOpen) {
            hostOpen();
            break;
          }
          if (typeof window === "undefined") break;
          const w = window as Window &
            typeof globalThis & {
              cookieInited?: boolean;
              Cookiebot?: { renew: () => void };
            };
          w.cookieInited = true;
          w.Cookiebot?.renew();
          break;
        }

        case "buy_upsell" as never: {
          // Deprecated — use http_request instead. Keep this case so legacy
          // JSONs don't blow up the runtime; will be removed once all unsub
          // pages are regenerated.
          break;
        }

        case "scroll_to": {
          if (
            typeof window === "undefined" ||
            typeof document === "undefined"
          ) {
            break;
          }

          const { targetId, containerId, block, behavior, behaviour, inline } =
            action.params;
          const elementId = containerId ?? targetId;

          if (!elementId) {
            break;
          }

          // Not getElementById: an authored container carries the id as
          // `data-id` and nothing else, so the lookup found nothing and the
          // scroll silently did not happen. See findAuthoredElement.
          const element = findAuthoredElement(elementId);
          if (!element) {
            break;
          }

          element.scrollIntoView({
            block,
            behavior: behaviour ?? behavior,
            inline,
          });
          break;
        }

        case "play_video": {
          if (typeof document === "undefined") break;

          const { targetId, withSound = true, restart = true } = action.params;

          if (!targetId) {
            break;
          }

          const el = document.getElementById(targetId);
          if (!(el instanceof HTMLVideoElement)) {
            break;
          }

          el.pause();
          if (withSound) el.muted = false;
          if (restart) el.currentTime = 0;
          // Signals to the host video component that the user took control —
          // its IntersectionObserver stops auto-pausing on scroll.
          el.dataset.userControlled = "true";
          el.play().catch(() => {
            // play_video rejected — likely lost user gesture
          });
          break;
        }

        case "unmute_video": {
          if (typeof document === "undefined") break;

          const { targetId } = action.params;

          if (!targetId) {
            break;
          }

          const el = document.getElementById(targetId);
          if (!(el instanceof HTMLVideoElement)) {
            break;
          }

          // Enforce "last unmuted wins" — every other <video> on the page is
          // muted (kept playing silently). Clearing userControlled hands the
          // others back to the host's auto-pause-on-scroll behavior.
          for (const v of document.querySelectorAll("video")) {
            if (v === el) continue;
            v.muted = true;
            delete v.dataset.userControlled;
          }

          // Unlike play_video, leave playback position alone so a currently-
          // playing autoplay video just gains sound without a visible glitch.
          el.muted = false;
          el.dataset.userControlled = "true";
          if (el.paused) {
            el.play().catch(() => {
              // unmute_video rejected — likely lost user gesture
            });
          }
          break;
        }

        case "http_request": {
          const requestConfig = tryParse<RequestConfig>(action.params.request);
          if (!requestConfig) {
            break;
          }

          const fullUrl = `${BASE_URLS[requestConfig.env] ?? ""}${requestConfig.url}`;

          // ── Headers ────────────────────────────────────────────────────────
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
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

          // Attribution/context for the request logs — tolerate bare or
          // funnel_data-prefixed answer keys.
          const loggedUtmSource =
            runtimeAnswers["utm_source"] ??
            runtimeAnswers["funnel_data-utm_source"];
          const loggedEmail =
            runtimeAnswers["email"] ?? runtimeAnswers["funnel_data-email"];
          const loggedLanguage =
            runtimeAnswers["lang"] ?? runtimeAnswers["funnel_data-lang"];
          const loggedHref =
            typeof window !== "undefined" ? window.location.href : undefined;

          // ── Pending lifecycle ──────────────────────────────────────────────
          await runLifecycle(
            requestConfig.lifecycleActions,
            "pending",
            runAction,
            context,
          );

          // ── Fetch ──────────────────────────────────────────────────────────
          const extraHeaders = model.getHttpRequestHeaders?.() ?? {};
          const fetchStart = performance.now();
          try {
            const res = await fetch(fullUrl, {
              method: requestConfig.method,
              headers: {
                ...extraHeaders,
                ...headers,
              },
              body:
                requestConfig.method !== "GET"
                  ? JSON.stringify(bodyObject)
                  : undefined,
            });

            // ── Parse response body once ───────────────────────────────────
            let responseData: any = null;
            try {
              responseData = await res.json();
            } catch {
              /* non-JSON response */
            }

            // ── Match specific status first, then generic ──────────────────
            const specificKey =
              `${res.ok ? "success" : "error"}_${res.status}` as RequestStatus;
            const genericKey: RequestStatus = res.ok ? "success" : "error";

            const matched =
              requestConfig.lifecycleActions.find(
                (b) => b.status === specificKey,
              ) ??
              requestConfig.lifecycleActions.find(
                (b) => b.status === genericKey,
              );

            logger[res.ok ? "info" : "warn"]("request_timing", {
              kind: "http_action",
              url: fullUrl,
              method: requestConfig.method,
              status: res.status,
              ok: res.ok,
              duration_ms: Math.round(performance.now() - fetchStart),
              utm_source: loggedUtmSource,
              email: loggedEmail,
              language: loggedLanguage,
              href: loggedHref,
              request_body: bodyObject,
            } satisfies RequestTiming);

            // Single measurement carrying timing + request/response bodies (a Faro
            // measurement survives log-only transport filters in the host app).
            logger.measurement(
              "backend_request",
              { duration: Math.round(performance.now() - fetchStart) },
              {
                url: fullUrl,
                method: requestConfig.method,
                status: res.status,
                ok: res.ok,
                request_body: bodyObject,
                response_body: responseData,
                utm_source: loggedUtmSource,
                email: loggedEmail,
                language: loggedLanguage,
                href: loggedHref,
              },
            );

            if (matched) {
              for (const a of matched.actions) {
                if (!a.type) continue;
                const enriched =
                  a.type === "map_local_state" ||
                  a.type === "write_response_data"
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
              answers: pickLoggedAnswers(runtimeAnswers),
              utm_source: loggedUtmSource,
              email: loggedEmail,
              language: loggedLanguage,
              href: loggedHref,
              request_body: bodyObject,
              local_states: runtimeLocalStates,
              url: fullUrl,
              method: requestConfig.method,
              env: requestConfig.env,
              duration_ms: Math.round(performance.now() - fetchStart),
              error,
            });

            logger.measurement(
              "backend_request",
              { duration: Math.round(performance.now() - fetchStart) },
              {
                url: fullUrl,
                method: requestConfig.method,
                ok: false,
                request_body: bodyObject,
                error: error instanceof Error ? error.message : String(error),
                utm_source: loggedUtmSource,
                email: loggedEmail,
                language: loggedLanguage,
                href: loggedHref,
              },
            );

            logger.warn("request_timing", {
              kind: "http_action",
              url: fullUrl,
              method: requestConfig.method,
              ok: false,
              duration_ms: Math.round(performance.now() - fetchStart),
              utm_source: loggedUtmSource,
              email: loggedEmail,
              language: loggedLanguage,
              href: loggedHref,
              request_body: bodyObject,
            } satisfies RequestTiming);

            await runLifecycle(
              requestConfig.lifecycleActions,
              "error_network",
              runAction,
              context,
            );
          }

          break;
        }

        case "conditional": {
          const conditionalAction = action as ConditionalAction;
          const { conditions, thenActions, elseActions } =
            conditionalAction.params;
          // Contain failures (e.g. the rules-engine chunk failing to load) to
          // this action: skip the branch but keep running the rest of the
          // chain so navigation actions after it still fire.
          try {
            const matched = await evaluateConditionalAction(
              conditions,
              getRuntimeFacts(),
            );
            const actionsToRun = matched ? thenActions : elseActions;

            await runActions(actionsToRun, context);
          } catch {
            // skip
          }
          break;
        }

        case "analytics": {
          const analyticsAction = action;
          const event = analyticsAction.params.event;

          if (!interactionAnalytics) {
            break;
          }

          const fields = (analyticsAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>(
            (acc, field) => {
              if (!field.analyticsName) return acc;

              let resolvedValue: unknown;

              switch (field.storeType) {
                case "local":
                  resolvedValue = runtimeLocalStates[field.localName];
                  break;
                case "fact":
                  resolvedValue =
                    runtimeAnswers[field.localName as keyof Answers];
                  break;
                case "manual":
                default:
                  resolvedValue = field.localName;
                  break;
              }

              setByPath(acc, field.analyticsName, resolvedValue);
              return acc;
            },
            {},
          );

          const triggerPayloadProps =
            context?.triggerPayload &&
            typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          const props = deepMergeAll(
            interactionAnalytics.getProps?.(getAnalyticsContext()),
            triggerPayloadProps,
            resolvedFields,
          );

          interactionAnalytics.track(event, props);
          break;
        }

        case "set_timeout": {
          const delay = Number(action.params.delay);
          const timeoutAction = wait(
            Number.isFinite(delay) ? Math.max(0, delay) : 0,
          ).then(() => runActions(action.params.actions, context));

          pendingTimeoutActions.add(timeoutAction);
          timeoutAction.then(
            () => pendingTimeoutActions.delete(timeoutAction),
            () => pendingTimeoutActions.delete(timeoutAction),
          );
          break;
        }

        case "pixel_track": {
          const pixelTrackAction = action as PixelTrackAction;
          const { eventName, eventId, eventIdDataType } =
            pixelTrackAction.params;
          if (!eventName) {
            break;
          }

          const resolvedEventId = resolveValuePicker({
            value: eventId,
            dataType: eventIdDataType,
            answers: runtimeAnswers,
            localStates: runtimeLocalStates,
            triggerPayload: context?.triggerPayload,
          });

          const eventExtra = resolvedEventId
            ? { eventID: String(resolvedEventId) }
            : undefined;

          const pixelFields = (pixelTrackAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedPixelFields = pixelFields.reduce<
            Record<string, unknown>
          >((acc, field) => {
            if (!field.analyticsName) return acc;

            let resolvedValue: unknown;

            switch (field.storeType) {
              case "local":
                resolvedValue = runtimeLocalStates[field.localName];
                break;
              case "fact":
                resolvedValue =
                  runtimeAnswers[field.localName as keyof Answers];
                break;
              case "manual":
              default:
                resolvedValue = field.localName;
                break;
            }

            setByPath(acc, field.analyticsName, resolvedValue);
            return acc;
          }, {});

          const pixelTriggerPayloadProps =
            context?.triggerPayload &&
            typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          const mergedPixelProps = deepMergeAll(
            interactionAnalytics?.getProps?.(getAnalyticsContext()),
            pixelTriggerPayloadProps,
            resolvedPixelFields,
          );

          const eventProps =
            mergedPixelProps && Object.keys(mergedPixelProps).length > 0
              ? (mergedPixelProps as Record<string, string>)
              : undefined;

          if (
            eventName === "PageView" ||
            eventName === "Lead" ||
            eventName === "InitiateCheckout" ||
            eventName === "test_inititate"
          ) {
            pixel.track({
              eventType: "track",
              eventName,
              eventProps,
              eventExtra,
            });
            break;
          }

          pixel.track({
            eventType: "trackCustom",
            eventName,
            eventProps,
            eventExtra,
          });
          break;
        }

        case "gtm_push": {
          const gtmPushAction = action as GtmPushAction;
          const event = gtmPushAction.params.event;

          if (!event) {
            break;
          }

          const fields = (gtmPushAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>(
            (acc, field) => {
              if (!field.analyticsName) return acc;

              let resolvedValue: unknown;

              switch (field.storeType) {
                case "local":
                  resolvedValue = runtimeLocalStates[field.localName];
                  break;
                case "fact":
                  resolvedValue =
                    runtimeAnswers[field.localName as keyof Answers];
                  break;
                case "manual":
                default:
                  resolvedValue = field.localName;
                  break;
              }

              setByPath(acc, field.analyticsName, resolvedValue);
              return acc;
            },
            {},
          );

          const triggerPayloadProps =
            context?.triggerPayload &&
            typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          tagManager.pushEvent(
            event,
            deepMergeAll(
              interactionAnalytics?.getProps?.(getAnalyticsContext()),
              triggerPayloadProps,
              resolvedFields,
            ),
          );
          break;
        }

        case "tiktok_push": {
          const tiktokPushAction = action as TiktokPushAction;
          const event = tiktokPushAction.params.event;

          if (!event) {
            break;
          }

          const fields = (tiktokPushAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>(
            (acc, field) => {
              if (!field.analyticsName) return acc;

              let resolvedValue: unknown;

              switch (field.storeType) {
                case "local":
                  resolvedValue = runtimeLocalStates[field.localName];
                  break;
                case "fact":
                  resolvedValue =
                    runtimeAnswers[field.localName as keyof Answers];
                  break;
                case "manual":
                default:
                  resolvedValue = field.localName;
                  break;
              }

              setByPath(acc, field.analyticsName, resolvedValue);
              return acc;
            },
            {},
          );

          const triggerPayloadProps =
            context?.triggerPayload &&
            typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          tiktokPixel.track(
            event,
            deepMergeAll(
              tiktokPixel.getProps?.(getAnalyticsContext()),
              triggerPayloadProps,
              resolvedFields,
            ),
          );
          break;
        }

        case "axon_push": {
          const axonPushAction = action as AxonPushAction;
          const event = axonPushAction.params.event;

          if (!event) {
            break;
          }

          const fields = (axonPushAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>(
            (acc, field) => {
              if (!field.analyticsName) return acc;

              let resolvedValue: unknown;

              switch (field.storeType) {
                case "local":
                  resolvedValue = runtimeLocalStates[field.localName];
                  break;
                case "fact":
                  resolvedValue =
                    runtimeAnswers[field.localName as keyof Answers];
                  break;
                case "manual":
                default:
                  resolvedValue = field.localName;
                  break;
              }

              setByPath(acc, field.analyticsName, resolvedValue);
              return acc;
            },
            {},
          );

          const triggerPayloadProps =
            context?.triggerPayload &&
            typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          axonPixel.track(
            event,
            deepMergeAll(
              axonPixel.getProps?.(getAnalyticsContext()),
              triggerPayloadProps,
              resolvedFields,
            ),
          );
          break;
        }

        case "x_push": {
          const xPushAction = action as XPushAction;
          const event = xPushAction.params.event;

          if (!event) {
            break;
          }

          const fields = (xPushAction.params.fields ?? []) as Array<{
            id: string;
            localName: string;
            analyticsName: string;
            storeType: "manual" | "local" | "fact";
          }>;

          const resolvedFields = fields.reduce<Record<string, unknown>>(
            (acc, field) => {
              if (!field.analyticsName) return acc;

              let resolvedValue: unknown;

              switch (field.storeType) {
                case "local":
                  resolvedValue = runtimeLocalStates[field.localName];
                  break;
                case "fact":
                  resolvedValue =
                    runtimeAnswers[field.localName as keyof Answers];
                  break;
                case "manual":
                default:
                  resolvedValue = field.localName;
                  break;
              }

              setByPath(acc, field.analyticsName, resolvedValue);
              return acc;
            },
            {},
          );

          const triggerPayloadProps =
            context?.triggerPayload &&
            typeof context.triggerPayload === "object"
              ? (context.triggerPayload as Record<string, unknown>)
              : {};

          xPixel.track(
            event,
            deepMergeAll(
              xPixel.getProps?.(getAnalyticsContext()),
              triggerPayloadProps,
              resolvedFields,
            ),
          );
          break;
        }

        // ── Swiper ────────────────────────────────────────────────────────────
        case "slide_swiper": {
          const { swiper_id: swiperId, slide_index: slideIndex } =
            action.params;

          if (!swiperId || slideIndex === undefined) {
            break;
          }

          const resolvedIndex = Number(slideIndex);

          if (!Number.isFinite(resolvedIndex) || resolvedIndex < 0) {
            break;
          }

          handleSlideTo({ id: swiperId, index: resolvedIndex });
          break;
        }

        case "swiper_slide_next": {
          const { swiper_id: swiperId } = action.params;

          if (!swiperId) {
            break;
          }

          handleSlideNext({ id: swiperId });
          break;
        }

        case "swiper_slide_prev": {
          const { swiper_id: swiperId } = action.params;

          if (!swiperId) {
            break;
          }

          handleSlidePrev({ id: swiperId });
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
            break;
          }
          const { mode, subscriptionId, selectionType } = action.params;
          if (mode === "by_id" && !subscriptionId) {
            break;
          }
          resolve({ mode, subscriptionId, selectionType });
          break;
        }

        // ── Slides ────────────────────────────────────────────────────────────
        case "slides_next": {
          const next = options?.slides?.next;
          if (!next) {
            break;
          }
          const { slides_id: slidesId } = action.params;
          if (!slidesId) {
            break;
          }
          next({ id: slidesId });
          break;
        }

        case "slides_prev": {
          const prev = options?.slides?.prev;
          if (!prev) {
            break;
          }
          const { slides_id: slidesId } = action.params;
          if (!slidesId) {
            break;
          }
          prev({ id: slidesId });
          break;
        }

        case "slides_goto": {
          const goto = options?.slides?.goto;
          if (!goto) {
            break;
          }
          const { slides_id: slidesId, slide_index: slideIndex } =
            action.params;
          if (!slidesId || slideIndex === undefined) {
            break;
          }
          const resolvedIndex = Number(slideIndex);
          if (!Number.isFinite(resolvedIndex) || resolvedIndex < 0) {
            break;
          }
          goto({ id: slidesId, index: resolvedIndex });
          break;
        }

        // ── Spinning wheel ────────────────────────────────────────────────────
        case "spin_start": {
          const startSpin = options?.spin_start?.startSpin;
          if (!startSpin) {
            break;
          }
          const { wheel_id: wheelId } = action.params;
          if (!wheelId) {
            break;
          }
          startSpin({ wheelId });
          break;
        }

        default:
          break;
      }
    };

    const runActions = (
      actions: LogicAction[],
      context?: ActionContext,
    ): Promise<void> =>
      actions.reduce(
        (promise, currentAction) =>
          promise.then(() => runAction(currentAction, context)),
        Promise.resolve(),
      );

    const waitPendingTimeoutActions = async (): Promise<void> => {
      while (pendingTimeoutActions.size > 0) {
        await Promise.all(Array.from(pendingTimeoutActions));
      }
    };

    const runInteractionIfIdle = async (
      callback: () => Promise<void>,
    ): Promise<void> => {
      if (isInteractionPending) return;

      isInteractionPending = true;
      try {
        await callback();
        await waitPendingTimeoutActions();
      } finally {
        isInteractionPending = false;
      }
    };

    const handleAction = async (
      action: LogicAction,
      triggerPayload?: unknown,
    ): Promise<void> => {
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
          logicValue
            .filter((rule) => rule.trigger === trigger)
            .flatMap((rule) => rule.actions),
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
