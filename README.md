# Stock Tracker

A Vercel-ready stock tracker rebuilt from `Stock Tracker 2026.xlsx`.

## What It Tracks

- Products from the workbook: RH638 AC smoke alarm, RH638 B smoke alarm, and RHRC2 remote controller.
- Warehouses and electricians from the workbook master data.
- Opening stock snapshot based on the workbook dashboard.
- Stock movements: receive, issue, return, install, adjustment, and opening balance.
- Live stock-on-hand totals by product and holder.
- Warranty jobs by job number and customer.
- Customer postings from a warehouse, with reference and tracking.
- Electrician changeovers where good stock is installed and faulty stock is held separately in the electrician's inventory.

## No Login

The app is an internal tool, so there is **no sign-in**. It opens straight to the
dashboard. When Supabase is connected, everyone who opens the site shares the same
live data. When it is not, the app stores data in the browser on that device only.

## Local Setup

```bash
pnpm install
pnpm dev
```

The app works locally with browser storage if Supabase variables are not set.

## Supabase Setup (shared cloud, no login)

1. Create a Supabase project (keep it private — anyone with the anon key can read
   and write the data).
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Add:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Use **Load workbook snapshot** to seed the first set of products, holders, and
opening balances.

**Upgrading an existing deployment:** rerun `supabase/schema.sql` after pulling
these updates. It is idempotent — it removes the old per-account sign-in
requirement, switches to a shared workspace, and keeps your existing data. Data
that was created under a signed-in account before this change stays visible.

## Managing Electricians & Products

Use the **Setup** tab to add or remove electricians, warehouses, and products.
Removing an electrician with no stock history deletes them outright; if they have
past movements, they are hidden from the lists while their history is kept for the
records.

## Warranty Workflow

1. Create a warranty job with the job number and customer details.
2. Use **Post Stock To Customer** when replacement stock is sent from 3PL or another warehouse.
3. Use **Record Electrician Changeover** when an electrician replaces a faulty alarm at the house.

The changeover creates two linked stock movements:

- Good stock leaves the electrician as installed.
- Faulty stock is added back to that electrician as faulty inventory.

## Pickup Slips (Stock Release Requests) via Resend

On the **Electricians** tab, **Request Stock — Pickup Slip** builds a Stock
Release Request (matching the Goldsure template) and can email it to Specific
Freight. Recipients are set in `src/pickupConfig.ts`:

- To: Damien Doyle (`damiend@specificfreight.com.au`)
- CC: `mel3pl@specificfreight.com.au`, plus the selected electrician when they
  have an email saved in Setup.

Sending happens through a Vercel serverless function (`api/send-pickup-slip.ts`)
so the Resend API key never reaches the browser.

### Setup

1. In Resend, verify your sending domain (e.g. `goldsure.com.au`).
2. In Vercel > Project > Settings > Environment Variables, add:

```bash
RESEND_API_KEY=your-resend-api-key
PICKUP_FROM_EMAIL=Goldsure Stock Tracker <vignesh@goldsure.com.au>
```

`PICKUP_FROM_EMAIL` must use a domain verified in Resend. If it is not set, the
function falls back to Resend's `onboarding@resend.dev` test sender.

Editable business details (company, Specific Freight address/phone, carton
sizes per product) live in `src/pickupConfig.ts`.

**Note:** email sending only works on a deployed Vercel environment (or via
`vercel dev`) — `pnpm dev` serves the front end only, so use **Preview / print**
to check the slip locally.

## Branding

Add your logo at `public/assets/goldsure-logo.png` (see
`public/assets/README.md`). It appears in the header and on the pickup slip. If
it is missing, the app simply hides it.

## Vercel

Add the environment variables in Vercel project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `RESEND_API_KEY` (for pickup-slip emails)
- `PICKUP_FROM_EMAIL` (verified Resend sender)

Build command: `pnpm build`

Output directory: `dist`
