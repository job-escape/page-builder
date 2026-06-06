import { describe, expect, it } from "@jest/globals";

import { resolveValuePicker } from "./resolve-value-picker";

describe("resolveValuePicker", () => {
  it("returns manual literal values when dataType is empty", () => {
    expect(
      resolveValuePicker({
        value: "literal-id",
        answers: {},
        localStates: {},
      }),
    ).toBe("literal-id");
  });

  it("reads local state values", () => {
    expect(
      resolveValuePicker({
        value: "pixel_event_id",
        dataType: "local",
        answers: {},
        localStates: { pixel_event_id: "uuid-123" },
      }),
    ).toBe("uuid-123");
  });

  describe("cookie data type", () => {
    afterEach(() => {
      document.cookie = "_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });

    it("reads values from cookies", () => {
      document.cookie = "_fbc=fb.1.1700000000.abc123; path=/";

      expect(
        resolveValuePicker({
          value: "_fbc",
          dataType: "cookie",
          answers: {},
          localStates: {},
        }),
      ).toBe("fb.1.1700000000.abc123");
    });

    it("returns undefined when the cookie is absent", () => {
      expect(
        resolveValuePicker({
          value: "_missing_cookie",
          dataType: "cookie",
          answers: {},
          localStates: {},
        }),
      ).toBeUndefined();
    });
  });

  it("returns the current timestamp for date.now() values", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1710000000000);

    expect(
      resolveValuePicker({
        dataType: "date.now()",
        answers: {},
        localStates: {},
      }),
    ).toBe(1710000000000);

    nowSpy.mockRestore();
  });

  it("returns the current timestamp for date_now values", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1710000000001);

    expect(
      resolveValuePicker({
        dataType: "date_now",
        answers: {},
        localStates: {},
      }),
    ).toBe(1710000000001);

    nowSpy.mockRestore();
  });

  it("reads fact values from answers", () => {
    expect(
      resolveValuePicker({
        value: "email",
        dataType: "funnel_data",
        answers: { "funnel_data-email": "test@example.com" },
        localStates: {},
      }),
    ).toBe("test@example.com");
  });

  it("reads trigger payload values by path", () => {
    expect(
      resolveValuePicker({
        value: "error.message",
        dataType: "trigger",
        answers: {},
        localStates: {},
        triggerPayload: { error: { message: "Card declined" } },
      }),
    ).toBe("Card declined");
  });

  it("reads trigger payload values from the payload field", () => {
    expect(
      resolveValuePicker({
        value: "email",
        dataType: "trigger",
        answers: {},
        localStates: {},
        triggerPayload: { payload: { email: "test@example.com" } },
      }),
    ).toBe("test@example.com");
  });

  it("preserves boolean trigger payload values", () => {
    expect(
      resolveValuePicker({
        value: "consent",
        dataType: "trigger",
        answers: {},
        localStates: {},
        triggerPayload: { payload: { consent: false } },
      }),
    ).toBe(false);
  });
});
