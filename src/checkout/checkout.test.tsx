/**
 * What a checkout reports, driven by the events each gateway's SDK dispatches.
 *
 * No SDK runs here: Primer's web components are inert elements in jsdom, and
 * the events they would dispatch are dispatched by hand — which is the point,
 * because the reports are decided entirely by how those events are read.
 */
import "@testing-library/jest-dom";
import { act, render } from "@testing-library/react";

import { createCheckout } from "./checkout";
import { methodsOf, sessionOf, type PaymentReport } from "./contract";

type Report = [string, PaymentReport | undefined];

const flush = () => act(async () => {});

function recorder() {
  const reports: Report[] = [];
  const trigger = jest.fn(async (name: string, values?: PaymentReport) => {
    reports.push([name, values]);
    return true;
  });
  return { reports, trigger };
}

const dispatch = (element: Element, name: string, detail: unknown) =>
  act(() => {
    element.dispatchEvent(new CustomEvent(name, { detail }));
  });

describe("sessionOf and methodsOf", () => {
  it("reads a session from either backend's answer, and nothing from an empty one", () => {
    expect(sessionOf({ gateway: "primer", clientToken: "tok" })).toMatchObject({ gateway: "primer", clientToken: "tok" });
    expect(sessionOf({ checkoutAttemptId: "a", clientToken: "tok", userId: "u" })).toMatchObject({ gateway: "primer" });
    expect(sessionOf("tok")).toMatchObject({ gateway: "primer", clientToken: "tok" });
    expect(sessionOf({ merchantData: { paymentIntent: "p", merchant: "m", signature: "s" } })).toMatchObject({
      gateway: "solidgate",
    });
    expect(sessionOf({ gateway: "paypal", scriptUrl: "https://x/sdk.js", orderId: "o" })).toMatchObject({ orderId: "o" });
    expect(sessionOf(null)).toBeNull();
    expect(sessionOf({ gateway: "solidgate", clientToken: "tok" })).toBeNull();
  });

  it("keeps the designer's order and drops what it does not know", () => {
    expect(methodsOf("applepay, card,apple_pay,bitcoin")).toEqual(["applepay", "card"]);
    expect(methodsOf(["Google-Pay", "PayPal"])).toEqual(["googlepay", "paypal"]);
    expect(methodsOf(undefined)).toEqual(["card", "applepay", "googlepay", "paypal"]);
  });
});

describe("without a session", () => {
  it("holds the space the form will take, and reports nothing", () => {
    const { trigger } = recorder();
    const Checkout = createCheckout({ primer: async () => ({ loadPrimer: () => undefined }) });
    const { container } = render(<Checkout session={null} placeholderHeight={120} trigger={trigger} />);
    expect(container.querySelector('[data-checkout="pending"]')).toHaveStyle({ minHeight: "120px" });
    expect(trigger).not.toHaveBeenCalled();
  });

  it("reports an error when the host has no loader for the session's gateway", async () => {
    const { reports, trigger } = recorder();
    const Checkout = createCheckout({ primer: async () => ({ loadPrimer: () => undefined }) });
    const merchantData = { paymentIntent: "p", merchant: "m", signature: "s" };
    const { container, rerender } = render(<Checkout session={{ merchantData }} trigger={trigger} />);
    rerender(<Checkout session={{ merchantData }} trigger={trigger} />);
    await flush();
    expect(container).toBeEmptyDOMElement();
    expect(reports).toEqual([["error", expect.objectContaining({ gateway: "solidgate" })]]);
  });
});

