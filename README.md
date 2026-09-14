# Obsidian — Production SaaS Edition

A premium personal finance tracker: React + Vite + Tailwind + Framer
Motion + Zustand on the frontend, Supabase (Postgres + Auth + Edge
Functions) on the backend, Stripe for billing.

This README is the implementation guide, organized into the 6 phases
used to take it from local-only prototype to a real, payable SaaS.

---

## Phase 1 — Backend & Authentication (Supabase)

**What changed:**
- `src/lib/supabaseClient.js` — the one Supabase client instance.
- `supabase/migrations/001_init_schema.sql` — `profiles`, `transactions`,
  `budgets`, `recurring_rules` tables, all with Row Level Security.
- `src/lib/dataProvider.js` — every function now queries Postgres via
  Supabase instead of LocalStorage.
- `src/components/AuthScreen.jsx` — real email/password sign up + sign
  in, plus "Continue with Google" (Supabase OAuth).
- `src/store/useStore.js` — `initAuth()` now calls
  `supabase.auth.getSession()` and subscribes to
  `supabase.auth.onAuthStateChange`, so login, logout, token refresh, and
  the OAuth redirect are all handled by one listener.

**Why RLS instead of filtering in the frontend?**
Row Level Security is enforced by Postgres itself, on every query, no
matter what client sends it. The anon key shipped to the browser
genuinely cannot read or write another user's rows — even if there's a
bug in your React code. Filtering with `WHERE user_id = ...` in
application code is a UX nicety, not a security boundary; RLS makes the
database itself the enforcement point.

**Setup steps:**
1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/migrations/001_init_schema.sql`.
3. Authentication → Providers → enable **Google** (you'll need a Google
   Cloud OAuth client ID/secret — Supabase's docs link you straight to
   the right Google Cloud page).
4. Authentication → URL Configuration → add your local
   (`http://localhost:5173`) and production URLs to **Redirect URLs**.
5. Project Settings → API → copy the Project URL and `anon` public key
   into `.env` (see `.env.example`).

---

## Phase 2 — Monetization: Stripe Payment Link + Webhook

Billing uses a **static Stripe Payment Link** rather than a
dynamically-created Checkout Session — there is no `create-checkout-session`
function at all. The whole "start a payment" step is just building a URL
and redirecting the browser to it.

**What changed:**
- `supabase/migrations/002_payment_link_billing.sql` — adds
  `stripe_customers` (maps a Supabase user → Stripe customer id) and
  `subscriptions` (status, plan, renewal date), both RLS-protected
  read-only-to-the-user. Retires the old `profiles.is_pro` column from
  migration 001 — these two tables are now the single source of truth.
- `src/lib/stripe.js` — `redirectToPaymentLink()` appends
  `?client_reference_id=<supabase_user_id>` to the Payment Link and
  navigates the browser there. `redirectToCustomerPortal()` still calls
  an Edge Function, since managing an *existing* subscription needs the
  Stripe secret key.
- `supabase/functions/stripe-webhook/index.ts` — verifies Stripe's
  signature, reads `session.client_reference_id` on
  `checkout.session.completed` to link the payment to a user, and keeps
  `subscriptions` in sync on `customer.subscription.updated/deleted` and
  `invoice.payment_failed`.
- `supabase/functions/customer-portal/index.ts` — looks up the caller's
  Stripe customer id from `stripe_customers` and opens the portal.
- `src/hooks/useProStatus.js` (new) — reads the current user's
  `subscriptions` row and stays live via Supabase Realtime.
- `src/components/UpgradeModal.jsx` / `BillingPanel.jsx` — use
  `redirectToPaymentLink()` / `useProStatus()` instead of a local flag.

