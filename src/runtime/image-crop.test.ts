import { cropBackground, cropBox, cropPaintOf, frameBackground } from "./image-crop";

describe("a picture in Figma's crop mode", () => {
  it("fills the box exactly when there is no matrix, as the canvas draws it", () => {
    expect(cropBox(undefined)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(cropBackground("a.png")).toBe('url("a.png") 0% 0% / 100% 100% no-repeat');
  });

  it("places a zoomed-in crop by its matrix", () => {
    // The box shows the middle half of the picture on each axis.
    const transform = [0.5, 0, 0.25, 0, 0.5, 0.25];
    expect(cropBox(transform)).toEqual({ left: -0.5, top: -0.5, width: 2, height: 2 });
    expect(cropBackground("a.png", transform)).toBe('url("a.png") 50% 50% / 200% 200% no-repeat');
  });

  it("is only read for the topmost picture paint, and only when it is a crop", () => {
    expect(cropPaintOf([{ kind: "image", src: "a.png", fit: "crop" }])).toEqual({
      src: "a.png",
      transform: undefined,
    });
    expect(cropPaintOf([{ kind: "image", src: "a.png", fit: "fill" }])).toBeNull();
    expect(cropPaintOf(undefined)).toBeNull();
  });
});

describe("a frame's background", () => {
  const fill = 'url("https://cdn/p.img") center / cover no-repeat';

  it("shows a cropped picture whole rather than covering the box with it", () => {
    expect(frameBackground(fill, [{ kind: "image", src: "https://cdn/p.img", fit: "crop" }])).toBe(
      'url("https://cdn/p.img") 0% 0% / 100% 100% no-repeat',
    );
  });

  it("leaves a filled picture, a colour and a swapped-in state fill as they were", () => {
    expect(frameBackground(fill, [{ kind: "image", src: "https://cdn/p.img", fit: "fill" }])).toBe(fill);
    expect(frameBackground("#fff", undefined)).toBe("#fff");
    expect(frameBackground("#000", [{ kind: "image", src: "https://cdn/p.img", fit: "crop" }])).toBe("#000");
  });
});