describe("Primer", () => {
  const loadPrimer = jest.fn();
  const Checkout = createCheckout({ primer: async () => ({ loadPrimer }) });

  async function mount(props: Record<string, unknown> = {}) {
    const { reports, trigger } = recorder();
    const view = render(<Checkout session={{ gateway: "primer", clientToken: "tok-1" }} trigger={trigger} {...props} />);
    await flush();
    const element = view.container.querySelector("primer-checkout") as HTMLElement & { options?: Record<string, any> };
    return { ...view, element, reports, trigger };
  }

  it("boots the SDK once, and draws the methods in the designer's order", async () => {
    const { element } = await mount({ methods: "applepay,card,paypal", buttonLabel: "Pay now", cardholderName: true });
    await mount();
    expect(loadPrimer).toHaveBeenCalledTimes(1);
    expect(element).toHaveAttribute("client-token", "tok-1");
    const drawn = [...element.querySelectorAll("[data-payment-method]")].map((node) => node.getAttribute("data-payment-method"));
    expect(drawn).toEqual(["applepay", "card", "paypal"]);
    expect(element.querySelector('[include="APPLE_PAY"]')).not.toBeNull();
    expect(element.querySelector("primer-input-card-holder-name")).not.toBeNull();
    expect(element.querySelector('button[type="submit"]')).toHaveTextContent("Pay now");
    expect(element.options?.card).toEqual({ cardholderName: { visible: true, required: true } });
    expect(element.options?.paypal).toMatchObject({ vault: true });
  });

  it("reports a card payment's submit and success, carrying an idempotency key", async () => {
    const { element, reports } = await mount();
    const continuePaymentCreation = jest.fn();
    await dispatch(element, "primer:payment-start", { paymentMethodType: "PAYMENT_CARD", continuePaymentCreation });
    await dispatch(element, "primer:payment-success", { paymentMethodType: "PAYMENT_CARD", payment: { id: "pay-1" } });
    expect(continuePaymentCreation).toHaveBeenCalledWith({ idempotencyKey: expect.any(String) });
    expect(reports).toEqual([
      ["purchase_click", { gateway: "primer", method: "card" }],
      ["success", { gateway: "primer", method: "card", orderId: "pay-1", paymentId: "pay-1" }],
    ]);
  });

  it("rotates the key after a decline, so the retry is a new payment", async () => {
    const { element, reports } = await mount();
    const keys: string[] = [];
    const start = () =>
      dispatch(element, "primer:payment-start", {
        paymentMethodType: "PAYMENT_CARD",
        continuePaymentCreation: ({ idempotencyKey }: { idempotencyKey: string }) => keys.push(idempotencyKey),
      });
    await start();
    await dispatch(element, "primer:payment-failure", {
      paymentMethodType: "PAYMENT_CARD",
      payment: { id: "pay-2" },
      error: { message: "Insufficient funds", code: "51" },
    });
    await start();
    expect(keys[0]).not.toBe(keys[1]);
    expect(reports[1]).toEqual([
      "decline",
      { gateway: "primer", method: "card", orderId: "pay-2", paymentId: "pay-2", message: "Insufficient funds", code: "51" },
    ]);
  });

  it("reports a wallet tap as a click, and its purchase only once the sheet is approved", async () => {
    const { element, reports } = await mount();
    await dispatch(element, "primer:payment-start", { paymentMethodType: "APPLE_PAY", continuePaymentCreation: jest.fn() });
    expect(reports).toEqual([["click", { gateway: "primer", method: "applepay" }]]);
    await dispatch(element, "primer:state-change", { isProcessing: true });
    await dispatch(element, "primer:state-change", { isProcessing: false });
    await dispatch(element, "primer:payment-success", { paymentMethodType: "APPLE_PAY", payment: { id: "pay-3" } });
    expect(reports.map(([name]) => name)).toEqual(["click", "purchase_click", "success"]);

    await dispatch(element, "primer:payment-start", { paymentMethodType: "GOOGLE_PAY", continuePaymentCreation: jest.fn() });
    await dispatch(element, "primer:payment-cancel", { paymentMethodType: "GOOGLE_PAY" });
    expect(reports.slice(3)).toEqual([
      ["click", { gateway: "primer", method: "googlepay" }],
      ["cancel", { gateway: "primer", method: "googlepay" }],
    ]);
  });

  it("reports one PayPal tap and one closed popup once each, and never as a decline", async () => {
    const { element, reports } = await mount();
    const start = { paymentMethodType: "PAYPAL", continuePaymentCreation: jest.fn() };
    await dispatch(element, "primer:payment-start", start);
    await dispatch(element, "primer:payment-start", start);
    // PayPal's processing flag flips at the tap: not a purchase.
    await dispatch(element, "primer:state-change", { isProcessing: true });
    await dispatch(element, "primer:payment-cancel", { paymentMethodType: "PAYPAL" });
    await dispatch(element, "primer:payment-failure", { error: { message: "PayPal payment was cancelled by the user" } });
    await dispatch(element, "primer:payment-failure", { error: { origin: "user", message: "Detected popup close" } });
    expect(reports).toEqual([
      ["click", { gateway: "primer", method: "paypal" }],
      ["cancel", { gateway: "primer", method: "paypal" }],
    ]);
  });

  it("reports a 3-D Secure challenge", async () => {
    const { element, reports } = await mount();
    await dispatch(element, "primer:3ds-challenge", {});
    expect(reports).toEqual([["challenge", { gateway: "primer", method: "card" }]]);
  });

  it("rebuilds the form for a new session's token", async () => {
    const { element, rerender, trigger, container } = await mount();
    rerender(<Checkout session={{ gateway: "primer", clientToken: "tok-2" }} trigger={trigger} />);
    const next = container.querySelector("primer-checkout");
    expect(next).toHaveAttribute("client-token", "tok-2");
    expect(next).not.toBe(element);
  });
});

