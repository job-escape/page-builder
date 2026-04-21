import { describe, expect, it } from "@jest/globals";

import { buildRequestBodyObject } from "./build-request-body-object";

describe("buildRequestBodyObject", () => {
  it("creates a flat body for plain keys", () => {
    expect(
      buildRequestBodyObject({
        fields: [
          {
            id: "1",
            key: "email",
            value: "email",
            valueDataType: "funnel_data",
          },
        ],
        answers: { "funnel_data-email": "test@example.com" },
        localStates: {},
      }),
    ).toEqual({
      email: "test@example.com",
    });
  });

  it("creates nested objects for dot-separated keys", () => {
    expect(
      buildRequestBodyObject({
        fields: [
          {
            id: "1",
            key: "funnel_info.fbp",
            value: "fbp",
            valueDataType: "funnel_data",
          },
          {
            id: "2",
            key: "funnel_info.fbc",
            value: "fbc",
            valueDataType: "funnel_data",
          },
        ],
        answers: {
          "funnel_data-fbp": "fb.1.123",
          "funnel_data-fbc": "fb.1.456",
        },
        localStates: {},
      }),
    ).toEqual({
      funnel_info: {
        fbp: "fb.1.123",
        fbc: "fb.1.456",
      },
    });
  });

  it("supports trigger payload values for nested keys", () => {
    expect(
      buildRequestBodyObject({
        fields: [
          {
            id: "1",
            key: "profile.contact.email",
            value: "email",
            valueDataType: "trigger",
          },
        ],
        answers: {},
        localStates: {},
        triggerPayload: {
          payload: {
            email: "test@example.com",
          },
        },
      }),
    ).toEqual({
      profile: {
        contact: {
          email: "test@example.com",
        },
      },
    });
  });

  it("writes local timestamp fields as numbers", () => {
    expect(
      buildRequestBodyObject({
        fields: [
          {
            id: "1",
            key: "funnel_info.fb_timestamp",
            value: "fb_timestamp",
            valueDataType: "local",
          },
        ],
        answers: {},
        localStates: {
          fb_timestamp: "1775936135934",
        },
      }),
    ).toEqual({
      funnel_info: {
        fb_timestamp: 1775936135934,
      },
    });
  });
});
