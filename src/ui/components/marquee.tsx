"use client";

/** @jsxImportSource @emotion/react */
import { keyframes } from "@emotion/react";

import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps } from "../../types";
import { tryParse } from "../../utils/try-parse";

export type MarqueeItem = {
  text: string;
  image?: string;
  alt?: string;
};

/** Rows scroll independently; even rows go one way, odd rows the other. */
export type MarqueeRow = MarqueeItem[];

const scrollX = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(-100%)" },
});

const getNumberAttr = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getBooleanAttr = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;

  return value === "" || value === "true" || value === "1";
};

export default function MarqueeRegistry({ domNode }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);

  const rows = tryParse<MarqueeRow[]>(attribs["data-marquee-rows"]) ?? [];
  const duration = getNumberAttr(attribs["marquee-duration"], 40);
  const gap = getNumberAttr(attribs["marquee-gap"], 12);
  const reverseFirst = getBooleanAttr(attribs["marquee-reverse"]);
  const pauseOnHover = getBooleanAttr(attribs["marquee-pause-on-hover"]);
  const fade = getBooleanAttr(attribs["marquee-fade"]);
  const fadeWidth = getNumberAttr(attribs["marquee-fade-width"], 64);
  const shadow = getBooleanAttr(attribs["marquee-shadow"]);
  const avatarSize = getNumberAttr(attribs["marquee-avatar-size"], 40);
  const itemBg = attribs["marquee-item-bg"] || "#fff";
  const itemColor = attribs["marquee-item-color"] || undefined;

  // Few items make a track narrower than the container, and translateX(-100%) would
  // then leave a visible gap. Repeat the items so one track always overflows.
  const repeat = Math.max(1, getNumberAttr(attribs["marquee-repeat"], 4));

  const visibleRows = rows.filter((row) => Array.isArray(row) && row.length > 0);
  if (!visibleRows.length) return null;

  const maskImage = fade
    ? `linear-gradient(to right, transparent 0, #000 ${fadeWidth}px, #000 calc(100% - ${fadeWidth}px), transparent 100%)`
    : undefined;

  return (
    <div
      id={attribs["data-id"] ?? attribs.id}
      // eslint-disable-next-line react/no-unknown-property
      css={[
        {
          display: "flex",
          flexDirection: "column",
          gap: `${gap}px`,
          width: "100%",
          overflow: "hidden",
          maskImage,
          WebkitMaskImage: maskImage,
        },
        styledCss,
      ]}
    >
      {visibleRows.map((row, rowIndex) => {
        // Even rows scroll one way, odd rows the other — same duration, direction flipped.
        const isReversed = rowIndex % 2 === 0 ? reverseFirst : !reverseFirst;

        return (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={rowIndex}
            // eslint-disable-next-line react/no-unknown-property
            css={{
              display: "flex",
              overflow: "hidden",
              // Nudge alternating rows so the pills don't line up in a grid.
              marginLeft: rowIndex % 2 === 0 ? 0 : `-${gap * 2}px`,
            }}
          >
            {/*
              The track is rendered twice back-to-back. Translating it by exactly
              -100% of ONE track lands the copy precisely where the original
              started, so the loop is seamless.
            */}
            {[0, 1].map((copy) => (
              <div
                key={copy}
                aria-hidden={copy === 1}
                // eslint-disable-next-line react/no-unknown-property
                css={{
                  display: "flex",
                  flex: "0 0 auto",
                  alignItems: "center",
                  gap: `${gap}px`,
                  paddingRight: `${gap}px`,
                  animation: `${scrollX} ${duration}s linear infinite`,
                  animationDirection: isReversed ? "reverse" : "normal",
                  willChange: "transform",
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                  },
                  ...(pauseOnHover
                    ? { "div:hover > &": { animationPlayState: "paused" } }
                    : {}),
                }}
              >
                {Array.from({ length: repeat }, () => row)
                  .flat()
                  .map((item, itemIndex) => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={itemIndex}
                    className="marquee-item"
                    // eslint-disable-next-line react/no-unknown-property
                    css={{
                      display: "flex",
                      flex: "0 0 auto",
                      alignItems: "center",
                      gap: "8px",
                      // Tighter on the left so the avatar sits flush inside the pill.
                      padding: item.image ? "16px 24px 16px 16px" : "16px 24px",
                      borderRadius: "100px",
                      background: itemBg,
                      color: itemColor,
                      boxShadow: shadow ? "0 2px 10px rgba(16, 24, 40, 0.06)" : undefined,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.alt ?? ""}
                        loading="lazy"
                        decoding="async"
                        css={{
                          width: `${avatarSize}px`,
                          height: `${avatarSize}px`,
                          borderRadius: "50%",
                          objectFit: "cover",
                          flex: "0 0 auto",
                        }}
                      />
                    ) : null}
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
