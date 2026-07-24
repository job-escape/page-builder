import HTMLReactParser, { Element, HTMLReactParserOptions } from "html-react-parser/lib/index";

import { useMemo } from "react";

import { ComponentRegisry } from "../types";

export default function Parser({
  content,
  registry,
}: {
  content: string;
  registry: ComponentRegisry;
}) {
  // Memoize the parser config AND the parsed tree.
  //
  // Previously both were recreated on every render: a fresh `config` object was
  // built each render and passed as a prop to every component (`config={config}`),
  // and `HTMLReactParser(content, config)` ran in the render body — so the ENTIRE
  // active page was re-parsed and its element tree rebuilt on every BuilderClient
  // re-render (which fires on $visiblePages / $activeDialog / $dialogsByPage
  // changes). React then reconciled the whole tree, re-rendering every component.
  // On the loader page — the heaviest tree, and the one firing the most re-renders
  // (3 dialogs opening/closing, prefetch, state writes) — that meant repeatedly
  // rebuilding a heavy subtree including the Swiper (a large lib that re-inits and
  // restarts autoplay each time), which tipped the page into freezing.
  //
  // With a stable `config` and a memoized parse result, the element tree keeps the
  // same references across re-renders, so React bails out and only re-renders
  // components whose OWN state actually changed.
  const config = useMemo<HTMLReactParserOptions>(() => {
    const cfg: HTMLReactParserOptions = {
      replace: (domNode) => {
        if (domNode instanceof Element) {
          const componentType =
            domNode.attribs["component-type"] ?? domNode.attribs["data-lexical-component"];
          const Component = registry[componentType];
          if (Component) return <Component config={cfg} domNode={domNode} />;
        }
        return undefined;
      },
    };
    return cfg;
  }, [registry]);

  const parsed = useMemo(() => HTMLReactParser(content, config), [content, config]);

  return <>{parsed}</>;
}
