# Production Readiness Requirements — Obsidian Finance Tracker (Tracker_Pro)

**Status:** Confirmed (Step 1 complete). Proceeding to Step 2.  
**Branch:** `chore/production-readiness`  
**Baseline date:** 2026-11-24

## 1) Core User Promise

> **Log money fast, see where it goes, and stay under budget.**

Everything required for launch must directly support this promise for real, authenticated private-beta users on production (Vercel + Supabase + Stripe test mode), with data isolated per user and no misleading financial state.

## 2) Confirmed Launch Decisions

| Decision | Confirmed answer |
|---|---|
| Stripe mode | **TEST mode for private beta**. Move link to `VITE_STRIPE_PAYMENT_LINK`. Switch to live only after one full test-mode payment works end to end. ⚠ confirm before live switch. |
| ABA | **Keep existing MANUAL flow for launch** (admin approves). **DEFER** PayWay API (`006 aba payway` migration). |
| Production backend | **Express + local Postgres (`/server`) is dev/test only**, never deployed on Vercel. |
| Launch scope | **MUST:** auth (email + Google login), transactions, budgets, dashboard, export, billing/Pro gating. **SHOULD:** recurring, goals, debts, multi-currency. **DEFER:** bank sync, notifications/push, daily-digest, AI Quick Add unless it works against Supabase staging; net worth only if complete. ⚠ adjust to product as needed. |
| Supabase | User will create a **SEPARATE staging project**. Provide guided commands with no secrets. **Do NOT touch any real project or run `db push` without explicit approval each time.** |
| Admin | `is_admin` enforced by RLS (migration 005); add client route guard on `/admin` too. Test non-admin cannot read/approve payments. |
| Launch audience | **Private beta, 10–20 invited users first.** |
| Quality targets | **Lighthouse Performance / Accessibility / Best Practices / SEO >= 90** (no PWA category). |

## 3) Route / Feature Inventory

| Route / Feature | User job | Launch class | Notes |
|---|---|---|---|
| `/dashboard` | See financial state at a glance | **MUST** | Quick Add, stats, budget health, trend, category, recent tx. |
| `/transactions` | Review/search/filter/edit/delete transactions | **MUST** | Core CRUD. |
| Transaction create/edit modal | Log money fast; correct mistakes | **MUST** | `TransactionModal.jsx`. |
| Auth: email sign up/login/logout/reset | Access own data safely | **MUST** | Supabase Auth. |
| Google login | Faster sign-in | **MUST** | Confirmed in scope; verify staging config. |
| `/budgets` | Set limits, see over/under budget | **MUST** | Core promise. |
| `/export` | Export CSV/PDF records | **MUST** | Confirmed in scope. |
| `/billing` + Pro gating | Understand plan, upgrade/manage | **MUST** | Stripe TEST mode private beta; `VITE_STRIPE_PAYMENT_LINK`. |
| `/admin` (manual ABA approval) | Approve/reject manual payments | **MUST** (for manual ABA launch) | Add client route guard; `is_admin` RLS enforced; test non-admin denied. |
| `/recurring` | Avoid re-entering repeating transactions | **SHOULD** | Keep if stable; verify against staging. |
| `/goals` | Track savings milestones | **SHOULD** | Verify complete against staging. |
| `/debts` | Track debt payoff | **SHOULD** | Verify complete against staging. |
| Multi-currency (USD/EUR/GBP/KHR/JPY) | Track/enter supported currencies | **SHOULD** | Verify conversion/display behavior. |
| `/networth` | Aggregate net worth | **DEFER unless complete** | Depends on assets/debts/goals completeness. |
| AI Quick Add | Natural-language fast entry | **DEFER unless works against Supabase staging** | Manual entry fallback exists. |
| Bank sync | Auto-import transactions | **DEFER** | Migration exists; scope/UI unclear. |
| Notifications/push/daily-digest | Engagement/reminders | **DEFER** | Not connected in local mode; SW push hooks exist. |
| PayWay ABA API | Automated ABA payments | **DEFER** | `006 aba payway api.sql` exists; manual flow kept for launch. |
| Express/local Postgres (`/server`) | Dev/test only | **NOT for production deploy** | Never deployed on Vercel; keep for dev/test. |

## 4) Measurable Launch Acceptance Criteria

