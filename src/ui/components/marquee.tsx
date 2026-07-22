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

/** Like getNumberAttr but accepts 0 and negatives — for widths/paddings. */
const getNumberAttrAny = (value: string | undefined, fallback: number) => {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  // ── Item / image customization (all optional, default to the classic pill) ──
  const layout = attribs["marquee-layout"] === "column" ? "column" : "row";
  const itemBg = attribs["marquee-item-bg"] || "#fff";
  const itemColor = attribs["marquee-item-color"] || undefined;
  const itemBorderWidth = getNumberAttrAny(attribs["marquee-item-border-width"], 0);
  const itemBorderColor = attribs["marquee-item-border-color"] || "#e4e4e7";
  const itemBorderStyle = attribs["marquee-item-border-style"] || "solid";
  const itemRadius = getNumberAttrAny(attribs["marquee-item-radius"], 100);
  const itemPaddingY = getNumberAttrAny(attribs["marquee-item-padding-y"], 16);
  const itemPaddingX = getNumberAttrAny(attribs["marquee-item-padding-x"], 24);
  const itemGap = getNumberAttrAny(attribs["marquee-item-gap"], 8);
  const fontSize = getNumberAttrAny(attribs["marquee-font-size"], 0);
  const fontWeight = getNumberAttrAny(attribs["marquee-font-weight"], 0);

  // `marquee-avatar-size` is the legacy square-size attr; new attrs win when present.
  const legacyAvatar = getNumberAttr(attribs["marquee-avatar-size"], 40);
  const imageWidth = getNumberAttrAny(attribs["marquee-image-width"], legacyAvatar);
  const imageHeight = getNumberAttrAny(attribs["marquee-image-height"], legacyAvatar);
  const imageRadius = getNumberAttrAny(attribs["marquee-image-radius"], 50);
  const imageFit = attribs["marquee-image-fit"] || "cover";
  const imageBorderWidth = getNumberAttrAny(attribs["marquee-image-border-width"], 0);
  const imageBorderColor = attribs["marquee-image-border-color"] || "#e4e4e7";

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
                      flexDirection: layout === "column" ? "column" : "row",
                      flex: "0 0 auto",
                      alignItems: "center",
                      gap: item.image ? `${itemGap}px` : 0,
                      // Tighter on the left so the avatar sits flush inside the pill.
                      padding:
                        item.image && layout === "row" && itemPaddingX > itemGap
                          ? `${itemPaddingY}px ${itemPaddingX}px ${itemPaddingY}px ${Math.max(
                              0,
                              itemPaddingX - 8,
                            )}px`
                          : `${itemPaddingY}px ${itemPaddingX}px`,
                      borderRadius: `${itemRadius}px`,
                      background: itemBg,
                      color: itemColor,
                      border:
                        itemBorderWidth > 0
                          ? `${itemBorderWidth}px ${itemBorderStyle} ${itemBorderColor}`
                          : undefined,
                      boxShadow: shadow ? "0 2px 10px rgba(16, 24, 40, 0.06)" : undefined,
                      fontSize: fontSize > 0 ? `${fontSize}px` : undefined,
                      fontWeight: fontWeight > 0 ? fontWeight : undefined,
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
                          width: `${imageWidth}px`,
                          height: `${imageHeight}px`,
                          borderRadius: `${imageRadius}%`,
                          objectFit: imageFit as "cover" | "contain" | "fill" | "none" | "scale-down",
                          border:
                            imageBorderWidth > 0
                              ? `${imageBorderWidth}px solid ${imageBorderColor}`
                              : undefined,
                          flex: "0 0 auto",
                        }}
                      />
                    ) : null}
                    {item.text ? <span>{item.text}</span> : null}
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
