"use client";

/** @jsxImportSource @emotion/react */
import HTMLReactParser from "html-react-parser/lib/index";
import { createContext, useContext, useEffect, useState } from "react";

import { useStyledNode } from "../../hooks/use-styled-node";
import { useComponentResolver } from "../../providers/component-resolver-context";
import { usePreload } from "../../providers/preload-context";
import { ComponentRegistryProps } from "../../types";

// Tracks the chain of component ids currently being rendered so a component
// that (directly or transitively) references itself can't trigger an infinite
// resolve/render loop. Each nested reference appends its id; a repeat bails out.
const ComponentRefChainContext = createContext<string[]>([]);

const getComponentId = (attribs: Record<string, string>) =>
  attribs["component-id"] ?? attribs["data-component-id"] ?? attribs["data-lexical-component-id"] ?? "";

/**
 * Renderer for the dynamic-component-reference node. Resolves the referenced
 * component to its published MDX via the injected resolver, then renders that
 * HTML through the SAME parser `config` — so the component's own content flows
 * back through the registry exactly like inline page content.
 */
export default function ComponentRefRegistry({ domNode, config }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const componentId = getComponentId(attribs);
  const styledCss = useStyledNode(attribs);
  const preload = usePreload();
  const resolve = useComponentResolver();
  const chain = useContext(ComponentRefChainContext);

  const [html, setHtml] = useState<string | null>(null);

  const isCycle = !!componentId && chain.includes(componentId);

  useEffect(() => {
    if (!componentId || preload || isCycle || !resolve) return undefined;

    let active = true;
    resolve(componentId)
      .then((result) => {
        if (active) setHtml(result ?? "");
      })
      .catch(() => {
        if (active) setHtml("");
      });

    return () => {
      active = false;
    };
  }, [componentId, preload, isCycle, resolve]);

  // Nothing to render: no id, a reference cycle, no resolver, still loading, or
  // empty content.
  if (!componentId || isCycle || !html) return null;

  return (
    <ComponentRefChainContext.Provider value={[...chain, componentId]}>
      <div
        id={attribs["data-id"]}
        // eslint-disable-next-line react/no-unknown-property
        css={styledCss}
      >
        {HTMLReactParser(html, config)}
      </div>
    </ComponentRefChainContext.Provider>
  );
}
