import { describe, expect, it } from "vitest";
import { cartValidationsGenerateRun } from "../src/cart_validations_generate_run.js";

const NO_CHANGES = { operations: [] };
const COMPANY = { company: { id: "gid://shopify/Company/1" } };

function line(title, quantity, caseSize = null) {
  return {
    quantity,
    merchandise: {
      __typename: "ProductVariant",
      product: { title },
      metafield: caseSize === null ? null : { value: String(caseSize) },
    },
  };
}

function buildInput({
  lines = [line("Olive oil 1L", 12)],
  subtotal = "600.00",
  company = COMPANY,
  step = "CHECKOUT_INTERACTION",
  config = null,
} = {}) {
  return {
    buyerJourney: { step },
    cart: {
      buyerIdentity: { purchasingCompany: company },
      cost: { subtotalAmount: { amount: subtotal } },
      lines,
    },
    validation: { metafield: config ? { jsonValue: config } : null },
  };
}

function blocked(...messages) {
  return {
    operations: [
      { validationAdd: { errors: messages.map((message) => ({ message, target: "$.cart" })) } },
    ],
  };
}

describe("b2b-case-packs", () => {
  it("accepts a B2B order of full cases above the minimum", () => {
    expect(cartValidationsGenerateRun(buildInput())).toEqual(NO_CHANGES);
  });

  it("leaves carts without a purchasing company untouched", () => {
    const lines = [line("Olive oil 1L", 7)];
    expect(cartValidationsGenerateRun(buildInput({ lines, subtotal: "40.00", company: null }))).toEqual(NO_CHANGES);

    const guest = buildInput({ lines, subtotal: "40.00" });
    guest.cart.buyerIdentity = null;
    expect(cartValidationsGenerateRun(guest)).toEqual(NO_CHANGES);
  });

  it("flags only the line that breaks the case size", () => {
    const lines = [line("Olive oil 1L", 12), line("Rosemary honey", 7), line("Sea salt", 18)];
    expect(cartValidationsGenerateRun(buildInput({ lines }))).toEqual(
      blocked("Order Rosemary honey in cases of 6 (you have 7)."),
    );
  });

  it("accepts exact multiples of the case size", () => {
    const lines = [line("Olive oil 1L", 6), line("Rosemary honey", 12), line("Sea salt", 60)];
    expect(cartValidationsGenerateRun(buildInput({ lines }))).toEqual(NO_CHANGES);
  });

  it("checks very large quantities exactly", () => {
    const full = [line("Olive oil 1L", 6_000_000)];
    expect(cartValidationsGenerateRun(buildInput({ lines: full }))).toEqual(NO_CHANGES);

    const oneOver = [line("Olive oil 1L", 6_000_001)];
    expect(cartValidationsGenerateRun(buildInput({ lines: oneOver }))).toEqual(
      blocked("Order Olive oil 1L in cases of 6 (you have 6000001)."),
    );
  });

  it("blocks a subtotal one cent under the minimum", () => {
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "499.99" }))).toEqual(
      blocked("B2B orders need a €500 minimum. Add €0.01 more."),
    );
  });

  it("accepts a subtotal at or above the minimum", () => {
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "500.00" }))).toEqual(NO_CHANGES);
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "500.01" }))).toEqual(NO_CHANGES);
  });

  it("tells the buyer how much is missing", () => {
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "380.00" }))).toEqual(
      blocked("B2B orders need a €500 minimum. Add €120.00 more."),
    );
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "379.99" }))).toEqual(
      blocked("B2B orders need a €500 minimum. Add €120.01 more."),
    );
  });

  it("works in cents for a minimum with decimals", () => {
    const config = { minimumSubtotal: 99.9 };
    // In floats 99.9 - 99.8 is 0.10000000000000853.
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "99.80", config }))).toEqual(
      blocked("B2B orders need a €99.90 minimum. Add €0.10 more."),
    );
    expect(cartValidationsGenerateRun(buildInput({ subtotal: "99.90", config }))).toEqual(NO_CHANGES);
  });

  it("returns every error at once, lines first and then the minimum", () => {
    const lines = [line("Olive oil 1L", 5), line("Rosemary honey", 6), line("Sea salt", 13)];
    expect(cartValidationsGenerateRun(buildInput({ lines, subtotal: "210.50" }))).toEqual(
      blocked(
        "Order Olive oil 1L in cases of 6 (you have 5).",
        "Order Sea salt in cases of 6 (you have 13).",
        "B2B orders need a €500 minimum. Add €289.50 more.",
      ),
    );
  });

  it("skips the rules outside the checkout steps", () => {
    const input = { lines: [line("Olive oil 1L", 1)], subtotal: "8.00" };
    expect(cartValidationsGenerateRun(buildInput({ ...input, step: "CART_INTERACTION" }))).toEqual(NO_CHANGES);
    expect(cartValidationsGenerateRun(buildInput({ ...input, step: null }))).toEqual(NO_CHANGES);
    expect(cartValidationsGenerateRun(buildInput({ ...input, step: "CHECKOUT_COMPLETION" }))).toEqual(
      blocked(
        "Order Olive oil 1L in cases of 6 (you have 1).",
        "B2B orders need a €500 minimum. Add €492.00 more.",
      ),
    );
  });

  it("reads the case size, minimum and messages from the metafield", () => {
    const config = {
      caseSize: 12,
      minimumSubtotal: 1000,
      messages: { caseSize: "{title}: se vende en cajas de {caseSize} (tienes {quantity})." },
    };
    const lines = [line("Olive oil 1L", 24), line("Rosemary honey", 6)];
    expect(cartValidationsGenerateRun(buildInput({ lines, subtotal: "900.00", config }))).toEqual(
      blocked(
        "Rosemary honey: se vende en cajas de 12 (tienes 6).",
        "B2B orders need a €1000 minimum. Add €100.00 more.",
      ),
    );
  });

  it("falls back to the defaults when the metafield is missing or empty", () => {
    const lines = [line("Olive oil 1L", 7)];
    const expected = blocked("Order Olive oil 1L in cases of 6 (you have 7).");
    expect(cartValidationsGenerateRun(buildInput({ lines }))).toEqual(expected);
    expect(cartValidationsGenerateRun(buildInput({ lines, config: {} }))).toEqual(expected);
  });

  it("uses a variant's own case size from custom.case_size", () => {
    const lines = [line("Wine 75cl", 6, 12), line("Wine magnum", 3, 3), line("Olive oil 1L", 12)];
    expect(cartValidationsGenerateRun(buildInput({ lines }))).toEqual(
      blocked("Order Wine 75cl in cases of 12 (you have 6)."),
    );
  });

  it("ignores an unusable case size metafield and keeps the default", () => {
    const lines = [line("Olive oil 1L", 7, "abc"), line("Sea salt", 6, 0), line("Rosemary honey", 12, "12.5")];
    expect(cartValidationsGenerateRun(buildInput({ lines }))).toEqual(
      blocked("Order Olive oil 1L in cases of 6 (you have 7)."),
    );
  });

  it("falls back to 6 when the configured case size is unusable", () => {
    const lines = [line("Olive oil 1L", 12), line("Rosemary honey", 7)];
    const expected = blocked("Order Rosemary honey in cases of 6 (you have 7).");
    for (const caseSize of [0, -6, 2.5, "abc", null]) {
      expect(cartValidationsGenerateRun(buildInput({ lines, config: { caseSize } }))).toEqual(expected);
    }
    // A numeric string still counts.
    expect(cartValidationsGenerateRun(buildInput({ lines, config: { caseSize: "12" } }))).toEqual(
      blocked("Order Rosemary honey in cases of 12 (you have 7)."),
    );
  });

  it("skips custom products, which have no variant to read", () => {
    const lines = [line("Olive oil 1L", 12), { quantity: 1, merchandise: { __typename: "CustomProduct" } }];
    expect(cartValidationsGenerateRun(buildInput({ lines }))).toEqual(NO_CHANGES);
  });
});
