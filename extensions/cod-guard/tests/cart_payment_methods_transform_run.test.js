import { describe, expect, it } from "vitest";
import { cartPaymentMethodsTransformRun } from "../src/cart_payment_methods_transform_run.js";

const COD_ID = "gid://shopify/PaymentCustomizationPaymentMethod/3";
const HIDE_COD = { operations: [{ paymentMethodHide: { paymentMethodId: COD_ID } }] };
const NO_CHANGES = { operations: [] };

function buildInput({ total = "120.00", countries = ["ES"], methods, config = null } = {}) {
  return {
    cart: {
      cost: { totalAmount: { amount: total } },
      deliveryGroups: countries.map((countryCode) => ({
        deliveryAddress: countryCode ? { countryCode } : null,
      })),
    },
    paymentMethods: methods ?? [
      { id: "gid://shopify/PaymentCustomizationPaymentMethod/0", name: "Credit card" },
      { id: "gid://shopify/PaymentCustomizationPaymentMethod/1", name: "PayPal" },
      { id: "gid://shopify/PaymentCustomizationPaymentMethod/2", name: "Bank transfer" },
      { id: COD_ID, name: "Cash on Delivery (COD)" },
    ],
    paymentCustomization: { metafield: config ? { jsonValue: config } : null },
  };
}

describe("cod-guard", () => {
  it("keeps cash on delivery for a small order shipped within Spain", () => {
    expect(cartPaymentMethodsTransformRun(buildInput())).toEqual(NO_CHANGES);
  });

  it("hides cash on delivery above the order limit", () => {
    expect(cartPaymentMethodsTransformRun(buildInput({ total: "315.00" }))).toEqual(HIDE_COD);
  });

  it("keeps cash on delivery at exactly the order limit", () => {
    expect(cartPaymentMethodsTransformRun(buildInput({ total: "300.00" }))).toEqual(NO_CHANGES);
  });

  it("hides cash on delivery when shipping outside Spain", () => {
    expect(cartPaymentMethodsTransformRun(buildInput({ countries: ["FR"] }))).toEqual(HIDE_COD);
  });

  it("hides cash on delivery when any delivery group ships abroad", () => {
    expect(cartPaymentMethodsTransformRun(buildInput({ countries: ["ES", "PT"] }))).toEqual(HIDE_COD);
  });

  it("only applies the total rule before the buyer enters an address", () => {
    expect(cartPaymentMethodsTransformRun(buildInput({ countries: [null] }))).toEqual(NO_CHANGES);
    expect(cartPaymentMethodsTransformRun(buildInput({ countries: [null], total: "400.00" }))).toEqual(HIDE_COD);
  });

  it("returns no changes when the store has no cash on delivery method", () => {
    const methods = [{ id: "gid://shopify/PaymentCustomizationPaymentMethod/0", name: "Credit card" }];
    expect(cartPaymentMethodsTransformRun(buildInput({ total: "999.00", methods }))).toEqual(NO_CHANGES);
  });

  it("reads limits and countries from the metafield configuration", () => {
    const config = { maxOrderTotal: 500, allowedCountries: ["ES", "PT"] };
    expect(cartPaymentMethodsTransformRun(buildInput({ total: "450.00", countries: ["PT"], config }))).toEqual(NO_CHANGES);
    expect(cartPaymentMethodsTransformRun(buildInput({ total: "450.00", countries: ["FR"], config }))).toEqual(HIDE_COD);
  });

  it("matches a translated method name from the configuration", () => {
    const methods = [{ id: COD_ID, name: "Contrareembolso" }];
    const config = { methodName: "contrareembolso" };
    expect(cartPaymentMethodsTransformRun(buildInput({ total: "350.00", methods, config }))).toEqual(HIDE_COD);
  });
});
