-- Add 'expired' status for stale pending manual payments.
-- Expired rows are set by service role only; regular users cannot set expired.

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.manual_payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.manual_payments drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.manual_payments
  add constraint manual_payments_status_check
  check (status in ('pending', 'submitted', 'approved', 'rejected', 'expired'));

-- Guard remains service-role/SQL-editor bypassed; regular users still cannot
-- set expired/review fields. Recreate to keep function definition current.
create or replace function public.guard_manual_payment_fields()
returns trigger as $$
begin
  if auth.role() = 'service_role'
     or (session_user in ('postgres', 'supabase_admin') and auth.role() is distinct from 'authenticated') then
    return new;
  end if;

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

  new.amount := old.amount;
  new.currency := old.currency;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.khqr_md5 := old.khqr_md5;
  new.user_id := old.user_id;

  if new.status = 'submitted' then
    new.submitted_at := now();
  elsif new.status <> 'pending' then
    new.status := old.status;
  end if;

  return new;
end;
$$ language plpgsql security definer;
