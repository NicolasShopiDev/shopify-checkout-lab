// @ts-check

/**
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunInput} CartPaymentMethodsTransformRunInput
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunResult} CartPaymentMethodsTransformRunResult
 */

/**
 * Merchant settings, stored as JSON on the payment customization's metafield.
 * @typedef {object} Configuration
 * @property {string} methodName         Matched case-insensitively against the payment method name.
 * @property {number} maxOrderTotal      Above this cart total the method is hidden.
 * @property {string[]} allowedCountries Shipping anywhere else hides the method.
 */

/** @type {Configuration} */
const DEFAULTS = {
  methodName: "cash on delivery",
  maxOrderTotal: 300,
  allowedCountries: ["ES"],
};

/** @type {CartPaymentMethodsTransformRunResult} */
const NO_CHANGES = { operations: [] };

/**
 * Hides cash on delivery for large orders and for orders shipped abroad.
 *
 * @param {CartPaymentMethodsTransformRunInput} input
 * @returns {CartPaymentMethodsTransformRunResult}
 */
export function cartPaymentMethodsTransformRun(input) {
  const config = {
    ...DEFAULTS,
    ...input.paymentCustomization?.metafield?.jsonValue,
  };

  const method = input.paymentMethods.find((m) =>
    m.name.toLowerCase().includes(config.methodName.toLowerCase()),
  );
  if (!method) return NO_CHANGES;

  const total = parseFloat(input.cart.cost.totalAmount.amount);
  // No address yet means no countries, so only the total rule applies.
  const countries = input.cart.deliveryGroups
    .map((group) => group.deliveryAddress?.countryCode)
    .filter(Boolean);

  const overLimit = total > config.maxOrderTotal;
  const shipsAbroad = countries.some(
    (code) => !config.allowedCountries.includes(code),
  );
  if (!overLimit && !shipsAbroad) return NO_CHANGES;

  return {
    operations: [{ paymentMethodHide: { paymentMethodId: method.id } }],
  };
}
