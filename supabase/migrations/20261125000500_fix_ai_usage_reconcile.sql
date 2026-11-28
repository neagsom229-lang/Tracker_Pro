-- =====================================================================
-- Obsidian Finance — Migration 20261125000500
-- Defensive follow-up to 20261125000400 for environments that already
-- applied that file before its ai_usage fixes were made. Idempotent and a
-- no-op on a fresh DB built from the (now-corrected) migration chain.
-- =====================================================================

-- Merge any duplicate (user_id, usage_date) rows left by the old table,
-- then enforce uniqueness so increment_ai_usage's ON CONFLICT works.
do $$
declare
  has_duplicates boolean;
begin
  if to_regclass('public.ai_usage') is null then
    return;
  end if;

  select exists (
    select 1 from public.ai_usage
    group by user_id, usage_date
    having count(*) > 1
  ) into has_duplicates;

  if has_duplicates then
    create temp table ai_usage_merge on commit drop as
      select user_id, usage_date,
             sum(count)::integer as total_count,
             min(ctid) as keep_ctid
      from public.ai_usage
      group by user_id, usage_date
      having count(*) > 1;

    -- Delete duplicates BEFORE the UPDATE: updating changes the survivor's
    -- ctid, so the precomputed keep_ctid must be used first.
    delete from public.ai_usage a
     using ai_usage_merge m
     where a.user_id = m.user_id
       and a.usage_date = m.usage_date
       and a.ctid <> m.keep_ctid;

    update public.ai_usage a
       set count = m.total_count
      from ai_usage_merge m
     where a.user_id = m.user_id
       and a.usage_date = m.usage_date
       and a.ctid = m.keep_ctid;

    drop table ai_usage_merge;
  end if;
end $$;

do $$
begin
  if to_regclass('public.ai_usage') is not null then
    execute 'create unique index if not exists ai_usage_user_date_key on public.ai_usage (user_id, usage_date)';
    execute 'drop policy if exists ai_usage_select_own on public.ai_usage';
  end if;
end $$;
