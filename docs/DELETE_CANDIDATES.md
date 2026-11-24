# Step 2 — Delete Candidates

**Branch:** `chore/production-readiness`  
**Rule:** Delete only items marked NOT-NEEDED-FOR-LAUNCH or proven unused. If not forced to add back later, we didn't delete enough — but do not delete uncertain items.

## Evidence Collected

- `npx --yes depcheck --json` (exit 1): unused devDependencies reported: `@vitest/coverage-v8`, `autoprefixer`, `axe-core`, `postcss`, `tailwindcss`. Missing deps reported for Deno Supabase functions (`stripe`, `bakong-khqr`) — expected false positives (Deno URL imports).
- `npx --yes knip --no-progress --reporter compact` (exit 1): flagged unused files including `public/service-worker.js` and all `supabase/functions/**` — **false positives** (static PWA asset / Deno edge functions). Also flagged `axe-core`, `lint-staged` as unused devDependencies — **false positives** (used by `scripts/ui-check.mjs` and `.husky/pre-commit` + package.json config).
- `git grep` for candidates: `_redirects` present; BrowserRouter v7 future flags present in `src/App.jsx`; `.env.example` duplicate dev-toggle block lines 30-41.

## Candidates

| Item | Why safe / rationale | Evidence | Risk | Launch scope | Action |
|---|---|---|---|---|---|
| `public/_redirects` | Netlify/Cloudflare Pages SPA fallback; Vercel uses `vercel.json` rewrites. Project deploy target is Vercel. | `public/_redirects` exists; README mentions Netlify/CF; `vercel.json` already has rewrite. | Low — breaks Netlify deploy if used later. README already documents it; can restore from git. | NOT needed for Vercel launch | **DELETE NOW** |
| `.env.example` duplicate dev-toggle block (lines 30-41) | Duplicate `ENABLE_DEV_PRO_TOGGLE` / `NODE_ENV` comment block; confusing and stale. | Lines 30-34 and 36-41 repeat same keys/comments. | Low — docs only, no runtime effect. | Cleanup | **DELETE NOW** (dedupe) |
| `src/App.jsx` `BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` | React Router 7 uses these behaviors by default; flags are v6->v7 future compat flags. Installed `react-router-dom@^7.18.6`. | `src/App.jsx:153`; RR7 docs/migration: future flags were for v6 opt-in; in v7 defaults apply. | Low — verify tests/build pass. | Cleanup | **DELETE NOW** (after verify) |
| `scripts/show-set-cookie.mjs` | Unreferenced debug script; not in package.json scripts, not in docs. | `git grep show-set-cookie` only finds file itself. | Low — dev debug helper only; recoverable from git. | NOT needed | **DELETE NOW** |
| `src/lib/aba.js` | Unreferenced old ABA PayWay form-post helper. ABA PayWay API deferred; manual ABA flow kept. No imports found. | `git grep -rn "from.*aba.js\|from.*lib/aba" -- .` = no matches. `AbaPaywayFlow.jsx`/manual flow use different paths. | Medium — confirm no runtime dynamic use; recoverable from git. | DEFERRED PayWay path; unused | **DELETE NOW** (verify build/tests) |
| `src/lib/manualPayment.js` exports `createManualPayment`, `submitPaymentProof` | Knip reports unused exports. Manual ABA is launch MUST; exports may be dead or future wiring. | Only defined in file; no imports found. | **High** — may be intended wiring; do not delete before confirming. | MUST area | **INVESTIGATE / KEEP** |
| `src/hooks/useProStatus.js` export `refreshUntilPro` | Knip unused export. | Only defined in file; no imports found. | Medium — may be used by billing flow later. | Billing area | **INVESTIGATE / KEEP** |
| `src/utils/constants.js` `TRANSFER_CATEGORY_IDS`, `DATE_RANGES` | Knip unused exports. | No usages found in src. | Low-medium — may be planned UI filters. | Cleanup candidate | **DEFER** (not blocking) |
| `src/store/useStore.js` `selectSpendingByCategory` export | Used internally in same file; export may be unused externally. | Internal use at line 519; no external imports found. | Low | Cleanup | **DEFER** |
| `public/service-worker.js` | Knip flagged unused file — false positive. Referenced as PWA asset; AC-7 requires `/service-worker.js` 200. | `vercel.json`/PWA expectations; SW contains push hooks; file served from public. | **High if deleted** | MUST (PWA/offline honesty) | **KEEP** |
| `supabase/functions/**` | Knip flagged unused — false positive for Deno edge functions. | Deployed to Supabase, not imported by Vite. | **High if deleted** | Depends (Stripe/manual ABA/webhooks) | **KEEP** |
| `axe-core`, `lint-staged` devDependencies | Knip/depcheck flagged unused — false positives. | `scripts/ui-check.mjs` uses axe-core; `.husky/pre-commit` runs `npx lint-staged`; package.json has lint-staged config. | **High if deleted** | Tooling | **KEEP** |
| `@vitest/coverage-v8`, `autoprefixer`, `postcss`, `tailwindcss` | Depcheck flagged unused devDeps — likely config/tooling false positives or indirect. | autoprefixer/postcss/tailwind used by Tailwind/PostCSS build chain; coverage used by `npm run coverage`. | Medium | Tooling | **KEEP for now** (verify before any removal) |
| Duplicate migration versions / spaces in `supabase/migrations` | Not a deletion; normalization needed. | Issue #10: `003/004/006` duplicates; filenames with spaces. | High if mishandled on real DB | MUST fix safely | **Step 3 migration task** (no real project) |
| `scripts/db-check.mjs` | Knip unused file; package.json uses `server/db-check.js` instead. | `package.json` `db:check` points to `server/db-check.js`; no refs to `scripts/db-check.mjs`. | Medium — may be ad hoc tool. | Dev tooling | **INVESTIGATE / DEFER** |

