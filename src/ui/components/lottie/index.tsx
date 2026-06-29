"use client";

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import dynamic from "next/dynamic";

import { useEffect, useMemo, useState } from "react";

import { useInteraction } from "../../../hooks/use-interaction";
import { usePreload } from "../../../providers/preload-context";
import { useStyledNode } from "../../../hooks/use-styled-node";
import { ComponentRegistryProps, LogicValue } from "../../../types";
import { tryParse } from "../../../utils/try-parse";

// Lazy-load the lottie player so react-lottie-player (+ its lottie-web engine,
// ~330KB) is split into its own chunk and only fetched when a lottie block
// actually renders — instead of being pulled into every consumer that spreads
// DEFAULT_REGISTRY.
const LottiePlayerSrc = dynamic(() => import("./lottie-player-src"), { ssr: false });

const cache = new Map<string, unknown>();

export default function LottieRegistry(props: ComponentRegistryProps) {
  const { domNode } = props;
  const preload = usePreload();
  const attribs = domNode?.attribs ?? {};

  const src = attribs.src || attribs["data-lexical-lottie-src"];
  const width = Number(attribs.width || attribs["data-lexical-lottie-width"]) || 576;
  const height = Number(attribs.height || attribs["data-lexical-lottie-height"]) || 400;
  const autoplay = attribs.autoplay !== "false";
  const keepLastFrame = attribs.keepLastFrame !== "false";
  const loop = attribs.loop === "true";
  const logic = useMemo(() => tryParse<LogicValue>(attribs.logic) || [], [attribs.logic]);
  const styledCss = useStyledNode(attribs);

  const { createInteraction } = useInteraction();

  const [animationData, setAnimationData] = useState<unknown>(() =>
    src ? (cache.get(src) ?? null) : null,
  );

  useEffect(() => {
    if (!src) return;
    const cached = cache.get(src);
    if (cached) {
      setAnimationData(cached);
      return;
    }
    let aborted = false;
    fetch(src)
      .then((r) => r.json())
      .then((data) => {
        cache.set(src, data);
        if (!aborted) setAnimationData(data);
      })
      .catch(() => undefined);
    return () => {
      aborted = true;
    };
  }, [src]);

  useEffect(() => {
    if (preload) return;
    const { handleTrigger } = createInteraction();
    handleTrigger("on_mount", logic).catch(() => undefined);
  }, [preload]);

  if (!src || preload || !animationData) {
    return null;
  }

  return (
    <LottiePlayerSrc
      // eslint-disable-next-line react/no-unknown-property
      css={[
        styledCss,
        css({
          maxWidth: `${width}px`,
          maxHeight: `${height}px`,
        }),
      ]}
      autoplay={autoplay}
      keepLastFrame={keepLastFrame}
      loop={loop}
      src={animationData as object}
      onError={() => {}}
      onComplete={() => {
        const { handleTrigger } = createInteraction();
        handleTrigger("on_finish", logic).catch(() => undefined);
      }}
    />
  );
}