**How `UpgradeModal.jsx` builds the link (Section 2 of the request):**
```js
// src/lib/stripe.js
export const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/test_28E3cwfmXe753yI1Ew6kg01';

export async function redirectToPaymentLink() {
  const { data: { user } } = await supabase.auth.getUser();
  const url = new URL(STRIPE_PAYMENT_LINK);
  url.searchParams.set('client_reference_id', user.id);
  window.location.href = url.toString();
}
```
`UpgradeModal.jsx` just calls `await redirectToPaymentLink()` on the
upgrade button's `onClick`. Stripe echoes `client_reference_id` back
untouched as `session.client_reference_id` in the
`checkout.session.completed` webhook event — that's the entire
mechanism linking a payment to an app user.

**Why an Edge Function for the webhook, specifically?**
Stripe calls the webhook server-to-server — there's no user browser
session attached to that request. The ONLY way to trust it is verifying
the `Stripe-Signature` header against your webhook signing secret, which
requires the Stripe secret key. That key must never reach the browser,
so this logic has to live somewhere server-side; Supabase Edge Functions
are the natural place because they can use the `service_role` key to
write `subscriptions`/`stripe_customers` directly, bypassing RLS in a
controlled, audited way — RLS on those two tables has no INSERT/UPDATE
policy for normal users at all, so only a `service_role`-authenticated
request (i.e. the webhook) can ever write to them.

**Handling out-of-order and duplicate events (Section 6):**
Every event handler funnels through one `upsertSubscriptionStatus()`
helper in the webhook, which (a) upserts on `stripe_subscription_id` so
a retried/duplicate delivery just re-writes the same row instead of
creating a second one, and (b) compares the incoming event's Unix
timestamp against a stored `last_event_ts` column and **ignores the
event if it's older** than what's already applied — Stripe does not
guarantee webhooks arrive in the order they were generated.

**Setup steps:**
1. Stripe Dashboard → Payment Links → create one for your Pro price
   (or use the one already in `src/lib/stripe.js`). Under **After
   payment**, set it to redirect to your app —
   `http://localhost:5173/?success=true` locally, or your production
   URL with the same query param. (The app has no router, so `/dashboard`
   also works fine thanks to `vercel.json`'s SPA rewrite — it just loads
   the same `index.html` and the query string is read from there.)
2. Install the Supabase CLI, then from the project root:
   ```bash
   supabase functions deploy customer-portal
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   `--no-verify-jwt` is required for the webhook only — Stripe has no
   Supabase session to send a JWT with.
3. Set the server-side secrets (never in `.env`, only in Supabase):
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
   ```