describe("Solidgate", () => {
  let captured: Record<string, any> = {};
  const Payment = (props: Record<string, any>) => {
    captured = props;
    return <div data-testid="solidgate-form" />;
  };
  const Checkout = createCheckout({ solidgate: async () => ({ default: Payment }) });
  const merchantData = { paymentIntent: "p", merchant: "m", signature: "s" };

  async function mount(props: Record<string, unknown> = {}) {
    const { reports, trigger } = recorder();
    const view = render(<Checkout session={{ gateway: "solidgate", merchantData }} trigger={trigger} {...props} />);
    await flush();
    return { ...view, reports };
  }

  it("gives the form the session, the wallets their slots and the button its words", async () => {
    const { container } = await mount({ methods: "googlepay,card", buttonLabel: "Pay", buttonStyle: { backgroundColor: "#000" } });
    expect(captured.merchantData).toEqual(merchantData);
    expect(captured.formParams).toEqual({ submitButtonText: "Pay" });
    expect(captured.styles.submit_button["background-color"]).toBe("#000");
    expect(captured.googlePayContainerRef.current).toBe(container.querySelector('[data-payment-method="googlepay"]'));
    expect(captured.applePayContainerRef).toBeUndefined();
  });

  it("reports a card payment's submit and success with the order to confirm", async () => {
    const { reports } = await mount();
    act(() => captured.onSubmit({ entity: "form" }));
    act(() => captured.onSuccess({ entity: "form", order: { order_id: "ord-1" } }));
    act(() => captured.onSuccess({ entity: "form", order: { order_id: "ord-1" } }));
    expect(reports).toEqual([
      ["purchase_click", { gateway: "solidgate", method: "card" }],
      ["success", { gateway: "solidgate", method: "card", orderId: "ord-1" }],
    ]);
  });

  it("attributes a wallet's purchase from the order status, and a closed sheet is not a decline", async () => {
    const { reports } = await mount();
    act(() => captured.onInteraction({ target: { name: "applePay", interaction: "click" } }));
    act(() => captured.onFail({ entity: "applebtn", code: "3.13", message: "closed" }));
    act(() => captured.onInteraction({ target: { name: "applePay", interaction: "pageClose" } }));
    act(() => captured.onInteraction({ target: { name: "googlePay", interaction: "click" } }));
    act(() => captured.onOrderStatus({ response: { order: { method: "google_pay" } } }));
    act(() => captured.onOrderStatus({ response: { order: { method: "google_pay" } } }));
    act(() => captured.onSubmit({ entity: "googlebtn" }));
    act(() => captured.onFail({ entity: "googlebtn", code: "0.02", message: "Declined" }));
    expect(reports).toEqual([
      ["click", { gateway: "solidgate", method: "applepay" }],
      ["cancel", { gateway: "solidgate", method: "applepay" }],
      ["click", { gateway: "solidgate", method: "googlepay" }],
      ["purchase_click", { gateway: "solidgate", method: "googlepay" }],
      ["decline", { gateway: "solidgate", method: "googlepay", message: "Declined", code: "0.02" }],
    ]);
  });

  it("keeps the form mounted off-screen when only wallets are offered", async () => {
    const { container } = await mount({ methods: "applepay" });
    expect(container.querySelector('[data-payment-method="card"]')).toBeNull();
    expect(container.querySelector('[data-testid="solidgate-form"]')?.parentElement).toHaveStyle({ opacity: "0" });
  });
});

describe("PayPal through Solidgate", () => {
  it("boots the order's script in its own frame, and reports what its button says", async () => {
    const { reports, trigger } = recorder();
    const Checkout = createCheckout({});
    const { container, rerender } = render(
      <Checkout
        session={{ gateway: "paypal", scriptUrl: "https://pay.example/sdk.js", orderId: "pp-1" }}
        paypalStyle={{ color: "black", height: 48 }}
        trigger={trigger}
      />,
    );
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    const doc = frame.contentDocument as Document;
    const script = doc.querySelector("script") as HTMLScriptElement;
    expect(script.src).toBe("https://pay.example/sdk.js");
    expect(script.dataset).toMatchObject({ shape: "pill", color: "black", height: "48" });

    const button = doc.getElementById("paypal-button") as HTMLElement;
    await dispatch(button, "button-click", {});
    await dispatch(button, "button-cancel", {});
    await dispatch(button, "order-started-processing", {});
    await dispatch(button, "order-processed", { data: { error: { recommended_message_for_user: "Try another account" } } });
    await dispatch(button, "order-processed", { data: {} });
    const paypal = { gateway: "paypal", method: "paypal", orderId: "pp-1" };
    expect(reports).toEqual([
      ["click", paypal],
      ["cancel", paypal],
      ["purchase_click", paypal],
      ["decline", { ...paypal, message: "Try another account" }],
      ["success", paypal],
    ]);

    rerender(
      <Checkout session={{ gateway: "paypal", scriptUrl: "https://pay.example/sdk2.js", orderId: "pp-2" }} trigger={trigger} />,
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(container.querySelector("iframe")).not.toBe(frame);
  });
});
