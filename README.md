# Sun POS

A point-of-sale system for cafés and restaurants, built with **Vue 3**, **Tailwind CSS 4**, **Pinia** and **TypeScript**.

The interface is designed for staff who use it all day: warm, low-glare colours, soft (never pure black) text,
large touch targets, and a comfortable dark theme.

## Features

- **Sell screen**: product grid with category filters, search, and barcode/SKU scanning (type or scan, then press Enter).
- **Top sellers**: a ranked strip of the best-selling items (last 30 days by default) with one-tap add.
- **Options & modifiers**: size, temperature, milk, extras and so on, each with an extra price.
- **Cart**: quantity steppers, item notes, item and order discounts, dine-in/takeaway/delivery, table number.
- **Hold & resume** orders to serve the next customer.
- **Payments**: cash (quick amounts and change), card, QR/transfer, and split payments.
- **Receipts**: printable 80 mm receipts, with reprint from order history.
- **Orders**: history, search and filters, refunds (restock optional), CSV export.
- **Shifts & cash drawer**: opening float, cash in/out, expected cash, and end-of-day count with over/short.
- **Customers & loyalty**: customer records, visit and spend history, points.
- **Products & categories**: prices, cost and margin, SKU/barcode, stock tracking, option groups.
- **Stock**: low-stock alerts, receive, remove and count stock, movement log.
- **Reports**: sales, orders, average order, estimated profit, sales by hour or day, best sellers, payment
  methods, categories, order types and staff.
- **Staff & roles**: PIN login. Managers get everything; cashiers can sell, run shifts and manage customers.
- **Settings**: store info, currency (USD, LAK, THB, EUR, VND), tax, service charge, theme, and JSON backup/restore.

Data is stored in the browser (`localStorage`), so it works offline with no server. On first run the app loads a
sample menu and 14 days of demo sales; clear them under **Settings → Data**.

**Demo PINs:** Manager `1234` · Cashier `0000`

**Shortcuts on the Sell screen:** `F2` or `/` to search, `F9` to charge.

## Development

Requires Node `^22.18.0` or `>=24.12.0`.

```sh
npm install          # if npm 10 crashes with "reading 'edgesOut'", use: npx npm@11 install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build
npm run test:unit    # unit tests (Vitest)
npm run lint         # oxlint + eslint
npm run format       # prettier
```

## Project structure

```
src/
  assets/main.css      Tailwind setup and colour tokens (light and dark)
  types.ts             Domain types
  data/seed.ts         Sample menu, staff and demo sales
  utils/pos.ts         Totals, rounding and cash helpers
  stores/              Pinia stores: cart, catalog, orders, customers, shift, auth, settings
  components/          Shared UI and sell-screen components
  views/               Pages: Sell, Orders, Shift, Customers, Products, Stock, Reports, Settings
```
