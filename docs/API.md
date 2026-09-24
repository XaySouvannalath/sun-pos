# Sun POS API reference

Sun POS currently runs **entirely in the browser**. There is no server and no HTTP API yet.

This document has two parts:

1. **[Current API](#part-1-current-api-in-the-browser)**: the functions the app uses today. They live in the Pinia stores
   under `src/stores/` and the helpers under `src/utils/`. Data is saved to the browser's `localStorage`.
2. **[Planned REST API](#part-2-planned-rest-api-not-built-yet)**: a proposed server API for when Sun POS gets a backend,
   so several devices can share orders, stock and reports. **None of these endpoints exist yet.**

Data types (`Product`, `Order`, `Customer` and so on) are defined in [`src/types.ts`](../src/types.ts).

---

## Part 1. Current API (in the browser)

Use a store inside a Vue component or another store:

```ts
import { useCartStore } from '@/stores/cart'

const cart = useCartStore()
cart.add(product)
const order = cart.checkout([{ method: 'cash', amount: 10 }])
```

### Overview

| Store | File | Responsibility |
|---|---|---|
| `useAuthStore` | `src/stores/auth.ts` | Staff accounts, PIN login, roles |
| `useCatalogStore` | `src/stores/catalog.ts` | Products, categories, stock levels and stock movements |
| `useCartStore` | `src/stores/cart.ts` | The order being built, held orders, checkout |
| `useOrdersStore` | `src/stores/orders.ts` | Completed orders, refunds, top sellers |
| `useCustomersStore` | `src/stores/customers.ts` | Customers and loyalty points |
| `useShiftStore` | `src/stores/shift.ts` | Shifts, cash drawer, cash in/out, end-of-day count |
| `useSettingsStore` | `src/stores/settings.ts` | Store settings, money formatting, theme |
| `useToastStore` | `src/stores/toast.ts` | Short on-screen messages |

### Auth: `useAuthStore`

| Member | Type | Description |
|---|---|---|
| `staff` | `Staff[]` | All staff accounts. |
| `user` | `Staff \| null` | The signed-in staff member. |
| `isAdmin` | `boolean` | `true` when the signed-in user is a manager. |
| `login(pin)` | `(pin: string) => boolean` | Signs in the staff member with this PIN. Returns `false` if no one matches. |
| `logout()` | `() => void` | Signs out and locks the till. |
| `saveStaff(data)` | `(data: Omit<Staff, 'id'> & { id?: string }) => string \| null` | Creates a staff member, or updates one if `id` is given. Returns an error message or `null`. Rejects PINs that aren't 4–6 digits, duplicate PINs, and removing the last manager. |
| `removeStaff(id)` | `(id: string) => string \| null` | Deletes a staff member. Returns an error if it's you or the last manager. |
| `roleLabel(role)` | `(role: Role) => string` | `'Manager'` or `'Cashier'`. |

Roles: `admin` (Manager) can use every screen and refund orders. `cashier` can sell, run shifts and manage customers.
Routes marked `meta.admin` in `src/router/index.ts` are manager-only.

### Catalog: `useCatalogStore`

| Member | Type | Description |
|---|---|---|
| `categories` | `Category[]` | All categories. |
| `products` | `Product[]` | All products, including hidden ones. |
| `stockMoves` | `StockMove[]` | Stock movement log, newest first (keeps the last 1,000). |
| `byId` | `Map<string, Product>` | Product lookup by id. |
| `categoryById` | `Map<string, Category>` | Category lookup by id. |
| `activeProducts` | `Product[]` | Products shown on the Sell screen. |
| `lowStock` | `Product[]` | Active, stock-tracked products at or below their alert level. |
| `findByCode(code)` | `(code: string) => Product \| undefined` | Finds an active product by barcode or SKU (case-insensitive). Used for barcode scanning. |
| `newProduct()` | `() => Product` | Returns a blank product with a new id and the next SKU. Does not save it. |
| `saveProduct(p)` | `(p: Product) => void` | Creates or replaces a product (matched by `id`). |
| `removeProduct(id)` | `(id: string) => void` | Deletes a product. Past orders keep their copy of the item. |
| `saveCategory(c)` | `(c: Category) => void` | Creates or replaces a category. |
| `removeCategory(id)` | `(id: string) => string \| null` | Deletes an empty category. Returns an error if products still use it. |
| `adjustStock(productId, delta, reason, by)` | `(string, number, string, string) => void` | Adds `delta` (negative to remove) to a tracked product's stock and logs the movement. Does nothing for untracked products (`stock: null`). |
| `reset()` | `() => void` | Restores the sample menu and clears the stock log. |

### Cart: `useCartStore`

| Member | Type | Description |
|---|---|---|
| `state` | `{ lines, discount, orderType, table, note, customerId }` | The order being built. Saved, so a page reload doesn't lose it. |
| `held` | `HeldOrder[]` | Orders parked with **Hold**. |
| `totals` | `Totals` | `itemCount`, `subtotal`, `discount`, `service`, `tax`, `total` for the current order. |
| `isEmpty` | `boolean` | `true` when there are no items. |
| `add(product, options?, qty?)` | `(Product, SelectedOption[]?, number?) => void` | Adds an item. Options default to the first choice of each required group. Merges with an identical line that has no note or discount. |
| `setQty(index, qty)` | `(number, number) => void` | Sets a line's quantity. `0` or less removes the line. |
| `remove(index)` | `(number) => void` | Removes a line. |
| `clear()` | `() => void` | Empties the current order. |
| `hold(label)` | `(string) => void` | Parks the current order under `label` and clears the screen. |
| `resume(id)` | `(string) => void` | Brings a held order back. Any order on screen is held first, so nothing is lost. |
| `discardHeld(id)` | `(string) => void` | Deletes a held order. |
| `checkout(payments)` | `(Payment[]) => Order` | Completes the sale through `orders.complete`, calculates change and loyalty points, then clears the cart. |

Also exported: `defaultOptions(product)`, which returns the one-tap default options for a product.

### Orders: `useOrdersStore`

| Member | Type | Description |
|---|---|---|
| `orders` | `Order[]` | Completed and refunded orders, newest first. |
| `nextNumber` | `number` | The next order number. |
| `byId` | `Map<string, Order>` | Order lookup by id. |
| `topSellers(days, limit?)` | `(number, number = 8) => TopSeller[]` | Best-selling active products by quantity over the last `days` days. Powers the **Top sellers** strip. |
| `complete(draft)` | `(NewOrder) => Order` | Saves an order with its number, time, staff and shift. Deducts stock and updates the customer's spend and points. |
| `refund(id, reason, restock)` | `(string, string, boolean) => void` | Marks a completed order as refunded, records who and why, returns items to stock if `restock`, and reverses the customer's spend and points. |
| `clearAll()` | `() => void` | Deletes all orders. |
| `loadDemo()` | `() => void` | Replaces orders with 14 days of sample sales. |

Also exported: `rankProducts(orders, products, since)`, a pure function used by `topSellers` and the unit tests.

### Customers: `useCustomersStore`

| Member | Type | Description |
|---|---|---|
| `customers` | `Customer[]` | All customers, newest first. |
| `byId` | `Map<string, Customer>` | Customer lookup by id. |
| `search(q)` | `(string) => Customer[]` | Matches name, phone (spaces ignored) or email. An empty query returns everyone. |
| `save(data)` | `({ name, phone, email, note, id? }) => Customer` | Creates a customer, or updates one if `id` is given. |
| `remove(id)` | `(string) => void` | Deletes a customer. Their orders stay in history. |
| `recordPurchase(id, total, points, sign?)` | `(string, number, number, 1 \| -1) => void` | Adds a purchase to the customer's totals, or reverses one with `sign = -1`. Called by `orders.complete` and `orders.refund`. |
| `reset()` | `() => void` | Deletes all customers. |

### Shifts: `useShiftStore`

| Member | Type | Description |
|---|---|---|
| `shifts` | `Shift[]` | All shifts, newest first. |
| `current` | `Shift \| null` | The open shift. A shift must be open to take payment. |
| `history` | `Shift[]` | Closed shifts. |
| `open(openingFloat)` | `(number) => void` | Opens a shift with the cash counted in the drawer. |
| `moveCash(type, amount, reason)` | `('in' \| 'out', number, string) => void` | Records cash added to or taken from the drawer. |
| `summary(shift)` | `(Shift) => ShiftSummary` | Orders, refunds, takings by payment method, and **expected cash**. |
| `close(countedCash, note)` | `(number, string) => void` | Closes the shift and stores expected vs counted cash. |
| `reset()` | `() => void` | Deletes all shifts. |

Expected cash = opening cash + cash sales (minus change) − cash refunds + cash in − cash out.

### Settings: `useSettingsStore`

| Member | Type | Description |
|---|---|---|
| `s` | `Settings` | Store name, address, currency, decimals, tax, service charge, receipt footer, theme, loyalty rate and top-seller period. Edit fields directly; changes save automatically. |
| `money(n)` | `(number) => string` | Formats an amount in the store's currency, e.g. `$3.75` or `LAK 25,000`. |
| `round(n)` | `(number) => number` | Rounds to the currency's decimals. |
| `isDark` | `boolean` | Whether the dark theme is active. |
| `toggleTheme()` | `() => void` | Switches between light and dark. |
| `reset()` | `() => void` | Restores default settings. |

### Toasts: `useToastStore`

| Member | Type | Description |
|---|---|---|
| `toasts` | `Toast[]` | Messages on screen (at most 4). |
| `show(message, tone?, ms?)` | `(string, 'default' \| 'success' \| 'error', number = 2200) => void` | Shows a message that hides itself after `ms` milliseconds. |
| `dismiss(id)` | `(number) => void` | Hides a message. |

### Helpers: `src/utils/pos.ts`

| Function | Description |
|---|---|
| `computeTotals(lines, discount, { taxRate, serviceRate, decimals })` | Order totals. Line discounts apply first, then the order discount, then the service charge. Tax applies to the discounted amount plus service. |
| `lineTotal(line)` | `unitPrice × qty × (1 − discountPct / 100)`. |
| `lineKey(productId, options)` | Stable key for a product with a set of options, in any order. Used to merge identical lines. |
| `netCash(payments, change)` | Cash kept from an order (cash paid minus change). |
| `quickCashAmounts(due, decimals)` | Suggested cash buttons: the exact amount, then round note values. |
| `roundTo(n, decimals)` | Rounds a number. |
| `startOfDay(ts)` | Midnight (local time) for a timestamp. |
| `downloadCsv(filename, rows)` | Downloads rows as a CSV file. Does nothing in the embedded preview. |
| `uid()` | Short unique id. |
| `clone(value)` | Deep copy of plain data. Safe for Vue reactive objects. |

### Storage keys

All data is saved as JSON in `localStorage` with the prefix `sunpos:` (helpers in `src/composables/persisted.ts`).

| Key | Contents |
|---|---|
| `sunpos:settings` | `Settings` |
| `sunpos:staff` | `Staff[]` |
| `sunpos:categories` | `Category[]` |
| `sunpos:products` | `Product[]` |
| `sunpos:stock-moves` | `StockMove[]` |
| `sunpos:customers` | `Customer[]` |
| `sunpos:orders` | `Order[]` |
| `sunpos:shifts` | `Shift[]` |
| `sunpos:cart` | The current order |
| `sunpos:held` | `HeldOrder[]` |
| `sunpos:session-user` | Signed-in staff id (in `sessionStorage`, so closing the tab locks the till) |

**Settings → Export backup** saves all of these, except the cart and the signed-in user, to one JSON file in this format:
`{ "app": "sun-pos", "version": 1, "at": <timestamp>, "data": { "<key>": ... } }`.

---

## Part 2. Planned REST API (not built yet)

> **Status: proposal.** This is a design for a future backend. Nothing below is implemented. Each endpoint maps to a
> store function from Part 1, so the frontend can switch from `localStorage` to the server one store at a time.

### Conventions

- Base URL: `/api/v1`
- JSON requests and responses. Money is a decimal number in the store's currency. Times are ISO 8601 strings.
- Auth: `POST /auth/login` with a PIN returns a token. Send it as `Authorization: Bearer <token>`.
- Roles: 🔒 marks manager-only endpoints. Everything else is available to cashiers too.
- Errors: `{ "error": { "code": "PIN_TAKEN", "message": "That PIN is already used" } }` with a 4xx status.
- Lists accept `?limit=` and `?cursor=` for paging.

### Auth and staff

| Method | Path | Maps to | Description |
|---|---|---|---|
| `POST` | `/auth/login` | `auth.login` | Body `{ "pin": "1234" }`. Returns `{ token, user }`. |
| `POST` | `/auth/logout` | `auth.logout` | Ends the session. |
| `GET` | `/auth/me` | `auth.user` | The signed-in staff member. |
| `GET` | `/staff` 🔒 | `auth.staff` | List staff (PINs are never returned). |
| `POST` | `/staff` 🔒 | `auth.saveStaff` | Create a staff member. |
| `PATCH` | `/staff/:id` 🔒 | `auth.saveStaff` | Update name, PIN or role. |
| `DELETE` | `/staff/:id` 🔒 | `auth.removeStaff` | Delete a staff member. |

### Catalog

| Method | Path | Maps to | Description |
|---|---|---|---|
| `GET` | `/categories` | `catalog.categories` | List categories. |
| `POST` | `/categories` 🔒 | `catalog.saveCategory` | Create a category. |
| `PATCH` | `/categories/:id` 🔒 | `catalog.saveCategory` | Update a category. |
| `DELETE` | `/categories/:id` 🔒 | `catalog.removeCategory` | Delete an empty category (`409` if it has products). |
| `GET` | `/products` | `catalog.products` | List products. Filters: `?categoryId=`, `?active=true`, `?q=`. |
| `GET` | `/products/lookup?code=` | `catalog.findByCode` | Find a product by barcode or SKU. |
| `GET` | `/products/:id` | `catalog.byId` | Get one product. |
| `POST` | `/products` 🔒 | `catalog.saveProduct` | Create a product, including option groups. |
| `PATCH` | `/products/:id` 🔒 | `catalog.saveProduct` | Update a product. |
| `DELETE` | `/products/:id` 🔒 | `catalog.removeProduct` | Delete a product. |

### Stock

| Method | Path | Maps to | Description |
|---|---|---|---|
| `GET` | `/stock/low` | `catalog.lowStock` | Products at or below their alert level. |
| `POST` | `/stock/adjustments` 🔒 | `catalog.adjustStock` | Body `{ productId, delta, reason }`. |
| `GET` | `/stock/movements` 🔒 | `catalog.stockMoves` | Movement log. Filters: `?productId=`, `?from=`, `?to=`. |

### Orders and checkout

| Method | Path | Maps to | Description |
|---|---|---|---|
| `POST` | `/orders` | `cart.checkout` → `orders.complete` | Complete a sale. The server recalculates totals, assigns the order number, deducts stock and awards points. |
| `GET` | `/orders` | `orders.orders` | List orders. Filters: `?from=`, `?to=`, `?status=`, `?q=`. |
| `GET` | `/orders/:id` | `orders.byId` | Get one order (for reprinting a receipt). |
| `POST` | `/orders/:id/refund` 🔒 | `orders.refund` | Body `{ reason, restock }`. |
| `GET` | `/orders/top-sellers?days=30&limit=8` | `orders.topSellers` | Best sellers for the Sell screen. |
| `GET` | `/held-orders` | `cart.held` | Held orders, shared across tills. |
| `POST` | `/held-orders` | `cart.hold` | Park an order. |
| `DELETE` | `/held-orders/:id` | `cart.resume` / `cart.discardHeld` | Take a held order off the list (resume or discard). |

Example request for `POST /orders`:

```json
{
  "orderType": "dine-in",
  "table": "5",
  "customerId": "c_123",
  "note": "",
  "orderDiscount": { "type": "percent", "value": 10 },
  "lines": [
    {
      "productId": "prd-4",
      "qty": 2,
      "options": [{ "group": "Size", "name": "Large" }],
      "note": "less ice",
      "discountPct": 0
    }
  ],
  "payments": [{ "method": "cash", "amount": 10 }]
}
```

The client sends only the ids, choices and quantities. The server looks up prices, so a changed price in the browser
can't alter what's charged. The response is the full `Order`, including `number`, totals, `change` and `pointsEarned`.

### Customers

| Method | Path | Maps to | Description |
|---|---|---|---|
| `GET` | `/customers?q=` | `customers.search` | Search by name, phone or email. |
| `GET` | `/customers/:id` | `customers.byId` | Customer with totals and points. |
| `GET` | `/customers/:id/orders` | — | The customer's order history. |
| `POST` | `/customers` | `customers.save` | Create a customer. |
| `PATCH` | `/customers/:id` | `customers.save` | Update a customer. |
| `DELETE` | `/customers/:id` 🔒 | `customers.remove` | Delete a customer. |

### Shifts and cash drawer

| Method | Path | Maps to | Description |
|---|---|---|---|
| `GET` | `/shifts/current` | `shift.current` + `shift.summary` | The open shift with its live summary. |
| `POST` | `/shifts` | `shift.open` | Body `{ openingFloat }`. `409` if a shift is already open. |
| `POST` | `/shifts/current/cash-moves` | `shift.moveCash` | Body `{ type: "in" \| "out", amount, reason }`. |
| `POST` | `/shifts/current/close` | `shift.close` | Body `{ countedCash, note }`. Returns expected vs counted. |
| `GET` | `/shifts` | `shift.history` | Past shifts. |

### Reports 🔒

| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/summary?from=&to=` | Net sales, orders, average order, items sold, tax, discounts, estimated profit, refunds. |
| `GET` | `/reports/sales-by-time?from=&to=&bucket=hour\|day` | Sales chart data. |
| `GET` | `/reports/products?from=&to=` | Quantity and revenue per product. |
| `GET` | `/reports/breakdown?from=&to=&by=payment\|category\|orderType\|staff` | Sales grouped by the chosen field. |
| `GET` | `/reports/orders.csv?from=&to=` | Orders export. |

These are calculated in the browser in `src/views/ReportsView.vue` today.

### Settings and data

| Method | Path | Maps to | Description |
|---|---|---|---|
| `GET` | `/settings` | `settings.s` | Store settings. |
| `PATCH` | `/settings` 🔒 | `settings.s` | Update settings. |
| `GET` | `/backup` 🔒 | Export backup | Full data export. |
| `POST` | `/backup` 🔒 | Import backup | Restore from an export. |

### Live updates (planned)

For kitchen displays and multiple tills, a WebSocket at `/api/v1/events` would push `order.created`,
`order.refunded`, `held-order.changed`, `stock.low` and `shift.closed` events.

### Hardware (planned)

A small local print service (for example `http://localhost:9100`) would accept `POST /print/receipt`,
`POST /print/kitchen` and `POST /drawer/open`, and send ESC/POS commands to the receipt printer and cash drawer.
