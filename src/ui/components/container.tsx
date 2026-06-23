"use client";

/** @jsxImportSource @emotion/react */
import { attributesToProps, DOMNode, domToReact } from "html-react-parser";
import { useEffect, useRef } from "react";

import { useInteraction } from "../../hooks/use-interaction";
import { usePreload } from "../../providers/preload-context";
import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps, LogicValue } from "../../types";
import { tryParse } from "../../utils/try-parse";

// Generic container with on_mount logic support. By default parser.tsx
// short-circuits containers and renders them as plain <div>s. To trigger
// analytics view-events or any other action on page mount we register an
// explicit ContainerRegistry — it carries the same DOM attrs and children,
// plus fires `on_mount` once from the logic array.
export default function ContainerRegistry({ domNode, config }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const logic = tryParse<LogicValue>(attribs.logic) || [];
  const styledCss = useStyledNode(attribs);
  const { createInteraction } = useInteraction();
  const preload = usePreload();
  const firedRef = useRef(false);

  useEffect(() => {
    if (preload) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    if (!logic.some(rule => rule.trigger === "on_mount")) return;
    firedRef.current = true;
    const { handleTrigger } = createInteraction();
    handleTrigger("on_mount", logic).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload]);

  // Strip our internal attrs so they don't pollute the rendered DOM.
  const { logic: _l, ...rest } = attribs;
  const domProps = attributesToProps(rest);

  return (
    <div
      {...domProps}
      // eslint-disable-next-line react/no-unknown-property
      css={styledCss}
    >
      {domNode.children?.length ? domToReact(domNode.children as DOMNode[], config) : null}
    </div>
  );
}
