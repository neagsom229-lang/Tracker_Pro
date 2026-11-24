# Production Readiness Requirements — Obsidian Finance Tracker (Tracker_Pro)

**Status:** Draft for confirmation (Step 1). **Do not proceed to Step 2 until open questions are answered.**  
**Branch:** `chore/production-readiness`  
**Baseline date:** 2026-11-24

## 1) Core User Promise

> **Log money fast, see where it goes, and stay under budget.**

Everything required for launch must directly support this promise for a real, authenticated user on production (Vercel + Supabase + Stripe), with data isolated per user and no misleading financial state.

## 2) Route / Feature Inventory

| Route / Feature | Who asked for it (assumed; confirm) | Real user job | Launch class | Notes / evidence |
|---|---|---|---|---|
| `/dashboard` | Product/core UX (README, DESIGN, ux-audit) | See financial state at a glance: balance, budget health, trend, category spend, recent transactions | **MUST** | `src/App.jsx`; `Dashboard.jsx`; ux-audit requires Quick Add, 3 stat cards, budget health, trend, category, recent tx. |
| `/transactions` | Product/core UX | Review, search, filter, edit, delete money movements | **MUST** | `TransactionList.jsx`; core CRUD. |
| Transaction create/edit modal | Product/core UX | Log money fast; correct mistakes | **MUST** | `TransactionModal.jsx`. |
| AI Quick Add | Product enhancement (README) | Log expense/income from natural language quickly | **SHOULD** | `AIQuickAdd.jsx`, `parseQuickAdd.js`; fallback is manual entry. Confirm launch scope. |
| Multi-currency (USD/EUR/GBP/KHR/JPY) | Product enhancement (README) | Track/enter amounts in supported currencies | **SHOULD** | README claims support; verify conversion/display behavior. Confirm launch scope. |
| `/budgets` | Product/core UX | Set monthly limits and see over/under budget | **MUST** | `BudgetProgress.jsx`; directly serves core promise. |
| `/recurring` | Product enhancement | Avoid re-entering repeating transactions | **SHOULD** | `RecurringManager.jsx`, `recurrence.js`. Confirm launch scope. |
| `/goals` | Product enhancement | Track savings milestones | **SHOULD** | `GoalManager.jsx`. Confirm launch scope. |
| `/debts` | Product enhancement | Track debt payoff | **SHOULD** | `DebtManager.jsx`. Confirm launch scope. |
| `/networth` | Product enhancement | See aggregate net worth | **SHOULD / DEFER?** | `NetWorthPage.jsx`; depends on assets/debts/goals; local mode notes assets empty. Confirm. |
| `/export` | Product enhancement / trust | Export CSV/PDF for records | **SHOULD** | `ExportPanel.jsx`. Confirm launch scope. |
| `/billing` | Monetization | Understand plan, upgrade/manage subscription | **MUST if paid launch** / **SHOULD if free** | `BillingPanel.jsx`; depends on Stripe decision. |
| Stripe Payment Link upgrade | Monetization | Pay for Pro | **MUST if Stripe live at launch** | `src/lib/stripe.js` hardcodes test link; webhook/Edge Function flow exists. |
| Manual ABA payment + admin review | Regional monetization | Pay via ABA when card/Stripe not suitable | **OPEN QUESTION** | `AbaPaywayFlow.jsx`, `AdminPaymentsPanel.jsx`, ABA migrations/functions exist. |
| `/admin` | Operations | Approve/reject manual ABA payments | **MUST only if ABA manual payments required** | `AdminPaymentsPanel.jsx`; **needs route guard** (client + server/RLS enforcement). |
| Auth: sign up/login/logout/reset | Security/core | Access own data safely | **MUST** | `AuthScreen.jsx`, `ResetPasswordScreen.jsx`, Supabase Auth. |
| Google login | Convenience auth | Faster sign-in | **SHOULD** | Confirm configured in Supabase. |
| PWA manifest/service worker/offline shell | Reliability/installability | App opens reliably; installable; honest offline state | **MUST** | Manifest/icon/SW issues; offline must not show fake cached balances. |
| Notifications | Engagement | Receive reminders/alerts | **DEFER candidate** | `useNotifications.js`, `NotificationBell.jsx`; local mode says not connected. Confirm. |
| Bank sync | Convenience | Import transactions automatically | **DEFER candidate** | `003 bank sync.sql` exists; implementation/UI status unclear. Confirm. |
| Local Express/Postgres backend (`/server`, `VITE_DATA_BACKEND=local`) | Dev/testing | Local development and integration tests | **NOT for production deploy** | Keep for dev/test unless proven unused; must not be enabled on Vercel. |

## 3) Measurable Launch Acceptance Criteria

