import HTMLReactParser, { Element, HTMLReactParserOptions } from "html-react-parser/lib/index";

import { ComponentRegisry } from "../types";

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
        else if (componentType && componentType !== "container") {
        }

        if (componentType && !Component) {
        }
      }
    },
  };
  return HTMLReactParser(content, config);
}