| ID | Criterion | Target | Evidence |
|---|---|---|---|
| AC-1 | New user can sign up and log first transaction | < 60s | Manual/E2E on staging |
| AC-2 | Auth flows work | PASS | Email + Google login, logout, reset on staging |
| AC-3 | Core money flow | PASS | Add/edit/delete tx; totals update |
| AC-4 | Budget flow | PASS | Create budget, exceed, see alert |
| AC-5 | Data isolation (RLS) | PASS | User A cannot read/modify User B data; automated proof |
| AC-6 | Deep links / SPA routing | PASS | Direct load/reload key routes |
| AC-7 | PWA/static assets correct | PASS | `/manifest.json`, `/icons/icon.svg`, `/service-worker.js` 200 + correct content types; referenced icons exist |
| AC-8 | No critical console errors | 0 errors | Smoke on key routes |
| AC-9 | Security headers present | PASS | CSP/frame-ancestors/base-uri/form-action as agreed; XCTO; HSTS; etc. |
| AC-10 | Lighthouse quality | **Perf / A11y / Best Practices / SEO >= 90** | Production/staging Lighthouse audit (no PWA category) |
| AC-11 | Build/deploy fails fast | PASS | Missing required Vercel env vars or unsafe prod config blocks deploy |
| AC-12 | Billing safety | PASS | Stripe TEST mode; `VITE_STRIPE_PAYMENT_LINK`; webhook server-verified Pro only |
| AC-13 | Offline honesty | PASS | No fake cached balances; honest offline state |
| AC-14 | Quality gate | PASS | `npm run verify` in CI |
| AC-15 | **Production-path staging test** | PASS | **Gate for Step 5**. Real-user flow validated against **Supabase staging project** (not local-mode smoke). No real project touched without explicit approval. |
| AC-16 | Admin access control | PASS | `/admin` client guard + `is_admin` RLS; non-admin cannot read/approve payments |
| AC-17 | Migration integrity | PASS | No duplicate version conflicts/unsafe filenames; `supabase db push --dry-run` validated only after explicit approval |

## 5) Known Issues / Findings

| ID | Status | Evidence | Disposition |
|---|---:|---|---|
| 1 | Fixed in branch | Manifest renamed to `public/manifest.json` (`1eb3ffb`) | Verify on Vercel deploy smoke |
| 2 | Confirmed | `index.html` links `/icon.svg`; actual `public/icons/icon.svg` | Step 3A fix |
| 3 | Confirmed/adjusted | `prebuild` script exists and wired (`df4e314`); confirm explicit build wiring desired | Step 3B |
| 4 | Dropped | SW navigations are network-first | No action |
| 5 | Confirmed | `src/lib/stripe.js` hardcodes test Payment Link | Step 3B: move to `VITE_STRIPE_PAYMENT_LINK` |
| 6 | Confirmed | CSP has `unsafe-eval`, missing frame-ancestors/base-uri/form-action; `wss://*.supabase.co` present; no `/assets/*` immutable cache | Step 3D |
| 7 | Confirmed | `public/_redirects` exists | Step 2 delete candidate |
| 8 | Not reproduced in baseline | `Dashboard.test.jsx` and `useStore.test.js` passed in unit tests | Step 3E verify with env stripped |
| 9 | Likely | BrowserRouter v7 future flags in `App.jsx` | Confirm before removal |
| 10 | Confirmed | Duplicate migration versions (`003/004/006`) and filenames with spaces | Step 2/3: normalize; `supabase db push --dry-run` only with explicit approval |
| 11 | Confirmed | `public/service-worker.js` references `/icons/icon-192.png`; file missing | Step 2/3: add icon or remove reference |
| 12 | Confirmed | `/admin` route has no client guard | Step 3/5: add guard; test non-admin denial |
| 13 | **Confirmed (new)** | Charts chunk is 735 kB **only because `NODE_ENV=development`** in shell/CI. **Production build:** `charts-D_J1HEID.js` 567.56 kB (159 kB gzip). **Dev build:** `charts-DDY33oza.js` 734.82 kB. | Corrected from earlier wrong explanation. Re-measure under `NODE_ENV=production` before Step 3F; lazy-load charts only if Lighthouse still shows problem. |
| 14 | **Confirmed (new)** | `ci.yml` sets `NODE_ENV: development` at job level, so verify/smoke:local test a DEV bundle. | Step 4: use `cross-env NODE_ENV=production` on build only; keep development for API/integration tests (dev Pro toggle needs it). Verify `npm run smoke:local` still passes against production build. |

## 6) Baseline (before Step 1 code changes)

Command (PowerShell): `npm ci; if ($LASTEXITCODE -eq 0) { npm run verify } else { exit $LASTEXITCODE }`

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | PASS (warnings) | 670 packages; 13 vulnerabilities (7 moderate, 3 high, 3 critical) |
| `check:imports` | PASS | `check:imports OK` |
| `lint` | PASS | `eslint .` |
| `test:unit` | PASS | 10 files, 51 tests |
| `db:reset:test` | PASS | `tracker_db_test` migrated/seeded |
| `test:integration` | PASS | 5 files, 34 tests |
| `build` | PASS (warning) | Vite build succeeded; dev-bundle chart size observed in baseline context — see Issue #13 for prod/dev distinction |
| `smoke:local` | PASS | signup → dashboard, tx persists after reload, networth renders, local-mode toast, 0 console errors, 0 Supabase requests |

## 7) Process / Release Notes

- **AC-15 is the gate for Step 5**, not local-mode smoke. Local smoke remains useful but insufficient for production readiness.
- **Supabase staging:** provide guided commands containing no secrets; do not touch any real project or run `db push` without explicit approval each time.
- **Push/PR:** push `chore/production-readiness` and open PR; `origin/main` is currently at `c19379d` and lacks these commits.
- **Bundle measurement:** re-measure bundle sizes under `NODE_ENV=production` before Step 3F; only lazy-load charts if Lighthouse still shows a problem.

## 8) Step 1 Exit

Step 1 requirements are **confirmed** by user answers. Proceeding to **Step 2: DELETE THE PART OR PROCESS** (evidence-first, `docs/DELETE_CANDIDATES.md`, no deletion without launch-scope justification).