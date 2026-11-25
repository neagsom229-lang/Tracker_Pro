# Cycle Time

Measured on local Windows dev machine (Node 22, npm, Playwright Chromium installed). Times are wall-clock, single run, after warm caches. CI runner times will differ.

## Baseline (before Step 4 changes)

| Command | Time (s) | Notes |
|---|---:|---|
| `npm run lint` | 4.11 | ESLint full repo |
| `npm run test:unit` | 3.96 | 10 files, 52 tests |
| `npm run db:reset:test` | 1.43 | drops/recreates tracker_db_test, migrate, seed |
| `npm run test:integration` | 14.26 | 6 files, 38 tests, real HTTP + pg |
| `npm run build` | 7.42 | Vercel env check + Vite production build |
| `npm run smoke:local` | 12.38 | local API + Vite dev server + Playwright |
| `npm run smoke:preview` | 4.99 | Vite preview serving dist + Playwright |
| `npm run verify` (sum/components) | ~48s | runs all above except smoke:preview; CI also runs smoke:preview |

## Changes applied

| Change | Expected impact | Status |
|---|---|---|
| `actions/setup-node` npm cache | Already present (`cache: npm`) | Already in CI |
| Playwright browser cache (`~/.cache/ms-playwright`, key on OS+package-lock) | Skips Chromium download on cache hit; still installs OS deps | Added in `.github/workflows/ci.yml` |
| CI job env `NODE_ENV=production` removed from job level | Prevents devDependencies omission; fixes red CI | Done |
| CI step-level NODE_ENV split | Build uses production; db reset/integration/smoke use development | Done |
| Production dist smoke (`smoke:preview`) in CI | Catches broken production bundle before deploy confidence | Done |

## After (local measurement, same machine)

Local command timings unchanged by CI cache changes (cache helps CI runner). Measured after changes:

| Command | Time (s) |
|---|---:|
| `npm run lint` | 4.11 |
| `npm run test:unit` | 3.96 |
| `npm run db:reset:test` | 1.43 |
| `npm run test:integration` | 14.26 |
| `npm run build` | 7.42 |
| `npm run smoke:local` | 12.38 |
| `npm run smoke:preview` | 4.99 |

## Remaining Step 4 items

- Measure CI runner before/after on actual GitHub Actions PR run (user to open PR and paste results).
- Point post-deploy smoke against Vercel Preview URL (Step 5 / CI deploy workflow).
- Consider splitting integration tests or parallelizing independent jobs only if CI time becomes a problem; current suite is small (~14s local).
