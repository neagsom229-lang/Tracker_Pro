-- Harden manual_payments against client-side tampering.
-- - Trusted server/SQL operators (service_role, postgres, supabase_admin) may update.
-- - Regular users may only move pending -> submitted, and only while pending.
-- - Protected fields are reverted for regular users.
-- - submitted_at is set server-side on pending -> submitted.

create or replace function public.guard_manual_payment_fields()
returns trigger as $$
begin
  -- Trusted server/SQL operator contexts. SQL editor runs as postgres/supabase_admin
  -- without an authenticated end-user JWT role.
  if auth.role() = 'service_role'
     or (session_user in ('postgres', 'supabase_admin') and auth.role() is distinct from 'authenticated') then
    return new;
  end if;

  -- Only the owner can edit their own row, and only while it is still pending.
  if old.status is distinct from 'pending' then
    new.status := old.status;
    new.amount := old.amount;
    new.currency := old.currency;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.khqr_md5 := old.khqr_md5;
    new.user_id := old.user_id;
    new.claimed_transaction_ref := old.claimed_transaction_ref;
    new.screenshot_path := old.screenshot_path;
    new.submitted_at := old.submitted_at;
    return new;
  end if;

  -- Protected fields: revert any client-side change.
  new.amount := old.amount;
  new.currency := old.currency;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.khqr_md5 := old.khqr_md5;
  new.user_id := old.user_id;

  -- Only pending -> submitted is allowed from the client.
  if new.status = 'submitted' then
    new.submitted_at := now();
  elsif new.status <> 'pending' then
    new.status := old.status;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_manual_payment_status on public.manual_payments;
drop trigger if exists guard_manual_payment_fields on public.manual_payments;
drop function if exists public.guard_manual_payment_status();
create trigger guard_manual_payment_fields
  before update on public.manual_payments
  for each row execute function public.guard_manual_payment_fields();
