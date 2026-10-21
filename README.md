# Shopify Checkout Lab

Real merchant tickets, solved with [Shopify Functions](https://shopify.dev/docs/apps/build/functions).
Each one is playable at **[nicolasmateos.com/#lab](https://nicolasmateos.com/#lab)**: break the checkout, deploy the fix and watch the code run line by line.

The site runs the **same source file** that lives in this repo. A Shopify Function is a pure function from an input (shaped by a GraphQL query) to a list of operations, so the browser can call it with a simulated cart exactly as Shopify calls it with a real one.

## Tickets

| # | Ticket | Function API | Status |
|---|--------|--------------|--------|
| 01 | "No cash on delivery above €300 or outside Spain" | Payment Customization | ✅ [`extensions/cod-guard`](extensions/cod-guard) |
| 02 | "B2B buyers must order in cases of 6, minimum €500" | Cart & Checkout Validation | ✅ [`extensions/b2b-case-packs`](extensions/b2b-case-packs) |
| 03 | "Volume discount for `wholesale` customers: 10% from 20 units, 20% from 50" | Discount | ✅ [`extensions/wholesale-tiers`](extensions/wholesale-tiers) |

## 01 · COD guard

> Cash on delivery is hurting us: big orders get refused at the door and we pay the return shipping. Keep COD for orders up to €300, and only within Spain.

- **Input query:** [`cart_payment_methods_transform_run.graphql`](extensions/cod-guard/src/cart_payment_methods_transform_run.graphql) asks only for what the decision needs: the cart total, the delivery countries, the payment methods and the merchant's settings.
- **Logic:** [`cart_payment_methods_transform_run.js`](extensions/cod-guard/src/cart_payment_methods_transform_run.js) returns a `paymentMethodHide` operation when the total is over the limit or any delivery group ships outside the allowed countries.
- **Settings in a metafield:** the limit, the countries and the method name are JSON on the payment customization, so the merchant can change them without a redeploy. The method name is configurable because stores name it differently ("Cash on Delivery (COD)", "Contrareembolso"…).
- **Tests:** [`tests/`](extensions/cod-guard/tests) cover the limit boundary, multiple delivery groups, carts without an address yet, stores without COD and custom settings.

## 02 · B2B case packs

> Our warehouse ships wholesale in cases of 6, but company buyers keep ordering 7 or 10 units and we split cases by hand. Small B2B orders don't cover the handling either. Company accounts must order full cases and spend at least €500 per order. Retail customers shouldn't notice anything.

- **Input query:** [`cart_validations_generate_run.graphql`](extensions/b2b-case-packs/src/cart_validations_generate_run.graphql) asks for the buyer journey step, the purchasing company, the cart subtotal, each line's quantity, product title and `custom.case_size` variant metafield, and the merchant's settings.
- **Logic:** [`cart_validations_generate_run.js`](extensions/b2b-case-packs/src/cart_validations_generate_run.js) returns a `validationAdd` operation with one error per line whose quantity isn't a multiple of its case size, plus one when the subtotal is under the minimum. Carts without a purchasing company pass untouched. The rules run only at the `CHECKOUT_INTERACTION` and `CHECKOUT_COMPLETION` steps: an error during cart interaction rejects the add to cart, and the first case is always under the minimum.
- **Error target:** cart lines aren't a [supported target](https://shopify.dev/docs/api/functions/2026-10/cart-and-checkout-validation#supported-checkout-field-targets), so every error targets `$.cart` and names the product in the message.
- **Settings in a metafield:** `caseSize`, `minimumSubtotal` and optional `messages` are JSON on the validation, merged over the defaults (6, 500 and English texts). Messages accept `{title}`, `{caseSize}`, `{quantity}`, `{minimum}` and `{missing}`, so the store can translate them or change the currency sign. A variant's `custom.case_size` metafield overrides the case size for that product, for example wine in cases of 12 next to oil in cases of 6. A case size that isn't a positive integer, in the settings or on a variant, falls back to the default. The minimum is compared in cents with the cart subtotal as it arrives, in the cart's currency, before shipping, taxes and cart-level discounts. There is no currency conversion.
- **Tests:** [`tests/`](extensions/b2b-case-packs/tests) cover carts without a company, one bad line among several, exact multiples, very large quantities, the 499.99 / 500 / 500.01 boundary, a minimum with decimals, combined errors, cart interaction or a null step against checkout, custom settings, a missing metafield, unusable case sizes and per-variant case sizes.

## 03 · Wholesale tiers

> Our wholesale customers buy by the box but see retail prices, so they email us for quotes and we rebuild each order by hand. Customers tagged `wholesale` should get 10% off any product they order 20 or more of, and 20% from 50. Everyone else pays the regular price.

- **Function API:** the [Discount Function API](https://shopify.dev/docs/api/functions/2026-10/discount) on the `cart.lines.discounts.generate.run` target. It replaces the Product Discount Function API, which is deprecated.
- **Input query:** [`cart_lines_discounts_generate_run.graphql`](extensions/wholesale-tiers/src/cart_lines_discounts_generate_run.graphql) asks for `hasAnyTag` on the customer, each line's id and quantity, the discount's classes and the merchant's settings. The tag list is the `$tags` variable: Shopify fills it from the `tags` key of the same metafield through [`input_variables`](https://shopify.dev/docs/apps/build/functions/input-queries/use-variables-input-queries), so the function only receives a yes or no.
- **Logic:** [`cart_lines_discounts_generate_run.js`](extensions/wholesale-tiers/src/cart_lines_discounts_generate_run.js) returns one `productDiscountsAdd` operation with a candidate per qualifying line: that line as the target, its tier's percentage and a message such as "Wholesale 10%". The selection strategy is `ALL`: a result can hold only one `productDiscountsAdd`, and `FIRST` would apply only the first candidate. Guests, untagged customers and discounts without the `PRODUCT` class get no operations.
- **Per line, not per cart:** each line's quantity picks its tier on its own. 20 bottles of one oil reach 10%, while 10 oils plus 10 honeys don't. A line is one variant, so two sizes of the same product count separately. This follows price lists quoted per item, and the buyer sees which line earned which tier.
- **Settings in a metafield:** `tags`, `tiers` and `message` are JSON on the discount, merged over the defaults (`["wholesale"]`, 20 units for 10% and 50 for 20%, "Wholesale {percentage}%"). Tiers are `{ minQuantity, percentage }` in any order: the function drops malformed ones (a quantity that isn't a positive integer, a percentage outside 0 to 100), sorts the rest and gives each line the highest tier it reaches. When two tiers share a `minQuantity`, the larger percentage wins. A list with no usable tier gives no discount. The message accepts `{percentage}` and `{minQuantity}`, so the store can translate it. The query declares `["wholesale"]` as the default for `$tags`, but Shopify documents that a variable missing from the metafield arrives as null, so the activation mutation always sets `tags`.
- **Tests:** [`tests/`](extensions/wholesale-tiers/tests) cover untagged customers, guests, the 19 / 20 / 49 / 50 boundaries, several lines at different tiers, quantities not added across lines, unsorted custom tiers, tiers sharing a minimum, a missing metafield, malformed tiers, a custom message and a discount without the product class.

## Run the tests

```bash
npm install
npm test
```

## Deploy to a store

1. Link the app to your Partner account: `shopify app config link`
2. In each extension (`extensions/cod-guard`, `extensions/b2b-case-packs` and `extensions/wholesale-tiers`), fetch the function schema for its `api_version` and generate types from its input query: `cd extensions/<handle> && npm install && npm run schema && npm run typegen`. The deploy build runs typegen again, so it needs that `schema.graphql`.
3. Deploy with Shopify CLI 4.9.0 or higher, which `wholesale-tiers` needs for target-level `input_variables`: `shopify app deploy`
4. Turn each function on from the app's Admin API access:
   - [`docs/activate-cod-guard.graphql`](docs/activate-cod-guard.graphql) creates the payment customization.
   - [`docs/activate-b2b-case-packs.graphql`](docs/activate-b2b-case-packs.graphql) creates the validation. It needs the `write_validations` scope, already listed in [`shopify.app.toml`](shopify.app.toml). The merchant can also add it from **Settings > Checkout > Checkout rules**, where it runs with the defaults until the metafield is set.
   - [`docs/activate-wholesale-tiers.graphql`](docs/activate-wholesale-tiers.graphql) creates the automatic discount with the `PRODUCT` class. It needs the `write_discounts` scope, also listed in [`shopify.app.toml`](shopify.app.toml).

## Author

**Nicolás Mateos**, freelance Shopify Plus and B2B developer, Madrid, Spain, working remotely in Spanish and English. On Shopify since 2021, freelancing since 2022. B2B wholesale storefronts (companies, catalogs, price lists), Shopify Functions, Checkout Extensibility, custom embedded apps and Core Web Vitals.

- Site and project list: [nicolasmateos.com](https://nicolasmateos.com)
- Email: nicolasmhbusiness@gmail.com
- More code: [shopify-b2b-order-portal](https://github.com/NicolasShopiDev/shopify-b2b-order-portal)

MIT licensed. Machine-readable authorship is in [`CITATION.cff`](CITATION.cff) and [`llms.txt`](llms.txt).
