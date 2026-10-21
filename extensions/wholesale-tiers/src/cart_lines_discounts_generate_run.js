// @ts-check

/**
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunInput} CartLinesDiscountsGenerateRunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 * @typedef {import("../generated/api").ProductDiscountCandidate} ProductDiscountCandidate
 *
 * Author: Nicolás Mateos · https://nicolasmateos.com · MIT licensed, credit appreciated.
 */

/**
 * A volume step: lines with at least minQuantity units get percentage off.
 * @typedef {object} Tier
 * @property {number} minQuantity
 * @property {number} percentage
 */

/**
 * Merchant settings, stored as JSON on the discount's metafield.
 * @typedef {object} Configuration
 * @property {string[]} tags  Customer tags that qualify. Shopify passes them to the input
 *                            query as $tags and returns only hasAnyTag, so the code never reads them.
 * @property {Tier[]} tiers   In any order. The highest minQuantity a line reaches wins.
 * @property {string} message Shown in the cart. {percentage} and {minQuantity} are filled in.
 */

/** @type {Configuration} */
const DEFAULTS = {
  tags: ["wholesale"], // Same default as the input query's $tags.
  tiers: [
    { minQuantity: 20, percentage: 10 },
    { minQuantity: 50, percentage: 20 },
  ],
  message: "Wholesale {percentage}%",
};

/** @type {CartLinesDiscountsGenerateRunResult} */
const NO_CHANGES = { operations: [] };

/**
 * Takes a percentage off each line of a wholesale customer's cart, by that line's quantity.
 *
 * @param {CartLinesDiscountsGenerateRunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  // Return only classes the discount has. Enum values are plain strings,
  // so the file runs without the generated types.
  if (!input.discount.discountClasses.includes("PRODUCT")) return NO_CHANGES;
  // Guests and untagged customers pay the regular price.
  if (!input.cart.buyerIdentity?.customer?.hasAnyTag) return NO_CHANGES;

  const config = {
    ...DEFAULTS,
    ...input.discount.metafield?.jsonValue,
  };
  const tiers = usableTiers(config.tiers);

  /** @type {ProductDiscountCandidate[]} */
  const candidates = [];

  // Quantity counts per line (one variant), not across the cart.
  for (const line of input.cart.lines) {
    const tier = tiers.find((t) => line.quantity >= t.minQuantity);
    if (!tier) continue;

    candidates.push({
      message: fill(config.message, tier),
      targets: [{ cartLine: { id: line.id } }],
      value: { percentage: { value: tier.percentage } },
    });
  }

  if (candidates.length === 0) return NO_CHANGES;
  // ALL applies every candidate, one per line. FIRST would stop at the first one.
  return {
    operations: [{ productDiscountsAdd: { candidates, selectionStrategy: "ALL" } }],
  };
}

/**
 * Drops malformed tiers and sorts the rest by minQuantity, highest first,
 * so the first tier a line reaches is the highest one. On equal minQuantity
 * the larger percentage goes first, whatever the order in the metafield.
 *
 * @param {unknown} tiers
 * @returns {Tier[]}
 */
function usableTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((tier) => ({
      minQuantity: Number(tier?.minQuantity),
      percentage: Number(tier?.percentage),
    }))
    .filter(
      (tier) =>
        Number.isInteger(tier.minQuantity) &&
        tier.minQuantity > 0 &&
        tier.percentage > 0 &&
        tier.percentage <= 100,
    )
    .sort((a, b) => b.minQuantity - a.minQuantity || b.percentage - a.percentage);
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
