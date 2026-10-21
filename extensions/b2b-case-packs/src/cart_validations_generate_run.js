// @ts-check

/**
 * @typedef {import("../generated/api").CartValidationsGenerateRunInput} CartValidationsGenerateRunInput
 * @typedef {import("../generated/api").CartValidationsGenerateRunResult} CartValidationsGenerateRunResult
 * @typedef {import("../generated/api").ValidationError} ValidationError
 *
 * Author: Nicolás Mateos · https://nicolasmateos.com · MIT licensed, credit appreciated.
 */

/**
 * Merchant settings, stored as JSON on the validation's metafield.
 * @typedef {object} Configuration
 * @property {number} caseSize        Units per case. A variant's custom.case_size metafield overrides it.
 * @property {number} minimumSubtotal B2B orders below this subtotal are blocked, in the cart's currency.
 * @property {{ caseSize: string, minimum: string }} messages
 *   Error texts. {title}, {caseSize}, {quantity}, {minimum} and {missing} are filled in.
 */

/** @type {Configuration} */
const DEFAULTS = {
  caseSize: 6,
  minimumSubtotal: 500,
  messages: {
    caseSize: "Order {title} in cases of {caseSize} (you have {quantity}).",
    minimum: "B2B orders need a €{minimum} minimum. Add €{missing} more.",
  },
};

/** @type {CartValidationsGenerateRunResult} */
const NO_CHANGES = { operations: [] };

// Cart lines aren't a supported error target, so every error shows at cart level.
const TARGET = "$.cart";

/**
 * Blocks B2B checkouts with lines outside full cases or a subtotal under the minimum.
 *
 * @param {CartValidationsGenerateRunInput} input
 * @returns {CartValidationsGenerateRunResult}
 */
export function cartValidationsGenerateRun(input) {
  // Checkout steps only. During cart interaction an error rejects the add to
  // cart, and the first case is always under the minimum. The step can be null.
  const step = input.buyerJourney.step;
  if (step !== "CHECKOUT_INTERACTION" && step !== "CHECKOUT_COMPLETION") return NO_CHANGES;
  // Only buyers ordering for a company are bound by the rules.
  if (!input.cart.buyerIdentity?.purchasingCompany) return NO_CHANGES;

  const settings = input.validation?.metafield?.jsonValue ?? {};
  const config = {
    ...DEFAULTS,
    ...settings,
    messages: { ...DEFAULTS.messages, ...settings.messages },
  };
  // A typo like 0 would otherwise flag every line.
  const defaultCaseSize = positiveInteger(config.caseSize) ?? DEFAULTS.caseSize;

  /** @type {ValidationError[]} */
  const errors = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const caseSize = positiveInteger(line.merchandise.metafield?.value) ?? defaultCaseSize;
    if (line.quantity % caseSize === 0) continue;

    errors.push({
      message: fill(config.messages.caseSize, {
        title: line.merchandise.product.title,
        caseSize,
        quantity: line.quantity,
      }),
      target: TARGET,
    });
  }

  // Merchandise before shipping, taxes and cart-level discounts, in the cart's
  // currency. It's compared as is: no conversion. Cents avoid float rounding.
  const subtotal = Math.round(parseFloat(input.cart.cost.subtotalAmount.amount) * 100);
  const minimum = Math.round(Number(config.minimumSubtotal) * 100);
  if (subtotal < minimum) {
    errors.push({
      message: fill(config.messages.minimum, {
        // 500 reads as €500, 99.9 as €99.90.
        minimum: (minimum / 100).toFixed(minimum % 100 === 0 ? 0 : 2),
        missing: ((minimum - subtotal) / 100).toFixed(2),
      }),
      target: TARGET,
    });
  }

  if (errors.length === 0) return NO_CHANGES;
  return { operations: [{ validationAdd: { errors } }] };
}

/**
 * Reads a whole number above 0 from a setting or metafield value.
 *
 * @param {unknown} value
 * @returns {number | undefined} undefined for anything else, such as "abc", 0 or 2.5.
 */
function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

/**
 * Replaces {name} placeholders. Unknown ones are left as written.
 *
 * @param {string} template
 * @param {Record<string, string | number>} values
 * @returns {string}
 */
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
