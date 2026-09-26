# Sun POS

A point-of-sale system for cafés, restaurants and shops, built with **Vue 3**, **Tailwind CSS 4**, **Pinia** and
**TypeScript**.

The interface is made for staff who use it all day: warm, low-glare colours, soft (never pure black) text, large touch
targets and a comfortable dark theme. It works on iPads, Android tablets, phones and computers, in English, Lao,
Chinese and Vietnamese.

## Try it

```sh
npm install
npm run dev          # http://localhost:5173
```

A **mock backend is included**, so the app runs right after cloning, with a sample menu, staff, customers, a floor plan,
a week of exchange rates and 14 days of demo sales.

**Demo PINs:** Manager `1234` · Cashier `0000`

**Shortcuts on the Sell screen:** `F2` or `/` to search, `F9` to charge.

## Features

### Selling

- **Sell screen**: product grid with category filters, search, and barcode/SKU scanning (type or scan, then press
  Enter).
- **Top sellers**: the best-selling items of the last 30 days (configurable) in a strip with one-tap add.
- **Options & modifiers**: size, temperature, milk, extras and so on, each with an extra price. Required options are
  pre-selected for one-tap adding.
- **Cart**: quantity steppers, item notes with quick notes ("less ice", "no onion"…), item and order discounts,
  dine-in / takeaway / delivery, table, customer and order note. The order on screen survives a page reload.
- **Hold & resume**: park an order and serve the next customer. Held orders are saved on the server, so any till can
  open them.

### Payments and bills

- **Payments**: cash (quick amounts and change), card and QR/transfer, and several payments on one order.
- **Split bill**:
  - **By items**: each guest pays for what they had; the rest stays on the bill.
  - **Equally**: 2–20 guests pay one after another, each with any method. Rounding differences go to the last guest.
- **Merge bill**: combine held bills (for example tables 5 and 6) into one order.
- **Exchange rates**: managers set each day's rates (USD, LAK, THB, CNY, EUR, VND) and see the history. The payment
  screen shows the total in each currency, every sale keeps its day's rates, and receipts can show the rates and
  converted totals (switch off in Settings).
- **Receipts**: 80 mm receipts, printed through the device's print system. Reprints from Orders are logged.
- **Refunds**: with optional restocking. Cashiers refund with a manager's PIN.

### Tables and kitchen

- **Table floor plan**: one plan per area (Indoor, Terrace…) showing free tables, open bills with their total and time
  seated, and a bell when food is ready.
  - Tap a free table to start its order; tap a busy one to open, move or merge its bill.
  - **Move a table** by dragging its bill onto a free table, onto a busy table (merge, after a confirmation) or onto
    another area's button. Moves can be undone. Bills can also be moved from the table's menu or with **Move table**
    on the Sell screen. Kitchen tickets move with the bill.
  - **Edit layout** (managers): drag tables with a mouse, finger or arrow keys, resize them, set name, seats, shape
    and area, and add or rename areas. Overlapping tables are outlined in red.
- **Kitchen & bar tickets**: each category goes to a station (Coffee → Bar, Food → Kitchen, Bakery → no ticket).
  - **Send** passes new items to the stations; a table's order then goes back to the floor plan. Paying sends anything
    not sent yet, so takeaway orders reach the kitchen too.
  - Items removed after sending are shown to the kitchen as **cancelled**.
  - The **Kitchen** screen shows tickets per station with waiting times (amber after 10 minutes, red after 20),
    tick-off per item, Start → Ready → Served, recall of served tickets, and printing. Each screen remembers its
    station, so the bar tablet shows only drinks.
  - Stations are renamed, added or removed in **Settings → Kitchen & bar**.

### Cash control and staff activity

- **Manager approval (PIN)**, enforced by the server, for:
  - discounts above the cashier's limit (10% by default)
  - removing items the kitchen already has, or deleting an order with such items
  - refunds by cashiers
  - taking cash out of the drawer
  - reprinting receipts (optional)

  The PIN pad says what is being approved and who asked. Each approval works once, and five wrong PINs lock approvals
  for a few minutes.

