"use client";

import { useGate, useUnit } from "effector-react";
import { AnimatePresence, motion } from "framer-motion";

import dynamic from "next/dynamic";

import { useLogger } from "next-axiom";

import { ComponentType, useEffect, useRef, useState } from "react";

import { usePreloadChunk } from "../hooks/use-preload-chunk";
import { BuilderClientModel } from "../model/gate";
import { BuilderModel } from "../model/store";
import LocalProvider from "../providers/local-provider";
import ModelProvider, {
  ClientModelProvider,
} from "../providers/model-provider";
import PageProvider from "../providers/page-provider";
import { PreloadProvider } from "../providers/preload-context";
import { BuilderPage, ComponentRegisry, RequestTiming } from "../types";
import { loadJsonRulesEngine } from "../utils/load-json-rules-engine";

import BuilderClientLoadingPage from "./builder-client-loading-page";
import {
  FallbackTeaserPage,
  FallbackTeaserPageWithNavigation,
} from "./fallback-teaser-page";
import Parser from "./parser";

const PageDialog = dynamic(() => import("./page-dialog"), { ssr: false });
const PageDrawer = dynamic(() => import("./page-drawer"), { ssr: false });

export default function BuilderClient<Page extends BuilderPage = BuilderPage>({
  model,
  clientModel,
  loadingComponent: LoadingComponent = BuilderClientLoadingPage,
  registry: registryProp,
  preloadRegistry: preloadRegistryProp,
}: {
  model: BuilderModel<Page>;
  clientModel: BuilderClientModel;
  loadingComponent?: ComponentType;
  registry?: ComponentRegisry;
  preloadRegistry?: ComponentRegisry;
}) {
  const registry = registryProp ?? model.registry ?? {};
  const preloadRegistry =
    preloadRegistryProp ?? model.preloadRegistry ?? registry;
  useGate(clientModel.BuilderGate);

  // Warm json-rules-engine in the background so the first conditional
  // navigation/action evaluation doesn't pay an on-demand chunk fetch.
  usePreloadChunk(loadJsonRulesEngine);

  const logger = useLogger();
  const loggerRef = useRef(logger);
  useEffect(() => {
    loggerRef.current = logger;
  });

  useEffect(() => {
    const logTiming = (t: RequestTiming) => {
      loggerRef.current[t.ok ? "info" : "warn"]("request_timing", t);
    };
    const unsubModel = model.requestTimingEvt.watch(logTiming);
    const unsubClient = clientModel.requestTimingEvt.watch(logTiming);
    return () => {
      unsubModel();
      unsubClient();
    };
  }, [model, clientModel]);

  useEffect(() => {
    (
      PageDialog as typeof PageDialog & { preload?: () => Promise<unknown> }
    ).preload?.();
    (
      PageDrawer as typeof PageDrawer & { preload?: () => Promise<unknown> }
    ).preload?.();
  }, []);

  const {
    visiblePages,
    current,
    hasFetchFailed,
    hasDialogsFetchFailed,
    dialogs,
    dialogsByPage,
    activeDialog,
    setActiveDialog,
  } = useUnit({
    visiblePages: model.$visiblePages,
    current: model.$currentPageId,
    hasFetchFailed: model.$hasFetchFailed,
    hasDialogsFetchFailed: clientModel.$hasDialogsFailed,
    dialogs: model.$dialogs,
    dialogsByPage: model.$dialogsByPage,
    activeDialog: model.$activeDialog,
    setActiveDialog: model.setActiveDialogEvt,
  });

  const pageForCurrent = visiblePages.find((p) => p.id === current);
  const currentPageDialogsLoaded =
    current !== null && dialogsByPage[current] !== undefined;
  const pageReady =
    pageForCurrent &&
    typeof pageForCurrent.html === "string" &&
    currentPageDialogsLoaded;

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pageReady) {
      setLoadingTimedOut(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    timerRef.current = setTimeout(() => setLoadingTimedOut(true), 15_000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pageReady, current]);

  const anyFetchFailed = hasFetchFailed || hasDialogsFetchFailed;
  const showLoading = !pageReady && !loadingTimedOut && !anyFetchFailed;

  const renderDialogs = () => {
    return dialogs.map((dialog) => {
      if (dialog.type === "drawer") {
        return (
          <PageDrawer
            dialog={dialog}
            key={dialog.id}
            open={dialog.uuid === activeDialog}
            onOpenChange={() => setActiveDialog(null)}
            registry={registry}
          />
        );
      }

      return (
        <PageDialog
          dialog={dialog}
          key={dialog.id}
          open={dialog.uuid === activeDialog}
          onOpenChange={() => setActiveDialog(null)}
          registry={registry}
        />
      );
    });
  };

  const readyPages = visiblePages.filter(
    (p) => typeof p.html === "string" && dialogsByPage[p.id] !== undefined,
  );

  const renderPrerenderedPages = () =>
    readyPages.map((page) => {
      const isActive = page.id === current;

      if (isActive) {
        return (
          <div key={page.id} style={{ display: "contents" }}>
            <LocalProvider>
              <PageProvider<Page> page={page as Page}>
                <Parser content={page.html as string} registry={registry} />
                {renderDialogs()}
              </PageProvider>
            </LocalProvider>
          </div>
        );
      }

      return (
        <div key={page.id} style={{ display: "none" }} aria-hidden>
          <PreloadProvider preload>
            <LocalProvider>
              <PageProvider<Page> page={page as Page}>
                <Parser
                  content={page.html as string}
                  registry={preloadRegistry}
                />
              </PageProvider>
            </LocalProvider>
          </PreloadProvider>
        </div>
      );
    });

  const renderFallback = () => {
    if (showLoading) {
      return <LoadingComponent />;
    }

    if (!pageForCurrent) {
      return (
        <FallbackTeaserPage currentPageId={current} reason="missing_page" />
      );
    }

    if (typeof pageForCurrent.html !== "string") {
      return (
        <LocalProvider>
          <PageProvider<Page> page={pageForCurrent as Page}>
            <FallbackTeaserPageWithNavigation />
          </PageProvider>
        </LocalProvider>
      );
    }

    return null;
  };

  const fallback = renderFallback();
  const fallbackKey =
    pageForCurrent?.id ?? `missing-page-${current ?? "unknown"}`;

  return (
    <ModelProvider model={model as unknown as BuilderModel}>
      <ClientModelProvider model={clientModel}>
        {renderPrerenderedPages()}
        {fallback && (
          <AnimatePresence mode="wait">
            <motion.div
              key={fallbackKey}
              style={{ display: "contents" }}
              initial={false}
              animate={{}}
              exit={{}}
              transition={{ duration: 0 }}
            >
              {fallback}
            </motion.div>
          </AnimatePresence>
        )}
      </ClientModelProvider>
    </ModelProvider>
  );
}
