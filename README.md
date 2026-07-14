# Stock Tracker

A Vercel-ready stock tracker rebuilt from `Stock Tracker 2026.xlsx`.

## What It Tracks

- Products from the workbook: RH638 AC smoke alarm, RH638 B smoke alarm, and RHRC2 remote controller.
- Warehouses and electricians from the workbook master data.
- Opening stock snapshot based on the workbook dashboard.
- Stock movements: receive, issue, return, install, adjustment, and opening balance.
- Live stock-on-hand totals by product and holder.

## Local Setup

```bash
pnpm install
pnpm dev
```

The app works locally with browser storage if Supabase variables are not set.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. In Supabase Auth, enable email/password sign-in.
4. Copy `.env.example` to `.env.local`.
5. Add:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

After signing in, use **Load workbook snapshot** to seed the first set of products, holders, and opening balances.

## Vercel

Add the same environment variables in Vercel project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Build command: `pnpm build`

Output directory: `dist`

