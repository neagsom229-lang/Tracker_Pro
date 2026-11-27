# Release Checklist

Use this checklist before promoting a release to production. Mark items as complete only with evidence (CI run, command output, screenshot, or ticket link).

## 1. Release scope

- [ ] Release commit SHA identified: `________`
- [ ] PR merged to target branch and CI green.
- [ ] Release notes / changelog summary prepared.
- [ ] Database migrations reviewed (idempotent, rollback/repair plan noted).
- [ ] No remote Supabase changes planned without explicit approval.

## 2. Quality gates

- [ ] `npm run verify` passes on the final release commit.
- [ ] CI workflow green on GitHub Actions (verify, supabase-migrations, secret-scan).
- [ ] `npm audit --omit=dev` reviewed; critical findings triaged.
- [ ] Gitleaks/secret scan clean.
- [ ] Manual smoke test on preview/staging:
  - [ ] Auth sign-in/sign-up/logout
  - [ ] Add/edit/delete transaction
  - [ ] Dashboard totals/charts render
  - [ ] Budget/recurring/pro flows as applicable
  - [ ] Billing page renders correct state
  - [ ] Admin panel inaccessible to non-admin; accessible to admin

## 3. Environment & secrets

- [ ] Vercel env vars confirmed for target environment (names only in docs/tickets).
- [ ] `VITE_DATA_BACKEND` is **not** set on hosted production.
- [ ] Supabase Site URL / Redirect URLs match deployment.
- [ ] Edge Function secrets present and current (no values in git).
- [ ] Stripe/payment configuration confirmed for intended mode (test vs production).

## 4. Database / Supabase

- [ ] Backup/PITR status confirmed before applying migrations.
- [ ] Migration apply plan documented (`supabase db push --dry-run` reviewed).
- [ ] Migration repair plan documented if history drift is possible.
- [ ] RLS/policy checks pass (`scripts/assert-supabase-migrations.mjs`, reconciliation assertions as applicable).
- [ ] Post-migration smoke query/check completed.

## 5. Deploy

- [ ] Deploy preview build and verify.
- [ ] Promote approved deployment to production.
- [ ] Record deployment ID, timestamp, and commit SHA.

## 6. Post-deploy verification

- [ ] Production smoke: home/auth/dashboard/transactions.
- [ ] Production smoke: billing/manual payment status.
- [ ] Production smoke: admin access control (non-admin denied).
- [ ] No critical console/server errors.
- [ ] Error monitoring/crash logs checked (if configured).

## 7. Rollback readiness

- [ ] Last known good deployment identified.
- [ ] Vercel rollback owner assigned.
- [ ] Supabase restore/repair owner assigned.
- [ ] Incident channel/contact path confirmed.

## 8. Sign-off

- [ ] Engineering sign-off: `________`
- [ ] Product/QA sign-off: `________`
- [ ] Release decision: GO / NO-GO
- [ ] Notes / remaining risks: `________`
