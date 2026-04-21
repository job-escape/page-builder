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