## Deleted (this Step 2 pass)

1. `public/_redirects` — deleted (Vercel-only deploy; vercel.json handles SPA rewrite).
2. `.env.example` duplicate dev-toggle block — deduped.
3. `src/App.jsx` BrowserRouter `future` flags — removed (RR7 defaults).
4. `scripts/show-set-cookie.mjs` — deleted (unreferenced debug script).
5. `src/lib/aba.js` — deleted after grep confirmed no imports.

## Step 2 Review Additions (evidence-based)

| Item | Evidence | Risk | Action |
|---|---|---|---|
| `supabase/functions/create-aba-payment/` | No src refs; only referenced by `aba-webhook` and deferred migration 006. PayWay API deferred; `src/lib/aba.js` removed. | Low-medium; recoverable from git. | **DELETED** |
| `supabase/functions/aba-webhook/` | PayWay webhook; no src refs; paired with create-aba-payment. | Low-medium. | **DELETED** |
| `src/components/AbaPaywayFlow.jsx` | Actually manual ABA flow (static KHQR, reference submission to `manual_payments`). Name misleading. | Low. | **RENAMED** to `ManualAbaFlow.jsx`; imports updated. |
| QR underpayment check | `ManualAbaFlow` uses static KHQR payload (no encoded amount). It records `amount_usd` as plan price; admin UI shows amount and instructs "Check your ABA app for this amount and reference before approving". | **Residual risk:** static QR cannot enforce paid amount; admin must verify actual ABA transfer amount. | **Documented risk**; admin review shows amount. Consider dynamic KHQR/amount-encoded payload in future. |
| `vitest.config.js` coverage exclude `src/lib/aba.js` | File deleted in Step 2. | None. | **REMOVED** |
| `supabase/functions/daily-digest/` | No src callers; notifications/digest DEFERRED. `supabase/config.toml` had `[functions.daily-digest]`. | Low; deferred feature. | **DELETED**; config entry removed. |
| `supabase/functions/notify-admin-payment/` | No src callers found; DEFERRED. | Low. | **DELETED** |
| `src/components/NotificationBell.jsx` + `src/hooks/useNotifications.js` | Notifications DEFERRED; bell only used in `TopBar.jsx`; hook only used by bell. | Low UI change; deferred feature. | **DELETED**; removed from `TopBar`. |
| `supabase/functions/parse-receipt/` + `ReceiptScanner` | `ReceiptScanner` used in `TransactionModal`; `Ai.js` calls parse-receipt. Receipt/AI scan adjacent to deferred AI Quick Add. | Medium - visible product change. | **DEFER** (feature-flag/remove only with explicit scope decision). |
| `supabase/migrations/003 bank sync.sql` | Bank sync DEFERRED; no UI callers found. | Migration history. | **KEEP migration**; no UI to remove. |
| `docs/` size ~11.21 MB (screenshots) | Large binary-like assets in repo. | Repo bloat. | **PROPOSE** move to Git LFS or external artifact storage; **do not delete without asking**. |

## Verification

- `npm run verify` PASS after Step 2 review changes (check:imports, lint, 10/51 unit, 5/34 integration, build, smoke:local).
- `NODE_ENV=production npm run build` (real prod bundle): `charts-D_J1HEID.js` **567.56 kB / 159.17 kB gzip**, `index-Dybv0reI.js` 210.25 kB / 71.06 kB gzip, `motion-BUiYvD9h.js` 123.04 kB / 40.89 kB gzip, `supabase-Pf0Abwmk.js` 224.17 kB / 58.66 kB gzip. Confirms Issue #13.

## Not Deleted (false positives / risky / deferred)

- `public/service-worker.js` (PWA asset)
- `supabase/functions/**` (server-side edge functions)
- `axe-core`, `lint-staged`, Tailwind/PostCSS/Vitest coverage toolchain deps
- Unused exports in manual payment/pro-status/constants/store (investigate separately)
- Migration normalization (separate controlled task)