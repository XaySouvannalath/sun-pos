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
- **Split bill**: by items (each guest pays for what they had; the rest stays on the bill) or equally between 2–20
  guests, who pay one after another with any method.
- **Merge bill**: combine held orders (for example tables 5 and 6) into one order.
- **Payments**: cash (quick amounts and change), card, QR/transfer, and several payments on one order.
- **Exchange rates**: managers set the rates each day (USD, LAK, THB, CNY, EUR, VND) with a history. The payment screen
  shows the total in each currency, and every sale keeps its day's rates. Receipts show the rates and converted totals;
  turn this off in Settings.
- **Receipts**: printable 80 mm receipts, with reprint from order history.
- **Orders**: history, search and filters, refunds (restock optional), CSV export.
- **Shifts & cash drawer**: opening float, cash in/out, expected cash, and end-of-day count with over/short.
- **Customers & loyalty**: customer records, visit and spend history, points.
- **Products & categories**: prices, cost and margin, SKU/barcode, stock tracking, option groups.
- **Stock**: low-stock alerts, receive, remove and count stock, movement log.
- **Reports**: sales, orders, average order, estimated profit, sales by hour or day, best sellers, payment
  methods, categories, order types and staff.
- **Staff & roles**: PIN login. Managers get everything; cashiers can sell, run shifts and manage customers.
- **Settings**: store info, currency (USD, LAK, THB, CNY, EUR, VND), tax, service charge, and JSON backup/restore.
- **Languages**: English, Lao (ລາວ), Chinese (中文) and Vietnamese (Tiếng Việt), chosen per device on the lock
  screen or in Settings. Dates, times and error messages follow the language. A Lao font is bundled, so Lao
  displays correctly offline.
- **Display per device**: light/dark theme, and animations On, Off or Match device (follows the device's
  reduce-motion setting). Animations are short: items fly into the cart, totals count up, charts grow in.
- **Import from Excel or CSV**: products, customers, staff and stock counts. Columns are matched automatically, and
  every row is checked in a preview before anything is saved. Excel and CSV templates are included.

The app talks to a REST API. A **mock backend is included**, so it runs right after cloning, with a sample menu,
staff, customers and 14 days of demo sales. Clear the demo sales under **Settings → Data**.

**Demo PINs:** Manager `1234` · Cashier `0000`

**Shortcuts on the Sell screen:** `F2` or `/` to search, `F9` to charge.

## Development

Requires Node `^22.18.0` or `>=24.12.0`.

```sh
npm install          # if npm 10 crashes with "reading 'edgesOut'", use: npx npm@11 install
npm run dev          # http://localhost:5173, with the mock API at /api/v1
npm run build        # type-check + production build
npm run test:unit    # unit tests (Vitest)
npm run lint         # oxlint + eslint
npm run format       # prettier
npm run mock:reset   # reset the mock data to src/mock/data/*.json
npm run build:preview  # single-file preview at dist-preview/sun-pos.html (no print/downloads)
```

## Backend and API

The frontend calls the REST API described in **[docs/API.md](docs/API.md)** (56 endpoints).

- **Out of the box:** `npm run dev` serves a mock backend at `/api/v1`. Its starting data is in
  `src/mock/data/*.json`, and changes are saved to `.mock-db.json` (git-ignored).
- **Your own backend:** create `.env.local` (see [`.env.example`](.env.example)) with
  `VITE_API_PROXY=http://localhost:8080` for development, or `VITE_API_URL=https://your-server/api/v1` for a
  production build. The mock turns off automatically.
- **No server:** `VITE_API_MODE=local` runs the mock inside the browser and saves to `localStorage`.

`src/mock/router.ts` is the reference implementation of every endpoint, and `src/__tests__/api.spec.ts` holds the
contract tests your backend should pass.

## Languages

All interface text lives in `src/i18n/locales/`: `en.ts` is the source, and `lo.ts`, `zh.ts` and `vi.ts` must have
exactly the same keys and `{placeholders}`. The type check and `src/__tests__/i18n.spec.ts` fail if a translation is
missing or a placeholder doesn't match.

- **Fix a translation:** edit the text in that language's file.
- **Add a language:** copy `en.ts` to a new file, translate it, and add it to `languages` and `catalogs` in
  `src/i18n/index.ts`.
- Use `t('key')` in components (`import { t } from '@/i18n'`). Plurals use `"{n} item | {n} items"`.

Menu items, categories, the receipt footer and other store data are not translated; they show as entered.

## Project structure

```
src/
  assets/main.css      Tailwind setup and colour tokens (light and dark)
  types.ts             Domain types
  utils/pos.ts         Totals, rounding and cash helpers (shared by the app and the mock)
  i18n/                Translations (en, lo, zh, vi), language setting, bundled Lao font
  api/                 API client: one typed function per endpoint
  stores/              Pinia stores: cart, catalog, orders, customers, shift, auth, settings
  mock/                Mock backend: router, business rules, and seed data in mock/data/*.json
  components/          Shared UI and sell-screen components
  views/               Pages: Sell, Orders, Shift, Customers, Products, Stock, Reports, Settings
```
