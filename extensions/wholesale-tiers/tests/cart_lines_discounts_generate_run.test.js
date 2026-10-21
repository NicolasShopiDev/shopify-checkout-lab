import { describe, expect, it } from "vitest";
import { cartLinesDiscountsGenerateRun } from "../src/cart_lines_discounts_generate_run.js";

const NO_CHANGES = { operations: [] };

function line(n, quantity) {
  return { id: `gid://shopify/CartLine/${n}`, quantity };
}

function buildInput({
  lines = [line(1, 20)],
  tagged = true,
  config = null,
  classes = ["PRODUCT"],
} = {}) {
  return {
    cart: {
      buyerIdentity: { customer: { hasAnyTag: tagged } },
      lines,
    },
    discount: {
      discountClasses: classes,
      metafield: config ? { jsonValue: config } : null,
    },
  };
}

function off(n, percentage, message = `Wholesale ${percentage}%`) {
  return {
    message,
    targets: [{ cartLine: { id: `gid://shopify/CartLine/${n}` } }],
    value: { percentage: { value: percentage } },
  };
}

function discounted(...candidates) {
  return {
    operations: [{ productDiscountsAdd: { candidates, selectionStrategy: "ALL" } }],
  };
}

describe("wholesale-tiers", () => {
  it("leaves customers without the wholesale tag at full price", () => {
    const lines = [line(1, 60)];
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines, tagged: false }))).toEqual(NO_CHANGES);
  });

  it("leaves guests at full price", () => {
    const guest = buildInput({ lines: [line(1, 60)] });
    guest.cart.buyerIdentity.customer = null;
    expect(cartLinesDiscountsGenerateRun(guest)).toEqual(NO_CHANGES);

    guest.cart.buyerIdentity = null;
    expect(cartLinesDiscountsGenerateRun(guest)).toEqual(NO_CHANGES);
  });

  it("gives nothing under 20 units", () => {
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 19)] }))).toEqual(NO_CHANGES);
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 0)] }))).toEqual(NO_CHANGES);
  });

  it("gives 10% at exactly 20 units", () => {
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 20)] }))).toEqual(discounted(off(1, 10)));
  });

  it("keeps 10% at 49 units", () => {
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 49)] }))).toEqual(discounted(off(1, 10)));
  });

  it("moves to 20% at 50 units", () => {
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 50)] }))).toEqual(discounted(off(1, 20)));
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 300)] }))).toEqual(discounted(off(1, 20)));
  });

  it("prices each line by its own quantity", () => {
    const lines = [line(1, 12), line(2, 20), line(3, 75), line(4, 8), line(5, 49)];
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines }))).toEqual(
      discounted(off(2, 10), off(3, 20), off(5, 10)),
    );
  });

  it("does not add quantities across lines", () => {
    const lines = [line(1, 10), line(2, 10), line(3, 19)];
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines }))).toEqual(NO_CHANGES);
  });

  it("sorts custom tiers from the metafield before matching", () => {
    const config = {
      tiers: [
        { minQuantity: 100, percentage: 25 },
        { minQuantity: 10, percentage: 5 },
        { minQuantity: 50, percentage: 15 },
      ],
    };
    const lines = [line(1, 9), line(2, 10), line(3, 60), line(4, 100), line(5, 99)];
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines, config }))).toEqual(
      discounted(off(2, 5), off(3, 15), off(4, 25), off(5, 15)),
    );
  });

  it("picks the larger percentage when two tiers share a minimum", () => {
    const lines = [line(1, 25)];
    const low = { minQuantity: 20, percentage: 10 };
    const high = { minQuantity: 20, percentage: 15 };
    for (const tiers of [[low, high], [high, low]]) {
      expect(cartLinesDiscountsGenerateRun(buildInput({ lines, config: { tiers } }))).toEqual(
        discounted(off(1, 15)),
      );
    }
  });

  it("falls back to the defaults when the metafield is missing or empty", () => {
    const lines = [line(1, 20), line(2, 50)];
    const expected = discounted(off(1, 10), off(2, 20));
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines }))).toEqual(expected);
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines, config: {} }))).toEqual(expected);
  });

  it("drops malformed tiers and keeps the valid ones", () => {
    const config = {
      tiers: [
        { minQuantity: "abc", percentage: 50 },
        { minQuantity: 5, percentage: 0 },
        { minQuantity: 5, percentage: 150 },
        { minQuantity: 2.5, percentage: 30 },
        null,
        { minQuantity: "30", percentage: "12.5" },
      ],
    };
    const lines = [line(1, 6), line(2, 30)];
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines, config }))).toEqual(
      discounted(off(2, 12.5)),
    );
  });

  it("gives nothing when no tier is usable", () => {
    const lines = [line(1, 80)];
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines, config: { tiers: [] } }))).toEqual(NO_CHANGES);
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines, config: { tiers: "20:10" } }))).toEqual(NO_CHANGES);
  });

  it("uses the message template from the metafield", () => {
    const config = { message: "Mayorista -{percentage}% (desde {minQuantity} uds.)" };
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [line(1, 50)], config }))).toEqual(
      discounted(off(1, 20, "Mayorista -20% (desde 50 uds.)")),
    );
  });

  it("returns nothing when the discount lacks the product class", () => {
    const input = buildInput({ lines: [line(1, 50)], classes: ["ORDER", "SHIPPING"] });
    expect(cartLinesDiscountsGenerateRun(input)).toEqual(NO_CHANGES);
  });

  it("returns nothing for an empty cart", () => {
    expect(cartLinesDiscountsGenerateRun(buildInput({ lines: [] }))).toEqual(NO_CHANGES);
  });
});
