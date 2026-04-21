import { describe, expect, it } from "@jest/globals";

import { resolveRequestBodyField } from "./resolve-request-body-field";

describe("resolveRequestBodyField", () => {
  it("returns manual literal values from the new value-picker shape", () => {
    expect(
      resolveRequestBodyField({
        field: {
          id: "1",
          key: "source",
          value: "lead_form",
        },
        answers: {},
        localStates: {},
      }),
    ).toBe("lead_form");
  });

  it("reads local state values from the new value-picker shape", () => {
    expect(
      resolveRequestBodyField({
        field: {
          id: "1",
          key: "event_id",
          value: "pixel_event_id",
          valueDataType: "local",
        },
        answers: {},
        localStates: { pixel_event_id: "uuid-123" },
      }),
    ).toBe("uuid-123");
  });

  it("reads fact values from the new value-picker shape", () => {
    expect(
      resolveRequestBodyField({
        field: {
          id: "1",
          key: "email",
          value: "email",
          valueDataType: "funnel_data",
        },
        answers: { "funnel_data-email": "test@example.com" },
        localStates: {},
      }),
    ).toBe("test@example.com");
  });

  it("supports legacy factName fields as funnel_data facts", () => {
    expect(
      resolveRequestBodyField({
        field: {
          id: "1",
          key: "email",
          factName: "email",
        },
        answers: { "funnel_data-email": "legacy@example.com" },
        localStates: {},
      }),
    ).toBe("legacy@example.com");
  });

  it("reads trigger payload values from the new value-picker shape", () => {
    expect(
      resolveRequestBodyField({
        field: {
          id: "1",
          key: "message",
          value: "error.message",
          valueDataType: "trigger",
        },
        answers: {},
        localStates: {},
        triggerPayload: { error: { message: "Card declined" } },
      }),
    ).toBe("Card declined");
  });

  it("reads trigger payload values from the payload field", () => {
    expect(
      resolveRequestBodyField({
        field: {
          id: "1",
          key: "email",
          value: "email",
          valueDataType: "trigger",
        },
        answers: {},
        localStates: {},
        triggerPayload: { payload: { email: "test@example.com" } },
      }),
    ).toBe("test@example.com");
  });
});
