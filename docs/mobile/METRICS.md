# Mobile Success Metrics — Obsidian Finance

**Owner:** Principal mobile + product engineer
**Purpose:** Write-to target success metrics for the Google Play launch (Track A: PWA + TWA).
**Status:** Drafted per mission instruction; awaiting product approval. Targets are the mission-approved set.

## Success metrics

| # | Metric | Target | Definition / scope | Instrumentation / source | Status |
|---|---|---|---|---|---|
| 1 | Install → first transaction | **< 60 s** | Median (or p90) time from successful app install to first logged transaction. | Analytics event `first_transaction` timestamp vs install timestamp; privacy-safe (no amounts/PII). | Draft |
| 2 | D1 retention | **> X%** (provisional) | Share of installs that complete ≥1 transaction on day 1. | Event `transaction_logged` cohorted by install day. | Draft |
| 3 | D7 retention | **> X%** (provisional) | Share of installs with ≥1 transaction on day 7. | Same cohorting. | Draft |
| 4 | Free → paid conversion | **Measured** | % of eligible free users who complete a paid purchase (KHQR test price during beta; Play Billing later). | Funnel: paywall view → purchase → entitlement; opt-in analytics only; no amounts/PII. | Draft |
| 5 | Crash-free sessions | **> 99%** | Sessions without crash. | Crash monitoring (Play vitals / privacy-safe error monitoring). | Draft |
| 6 | Play policy review passed first time | **Pass** | No policy rejections on first production submission. | Play Console review outcome. | Draft |
| 7 | Zero security / data-integrity regressions | **0** | No RLS bypass, no auth bypass, no entitlement write from client, no payment reconciliation regression. | Security regression tests (contract tests), gitleaks, migration assertions, RLS checks. | Draft |

## Instrumentation requirements (from mission)

- **Privacy-safe funnel:** track `activation`, `paywall_view`, `purchase` events with **opt-in analytics** only; never log amounts or PII.
- **Never block transaction logging behind Pro** (free users must be able to log transactions).
- **Value-based gates:** Pro gates (AI quick-add daily quota, budgets/goals count, export) — gated server-side/entitlement-side, never client-side amount decisions.

## Phase-gate linkage (updated 2026-11-27 per gating correction)

- Install → first transaction (<60 s): gated by **M1** (PWA readiness) and **M3** (paywall/billing); meaningful only with **G0 + G1**.
- D1 / D7 retention: measured during **M5** rollout/ops.
- Free → paid conversion: owned by **M3** (billing) — requires **G1**.
- Crash-free sessions (>99%): enforced at **M5** staged rollout (post-M2/M4).
- Play policy review passed first time: **M4** (after **M2** closed test).
- Zero security / data-integrity regressions: ongoing, tied to **G0** + contract tests.

## Review cadence

- Per phase end (M0–M5) and pre-launch.
- Monthly post-launch while in production.

## Approval

- Product owner approval required before these targets are treated as binding. (Pending.)
- Phase-gate corrections (M1→G0, M2→G0+G2, M3→G1) accepted from operator 2026-11-27; METRICS targets themselves await product approval.