| ID | Criterion | Measure / evidence | Target |
|---|---|---|---|
| AC-1 | New user can sign up and log first transaction | Manual/E2E flow from clean state | < 60 seconds |
| AC-2 | Auth flows work | Sign up, confirm (if enabled), login, logout, password reset; Google login redirect if enabled | PASS on production/staging |
| AC-3 | Core money flow works | Add/edit/delete transaction; balances/totals update correctly | PASS |
| AC-4 | Budget flow works | Create budget, exceed it, see alert/state | PASS |
| AC-5 | Data isolation (RLS) | User A cannot read/modify User B data | PASS with automated proof |
| AC-6 | Deep links / SPA routing | Direct load/reload on key routes returns app | HTTP 200 + app renders |
| AC-7 | PWA/static assets correct | `/manifest.json`, `/icons/icon.svg`, `/service-worker.js` return 200 and correct content types; referenced icons exist | PASS |
| AC-8 | No critical console errors | Browser console on key routes during smoke | 0 errors |
| AC-9 | Security headers present | CSP/frame-ancestors/base-uri/form-action as agreed, `X-Content-Type-Options`, HSTS, etc. | PASS on deployed response |
| AC-10 | Lighthouse quality | Production/staging Lighthouse audit | **Performance / Accessibility / Best Practices / SEO >= 90** |
| AC-11 | Build/deploy fails fast on bad config | Missing required Vercel env vars or unsafe prod config blocks deploy | PASS |
| AC-12 | Billing safety | Stripe mode/link correct for target environment; webhook updates Pro only through server-verified path | PASS; no client-side Pro grant |
| AC-13 | Offline honesty | App opens offline and shows honest offline/unavailable state; no fake cached balances | PASS |
| AC-14 | Quality gate | `npm run verify` passes in CI | PASS |
| AC-15 | Production-path test | Real-user flow validated against **Supabase staging project** (not local mode) | PASS with evidence; no real production project touched without explicit approval |
| AC-16 | Admin access control | `/admin` inaccessible to non-admin users; admin/payment approval enforced server-side/RLS | PASS |
| AC-17 | Migration integrity | Supabase migrations have no duplicate version conflicts/unsafe filenames; `supabase db push --dry-run` validated against staging/dev project only after approval | PASS |

## 4) Known-Issue Confirmation (Baseline Audit)

| Issue | Status | Evidence | Notes |
|---|---:|---|---|
| 1. Manifest case mismatch | **Fixed in working branch (separate commit)** | `public/Manifest.json -> public/manifest.json` committed as `1eb3ffb` | Verify Linux/Vercel behavior in deploy smoke. |
| 2. `index.html` links `/icon.svg`, real file `public/icons/icon.svg` | **Confirmed** | `index.html:8` links `/icon.svg`; `public/icons/icon.svg` exists; no `public/icon.svg` | Fix in Step 3A. |
| 3. `check-vercel-env.mjs` not wired into `build` | **Not accurate as stated; explicit wiring added** | `prebuild` existed before; `package.json` now also has prebuild script committed (`df4e314`) per Step 3B intent | Keep npm lifecycle behavior; confirm if build script should also inline-check. |
| 4. SW stale-while-revalidate on `index.html` | **Dropped** | `public/service-worker.js` is network-first for navigations | User correction: already network-first. |
| 5. Stripe hardcoded test payment link | **Confirmed** | `src/lib/stripe.js` hardcodes `https://buy.stripe.com/test_...` | Move to env-driven config; fail-fast in prod as appropriate. |
| 6. CSP issues / no assets immutable cache | **Mostly confirmed** | `vercel.json` had `'unsafe-eval'`; missing `frame-ancestors/base-uri/form-action`; `wss://*.supabase.co` already present (commit `fe4c235` added it earlier in worktree history). No `/assets/*` immutable cache rule | Adjust carefully; verify Supabase/Stripe/fonts. |
| 7. `public/_redirects` Netlify leftover | **Confirmed** | `public/_redirects` exists | Delete candidate if Vercel-only. |
| 8. `Dashboard.test.jsx`/`useStore.test.js` fail without Supabase env vars | **Not reproduced in baseline** | Both passed in `test:unit` | Recheck in Step 3E with env stripped. |
| 9. BrowserRouter `future` props no-ops in RR7 | **Likely; confirm before delete** | `App.jsx` uses RR v7 future flags | Confirm against installed React Router 7 behavior before removal. |
| 10. `supabase/migrations` has duplicate versions / filenames with spaces | **Confirmed (new)** | Files include `003_goals_schema.sql` + `003 bank sync.sql`; `004_goals_and_debts.sql` + `004_debts_schema.sql` + `004 notifications.sql`; `006 parse corrections.sql` + `006 aba payway api.sql`; several names contain spaces | **Step 2/3 item:** normalize/fix migration naming/versioning; validate with `supabase db push --dry-run`; **do not touch a real project without asking**. |
| 11. Missing `icon-192.png` referenced by service worker | **Confirmed** | `public/service-worker.js` references `/icons/icon-192.png` for push notification icon/badge; no `public/icons/icon-192.png` found | Add icon or remove reference; decide in Step 2/3. |
| 12. `/admin` route has no guard | **Confirmed** | `src/App.jsx` routes `/admin` directly to `AdminPaymentsPanel` with no client-side admin guard | Add route guard; server-side/RLS enforcement is required regardless. |

