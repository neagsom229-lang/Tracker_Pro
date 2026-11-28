# Mobile Master Plan — Obsidian Finance (Google Play launch)

**Owner:** Principal mobile + product engineer
**Status:** Draft — gating confirmed 2026-11-27: G0 **not met**, G1 **not met**, G2 **pending**.

## Phase gate dependency map (corrected 2026-11-27)

| Phase | Deliverable | Required gates |
|---|---|---|
| M0 | Track decision (A: PWA+TWA / B: Capacitor / C: Flutter) | **G2** (user approval) — stop here |
| M1 | PWA / Web readiness | **G0** only |
| M2 | TWA packaging, Play account, closed test | **G0 + G2** |
| M3 | Billing and entitlements | **G1** |
| M4 | Store readiness | Follows M2 / M3 completion + approvals |
| M5 | Rollout and operations | Follows M4 approval |

## Phase summaries

- **M0 – Track decision:** Score Tracks A (PWA+TWA), B (Capacitor), C (Flutter) on time-to-market, cost, Play Billing feasibility, measured performance on real low-end phone, offline needs, Khmer rendering, native features, maintenance, risk. Default recommendation: Track A. Escalate only on MEASURED triggers.
- **M1 – PWA / Web readiness (needs G0):** Installable PWA work (icons, manifest, install prompt); Lighthouse Performance/Accessibility/Best-Practices/SEO >= 90 on mobile; offline shell + honest offline state; Khmer font loading + baseline checks; safe areas; back-button behavior; font scaling to 200%; 48 dp touch targets; remove duplicate fetches; paginate heavy lists; lazy-load charts; hosting CF Pages (free, commercial-use verified) vs Vercel Pro; port vercel.json; generalize check-vercel-env; Supabase Auth redirect URLs.
- **M2 – TWA packaging (needs G0 + G2):** Bubblewrap `/mobile/twa`; package id; targetSdk 36; Play App Signing (upload key in secrets); assetlinks; splash/status-bar/orientation/shortcuts; full-screen; CI AAB + size report; >=3 real phones incl. low-end; screenshot evidence; closed test (Play account type permitting).
- **M3 – Billing and entitlements (needs G1):** BILLING_DESIGN first; products monthly/yearly/lifetime; trial; price localization; Digital Goods API + Payment Request only inside TWA; Edge Function verifies tokens via Google Play Developer API; subscriptions source `'play'`; RTDN idempotency; restore flow; entitlement single source of truth; tests (forged/replayed tokens, duplicate RTDN, refund revoke, cross-user isolation, client can't write).
- **M4 – Store readiness:** Dev account type decision (personal vs org); privacy policy + terms URLs; data safety form; in-app AND web account deletion; financial-features declaration; content rating; en+km listing, screenshots, feature graphic; minimal permissions; "not financial advice"; support email; closed test (>=12 opted-in testers / 14 continuous days; recruitment >=20 expected with drop-out).
- **M5 – Rollout and operations:** Staged rollout 5% -> 20% -> 100% gated on crash-free >99% and no billing failures; Play vitals + privacy-safe error monitoring; RUNBOOK_MOBILE; cost guardrails; monthly Play policy review.

## Decision log

- 2026-11-27: Phase gate dependencies corrected per operator directive — M1 requires G0; M2 requires G0+G2; M3 requires G1; M0 requires G2; M4/M5 inherit downstream approvals.

## Next action

Hold at gates: **G0 not met**, **G1 not met**, **G2 pending**. Resume with M1 only when G0 is confirmed met.
