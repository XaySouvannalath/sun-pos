# Sun POS API

The Sun POS frontend talks to a REST API at `/api/v1`. This repository includes a **mock backend** that implements the
whole API, so the app runs straight after `git clone`. When your real backend is ready, point the app at it with one
setting. The screens don't need to change.

- [How it works](#how-it-works) and [switching to your backend](#switching-to-your-backend)
- [The mock backend](#the-mock-backend) and its JSON data files
- [REST API reference](#rest-api-reference): 66 endpoints
- [Building your backend](#building-your-backend): a checklist and the contract tests

Types for every request and response are in [`src/types.ts`](../src/types.ts).

---

## How it works

```
 Screens (src/views, src/components)
        │
 Pinia stores (src/stores)        cache data for the screens, call the API
        │
 API client (src/api)             typed functions, one per endpoint
        │
        ├── HTTP ──► /api/v1 ──► mock backend (npm run dev)       default
        │                    └─► your backend (VITE_API_PROXY or VITE_API_URL)
        │
        └── in-browser ──► mock backend saved in localStorage      VITE_API_MODE=local
```

The order being built on the Sell screen stays on the device. Everything else goes through the API: sign-in, the menu,
checkout, held orders, customers, shifts, stock, reports and settings.

## Switching to your backend

Create `.env.local` in the project root (see [`.env.example`](../.env.example)) and set **one** of these:

| Setting                                       | When to use it                                    | What happens                                                                                           |
| --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| _(nothing)_                                   | Default                                           | `npm run dev` serves the mock API at `/api/v1`.                                                        |
| `VITE_API_PROXY=http://localhost:8080`        | Developing against your backend                   | The dev server forwards `/api/*` to your backend. The mock turns off. No CORS setup needed.            |
| `VITE_API_URL=https://pos.example.com/api/v1` | Production builds, or a backend on another domain | The app calls this URL directly. Your backend must allow the site's origin (CORS). The mock turns off. |
| `VITE_API_MODE=local`                         | No server at all (demos, offline)                 | The mock runs inside the browser and saves to `localStorage`.                                          |

Restart `npm run dev` after changing `.env.local`. With `VITE_API_PROXY`, your backend must serve the endpoints under
`/api/v1`.

## The mock backend

| File                           | Purpose                                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mock/data/*.json`         | Seed data: `settings`, `staff`, `categories`, `products`, `customers`, `orders` (about 220 demo sales), `exchange-rates` (a week of demo rates), `floor` (tables), `stations`. Edit these to change the starting data. |
| `src/mock/router.ts`           | Every endpoint: routing, validation, roles and business rules. **This is the reference implementation for your backend.**                                                                                              |
| `src/mock/logic.ts`            | Top-seller ranking, shift cash-up and report calculations.                                                                                                                                                             |
| `src/mock/db.ts`               | Loads the seed data and saves changes.                                                                                                                                                                                 |
| `src/mock/node/vite-plugin.ts` | Serves the mock from `npm run dev` and `npm run preview`.                                                                                                                                                              |
| `src/mock/browser.ts`          | Runs the mock inside the browser (`VITE_API_MODE=local`).                                                                                                                                                              |

- Changes are saved to **`.mock-db.json`** in the project root, so they survive a restart. This file is git-ignored.
- Run **`npm run mock:reset`** (or delete the file) to start again from the JSON seed files.
- Demo sales in `orders.json` are shifted in time when the data is seeded, so the newest sale is always today.
- Every mock response has an `X-Mock-Api: sun-pos` header, so you can tell whether you're talking to the mock.
- If a request fails, the mock undoes any partial changes, like a database transaction.

---

## REST API reference

### Conventions

- **Base URL:** `/api/v1`. All bodies are JSON (`Content-Type: application/json`).
- **Authentication:** `POST /auth/login` returns a token. Send it on every other request as
  `Authorization: Bearer <token>`.
- **Access** in the tables below: **public** needs no token, **staff** means any signed-in user, **manager** means
  role `admin`. A cashier calling a manager endpoint gets `403`.
- **Times** are epoch milliseconds (`1790268654217`). **Money** is a number in the store currency, rounded to
  `settings.decimals` places.
- **Ids** are strings chosen by the server, except the optional checkout `id` (see [Checkout](#checkout)).
- **Status codes:** `200` OK, `201` created, `204` no content, `400` invalid input, `401` not signed in or wrong PIN,
  `403` not allowed, `404` not found, `405` wrong method, `409` conflict with the current state.
- **Errors** always look like this:

  ```json
  { "error": { "code": "OUT_OF_STOCK", "message": "Only 3 Blueberry Muffin in stock" } }
  ```

  The app shows `message` to the user, so write it for staff. `code` is for programs:

  | Code                   | Status | Meaning                                                                           |
  | ---------------------- | ------ | --------------------------------------------------------------------------------- |
  | `VALIDATION_ERROR`     | 400    | A field is missing or invalid (the message names it).                             |
  | `EMPTY_ORDER`          | 400    | An order or held order has no items.                                              |
  | `PRODUCT_UNAVAILABLE`  | 400    | A product doesn't exist or is hidden.                                             |
  | `INVALID_OPTION`       | 400    | Missing required option, unknown choice, or two choices in a single-choice group. |
  | `INSUFFICIENT_PAYMENT` | 400    | Payments add up to less than the total.                                           |
  | `OVERPAID_NON_CASH`    | 400    | Card and QR payments add up to more than the total (only cash can give change).   |
  | `INVALID_PIN_FORMAT`   | 400    | A PIN isn't 4–6 digits.                                                           |
  | `INVALID_BACKUP`       | 400    | The uploaded file isn't a Sun POS backup.                                         |
  | `INVALID_PIN`          | 401    | Wrong PIN at sign-in.                                                             |
  | `UNAUTHORIZED`         | 401    | Missing or expired token. The app returns to the lock screen.                     |
  | `FORBIDDEN`            | 403    | Manager-only endpoint.                                                            |
  | `NOT_FOUND`            | 404    | Unknown id or endpoint.                                                           |
  | `METHOD_NOT_ALLOWED`   | 405    | The path exists but not with this method.                                         |
  | `NO_OPEN_SHIFT`        | 409    | Checkout, cash moves or closing need an open shift.                               |
  | `SHIFT_ALREADY_OPEN`   | 409    | Only one shift can be open.                                                       |
  | `OUT_OF_STOCK`         | 409    | Not enough stock for the order.                                                   |
  | `ALREADY_REFUNDED`     | 409    | The order was refunded before.                                                    |
  | `STOCK_NOT_TRACKED`    | 409    | Stock adjustment on a product with `stock: null`.                                 |
  | `CATEGORY_NOT_EMPTY`   | 409    | Delete or move the category's products first.                                     |
  | `PIN_TAKEN`            | 409    | Another staff member has that PIN.                                                |
  | `BARCODE_TAKEN`        | 409    | Another product has that barcode.                                                 |
  | `LAST_MANAGER`         | 409    | The last manager can't be removed or made a cashier.                              |
  | `CANNOT_DELETE_SELF`   | 409    | Staff can't delete their own account.                                             |

### Auth

| Method | Path           | Access | Body / query        | Response                       |
| ------ | -------------- | ------ | ------------------- | ------------------------------ |
| `POST` | `/auth/login`  | public | `{ "pin": "1234" }` | `{ token, user: StaffPublic }` |
| `POST` | `/auth/logout` | staff  | —                   | `204`                          |
| `GET`  | `/auth/me`     | staff  | —                   | `StaffPublic`                  |

```json
// POST /auth/login → 200
{ "token": "tok-mfx…", "user": { "id": "staff-admin", "name": "Manager", "role": "admin" } }
```

### Staff

PINs are never returned.

| Method   | Path         | Access  | Body                                                      | Response                                 |
| -------- | ------------ | ------- | --------------------------------------------------------- | ---------------------------------------- |
| `GET`    | `/staff`     | manager | —                                                         | `StaffPublic[]`                          |
| `POST`   | `/staff`     | manager | `{ name, role: "admin" \| "cashier", pin }`               | `201 StaffPublic`                        |
| `PATCH`  | `/staff/:id` | manager | any of `{ name, role, pin }` (leave `pin` out to keep it) | `StaffPublic`                            |
| `DELETE` | `/staff/:id` | manager | —                                                         | `204` (also ends that person's sessions) |

### Settings

| Method  | Path        | Access                                        | Body                  | Response   |
| ------- | ----------- | --------------------------------------------- | --------------------- | ---------- |
| `GET`   | `/settings` | public (the lock screen shows the store name) | —                     | `Settings` |
| `PATCH` | `/settings` | manager                                       | any `Settings` fields | `Settings` |

`Settings`: `storeName`, `address`, `phone`, `currency` (ISO code such as `USD` or `LAK`), `locale`, `decimals` (0–4),
`taxLabel`, `taxRate` (%), `serviceRate` (%), `receiptFooter`, `pointsPerUnit` (loyalty points per 1 currency unit),
`topSellerDays`, `receiptShowRates` (print the day's exchange rates and converted totals on receipts).

### Exchange rates

Rates are set per day by a manager. Every sale stores the rates in effect when it was paid, so an old receipt always
shows the rates it was paid at.

| Method   | Path                      | Access  | Query / body                             | Response                                            |
| -------- | ------------------------- | ------- | ---------------------------------------- | --------------------------------------------------- |
| `GET`    | `/exchange-rates`         | staff   | `?date=YYYY-MM-DD` (default: today)      | `{ date, effectiveDate, base, rates: RateEntry[] }` |
| `GET`    | `/exchange-rates/history` | staff   | `?limit=30`                              | `ExchangeRateSet[]`, newest day first               |
| `PUT`    | `/exchange-rates/:date`   | manager | `{ rates: [{ currency: "LAK", rate }] }` | `ExchangeRateSet` (creates or replaces that day)    |
| `DELETE` | `/exchange-rates/:date`   | manager | —                                        | `204`                                               |

- `rate` is **how many units of the store currency one unit of `currency` is worth**. With a USD store,
  `1 USD = 21,850 LAK` is stored as `{ "currency": "LAK", "rate": 0.0000457666 }` and `1 EUR = 1.087 USD` as
  `{ "currency": "EUR", "rate": 1.087 }`. The app lets managers type either direction.
- `ExchangeRateSet`: `{ date, base, rates, updatedBy, updatedAt }`. `base` is the store currency when the rates were
  saved. `rate` must be above 0, and the store currency can't be listed.
- `GET /exchange-rates` returns that day's rates, or the latest earlier ones (`effectiveDate` says which day; `null` when
  there are none). If the store currency changed, rates are converted when the set includes the new currency.

### Categories

| Method   | Path              | Access  | Body                           | Response                           |
| -------- | ----------------- | ------- | ------------------------------ | ---------------------------------- |
| `GET`    | `/categories`     | staff   | —                              | `Category[]`                       |
| `POST`   | `/categories`     | manager | `{ name, tint, stationId }`    | `201 Category`                     |
| `PATCH`  | `/categories/:id` | manager | `{ name?, tint?, stationId? }` | `Category`                         |
| `DELETE` | `/categories/:id` | manager | —                              | `204`, or `409 CATEGORY_NOT_EMPTY` |

`tint` is one of `sage`, `amber`, `rose`, `sky`, `lilac`, `sand`. `stationId` is where the category's items are
prepared (see [Kitchen and bar](#kitchen-and-bar)), or `null` for items served at the counter with no ticket.

### Products

| Method   | Path               | Access  | Body / query                  | Response            |
| -------- | ------------------ | ------- | ----------------------------- | ------------------- |
| `GET`    | `/products`        | staff   | `?q=&categoryId=&active=true` | `Product[]`         |
| `GET`    | `/products/lookup` | staff   | `?code=` (barcode or SKU)     | `Product`, or `404` |
| `GET`    | `/products/:id`    | staff   | —                             | `Product`           |
| `POST`   | `/products`        | manager | `Product` without `id`        | `201 Product`       |
| `PATCH`  | `/products/:id`    | manager | any `Product` fields          | `Product`           |
| `DELETE` | `/products/:id`    | manager | —                             | `204`               |

```json
{
  "id": "prd-4",
  "name": "Café Latte",
  "categoryId": "cat-coffee",
  "emoji": "🥛",
  "price": 3.75,
  "cost": 0.9,
  "sku": "SKU-004",
  "barcode": "8850000000004",
  "stock": null,
  "lowStockAt": 5,
  "active": true,
  "options": [
    {
      "id": "size",
      "name": "Size",
      "multiple": false,
      "required": true,
      "choices": [
        { "name": "Regular", "price": 0 },
        { "name": "Large", "price": 0.5 }
      ]
    }
  ]
}
```

`stock: null` means stock isn't tracked (made-to-order items).

### Stock

| Method | Path                 | Access  | Body / query                                                   | Response                                         |
| ------ | -------------------- | ------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `GET`  | `/stock/low`         | staff   | —                                                              | Active tracked products at or below `lowStockAt` |
| `POST` | `/stock/adjustments` | manager | `{ productId, delta, reason }` (`delta` ≠ 0, negative removes) | `{ product, move: StockMove }`                   |
| `GET`  | `/stock/movements`   | manager | `?productId=&limit=50`                                         | `StockMove[]`, newest first                      |

Sales and refunds also create stock movements (reason `Sale #221`, `Refund #221`).

### Checkout

`POST /orders` (staff) completes a sale. The client sends **only ids, choices, quantities and payments**. The server
looks up prices, works out totals, checks stock, deducts stock, assigns the order number and awards loyalty points.

```json
// POST /orders
{
  "id": "mfx8k2a9c1",
  "orderType": "dine-in",
  "table": "5",
  "note": "",
  "customerId": "cus-2",
  "orderDiscount": { "type": "percent", "value": 10 },
  "lines": [
    {
      "productId": "prd-4",
      "qty": 2,
      "options": [
        { "group": "Size", "name": "Large" },
        { "group": "Temperature", "name": "Iced" }
      ],
      "note": "less ice",
      "discountPct": 0
    }
  ],
  "payments": [{ "method": "cash", "amount": 20 }],
  "splitWays": null,
  "tableId": "tbl-5",
  "heldId": "hld-abc123",
  "voids": []
}
```

Response `201`: the full `Order`, including `number`, `lines` (with names and prices at the time of sale), `subtotal`,
`discount`, `service`, `tax`, `total`, `tendered`, `change`, `pointsEarned`, `staffName`, `shiftId`, `exchangeRates`
(the day's rates, `{ date, base, rates }` or `null`) and `splitWays` when the bill was split equally.

Rules:

1. A shift must be open (`409 NO_OPEN_SHIFT`).
2. **Retries are safe.** `id` is optional and chosen by the client. If an order with that id exists, the server returns
   it with `200` and doesn't charge again. The app reuses the same id when it retries after a network error.
3. Totals: item discounts first, then the order discount, then the service charge. Tax is charged on the discounted
   amount plus service. Everything is rounded to `settings.decimals` (see `computeTotals` in `src/utils/pos.ts`).
4. Payments must cover the total. Only cash can exceed it (the difference is `change`).
5. `payments[].method` is `cash`, `card` or `qr`. Split payments are allowed.
6. `pointsEarned = floor(total × settings.pointsPerUnit)` when a customer is attached.
7. The server saves the rates in effect on the day of the sale in `exchangeRates`.
8. Tables: `tableId` puts the table's name on the order, and `heldId` closes that table's bill. Items not yet sent to the
   kitchen (`qty − sentQty` per line) and `voids` become kitchen tickets.

**Split bill.** There are two ways to split, and neither needs a special endpoint:

- **By items:** the app sends one `POST /orders` for each guest with only the items that guest pays for. An amount
  discount is shared out in proportion to the items' value. The remaining items stay on the till.
- **Equally:** one order with `splitWays` (2–20) and each payment tagged with the guest who made it:
  `"payments": [{ "method": "card", "amount": 3.02, "guest": 1 }, { "method": "cash", "amount": 5, "guest": 2 }]`.
  The shares are `total ÷ splitWays` rounded down, and the last guest pays the rest.

**Merge bill** is done in the app: it removes the chosen held orders (`DELETE /held-orders/:id`) and combines their items
into the current order.

### Orders

| Method | Path                  | Access  | Query / body                                                             | Response                                       |
| ------ | --------------------- | ------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| `GET`  | `/orders`             | staff   | `?from=&to=&status=completed\|refunded&q=&customerId=&limit=50&offset=0` | `{ items: Order[], total }`, newest first      |
| `GET`  | `/orders/:id`         | staff   | —                                                                        | `Order`                                        |
| `POST` | `/orders/:id/refund`  | manager | `{ reason, restock: true }`                                              | `Order` with `status: "refunded"` and `refund` |
| `GET`  | `/orders/top-sellers` | staff   | `?days=30&limit=8`                                                       | `[{ product, qty, revenue }]`, best first      |

`q` matches the order number (`221` or `#221`), table, customer name, staff name or item names. `from` is inclusive,
`to` is exclusive. A refund puts items back into stock when `restock` is true, reverses the customer's spend and points,
and records the open shift (cash refunds come out of that drawer).

### Held orders (saved bills)

Saved bills are shared across tills. A bill with a `tableId` is that table's open bill: a table has at most one.

| Method   | Path                     | Access | Body                                                                             | Response                                         |
| -------- | ------------------------ | ------ | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/held-orders`           | staff  | —                                                                                | `HeldOrder[]`                                    |
| `POST`   | `/held-orders`           | staff  | `{ label, lines, discount, orderType, table, tableId, note, customerId, voids }` | `201 HeldOrder`, or `409 TABLE_BUSY`             |
| `PUT`    | `/held-orders/:id`       | staff  | Same as `POST` (replaces the bill's contents)                                    | `HeldOrder`                                      |
| `POST`   | `/held-orders/:id/move`  | staff  | `{ tableId }` (`null` takes it off tables)                                       | `HeldOrder`, or `409 TABLE_BUSY`                 |
| `POST`   | `/held-orders/:id/merge` | staff  | `{ ids: [...] }`: other bills to add to this one                                 | The combined `HeldOrder`; the others are removed |
| `DELETE` | `/held-orders/:id`       | staff  | —                                                                                | The removed `HeldOrder`                          |

- A bill stays saved while a till has it open. Saving again (`PUT`) updates it, and paying for it (`POST /orders` with
  `heldId`) removes it in the same step.
- `lines[].sentQty` records how many of each item the kitchen already has. `voids` are items removed after they were
  sent; the kitchen is told they're cancelled when the bill is sent or paid.
- Moving or merging a bill (or saving it with a different `tableId`) also moves its open kitchen tickets, so "ready"
  shows at the right table.
- Merging combines identical items, keeps notes and the first customer, and adds up amount discounts (otherwise the
  target bill's discount is kept).

### Floor plan

| Method | Path     | Access  | Body                | Response    |
| ------ | -------- | ------- | ------------------- | ----------- |
| `GET`  | `/floor` | staff   | —                   | `FloorPlan` |
| `PUT`  | `/floor` | manager | `{ areas, tables }` | `FloorPlan` |

`FloorPlan`: `areas: [{ id, name }]` and `tables: [{ id, name, areaId, seats, shape, x, y, w, h }]`. `shape` is
`square`, `round` or `rect`. Positions and sizes are in plan units: each area is **1000 × 640**, tables are 40–600
wide and high, and the server keeps them inside the plan. Table names must be unique (`400 DUPLICATE_TABLE_NAME`). New
areas and tables may leave `id` out. Removing a table that has an open bill fails with `409 TABLE_IN_USE`.

### Kitchen and bar

Stations are the places where orders are prepared. Each category is sent to one station, or none.

| Method  | Path           | Access  | Body / query                                                        | Response                                                 |
| ------- | -------------- | ------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET`   | `/stations`    | staff   | —                                                                   | `Station[]` (`{ id, name }`)                             |
| `PUT`   | `/stations`    | manager | `{ stations: [{ id?, name }] }` (the full list)                     | `Station[]`; categories of removed ones get none         |
| `POST`  | `/tickets`     | staff   | `{ label, orderType, table, tableId, note, lines }`                 | `201 KitchenTicket[]`, one per station (maybe `[]`)      |
| `GET`   | `/tickets`     | staff   | `?status=active` (default) or `?status=done&limit=20`, `stationId=` | Open tickets oldest first, or finished ones newest first |
| `PATCH` | `/tickets/:id` | staff   | `{ status? }` and/or `{ item: index, done: true }`                  | `KitchenTicket`                                          |

- `lines`: `[{ productId, qty, options: ["Large", "Oat milk"], note, cancelled? }]`. Items whose category has no station
  are skipped.
- `KitchenTicket`: `{ id, number, stationId, createdAt, status, statusAt, label, orderType, table, tableId, note,
staffName, items: [{ name, emoji, qty, options, note, cancelled, done }] }`.
- `status` goes `new` → `preparing` → `ready` → `done`. Ready tickets with a `tableId` show a bell on the floor plan.
- **Checkout sends the rest automatically:** `POST /orders` makes tickets for each line's `qty − sentQty`, plus any
  `voids`, so a takeaway order goes to the kitchen when it's paid.

### Customers

| Method   | Path                    | Access  | Body / query                   | Response                          |
| -------- | ----------------------- | ------- | ------------------------------ | --------------------------------- |
| `GET`    | `/customers`            | staff   | `?q=` (name, phone or email)   | `Customer[]`                      |
| `GET`    | `/customers/:id`        | staff   | —                              | `Customer`                        |
| `GET`    | `/customers/:id/orders` | staff   | `?limit=20`                    | `Order[]`                         |
| `POST`   | `/customers`            | staff   | `{ name, phone, email, note }` | `201 Customer`                    |
| `PATCH`  | `/customers/:id`        | staff   | any of those fields            | `Customer`                        |
| `DELETE` | `/customers/:id`        | manager | —                              | `204` (orders keep their history) |

`points`, `totalSpent` and `visits` are maintained by the server from sales and refunds.

### Shifts and cash drawer

| Method | Path                         | Access | Body                                      | Response                                                          |
| ------ | ---------------------------- | ------ | ----------------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/shifts/current`            | staff  | —                                         | `{ shift, summary }`, or `null` if none is open                   |
| `POST` | `/shifts`                    | staff  | `{ openingFloat }`                        | `201 { shift, summary }`                                          |
| `POST` | `/shifts/current/cash-moves` | staff  | `{ type: "in" \| "out", amount, reason }` | `{ shift, summary }`                                              |
| `POST` | `/shifts/current/close`      | staff  | `{ countedCash, note }`                   | `{ shift, summary }` with `expectedCash` and `countedCash` stored |
| `GET`  | `/shifts`                    | staff  | `?limit=30`                               | Closed shifts, `[{ shift, summary }]`                             |

`summary.expectedCash = openingFloat + cash sales (minus change) − cash refunds + cash in − cash out.`
It also includes the order and refund counts, gross sales and takings by payment method.

### Reports (manager)

All take `?from=&to=` (epoch ms, `to` exclusive). The app sends the shop's local day boundaries.

| Method | Path                     | Extra query                              | Response                                                                            |
| ------ | ------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET`  | `/reports/summary`       | —                                        | `{ net, orders, avg, items, tax, discounts, profit, margin, refunds, refundCount }` |
| `GET`  | `/reports/sales-by-time` | `bucket=hour\|day`, `tz=Asia/Vientiane`  | `[{ start, label, value, count }]` (hours 6–22, or one per day)                     |
| `GET`  | `/reports/products`      | `limit=100`                              | `[{ productId, name, emoji, qty, revenue }]`                                        |
| `GET`  | `/reports/breakdown`     | `by=payment\|category\|orderType\|staff` | `[{ key, value, pct }]`                                                             |

`profit` is an estimate: revenue before tax and service, minus each product's current `cost`.

### Bulk import (manager)

Used by the **Import** screen (Settings → Data, or the Import buttons on Products, Customers and Stock). The app reads
the Excel or CSV file in the browser, matches its columns to the fields below, and sends the rows as JSON.

| Method | Path                | Fields in each row (required in bold)                                                                                                             | Matches existing records by     |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `POST` | `/import/products`  | **`name`**, **`category`** (name; new names create the category), **`price`**, `cost`, `sku`, `barcode`, `emoji`, `stock`, `lowStockAt`, `active` | SKU, then barcode, then name    |
| `POST` | `/import/customers` | **`name`**, `phone`, `email`, `note`, `points` (opening balance)                                                                                  | Phone (digits only), then email |
| `POST` | `/import/staff`     | **`name`**, `role` (`manager` or `cashier`), `pin` (required for new staff)                                                                       | Name                            |
| `POST` | `/import/stock`     | **`code`** (SKU or barcode), **`quantity`** (counted level), `reason`                                                                             | SKU or barcode                  |

Request:

```json
{
  "dryRun": true,
  "rows": [
    { "name": "Iced Americano", "category": "Coffee", "price": "3.25", "sku": "SKU-101" },
    { "name": "Mystery Item", "category": "Coffee", "price": "ask staff" }
  ]
}
```

Response (`200`):

```json
{
  "dryRun": true,
  "created": 1,
  "updated": 0,
  "skipped": 0,
  "failed": 1,
  "rows": [
    { "index": 0, "action": "create", "label": "Iced Americano", "message": "" },
    { "index": 1, "action": "error", "label": "Mystery Item", "message": "Price must be a number" }
  ]
}
```

Rules:

- **`dryRun: true` saves nothing.** The app uses it to show the preview, then sends the same rows with
  `dryRun: false`.
- Rows with errors are skipped and reported. The other rows are saved.
- `action` is `create`, `update`, `skip` (already up to date) or `error`. `index` is the row's position in `rows`.
- Values may be strings or numbers. Numbers are read leniently (`1,250.50`, `1.250,50`, `$3.75`, `25 000`), and
  yes/no fields accept `yes/no`, `true/false` and `1/0`.
- On update, empty cells keep the current value.
- A stock change from `/import/products` or `/import/stock` is written to the stock movement log. Products that didn't
  track stock start tracking.
- At most 5,000 rows per request.

### Backup and admin (manager)

| Method | Path           | Body                                                                | Response                                                                                                                                                                    |
| ------ | -------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/backup`      | —                                                                   | `{ app: "sun-pos", version: 2, at, data: { settings, staff, categories, products, stockMoves, customers, orders, shifts, held, exchangeRates, floor, stations, tickets } }` |
| `POST` | `/backup`      | A backup file (version 1 files from the browser-only app also work) | `204`                                                                                                                                                                       |
| `POST` | `/admin/reset` | `{ scope: "sales" \| "demo" \| "all" }`                             | `204`                                                                                                                                                                       |

`sales` clears orders, shifts, held orders, kitchen tickets and stock movements. `demo` does the same, then loads the demo sales. `all`
restores all the seed data. Exchange rates are kept, except by `all`. A real backend may want to restrict or remove `/admin/reset` in production.

---

## Building your backend

1. **Implement the endpoints above** with the same paths, bodies and status codes. Use `src/mock/router.ts` as the
   reference: each route is a short function showing the exact rules.
2. **Keep the business rules on the server:** pricing, totals, stock, order numbers, points, shift cash-up and roles.
   Never trust prices or totals from the client.
3. **Store money precisely:** use `DECIMAL`, or whole minor units (cents, or kip with no decimals). Don't use floats.
4. **Do checkout in one transaction:** number the order, save it, deduct stock and update the customer together.
   Use the client `id` to make retries safe.
5. **Hash PINs** (bcrypt or argon2) and **limit wrong attempts**. The mock does neither.
6. **Check it with the contract tests.** [`src/__tests__/api.spec.ts`](../src/__tests__/api.spec.ts) runs these
   scenarios against the mock: sign-in and roles, server-side pricing, options, retries, stock, payments, loyalty
   points, refunds, cash-up, reports, exchange rates, split payments, tables and kitchen tickets. Run the same requests against your backend and compare.
7. **Switch the app over** with `VITE_API_PROXY` (development) or `VITE_API_URL` (production).

## Frontend reference

The screens use the Pinia stores. Each store keeps a cached copy of its data and calls the API through `src/api`.

| Store               | Main functions                                                                                                                                                          | Endpoints used                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `useAuthStore`      | `init`, `login`, `logout`, `loadStaff`, `saveStaff`, `removeStaff`                                                                                                      | `/auth/*`, `/staff`                          |
| `useSettingsStore`  | `load`, `save`, `money`, `round`, `toggleTheme` (theme stays on the device)                                                                                             | `/settings`                                  |
| `useCatalogStore`   | `load`, `refreshProducts`, `findByCode`, `saveProduct`, `removeProduct`, `saveCategory`, `removeCategory`, `adjustStock`, `loadMoves`                                   | `/categories`, `/products`, `/stock/*`       |
| `useCartStore`      | `add`, `setQty`, `remove`, `discard`, `hold`, `resume`, `openTable`, `setTable`, `send`, `mergeHeld`, `selectionTotals`, `checkout(payments, { selection, splitWays })` | `/held-orders/*`, `/tickets`, `POST /orders` |
| `useFloorStore`     | `load`, `save`                                                                                                                                                          | `/floor`                                     |
| `useKitchenStore`   | `load`, `watch` (refreshes every 5 s), `setStatus`, `toggleItem`                                                                                                        | `/tickets`                                   |
| `useRatesStore`     | `load`, `loadHistory`, `save`, `remove`                                                                                                                                 | `/exchange-rates/*`                          |
| `useOrdersStore`    | `loadTopSellers`, `refund`                                                                                                                                              | `/orders/top-sellers`, `/orders/:id/refund`  |
| `useCustomersStore` | `load`, `search`, `save`, `remove`, `refresh`                                                                                                                           | `/customers`                                 |
| `useShiftStore`     | `load`, `open`, `moveCash`, `close`                                                                                                                                     | `/shifts/*`                                  |
| `useAppStore`       | `load` (everything needed after sign-in)                                                                                                                                | several                                      |

The Orders, Reports, Shift history, customer history and Import screens call `api.*` directly.
File reading, column matching and templates for the import are in `src/utils/importer.ts`.
