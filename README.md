# Garuda

Pre-flight shipment checker: conversational shipment booking and error checking for UK → Germany / France / Netherlands road freight (Ops Hackathon, Case 2).

- **Book by chat:** describe a shipment in plain words. Garuda fills what it can, asks only for what is missing, checks it against the 10-rule rulebook, recommends a carrier and confirms the booking.
- **Check a file:** upload the judges' workbook (Bookings + Items sheets) or two CSVs. Every booking is checked, fixed in one click, and exported as a corrected workbook and an issues report.
- **Insights:** mistakes by rule, seller scorecards, freight by carrier and route, on-time risk, a carrier price what-if and consolidation opportunities for the checked file.
- **Rules:** the rulebook, the extra checks, and how each rule is read.

## Features beyond the brief

| Feature | Where | What it does |
|---|---|---|
| Guided demo | "▶ Watch the 60-second demo" in the hero | Plays a scripted run: chat booking, a mid-way change, confirmation, a file with planted mistakes, fix-all, a cheaper option, then Insights. Stoppable at any step. |
| Cost and delay avoided | Issue panels, file summary, Insights | Rough per-rule estimates (e.g. R-06 ≈ £500 and 5 days, R-08 ≈ £90 and 2 days) summed per booking and per file. Always labelled as estimates, not quotes (`src/domain/impact.ts`). |
| Fix all safe issues | File summary | Applies only fixes with one right answer: restore a dropped leading zero (R-01), and set the declared value (R-02) or carton total (R-04) when every item line is consistent. Everything else waits for a person. |
| Changes since upload | File view, corrected workbook | Cell-by-cell before/after list; also written as a "Changes" sheet in the corrected file. |
| Cheaper options | Carrier section (chat and file) | Carrier + pallet-count combinations that cost less and still pass R-05, with the trade-off in days and on-time rate, and a one-click "Use this". |
| Consolidation | Insights | Same seller, same route, ready within 3 days: one collection, and the best-case cost if part-loads combine. |
| Bank holidays | Checks and dates | UK, German, French and Dutch national holidays 2026–27. Collection skips UK bank holidays; arrival on a weekend or destination holiday is an info note. Status is never changed by these notes. |
| Dangerous-goods detail | R-06 cards | UN number, ADR class and what a DG shipment needs (e.g. UN38.3 summary for lithium batteries). |
| Voice input | 🎤 next to Send | Browser speech recognition (hidden where the browser has none). |
| Paste an order | "Paste order" in the chat | Paste an email or PO; it goes through the same parser as typed messages. |
| Saved sellers and products | Automatic after a confirmation | Kept in this browser only. Fills a seller's usual collection city and a product's HS code, origin, pack size, weight and price on the next booking. |
| Repeat last booking | Greeting button, or "repeat my last booking" | Copies the last confirmed booking with a new reference and asks only for the new date and slot. |
| Share link | Booking panel and file detail | The whole booking is encoded in the URL fragment (`#share=…`); nothing is stored on a server. |
| Print pack | "Print documents" | Booking summary, commercial invoice, packing list, export checklist, pallet labels and carton labels with Code 128 barcodes. Print or save as PDF from the browser. |
| Seller scorecards, risk, what-if | Insights | Clean-rate per seller, a 0–100 on-time risk heuristic per booking, and how freight and carrier choices shift if one carrier's prices change. |

Not built, because each needs a server, credentials or carrier contracts: live carrier rate and booking APIs, tracking after collection, team accounts with shared booking history, and email/Slack alerts.

The look is dark-first (near-black surfaces, one electric blue `#0016CB` with glow, oversized Inter Tight headings) with a light mode behind the toggle in the header; the choice is remembered per browser.

Everything runs in the browser. No login, no API key and no backend. The same input always gives the same result.

## Setup

Requires Node 20+.

