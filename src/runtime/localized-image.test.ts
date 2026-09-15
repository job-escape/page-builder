/**
 * A picture translated with its words: `image:<src>` in a locale swaps the
 * source an image draws, in both renderers, and changes nothing without it.
 */
import { emitScreen } from "./compiler/emit";
import { screenFromTree } from "./client/tree-screen";
import { IMAGE_KEY_PREFIX, localizedImage } from "./locale";

const SRC = "https://cdn.test/certificate.webp";
const AR = "https://cdn.test/certificate-ar.webp";

describe("a translated image", () => {
  it("answers the active locale's variant, or the source", () => {
    expect(localizedImage({ [`${IMAGE_KEY_PREFIX}${SRC}`]: AR }, SRC)).toBe(AR);
    expect(localizedImage({}, SRC)).toBe(SRC);
    expect(localizedImage({ [`${IMAGE_KEY_PREFIX}${SRC}`]: ["not", "a", "url"] }, SRC)).toBe(SRC);
  });

  it("is what a compiled screen draws, and a host without the lookup draws the source", () => {
    const code = emitScreen({
      id: "s1",
      name: "Certificate",
      frames: [
        {
          id: "f1", name: "Certificate", parent: null, kind: "image", pos: "a0",
          props: {}, src: SRC, textKey: null, bindings: {}, interactions: [],
        } as never,
      ],
    });
    const body = code.replace(/^\/\/.*\n/, "").replace("export default ", "return ");
    // eslint-disable-next-line no-new-func
    const Screen = new Function(body)() as (props: Record<string, unknown>) => unknown[];
    const ui = { Image: (props: { src: string }) => props.src, Frame: () => null };

    const t = Object.assign(() => "", { image: (src: string) => localizedImage({ [`image:${src}`]: AR }, src) });
    expect(Screen({ ui, t })).toEqual([AR]);
    expect(Screen({ ui, t: () => "" })).toEqual([SRC]);
  });

  it("is what the tree renderer draws, unless the source is bound data", () => {
    const ui = { Image: (props: { src: string }) => props.src };
    const t = Object.assign(() => "", { image: (src: string) => localizedImage({ [`image:${src}`]: AR }, src) });

    const drawn = screenFromTree({ id: "s1", roots: [{ id: "i", kind: "image", src: SRC }] } as never);
    expect(drawn({ ui, t } as never)).toEqual([AR]);
    expect(drawn({ ui, t: () => "" } as never)).toEqual([SRC]);
  });

  it("swaps a published tree's picture, whose source is props.src", () => {
    const ui = { Image: (props: { src: string }) => props.src };
    const t = Object.assign(() => "", { image: (src: string) => localizedImage({ [`image:${src}`]: AR }, src) });

    const drawn = screenFromTree({
      id: "s1",
      roots: [{ id: "i", kind: "image", props: { src: SRC, fit: "cover" } }],
    } as never);
    expect(drawn({ ui, t } as never)).toEqual([AR]);
  });
});
