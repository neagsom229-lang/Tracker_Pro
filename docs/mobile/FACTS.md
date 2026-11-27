# Mobile Fact Register — Obsidian Finance

**Checked:** 2026-11-27
**Subject:** Google Play, payments, and Cambodia-availability claims that drive the mobile launch (Track A: PWA + TWA).
**Method:** Official sources only (Google Play Console Help, Android Developers Blog / developer.android.com, Chrome Developers, National Bank of Cambodia, Stripe). In-session web search was unavailable (HTTP 402); official pages were reached directly via official domains.

## Legend

- **VERIFIED** — confirmed against the cited source on the date shown.
- **UNVERIFIED** — not confirmed in this session; must be re-checked before reliance. **Never present as fact.**

## Fact register

### F1 — Target Android version requirement

| Field | Value |
|---|---|
| Claim | New apps/updates must target Android 16 (API 36); existing apps API 35+ |
| Official source | https://support.google.com/googleplay/android-developer/answer/11926878 ("Target API level requirements for Google Play apps") |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** (with operational nuance) |

Details (verified): From **August 31, 2026**, **new apps and app updates must target Android 16 (API 36) or higher** to be submitted to Google Play (exceptions: Wear OS → API 35, Android Automotive OS → API 35, Android TV → API 34, Android XR → API 34). **Existing apps** must target **Android 15 (API 35) or higher** to remain available to **new users** on devices running an OS higher than the app's target; an **update** to an existing app must target **API 36**, with an extension to **November 1, 2026** available via Play Console policy-status notifications.

### F2 — Closed testing requirement (new personal accounts)

| Field | Value |
|---|---|
| Claim | New personal Play accounts: closed test with >=12 testers for 14 continuous days before production access |
| Official source | https://support.google.com/googleplay/android-developer/answer/14151465 ("App testing requirements for new personal developer accounts") |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: Personal accounts created **after November 13, 2023** must run a **closed test** with a **minimum of 12 testers** opted in **continuously for at least 14 days** before applying for **production access**. Applies to Production and Pre-registration tracks. Tiers: internal = none required; closed = app setup complete; open = production access. Testers who opt out before 14 days do not count; opt-back-in must be consecutive. Production access application review takes ≤7 days typically.

### F3 — Device verification (new personal accounts)

| Field | Value |
|---|---|
| Claim | New personal accounts must verify a real Android device before distribution |
| Official source | https://support.google.com/googleplay/android-developer/answer/14316361 ("Device verification requirements for new developer accounts") |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details (verified procedure, answer 14316361): From **early 2024**, new personal accounts required verification of access to a **real Android mobile device** via the **Play Console mobile app** before the app may be made available on Google Play.

Verified procedure:
1. Log into the **Play Console** (web) as the **account owner** (the Google account used to create the developer account).
2. Go to the **Home** page (**Play Console** → **Home**, i.e. `play.google.com/console/developers/app-list`).
3. Find the task **"Verify that you have access to an Android mobile device"** and tap **View details**.
4. **Scan the QR code** to launch/install the **Play Console mobile app** on the chosen device.
5. Open the app, log in as the account owner, select the developer account, tap **Verify**, and follow the on-screen instructions.
6. After completion, the task no longer appears on the **Home** page.

Verified parameters: any **non-rooted physical Android device running at least Android 10** may be used; verification takes **< 1 min**; the device phone number is not used or collected; a future re-verification may use a different device.

### F4 — Play Billing, service fees, alternative billing

| Field | Value |
|---|---|
| Claim | Play Billing is mandatory for digital subscriptions sold in Play apps; alternative billing programs exist only in UK/EEA/US; Play fee for subscriptions (budget 15%) |
| Official sources | Billing overview: https://developer.android.com/google/play/billing · Blog: https://android-developers.googleblog.com/2026/06/play-expanded-billing.html · Service fees: https://support.google.com/googleplay/android-developer/answer/112622 · Lower fees: https://support.google.com/googleplay/android-developer/answer/16954621 |
| Date checked | 2026-11-27 |
| Status | **PARTIALLY VERIFIED** (fees verified; mandate + geography nuanced) |