4. Stripe Dashboard → Developers → Webhooks → **Add endpoint** →
   `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` →
   select events: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. After creating it, click **Reveal** next to
   Signing secret and copy the `whsec_...` value:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```
5. Test it end-to-end: click your Payment Link (or the in-app "Upgrade"
   button), pay with the test card `4242 4242 4242 4242`, any future
   expiry, any CVC. You should land back on `?success=true`, see the
   "Payment received" toast, and Billing should show the Pro plan within
   a couple seconds (Realtime) or immediately (the explicit refetch on
   the redirect). Stripe Dashboard → Webhooks → your endpoint → recent
   deliveries should show `200` responses.

---

## Phase 3 — Advanced "Sticky" Pro Features

**Recurring transactions (weekly / monthly / yearly):**
- `supabase/migrations/001_init_schema.sql` → `recurring_rules` table
  stores `frequency` and `next_run_date`.
- `src/utils/recurrence.js` → `addInterval(date, frequency)` — the only
  date math the whole feature needs.
- `src/store/useStore.js` → `processRecurring()` runs once per app load:
  for every rule whose `next_run_date` is today or earlier, it creates a
  real transaction and advances `next_run_date`, looping (capped at 24
  iterations) so a rule nobody's seen in months catches up correctly
  instead of firing once and going stale.
- `src/components/RecurringManager.jsx` — UI to add/remove rules with a
  frequency selector.

> For a stricter production setup, also add a Supabase **scheduled**
> Edge Function (cron) that calls the same catch-up logic daily — so
> recurring transactions post even if the user never opens the app that
> day. The client-side version here is intentionally the simpler MVP.

**Budget goals:**
- `budgets` table (`user_id`, `category`, `monthly_limit`), one row per
  category via a unique constraint — `setBudget` upserts on conflict.
- `src/components/BudgetProgress.jsx` — progress bar per category,
  turns red (`bg-expense`) once spend exceeds the limit.

**CSV export (Pro-gated):**
- `src/utils/format.js` → `downloadCSV`. Gated behind `requirePro` in
  Sidebar/MobileNav — the nav item itself shows a "PRO" badge and opens
  `UpgradeModal` if the user isn't subscribed yet, so the feature is
  visible (driving upgrades) but not usable for free.

---

## Phase 4 — Production UI/UX Polish

- **Skeletons:** `src/components/skeletons/DashboardSkeleton.jsx` and
  `TransactionListSkeleton.jsx`, both using `animate-pulse` and matching
  the real layout's exact dimensions so nothing shifts when data arrives.
- **Toasts:** `react-hot-toast`'s `<Toaster />` mounted once in `App.jsx`;
  every store mutation (`addTransaction`, `updateTransaction`, Stripe
  redirects, data-load failures) calls `toast.success` / `toast.error`.
- **Empty states:** `src/components/EmptyState.jsx` — shown by
  `TransactionList` when the user has zero transactions, with a direct
  "Add your first transaction" CTA that opens the same modal as the
  toolbar button.
- **Responsive layout:** `Sidebar.jsx` is `hidden md:flex`; `MobileNav.jsx`
  is a fixed bottom bar shown only below the `md` breakpoint — this was
  already true of the prototype and is unchanged here.
- **Error boundary:** `src/components/ErrorBoundary.jsx` wraps `<App />`
  in `main.jsx`. A crash anywhere in the component tree now shows a
  calm "Something went wrong / Reload" screen instead of a blank page.

---

## Phase 5 — Deployment & Environment

**Environment variables**

| Variable | Where it's used | Public? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vite app (`supabaseClient.js`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Vite app | Yes (protected by RLS) |
| `STRIPE_SECRET_KEY` | Both Edge Functions (`stripe-webhook`, `customer-portal`) | **No — server only** |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` function only | **No — server only** |
| `SUPABASE_SERVICE_ROLE_KEY` | Both Edge Functions | **No — server only, bypasses RLS** |

Note there's no `VITE_STRIPE_*` variable at all — the Pro plan is a
static Payment Link (its price is baked into the link itself in the
Stripe Dashboard), so the browser never needs any Stripe key.

**Deploy to Vercel:**
1. Push this repo to GitHub.
2. On vercel.com → New Project → import the repo. Framework preset:
   Vite (auto-detected).
3. Project Settings → Environment Variables → add the three `VITE_*`
   values from the table above (Production + Preview).
4. Deploy. `vercel.json` in this repo adds an SPA rewrite so a page
   refresh on any route, and the Google OAuth redirect back to your
   domain, resolve to `index.html` instead of 404ing.
5. Add your Vercel production URL (`https://your-app.vercel.app`) to
   Supabase → Authentication → URL Configuration → Redirect URLs, and to
   Google Cloud Console's OAuth client "Authorized redirect URIs".
6. Server-side secrets (Stripe keys, service role key) are **not** set in
   Vercel at all — they only exist as Supabase Edge Function secrets
   (`supabase secrets set ...`), since the Vite app never calls Stripe
   directly.

---

## Phase 6 — Local development

```bash
npm install
cp .env.example .env   # fill in the three VITE_* values
npm run dev
```

`supabase/` contains the SQL migration and three Edge Functions — deploy
those with the Supabase CLI as described in Phase 2 before Pro
features/billing will work end-to-end. Everything else (auth, CRUD,
budgets UI, recurring UI) works as soon as the migration has run and
your `.env` is filled in.
