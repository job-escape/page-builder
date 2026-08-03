import { Element, htmlToDOM } from "html-react-parser";

import type { ComponentRegistryProps } from "../../types";

/**
 * Build the props a registry component expects, from plain attributes.
 *
 * Every component in this package is a REGISTRY component: the builder parses authored HTML
 * and hands each one the `domNode` it was matched on, so a component's inputs are that node's
 * attributes rather than React props. Stories would otherwise have to hand-assemble a
 * domhandler Element, which is noise in every file and easy to get subtly wrong.
 *
 * `htmlToDOM` is used rather than `new Element(...)` so the node is built the same way the
 * real parser builds it — same class, same normalisation of attribute names — and a story
 * cannot pass something the runtime would never see.
 */
export function storyNode(
  tag: string,
  attribs: Record<string, string>,
  innerHTML = "",
): ComponentRegistryProps {
  const attrs = Object.entries(attribs)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, "&quot;")}"`)
    .join(" ");

  const [node] = htmlToDOM(`<${tag} ${attrs}>${innerHTML}</${tag}>`) as Element[];

  return { domNode: node, config: {} };
}
