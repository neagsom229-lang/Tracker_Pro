# Operations Runbook

This runbook covers common operational procedures for Obsidian Finance (Tracker Pro). It describes procedures only; do not run remote-affecting commands without explicit approval and correct environment access.

## Where secrets live

| Secret / config | Location | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel Project > Settings > Environment Variables; local `.env` / `.env.local` (gitignored) | Public client values; still scope by environment. |
| `VITE_STRIPE_PAYMENT_LINK` | Vercel env vars | Production must not use test links unless explicitly approved via `ALLOW_TEST_STRIPE_ON_PRODUCTION=true`. |
| Supabase service role / DB password / JWT secrets | Supabase Dashboard > Project Settings > API / Database | Never store in repo, never ship to client, never paste into logs. |
| Supabase Edge Function secrets (e.g. `APP_URL`, Stripe secrets, provider secrets) | Supabase Dashboard > Edge Functions > Secrets, or `supabase secrets set` | Managed outside git. |
| GitHub Actions secrets | GitHub repo > Settings > Secrets and variables > Actions | CI uses throwaway/test values where possible; production secrets belong in deployment platforms. |
| Local dev secrets | `.env`, `.env.local`, `mobile/env.local.json` (future) | Gitignored. Use placeholder names in docs and examples. |

## Vercel rollback

Use when a production deploy causes regressions.

1. **Identify bad deployment**: Vercel Dashboard > Project > Deployments. Note the last known good deployment ID/commit.
2. **Confirm scope**: Verify whether issue is frontend-only, backend/Supabase-related, or data migration-related. Frontend rollback does not roll back Supabase migrations/data.
3. **Rollback in Vercel**: Open the last known good deployment > "..." > "Promote to Production" / "Redeploy" as rollback (Vercel UI label may vary). Confirm production alias points to the good deployment.
4. **Verify**: Check `/dashboard` load, auth, critical read/write flows, and browser console for errors. Run smoke checks against production URL if available.
5. **Communicate**: Record incident, impacted window, rollback target, and follow-up fix PR.
6. **Do not** delete deployment history. Keep evidence for postmortem.

## Supabase backup / restore

### Backup

- **Automatic backups**: Confirm Supabase plan includes PITR/automatic backups in Dashboard > Database > Backups.
- **Before risky changes**: Take/confirm a recent backup before applying migrations, manual data fixes, or auth/billing changes.
- **Manual export (when appropriate)**: Use Supabase Dashboard backup/download tools or `pg_dump` against a secure connection. Store dumps in approved secure storage, not in repo.

### Restore

1. **Stop the bleeding**: Disable affected feature paths if possible (feature flag, UI guard, rollback frontend). Avoid writes that worsen inconsistency.
2. **Assess restore type**: Point-in-time restore vs. targeted table restore. Prefer least destructive option.
3. **Restore in controlled window**: Use Supabase Dashboard restore/PITR flow for the project. Coordinate with maintainers; restoration may affect whole project.
4. **Post-restore validation**: Verify auth, RLS, critical tables (`profiles`, `transactions`, `budgets`, `recurring_rules`, `subscriptions`, `manual_payments`), and Edge Functions.
5. **Replay consideration**: Determine whether data created after backup point must be manually reconciled. Document any data loss window.
6. **Never restore into production blindly** during active incident without stating data-loss window and getting approval.

## Applying migrations

### Local / CI

```bash
# Local Supabase
supabase start
supabase db reset --yes

# Or project scripts where applicable
npm run db:reset
npm run db:reset:test
```

### Remote (approved only)

Do **not** touch remote Supabase without explicit approval.

```bash
# Link project (authenticated, approved environment only)
supabase link --project-ref <PROJECT_REF>

# Inspect migration status
supabase migration list

# Apply pending migrations to remote
supabase db push --dry-run
supabase db push
```

After remote apply: verify schema, RLS policies, functions/triggers, and run reconciliation/assert scripts as appropriate.

## Migration repair

Use when migration history is out of sync (e.g., migration applied manually, file renamed, or remote/local history mismatch). This is sensitive; get approval before remote repair.

```bash
# Inspect status first
supabase migration list

# Mark migration versions as applied/reverted to match actual remote state
# Example (verify exact version from migration list before running):
supabase migration repair --status applied <version>
supabase migration repair --status reverted <version>
```

Rules:
- Never guess version numbers. Copy from `supabase migration list` and `supabase/migrations/`.
- Prefer fixing forward with a new migration over editing history.
- Do not rename already-applied migration files.
- After repair, run `supabase migration list` again and confirm local/remote alignment.
- Record who ran repair, why, exact command, and before/after status.

## Key rotation

### Supabase anon key / project keys

1. Plan for client downtime/config update window.
2. Rotate in Supabase Dashboard per Supabase guidance.
3. Update Vercel env vars (`VITE_SUPABASE_*`) and any CI/test placeholders as needed.
4. Redeploy frontend.
5. Invalidate old sessions/tokens if required by incident type.
6. Verify login, data fetch, and RLS-protected operations.

### JWT / app secrets

- `JWT_SECRET` (local/self-hosted API mode): rotate by updating env, restarting API, and expecting session invalidation. Schedule during low traffic.
- Third-party keys (Stripe, etc.): rotate in provider dashboard, update Vercel/Supabase function secrets, redeploy/restart affected services, verify webhooks/endpoints.

### Rotation checklist

- [ ] Identify blast radius and dependent services.
- [ ] Rotate in provider.
- [ ] Update secret stores (Vercel/Supabase/GitHub/local).
- [ ] Redeploy/restart.
- [ ] Verify auth/billing/critical flows.
- [ ] Revoke old key after confirmation.
- [ ] Record rotation in incident/change log (no secret values).

## Incident steps

1. **Detect & triage**: Identify symptoms, affected users, start time, severity. Capture screenshots/logs with secrets redacted.
2. **Contain**: Stop further damage. Options include Vercel rollback, disabling feature, pausing risky operations, or putting admin/payment flows in maintenance mode.
3. **Preserve evidence**: Save deployment ID, commit SHA, migration version, error messages, request IDs, and timestamps.
4. **Assess data impact**: Determine if data is corrupted, delayed, duplicated, or exposed. Involve backup/restore decision early.
5. **Fix forward**: Prefer small, reviewed PR with tests. Avoid hotfixing remote DB by hand unless emergency and approved.
6. **Verify**: Run `npm run verify` locally/CI as applicable, plus targeted production smoke checks.
7. **Communicate**: Update stakeholders with status, ETA, user impact, and mitigation.
8. **Postmortem**: Document root cause, detection gap, corrective actions, and owners.

## Emergency contacts / ownership

Fill in before production launch:

- Product owner: _TBD_
- Engineering owner: _TBD_
- Supabase admin: _TBD_
- Vercel admin: _TBD_
- On-call/escalation channel: _TBD_
