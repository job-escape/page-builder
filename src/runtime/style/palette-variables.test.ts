/**
 * A funnel variable choosing the palette — `VariableDecl.palette`.
 */
import { paletteFromVariables } from "./tokens";
import type { VariableDecl } from "../types";

const decls: VariableDecl[] = [
  { name: "theme", type: "string", palette: "mode" },
  { name: "brand", type: "string", palette: "brand" },
  { name: "goal", type: "string" },
];

describe("paletteFromVariables", () => {
  it("reads the mode and the brand from the variables that declare them", () => {
    expect(paletteFromVariables(decls, { theme: "dark", brand: "orange", goal: "x" })).toEqual({
      mode: "dark",
      brand: "orange",
    });
  });

  it("asks for nothing when the value is empty, blank or not text", () => {
    expect(paletteFromVariables(decls, { theme: "", brand: "  " })).toEqual({});
    expect(paletteFromVariables([{ name: "n", type: "number", palette: "mode" }], { n: 2 })).toEqual({});
  });

  it("takes the first declaration of each kind that has an answer", () => {
    const two: VariableDecl[] = [
      { name: "a", type: "string", palette: "mode" },
      { name: "b", type: "string", palette: "mode" },
    ];
    expect(paletteFromVariables(two, { a: "light", b: "dark" })).toEqual({ mode: "light" });
    expect(paletteFromVariables(two, { a: null, b: "dark" })).toEqual({ mode: "dark" });
  });

  it("ignores variables that do not choose anything", () => {
    expect(paletteFromVariables([{ name: "goal", type: "string" }], { goal: "dark" })).toEqual({});
    expect(paletteFromVariables(undefined, {})).toEqual({});
  });
});
