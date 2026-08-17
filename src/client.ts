// Client-only entry: providers, hooks, client renderers, registry components.
// The "use client" directive is injected by tsup via banner.js during build.
//
// Re-exports everything from ./server plus client-only surface, so consumers
// inside "use client" files can import from a single path.

export * from "./server";

// ─── Client-only model factory (uses effector-react's createGate) ────────────

export { createBuilderClientModel } from "./model/gate";

// ─── Model / swiper events (client-only: effector events trigger UI) ─────────

export {
  slideTo,
  slideNext,
  slidePrev,
  clearSwiperCommand,
  $swiperCommands,
} from "./model/swiper-store";
export type { SwiperCommand, SwiperCommands } from "./model/swiper-store";

// ─── Providers ────────────────────────────────────────────────────────────────

export { default as LocalProvider, LocalContext } from "./providers/local-provider";
export {
  default as ModelProvider,
  ModelContext,
  ClientModelProvider,
  ClientModelContext,
} from "./providers/model-provider";
export { default as PageProvider, PageContext } from "./providers/page-provider";
export { PreloadProvider, usePreload } from "./providers/preload-context";
export {
  ComponentResolverProvider,
  useComponentResolver,
} from "./providers/component-resolver-context";
export type { ComponentResolver } from "./providers/component-resolver-context";
export {
  InteractionAnalyticsContext,
  useInteractionAnalytics,
} from "./providers/interaction-analytics-context";
export type {
  InteractionAnalyticsContextValue,
  InteractionAnalyticsProps,
  InteractionAnalyticsRuntimeContext,
} from "./providers/interaction-analytics-context";
export { InteractionAnalyticsProvider } from "./providers/interaction-analytics-provider";
export {
  InteractionOptionsContext,
  useInteractionOptions,
} from "./providers/interaction-options-context";
export { InteractionOptionsProvider } from "./providers/interaction-options-provider";
export { PixelContext, usePixelAdapter } from "./providers/pixel-context";
export type { PixelAdapter } from "./providers/pixel-context";
export { PixelAdapterProvider } from "./providers/pixel-provider";
export { TagManagerContext, useTagManagerAdapter } from "./providers/tag-manager-context";
export type { TagManagerAdapter } from "./providers/tag-manager-context";
export { TagManagerAdapterProvider } from "./providers/tag-manager-provider";
export { TiktokPixelContext, useTiktokPixelAdapter } from "./providers/tiktok-pixel-context";
export type {
  TiktokPixelAdapter,
  TiktokPixelProps,
  TiktokPixelRuntimeContext,
} from "./providers/tiktok-pixel-context";
export { TiktokPixelAdapterProvider } from "./providers/tiktok-pixel-provider";
export { AxonPixelContext, useAxonPixelAdapter } from "./providers/axon-pixel-context";
export type {
  AxonPixelAdapter,
  AxonPixelProps,
  AxonPixelRuntimeContext,
} from "./providers/axon-pixel-context";
export { AxonPixelAdapterProvider } from "./providers/axon-pixel-provider";
export { XPixelContext, useXPixelAdapter } from "./providers/x-pixel-context";
export type { XPixelAdapter, XPixelProps, XPixelRuntimeContext } from "./providers/x-pixel-context";
export { XPixelAdapterProvider } from "./providers/x-pixel-provider";
// The X pixel itself, for a host that needs a piece of it outside the provider —
// resolving the pixel id to report a server-side conversion against, say.
export {
  createXPixelRuntime,
  loadXPixel,
  pickXParams,
  resetXPixelConfig,
  resolveXPixelConfig,
  xConversionId,
} from "./lib/x-pixel";
export type { XPixelResolution, XPixelRuntime } from "./lib/x-pixel";

// ─── Hooks ────────────────────────────────────────────────────────────────────

export { useBuilderModel, useClientBuilderModel } from "./hooks/use-builder-model";
export { useLocalModel } from "./hooks/use-local-model";
export { useNavigation } from "./hooks/use-navigation";
export { usePage } from "./hooks/use-page";
export { useActiveState } from "./hooks/use-active-state";
export { useStyledNode } from "./hooks/use-styled-node";
export { useInteraction } from "./hooks/use-interaction";
export type {
  InteractionOptions,
  WriteUserDataOptions,
  GbFeatureOptions,
  OpenDialogOptions,
  SetSelectedSubscriptionOptions,
  SpinStartOptions,
} from "./hooks/use-interaction";

// ─── Client renderers ────────────────────────────────────────────────────────

export { default as BuilderClient } from "./ui/builder-client";
export { default as BuilderClientLoadingPage } from "./ui/builder-client-loading-page";
export { default as Parser } from "./ui/parser";
export { default as PageDialog } from "./ui/page-dialog";
export { default as PageDrawer } from "./ui/page-drawer";
export {
  FallbackTeaserPage,
  FallbackTeaserPageWithNavigation,
} from "./ui/fallback-teaser-page";

// ─── Registry components ─────────────────────────────────────────────────────

export { DEFAULT_REGISTRY } from "./const/default-registry";
export { default as AnimatedContainerRegistry } from "./ui/components/animated-container";
export { default as AnimatedPercentageRegistry } from "./ui/components/animated-percentage";
export { default as ButtonRegistry } from "./ui/components/button";
export { default as ComponentRefRegistry } from "./ui/components/component-ref";
export { default as ConditionRegistry } from "./ui/components/condition";
export { default as ContainerRegistry } from "./ui/components/container";
export { default as InlineDataRegistry } from "./ui/components/inline-data";
export { default as LightLoaderRegistry } from "./ui/components/light-loader";
export { default as LoaderRegistry } from "./ui/components/loader";
export { default as LottieRegistry } from "./ui/components/lottie";
export { default as MarqueeRegistry } from "./ui/components/marquee";
export { default as SwiperRegistry } from "./ui/components/swiper";
export { default as SwiperView } from "./ui/components/swiper-view";

// ─── Vendored UI primitives ──────────────────────────────────────────────────

export { Button, buttonVariants } from "./ui/internal/button";
export type { ButtonProps } from "./ui/internal/button";
export { Progress } from "./ui/internal/progress";
