/**
 * Which brand a visitor sees, and the two ways that goes wrong.
 *
 * The order matters, and so does what happens to a name the artifact no longer
 * carries — a stale QA link or a cookie written before a brand was deleted must
 * fall through to something real rather than painting nothing.
 */
import { chooseVariant } from "./variant";

const available = ["control", "warm"];

describe("chooseVariant", () => {
  it("honours an explicit request over everything", () => {
    expect(chooseVariant({ available, requested: "warm", stored: "control", fallback: "control" }))
      .toBe("warm");
  });

  it("keeps what the visitor already has over the artifact's default", () => {
    // The assignment must not move under someone mid-funnel.
    expect(chooseVariant({ available, stored: "warm", fallback: "control" })).toBe("warm");
  });

  it("falls back to the artifact's default", () => {
    expect(chooseVariant({ available, fallback: "control" })).toBe("control");
  });

  it("ignores a requested brand the artifact does not carry", () => {
    // A stale `?v=` link, not an instruction to paint nothing.
    expect(chooseVariant({ available, requested: "sepia", fallback: "control" })).toBe("control");
  });

  it("ignores a stored brand that has since been deleted", () => {
    expect(chooseVariant({ available, stored: "gone", fallback: "control" })).toBe("control");
  });

  it("ignores a default the artifact does not carry either", () => {
    expect(chooseVariant({ available, fallback: "gone" })).toBeUndefined();
  });

  it("needs no name at all when there is only one brand", () => {
    expect(chooseVariant({ available: ["only"] })).toBe("only");
  });

  it("chooses nothing rather than guessing between several", () => {
    expect(chooseVariant({ available })).toBeUndefined();
  });

  it("has nothing to choose when the artifact carries no brands", () => {
    expect(chooseVariant({ available: [], requested: "warm" })).toBeUndefined();
  });
});
