-- Harden manual_payments against client-side tampering.
-- Existing guard_manual_payment_status only prevented self-approval/rejection.
-- This trigger additionally prevents non-service_role from changing protected
-- fields, limits edits to pending rows, and only allows pending -> submitted.

create or replace function public.guard_manual_payment_fields()
returns trigger as $$
begin
  if auth.role() = 'service_role' then
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
  if new.status not in ('pending', 'submitted') then
    new.status := old.status;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_manual_payment_status on public.manual_payments;
drop trigger if exists guard_manual_payment_fields on public.manual_payments;
create trigger guard_manual_payment_fields
  before update on public.manual_payments
  for each row execute function public.guard_manual_payment_fields();
