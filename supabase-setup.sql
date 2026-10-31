-- Private per-user data for the 온도 study app.
-- Run this once in the Supabase project's SQL Editor.

create table if not exists public.ondo_user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ondo_user_data enable row level security;
revoke all on table public.ondo_user_data from anon, authenticated;
grant select, insert, update on table public.ondo_user_data to authenticated;

drop policy if exists "ondo users read their own data" on public.ondo_user_data;
create policy "ondo users read their own data"
  on public.ondo_user_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ondo users create their own data" on public.ondo_user_data;
create policy "ondo users create their own data"
  on public.ondo_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ondo users update their own data" on public.ondo_user_data;
create policy "ondo users update their own data"
  on public.ondo_user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.set_ondo_user_data_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ondo_user_data_updated_at on public.ondo_user_data;
create trigger set_ondo_user_data_updated_at
  before update on public.ondo_user_data
  for each row execute function public.set_ondo_user_data_updated_at();

insert into storage.buckets (id, name, public, file_size_limit)
values ('ondo-attachments', 'ondo-attachments', false, 20971520)
on conflict (id) do update
  set public = false,
      file_size_limit = 20971520;

drop policy if exists "ondo users read their own attachments" on storage.objects;
create policy "ondo users read their own attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ondo-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "ondo users upload their own attachments" on storage.objects;
create policy "ondo users upload their own attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ondo-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "ondo users update their own attachments" on storage.objects;
create policy "ondo users update their own attachments"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ondo-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'ondo-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "ondo users delete their own attachments" on storage.objects;
create policy "ondo users delete their own attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ondo-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