- **Blind cash count**: cashiers close their shift without seeing how much cash there should be.
- **Activity log**: every discount, removed item, deleted order, refund, cash in/out, reprint, shift close and wrong
  PIN, with who did it and who approved it.
- **Activity screen** (managers): warnings first (cash short, many items removed after sending, high discounts,
  deleted orders, repeated wrong PINs), then totals per staff member and the full log, for today, yesterday or the
  last 7 days.
- **Shifts & cash drawer**: opening float, cash in/out, expected cash, and end-of-day count with over/short.
- Choose all controls in **Settings → Staff controls**.

### For the owner

- **Daily summary**: the day in one message, in the owner's language:
  - sales and orders compared with the same day last week
  - payments by method and the top 5 items
  - each shift's cash result
  - discounts, removed items, refunds and cash out
  - what to check

  Share it with one tap to **WhatsApp, Telegram, LINE or email**, or copy it. It can also be queued automatically
  when a shift closes or at a set time; your backend does the actual sending (see [Needs a real backend](#needs-a-real-backend)).

- **Reports**: sales, orders, average order, estimated profit, sales by hour or day, best sellers, payment methods,
  categories, order types and staff.
- **Orders**: history, search and filters, receipts, refunds and CSV export.

### Customers, products and stock

- **Customers & loyalty**: customer records, visit and spend history, loyalty points.
- **Products & categories**: prices, cost and margin, SKU/barcode, stock tracking, option groups, and which station
  each category's tickets go to.
- **Stock**: low-stock alerts, receive, remove and count stock, and a movement log.
- **Import from Excel or CSV**: products, customers, staff and stock counts. Columns are matched automatically (also
  from Lao and Chinese headings), and every row is checked in a preview before anything is saved. Excel and CSV
  templates are included.

### Staff, settings and display

- **Staff & roles**: PIN login. Managers get everything; cashiers get the screens in the table below.
- **Settings**: store info, currency, tax, service charge, receipt footer, loyalty points, top-seller period, staff
  controls, kitchen stations, exchange rates on receipts, and JSON backup/restore. Demo sales can be cleared or
  reloaded under **Settings → Data**.
- **Languages**: English, Lao (ລາວ), Chinese (中文) and Vietnamese (Tiếng Việt), chosen per device on the lock screen or
  in Settings. Dates, times and error messages follow the language. A Lao font is bundled, so Lao displays correctly
  offline.
- **Display per device**: light or dark theme, and animations On, Off or Match device (follows the device's
  reduce-motion setting). Animations are short: items fly into the cart, totals count up, charts grow in.

### Screens and who can use them

| Screen    | What it's for                         |             Cashier              |      Manager      |
| --------- | ------------------------------------- | :------------------------------: | :---------------: |
| Sell      | Taking orders and payments            |                ✓                 |         ✓         |
| Tables    | Floor plan, moving and merging bills  |                ✓                 | ✓ (+ edit layout) |
| Kitchen   | Kitchen and bar tickets               |                ✓                 |         ✓         |
| Orders    | History, receipts, refunds            | ✓ (refunds with a manager's PIN) |         ✓         |
| Shift     | Opening, cash in/out, closing         |         ✓ (blind count)          |         ✓         |
| Customers | Customer records and loyalty          |                ✓                 |         ✓         |
| Products  | Menu, categories, options             |                                  |         ✓         |
| Stock     | Stock levels and movements            |                                  |         ✓         |
| Reports   | Sales reports                         |                                  |         ✓         |
| Summary   | Daily summary and sending             |                                  |         ✓         |
| Activity  | Warnings and the activity log         |                                  |         ✓         |
| Rates     | Daily exchange rates                  |                                  |         ✓         |
| Settings  | Store settings, staff, controls, data |                                  |         ✓         |

### Needs a real backend

The mock backend covers everything above for demos and development. A few things only happen with a real server:

- **Sending the daily summary automatically** through a Telegram bot, WhatsApp Business or email. The mock keeps
  queued summaries in the send list on the Summary screen.
- **Several tills at once**: with the dev server, all browsers share the mock data; with `VITE_API_MODE=local`, each
  browser has its own. Other tills' changes (tables, tickets) appear within 5–10 seconds.
- **Security**: hash PINs and limit logins on your server (the mock does neither). See
  [Building your backend](docs/API.md#building-your-backend).

Printing uses the device's print dialog; one-tap printing to thermal printers is not built yet.

## Development

Requires Node `^22.18.0` or `>=24.12.0`.

```sh
npm install            # if npm 10 crashes with "reading 'edgesOut'", use: npx npm@11 install
npm run dev            # http://localhost:5173, with the mock API at /api/v1
npm run build          # type-check + production build
npm run test:unit      # unit and contract tests (Vitest)
npm run lint           # oxlint + eslint
npm run format         # prettier
npm run mock:reset     # reset the mock data to src/mock/data/*.json
npm run build:preview  # single-file preview at dist-preview/sun-pos.html (no printing or downloads)
```

## Backend and API

The frontend calls the REST API described in **[docs/API.md](docs/API.md)** (74 endpoints).

- **Out of the box:** `npm run dev` serves a mock backend at `/api/v1`. Its starting data is in
  `src/mock/data/*.json`, and changes are saved to `.mock-db.json` (git-ignored).
- **Your own backend:** create `.env.local` (see [`.env.example`](.env.example)) with
  `VITE_API_PROXY=http://localhost:8080` for development, or `VITE_API_URL=https://your-server/api/v1` for a
  production build. The mock turns off automatically.
- **No server:** `VITE_API_MODE=local` runs the mock inside the browser and saves to `localStorage`.

`src/mock/router.ts` is the reference implementation of every endpoint, and `src/__tests__/api.spec.ts` holds the
contract tests your backend should pass. Business rules (prices, totals, stock, approvals, discount limits, blind
counts) are checked on the server, never trusted from the app.

## Languages

All interface text lives in `src/i18n/locales/`: `en.ts` is the source, and `lo.ts`, `zh.ts` and `vi.ts` must have
exactly the same keys and `{placeholders}`. The type check and `src/__tests__/i18n.spec.ts` fail if a translation is
missing or a placeholder doesn't match.

- **Fix a translation:** edit the text in that language's file.
- **Add a language:** copy `en.ts` to a new file, translate it, and add it to `languages` and `catalogs` in
  `src/i18n/index.ts`.
- Use `t('key')` in components (`import { t } from '@/i18n'`). Plurals use `"{n} item | {n} items"`. For text in a
  specific language (such as the owner's daily summary), use `tIn(language, 'key')`.

Menu items, categories, the receipt footer and other store data are not translated; they show as entered.

## Project structure

```
src/
  assets/main.css      Tailwind setup and colour tokens (light and dark)
  types.ts             Domain and API types
  utils/               Totals and cash (pos.ts), exchange rates (rates.ts), the summary message (summaryText.ts),
                       Excel/CSV import (importer.ts), animations, downloads (shared by the app and the mock)
  i18n/                Translations (en, lo, zh, vi), language setting, bundled Lao font
  api/                 API client: one typed function per endpoint
  stores/              Pinia stores: cart, catalog, orders, customers, shift, auth, settings, rates, floor,
                       kitchen, approval, app, toast
  mock/                Mock backend: router, business rules (logic.ts), and seed data in mock/data/*.json
  components/          Shared UI, sell-screen components, the floor plan canvas, the approval PIN pad
  views/               Pages: Sell, Tables, Kitchen, Orders, Shift, Customers, Products, Stock, Reports, Summary,
                       Activity, Rates, Import, Settings, Lock
docs/API.md            REST API reference and the checklist for building your backend
```
