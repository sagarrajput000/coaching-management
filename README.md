# Coaching Center Manager

A complete, single-workspace app for running a coaching center: students and
batches, daily attendance, and fee invoices with overdue tracking. It runs on
Freebuff Sites with Sign in with Freebuff and D1 for data, and every record is
scoped to the signed-in user.

## What is inside

- **Overview** — active students, collected this month, pending dues and the
  weekly attendance rate, plus a 6-month collection chart, a 14-day
  attendance chart, outstanding per batch and a mark-paid list of overdue
  invoices.
- **Students** — searchable list (batch/status filters), guardian contact,
  per-student attendance %, outstanding dues, fee history with mark-paid and
  recent attendance marks.
- **Attendance** — pick a batch and date, mark present/late/absent (or clear),
  "all present" shortcut, previous/next day browsing and a monthly per-student
  summary with rates.
- **Fees** — invoices per student with month, due date, amount and status
  (paid / due / overdue). Filter by status, batch, month or student. "Generate
  invoices" creates one due invoice per active student of a batch from its
  monthly fee; students that already have an invoice for the month are skipped,
  so it is safe to run twice.
- **Batches** — name, subject, schedule, monthly fee; student count and
  outstanding dues per batch.
- **Settings** — rename the center, connection status, restore the sample data
  or clear everything.

## Run it

```sh
bun install
bun run dev        # http://localhost:5173 with local D1 (Miniflare)
bun run build      # dist/client (assets) + dist/coaching-center/index.js (Worker)
bun run typecheck
```

On localhost without a `FREEBUFF_CLIENT_ID`, the app signs you in as a local
development user so everything works before auth is provisioned. A new
workspace is seeded with sample data; Settings can restore or clear it.

## Connect it to Freebuff

1. `sites_create`, then `sites_add_storage` for D1 named `DB`.
2. `sites_enable_auth`. Copy the development variables into `.dev.vars` (see
   `.dev.vars.example`) to use real accounts locally.
3. `bun run build`, then `sites_deploy` with `deploy.json`. The deploy injects
   `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER` and `APP_ORIGIN`, and attaches the
   `DB` binding.

If the database binding is missing the app says so instead of failing: Setup
shows what is connected.

## Where things are

- `src/worker/` is the Hono API. `db.ts` owns the schema (created on first
  request), `seed.ts` the sample data, `auth.ts` the Freebuff integration and
  the loopback-only development user, `routes/*` the endpoints.
- `src/app/` is the React app. `components/ui.tsx` holds the primitives
  (buttons, inputs, dialogs, drawer, menus, toasts); `pages/*` the screens;
  `lib/api.ts` the data hooks (TanStack Query).
- `src/shared/types.ts` is the contract between the two.
- `src/styles.css` holds the design tokens. Everything rounded is a squircle
  via `corner-shape`; true circles use the `round` class.

## Security notes

Every `/api/*` route requires a signed-in user and scopes queries by
`owner_sub`. Mutations must be same-origin (`isSameOriginRequest`). Personalised
responses are `Cache-Control: private, no-store`.