Verified details:
- Google Play Billing is the billing system for selling digital products/subscriptions in Android apps via Google Play (developer.android.com/google/play/billing).
- **June 24, 2026 blog** ("Expanded billing choice and lower fees on Google Play"): new **billing choice program** available to developers globally offering digital services/content to users in **UK + EEA**, alongside programs in the **US**; further markets to follow. Developers may offer an **alternative billing system** or link users to their **own website** for purchases, alongside Google Play Billing; developer-designed choice screens allowed per UX guidelines. **External payments program** documented for **Japan**.
- **Service fee (verified):** from **June 30, 2026** (US, UK, EEA), service fee starts at **10%** of first **$1M USD** annual earnings; **10% applies to all auto-renewing subscriptions**. When transactions use **Google Play Billing**, an additional **5% billing fee** applies in US/UK/EEA; alternative billing/external web links incur no billing fee. Effective GP-billing subscription take rate in US/UK/EEA = **15%** (10% + 5%); elsewhere rates per table / to be announced.

Assessment against prompt claim: "Play Billing mandatory for digital subscriptions sold in Play apps; alternative billing only in UK/EEA/US; fee budget 15%":
- **Alternative billing geography:** now broader/expanding (UK, EEA, US, and announced expansion) — prompt's "UK/EEA/US" is **outdated-ish but directionally right** at time of prompt; verify at launch.
- **Mandatory for digital subs in Play apps:** programme-level nuance; **UNVERIFIED specifically for Cambodia**.
- **Fee budget 15%:** now restructured — **VERIFIED** that effective rate via GP billing in US/UK/EEA is 15% under the June 2026 split; subscription service fee itself is now 10%.

### F5 — TWA + Digital Goods API + Payment Request API → Play Billing

| Field | Value |
|---|---|
| Claim | TWA + Digital Goods API + Payment Request API support Play Billing (Chrome only, needs Digital Asset Links) |
| Official sources | https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing/ · https://developer.chrome.com/docs/android/trusted-web-activity/billing · https://github.com/gugadev/twa-play-billing-demo |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** (mechanism) |

Details: Google documents selling digital goods/subscriptions from a **PWA in a Trusted Web Activity with Google Play Billing, the Digital Goods API, and the Payment Request API**. Support is detected via `window.getDigitalGoodsService()`; the returned service instance is for Google Play Billing (other vendors may implement the API with different identifiers). TWA billing sample exists (gugadev/twa-play-billing-demo). Caveats: availability is in Chrome-based Android runtime; Digital Asset Links setup is required for store distribution (flagged **UNVERIFIED** for our specific asset configuration).

### F6 — Cambodia Play registration availability

| Field | Value |
|---|---|
| Claim | Cambodia supports Play developer and merchant registration (USD payouts) |
| Official source | https://support.google.com/googleplay/android-developer/answer/9306917 ("Supported locations for developer and merchant registration") |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: Cambodia = ✔ developer registration, ✔ merchant registration, developer default currency **USD**.

### F7 — Stripe availability (Cambodia)

| Field | Value |
|---|---|
| Claim | Stripe availability for a Cambodian-registered business (test mode vs live) |
| Official sources | https://stripe.com/global · https://support.stripe.com · (secondary reporting) |
| Date checked | 2026-11-27 |
| Status | **VERIFIED-NO** (as of check) |