```bash
npm ci
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc --noEmit`) and build the static site into `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |
| `npm run test` | Vitest unit and acceptance tests (`tests/*.test.ts`) |
| `npm run e2e` | Playwright end-to-end tests (`tests/e2e/`); builds and serves the app itself |
| `npm run typecheck` | Type-check only |

All tests freeze "today" to **26-10-2026** (Vitest via `setToday`, Playwright via `page.clock`).
If Chromium is not installed, run `npx playwright install chromium` once.

## Architecture

```
src/
  domain/            pure, framework-free business logic
    types.ts           Booking, Item, Issue, CarrierOption, CheckResult, Action
    reference.ts       CARRIERS (Sheet 3), RULES (Sheet 4), ALLOWED values: copied exactly from the template
    format.ts          number parsing and en-GB money / kg formatting
    dates.ts           DD-MM-YYYY, Excel serial dates, today() (freezable), next working day
    hs.ts              HS digit counting, description-based suggestions, leading-zero hint
    dangerousGoods.ts  R-06 keyword detection with negations ("battery-free", "non-flammable")
    normalize.ts       loose sheet/form input → clean Booking (idempotent)
    carriers.ts        evaluateCarriers, recommendCarrier (priority logic + R-05 fallback)
    rules.ts           check(booking, { carrierOverride }) → CheckResult (R-01..R-10 + extra checks)
    fixes.ts           applyAction(booking, action): setBooking / setItem / removeItem
    confirmation.ts    headline, label fields, "what happens next", invoice rows, booking reference
    holidays.ts        UK / DE / FR / NL public holidays 2026–27
    impact.ts          estimated cost and delay avoided per rule, booking and file
    optimize.ts        safe fixes and fix-all, cheaper carrier/pallet options, consolidation
    diff.ts            before/after cell changes
    insights.ts        mistakes by rule, seller scorecards, freight breakdowns, on-time risk, carrier what-if
  chat/
    understand.ts      rule-based language understanding (numbers, £, kg/g, dates, priorities, products…)
    conversation.ts    Conversation: state, asking order, derive(), undo, fixes, confirm
  io/
    assemble.ts        mapped rows → bookings; orphan / duplicate / missing-ID warnings (no SheetJS)
    readWorkbook.ts    find header rows, map columns by name, skip the untouched grey example row
    writeWorkbook.ts   corrected bookings workbook + issues report workbook
    report.ts          plain-text report for "Copy report"
    share.ts           encode/decode a booking in a share link
    profiles.ts        saved sellers and products (localStorage, injectable storage)
    print.ts           printable document pack and export checklist
    barcode.ts         Code 128 (set B) SVG barcodes
  data/sample.ts       the 9 sample bookings with planted mistakes
  ui/                  React views and components (App, ChatView, BookingPanel, FileView, InsightsView, RulesView,
                       components/: results, carrier, confirmation, extras, InvoiceModal, PrintModal)
tests/                 rules, carriers, chat, io, features, io-extra (Vitest) and e2e/ (Playwright)
public/                the blank template and the sample workbook, downloadable from the app
```

Design notes:

- `domain/` has no React or DOM code, so every rule is unit-tested directly. The UI only renders `CheckResult`s and dispatches `Action`s.
- `check()` normalises its input and is idempotent, so the same function serves chat bookings, uploaded rows and fixed bookings.
- Every change, whether typed, made in the panel or clicked as a fix, goes through the `Conversation`. It then re-runs all checks and reports a "Checks re-run" summary: rules fixed, new issues, carrier/cost change and status change.
- "Fix in chat" loads a file booking into the conversation and syncs every change back to the file results.
- SheetJS (`xlsx`) is lazy-loaded the first time a file is read or written, so the first page load stays small (~90 KB gzip of JS).
- Bot replies are a small HTML subset (bold, italics, lists). Every user-supplied value is escaped with `esc()` before it goes into that HTML.

## How each rule is read

Severity is in brackets. Red = must not ship until fixed; Amber = risky, fix or check.

| Rule | Reading |
|---|---|
| **R-01** HS code ≥ 6 digits (Red) | Counts digits only, so `6912.00` counts as 6. A 5-digit code gets a "restore leading zero" fix (Excel drops it: `90230` → `090230`). A likely code is suggested from the description, for the seller to confirm. |
| **R-02** Declared value = Σ qty × unit price, within 1% (Red) | Passes when \|declared − items\| ≤ 1% of the item total. The fix sets the declared value to the item total. |
| **R-03** Units per carton × cartons = quantity (Red) | Per item. Fixes offer whichever single number makes it consistent. |
| **R-04** Booking cartons = Σ item cartons (Red) | Fix sets the booking total. |
| **R-05** Gross weight ÷ pallets ≤ chosen carrier's max (Red) | Uses the recommended carrier (or the seller's override). If the priority's first choice is too heavy, the next eligible carrier is chosen with a Notice explaining why and what more pallets would cost. If no carrier fits, R-05 is Red with fixes for "more pallets for the chosen carrier" and "fewest pallets that fit any carrier". |
| **R-06** No lithium batteries, aerosols, flammable liquids (Red) | Keyword scan of description + SKU (power bank, Li-ion, hair spray, perfume, nail polish, solvents…). Negations such as "battery-free" and "non-flammable" are ignored. Fix removes the item. |
| **R-07** Gross weight ≥ Σ unit weight × quantity (Amber) | Fix suggests goods + ~25 kg per pallet. |
| **R-08** Warehouse deliveries need an appointment (Amber) | Applies only when Destination type = Warehouse. |
| **R-09** Every item has a country of origin (Amber) | Blank origin fails; an unrecognised country is an info note. |
| **R-10** Ready date not in the past (Amber) | Compared with today's date on the device. Fix offers the next working day. |

**Extra checks** are labelled "extra check" and are never mixed with the rulebook:
X-01 missing required fields (Red), X-05 invalid date (Red), X-07 city not in the country (Amber), X-08 currency not GBP (Amber), X-09 origin outside the UK (Amber), X-11 negative numbers (Red), X-12 invalid pallet count (Red), plus info notes for an HS code over 10 digits (X-02), items that might hide restricted contents (X-03), weekend ready dates (X-06) and duplicate SKUs (X-10).

**Status:** Red if any Red issue, Amber if any Amber, otherwise Green. Notices and info notes never change the status. Red bookings cannot be confirmed; Amber ones can, with a warning.

## Carrier scoring

Only carriers on the booking's route (UK → destination country) are considered.

- **Cheapest:** lowest price per pallet × pallets (ties: shorter transit).
- **Fastest:** shortest transit (ties: higher on-time rate, then price).
- **Most reliable:** highest on-time rate (ties: price).
- **Balanced:** each carrier is scored 0–1 on cost, speed and on-time rate with min–max scaling across the route (1 = best). Garuda picks the highest *minimum* of the three scores (the carrier with no weak spot), with ties broken by the average score, then price. That is Carrier B on every route (A scores 0 on speed and reliability, C scores 0 on cost).
- **R-05 eligibility:** a carrier is eligible only if weight per pallet ≤ its max. The first eligible carrier in priority order wins. If none is eligible, the priority's first choice is shown and R-05 is Red.
- **Override:** the seller can pick any carrier ("use carrier B" or the card buttons) and switch back to the recommendation.

BK-001 example (Manchester → Frankfurt, 3 pallets, 620 kg): Cheapest → Carrier A £540, Fastest → Carrier C £1,020, Most reliable → Carrier C £1,020, Balanced → Carrier B £660.

## Where the port differs from the prototype

The logic is a straight port of `engine.js`, `chat.js` and `io.js`, with these deliberate fixes:

- "500 t-shirts" was read as 500 tonnes. Weight units must now end the word.
- A second product that only shared a word with the first ("hair spray" after "hair brushes") was merged into it. New products now merge only when the head noun matches.
- R-05 with no eligible carrier also offers the fewest pallets that fit any carrier (e.g. BK-105: 5 pallets for Carrier C, or 3 for Carrier B).
- The example-row check compares mapped fields, so it works whatever the column order, and with a date cell stored as an Excel serial.

## Optional LLM fallback

Not included. The brief makes it optional and the app must work without it. Any API key baked into a static build is visible to every visitor. A fallback would therefore need a small server-side proxy, which conflicts with "no backend secrets". The `understand()` contract (text in, structured `FieldSet`s out) is the place to plug one in later.

## Deployment

Static site on Vercel (`vercel.json`: Vite, output `dist/`). Deployment Protection must be off so the production URL opens without login.

## Notes

- `xlsx` is pinned to 0.18.5, the last SheetJS release on the npm registry. It has published advisories for crafted workbooks: prototype pollution when reading, and ReDoS. Files are only ever read locally in the user's own browser, so the exposure is limited. Where the network allows, switch to the maintained build: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
