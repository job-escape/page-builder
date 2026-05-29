import HTMLReactParser, { Element, HTMLReactParserOptions } from "html-react-parser/lib/index";

import { ComponentRegisry } from "../types";
import { resolveSeniorFactor, scaleSeniorStyleString } from "../utils/scale-senior-styles";

export default function Parser({
  content,
  registry,
}: {
  content: string;
  registry: ComponentRegisry;
}) {
  const config: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        const componentType =
          domNode.attribs["component-type"] ?? domNode.attribs["data-lexical-component"];

        const Component = registry[componentType];

        if (Component) return <Component config={config} domNode={domNode} />;

        // Plain element (text span, paragraph, etc.): scale its inline
        // font-size/spacing for senior mode. Registry components are handled by
        // useStyledNode, so they're skipped above to avoid double-scaling.
        if (domNode.attribs?.style) {
          const factor = resolveSeniorFactor(domNode.attribs);
          if (factor) {
            domNode.attribs.style = scaleSeniorStyleString(domNode.attribs.style, factor);
          }
        }
      }
    },
  };
  return HTMLReactParser(content, config);
}