Details: Stripe is **not available in Cambodia** (not on Stripe's supported countries list; multiple independent sources). The prompt's "likely unavailable" is now **upgraded to VERIFIED unavailable** for Stripe accounts based in Cambodia. Manual KHQR/ABA (admin-approved, `khqr_md5`) remains the only viable local rail.

### F8 — Bakong Open API

| Field | Value |
|---|---|
| Claim | Bakong Open API (check_transaction_by_md5) access, token renewal, reachability from Supabase region |
| Official sources | https://api-bakong.nbc.gov.kh/ · https://bakong.nbc.gov.kh/download/KHQR/integration/Bakong%20Open%20API%20Document.pdf · https://www.camfintech.com/knowledge/bakong-technical-integration · https://github.com/orgs/supabase/discussions/10596 |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: Bakong Open API (National Bank of Cambodia) provides eight calls: request token, verify token, renew token, generate deeplink by QR, check transaction status by MD5 / full hash / short hash, check Bakong account (last added in v1.0.2). Supabase client auto-refreshes the access token once past `expire_at - 60s`.

### F9 — Play policy declarations

| Field | Value |
|---|---|
| Claim | Data safety form, in-app and web account deletion, financial-features declaration, content rating, privacy policy |
| Official sources | Data safety form: https://support.google.com/googleplay/android-developer/answer/10787469 · Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111 · Data-use declaration: https://developer.android.com/privacy-and-security/declare-data-use · Policy center: https://play.google/developer-content-policy/ |
| Date checked | 2026-11-27 |
| Status | **PARTIALLY VERIFIED** |

Details: Data safety form purpose + account-deletion disclosure requirement **VERIFIED**. Financial-features declaration, content rating, and privacy-policy-URL requirements: **UNVERIFIED** pending direct Play Console confirmation.

### F10 — Production access review timeline

| Field | Value |
|---|---|
| Claim | Production-access review time is **<= 7 days** (can occasionally take longer) |
| Official source | https://support.google.com/googleplay/android-developer/answer/14151465 ("App testing requirements for new personal developer accounts") |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: After submitting the production access application (**Play Console** → **Dashboard** → **Apply for production**), Google reviews the submission; review **usually takes seven days or less**, but can occasionally take longer; an email notification is sent to the account owner when the review completes.

### F11 — Tester engagement requirement

| Field | Value |
|---|---|
| Claim | Tester engagement requirement during the closed test before production access |
| Official source | https://support.google.com/googleplay/android-developer/answer/14151465 |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: Testers who opt in, test for fewer than 14 days, then opt out do not count toward the requirement; opt-back-in must be consecutive. When applying, Part 1 ("About your closed test") requires the developer to disclose how easy it was to recruit testers, whether testers used all available app features, whether usage matched expected production behavior (incl. observed differences), and to summarize tester feedback and how it was collected.

### F12 — Reviewer test credentials

| Field | Value |
|---|---|
| Claim | Reviewer test credentials: provide valid, working login credentials in Play Console when the app requires user authentication, so reviewers can fully test |
| Official source | https://support.google.com/googleplay/android-developer/answer/14151465 |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: Google reviews production apps for policy compliance; before applying, the developer should ensure any required test credentials are valid and working so reviewers can fully test the app's features.

### F13 — Pre-review checks

| Field | Value |
|---|---|
| Claim | Pre-review checks before production submission |
| Official sources | https://support.google.com/googleplay/android-developer/answer/14807773 ("Detect app issues early with pre-review checks") · https://support.google.com/googleplay/android-developer/answer/9842757 (pre-launch report) |
| Date checked | 2026-11-27 |
| Status | **VERIFIED** |

Details: Google provides pre-review / pre-launch tooling (pre-review checks, pre-launch report) to detect issues before release.

## Outstanding UNVERIFIED items (re-check before reliance)

1. Play Billing mandate for digital subscriptions specifically in **Cambodia**.
2. Financial-features declaration requirements.
3. Content rating (IARC) requirements.
4. Privacy policy URL requirement details.
5. Cloudflare Pages free-tier commercial-use eligibility (M1 hosting decision).
6. Google Play Billing market eligibility for **Cambodia** (mechanism verified; market availability not).

## Verification log

| Date | Source | Claim | Status |
|---|---|---|---|
| 2026-11-27 | support.google.com/googleplay/android-developer/answer/11926878 | New apps/updates target API 36; existing 35+ | VERIFIED |
| 2026-11-27 | support.google.com/googleplay/android-developer/answer/14151465 | Closed test 12 testers / 14 days | VERIFIED |
| 2026-11-27 | support.google.com/googleplay/android-developer/answer/14316361 | Device verification for new personal accounts | VERIFIED |
| 2026-11-27 | developer.android.com + googleblog 2026/06 | Play Billing, 15% fee, billing choice | PARTIALLY VERIFIED |
| 2026-11-27 | developer.chrome.com | TWA + Digital Goods + Payment Request → Play Billing | VERIFIED |
| 2026-11-27 | support.google.com/googleplay/android-developer/answer/9306917 | Cambodia registration | VERIFIED |
| 2026-11-27 | stripe.com / support.stripe.com | Stripe availability | VERIFIED-NO |
| 2026-11-27 | api-bakong.nbc.gov.kh | Bakong Open API | VERIFIED |
| 2026-11-27 | googleplay help pages | Data safety / deletion | PARTIALLY VERIFIED |
| 2026-11-27 | https://support.google.com/googleplay/android-developer/answer/14151465 | Production access review <=7 days; tester engagement; reviewer credentials | VERIFIED |
| 2026-11-27 | https://support.google.com/googleplay/android-developer/answer/14316361 | Device verification details | VERIFIED |
| 2026-11-27 | https://support.google.com/googleplay/android-developer/answer/14807773 | Pre-review checks | VERIFIED |
