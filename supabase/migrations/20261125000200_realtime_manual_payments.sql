do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='manual_payments') then
    alter publication supabase_realtime add table public.manual_payments;
  end if;
end $$;
