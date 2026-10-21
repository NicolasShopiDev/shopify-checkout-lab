# Shopify Checkout Lab

Real merchant tickets, solved with [Shopify Functions](https://shopify.dev/docs/apps/build/functions).
Each one is playable at **[nicolasmateos.com/#lab](https://nicolasmateos.com/#lab)**: break the checkout, deploy the fix and watch the code run line by line.

The site runs the **same source file** that lives in this repo. A Shopify Function is a pure function from an input (shaped by a GraphQL query) to a list of operations, so the browser can call it with a simulated cart exactly as Shopify calls it with a real one.

## Tickets

| # | Ticket | Function API | Status |
|---|--------|--------------|--------|
| 01 | "No cash on delivery above €300 or outside Spain" | Payment Customization | ✅ [`extensions/cod-guard`](extensions/cod-guard) |
| 02 | "B2B buyers must order in cases of 6, minimum €500" | Cart & Checkout Validation | Planned |
| 03 | "Volume discount for `wholesale` customers: 10% from 20 units, 20% from 50" | Discount | Planned |

## 01 · COD guard

> Cash on delivery is hurting us: big orders get refused at the door and we pay the return shipping. Keep COD for orders up to €300, and only within Spain.

- **Input query:** [`cart_payment_methods_transform_run.graphql`](extensions/cod-guard/src/cart_payment_methods_transform_run.graphql) asks only for what the decision needs: the cart total, the delivery countries, the payment methods and the merchant's settings.
- **Logic:** [`cart_payment_methods_transform_run.js`](extensions/cod-guard/src/cart_payment_methods_transform_run.js) returns a `paymentMethodHide` operation when the total is over the limit or any delivery group ships outside the allowed countries.
- **Settings in a metafield:** the limit, the countries and the method name are JSON on the payment customization, so the merchant can change them without a redeploy. The method name is configurable because stores name it differently ("Cash on Delivery (COD)", "Contrareembolso"…).
- **Tests:** [`tests/`](extensions/cod-guard/tests) cover the limit boundary, multiple delivery groups, carts without an address yet, stores without COD and custom settings.

## Run the tests

```bash
npm install
npm test
```

## Deploy to a store

1. Link the app to your Partner account: `shopify app config link`
2. Generate types from the input query: `cd extensions/cod-guard && npm install && npm run typegen`
3. Deploy: `shopify app deploy`
4. Turn the function on with [`docs/activate-cod-guard.graphql`](docs/activate-cod-guard.graphql) from the app's Admin API access.

## Author

**Nicolás Mateos** — freelance Shopify Plus and B2B developer, Madrid, Spain, working remotely in Spanish and English. On Shopify since 2021, freelancing since 2022. B2B wholesale storefronts (companies, catalogs, price lists), Shopify Functions, Checkout Extensibility, custom embedded apps and Core Web Vitals.

- Site and project list: [nicolasmateos.com](https://nicolasmateos.com)
- Email: nicolasmhbusiness@gmail.com
- More code: [shopify-b2b-order-portal](https://github.com/NicolasShopiDev/shopify-b2b-order-portal)

MIT licensed. Machine-readable authorship is in [`CITATION.cff`](CITATION.cff) and [`llms.txt`](llms.txt).