## 5) Baseline (before Step 1 code changes)

Command run (PowerShell): `npm ci; if ($LASTEXITCODE -eq 0) { npm run verify } else { exit $LASTEXITCODE }`

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | PASS (warnings) | 670 packages added; 13 vulnerabilities (7 moderate, 3 high, 3 critical); deprecation warnings |
| `check:imports` | PASS | `check:imports OK` |
| `lint` | PASS | `eslint .` exited 0 |
| `test:unit` | PASS | 10 files, 51 tests |
| `db:reset:test` | PASS | `tracker_db_test` migrated/seeded |
| `test:integration` | PASS | 5 files, 34 tests |
| `build` | PASS (warning) | Vite build succeeded; `dist/assets/charts-DDY33oza.js` **734.82 kB minified / 208.60 kB gzip** |
| `smoke:local` | PASS | signup → dashboard, tx persists after reload, networth renders, local-mode toast, 0 console errors, 0 Supabase requests |

### Charts chunk size note (735 kB vs ~567 kB)
- Current baseline build reports `dist/assets/charts-DDY33oza.js` as **734.82 kB minified, 208.60 kB gzip** (Vite 7.3.6, `npm run build`).
- `vite.config.js` intentionally isolates recharts via `manualChunks: { charts: ['recharts'] }`.
- `package.json` depends on `recharts@^2.12.7`; install resolved to `recharts@2.15.4` (npm warning: "1.x and 2.x branches are no longer active; bump to Recharts v3...").
- The earlier "~567 kB" figure is likely an older/approximate measurement (or gzip/minified confusion). The authoritative current measurement is the Vite build output above: **~735 kB minified**. Step 3F should address this by lazy-loading chart routes/components and confirming bundle impact with a temporary visualizer.

## 6) Step 1 Corrections Applied

- Added AC-15: real production-path test against **Supabase staging project** (not local mode).
- Added migration integrity requirement (AC-17) and known issue #10 for duplicate/space-named Supabase migrations; validation via `supabase db push --dry-run` only after explicit approval, never touching real project without asking.
- Dropped issue #4 as requested (SW already network-first).
- Replaced Lighthouse PWA threshold with **Performance / Accessibility / Best Practices / SEO >= 90**.
- Added known issue #11 (`icon-192.png` referenced by SW but missing) and #12 (`/admin` route missing guard).
- Committed pre-existing worktree changes in separate commits:
  - `1eb3ffb` `chore(pwa): rename Manifest.json to manifest.json for Linux case sensitivity`
  - `fe4c235` `fix(security): allow Supabase websocket in CSP connect-src`
  - `df4e314` `chore(build): add prebuild Vercel env check and allowScripts`

## 7) Open Questions (MUST answer before Step 2)

You indicated answers would be pasted, but the message contained `<paste my list above>`. I still need the actual answers before Step 2:

1. **Stripe launch mode:** Live or test for initial real users? If live, what is the production Payment Link strategy (env var only; no secret values)?
2. **ABA manual payment:** Required for launch, or defer? If required, which ABA flow is production (PayWay API/manual QR/KHQR)?
3. **Production backend scope:** Confirm Express/local PostgreSQL (`/server`, `VITE_DATA_BACKEND=local`) is dev/test-only and not deployed on Vercel.
4. **Launch feature scope:** For each, mark MUST/SHOULD/DEFER: AI Quick Add, multi-currency, recurring, goals, debts, net worth, export, notifications, bank sync, Google login.
5. **Supabase readiness:** Is there a production Supabase project and a staging/test project ready? Can I get explicit approval before any `supabase db push --dry-run` or remote inspection?
6. **Admin access model:** Who can access `/admin`? Is `is_admin` enforced server-side/RLS in target schema?
7. **Real-user definition:** Public launch or private beta/invite-only?
8. **Acceptance targets:** Confirm **Performance / Accessibility / Best Practices / SEO >= 90**, or provide different thresholds.

## 8) Step 1 Stop Point

Step 1 remains **blocked pending open-question answers**. No Step 2 deletions/optimizations have been made. After you provide answers, I will update this document to confirmed requirements and proceed to Step 2 with a `docs/DELETE_CANDIDATES.md` evidence table.