-- ARC Supabase schema. Review before running on an existing production project.
create extension if not exists pgcrypto;

create table if not exists public.arc_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'pending' check (role in ('admin','organizer','pending')),
  created_at timestamptz not null default now()
);

create or replace function public.arc_new_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.arc_profiles(user_id,email,role)
  values(new.id, coalesce(new.email,''), 'pending')
  on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists arc_auth_user_created on auth.users;
create trigger arc_auth_user_created after insert on auth.users
for each row execute function public.arc_new_profile();

create table if not exists public.arc_registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  phone text not null unique check (phone ~ '^[0-9]{10,15}$'),
  age integer not null check (age between 5 and 100),
  gender text not null check (gender in ('Male','Female','Other')),
  category text not null default '5K Run',
  area text not null default 'Aligarh',
  registered_at timestamptz not null default now()
);

create table if not exists public.arc_gallery (
  id uuid primary key default gen_random_uuid(),
  image_path text not null unique,
  caption text not null default '',
  edition text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.arc_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.arc_settings(setting_key,setting_value) values
('edition','{"editionNum":"5","editionTag":"#Week5","reportingTime":"5:30 AM","startTime":"5:50 AM","venueName":"Habitat Centre","venueSub":"Aligarh","routeDesc":"5 KM Run"}'::jsonb)
on conflict(setting_key) do nothing;

create or replace function public.arc_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.arc_profiles p where p.user_id=(select auth.uid()) and p.role='admin');
$$;
create or replace function public.arc_is_organizer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.arc_profiles p where p.user_id=(select auth.uid()) and p.role in ('admin','organizer'));
$$;
create or replace function public.arc_public_stats()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('total',count(*),'male',count(*) filter(where gender='Male'),
    'female',count(*) filter(where gender='Female'),'other',count(*) filter(where gender='Other'))
  from public.arc_registrations;
$$;

alter table public.arc_profiles enable row level security;
alter table public.arc_registrations enable row level security;
alter table public.arc_gallery enable row level security;
alter table public.arc_settings enable row level security;

drop policy if exists "profile self or admin read" on public.arc_profiles;
create policy "profile self or admin read" on public.arc_profiles for select to authenticated
using (user_id=(select auth.uid()) or public.arc_is_admin());
drop policy if exists "admin manage profile roles" on public.arc_profiles;
create policy "admin manage profile roles" on public.arc_profiles for update to authenticated
using (public.arc_is_admin()) with check (public.arc_is_admin());

drop policy if exists "public registration insert" on public.arc_registrations;
create policy "public registration insert" on public.arc_registrations for insert to anon,authenticated with check (true);
drop policy if exists "organizer read registrations" on public.arc_registrations;
create policy "organizer read registrations" on public.arc_registrations for select to authenticated using (public.arc_is_organizer());
drop policy if exists "organizer update registrations" on public.arc_registrations;
create policy "organizer update registrations" on public.arc_registrations for update to authenticated using (public.arc_is_organizer()) with check (public.arc_is_organizer());
drop policy if exists "admin delete registrations" on public.arc_registrations;
create policy "admin delete registrations" on public.arc_registrations for delete to authenticated using (public.arc_is_admin());

drop policy if exists "public gallery read" on public.arc_gallery;
create policy "public gallery read" on public.arc_gallery for select to anon,authenticated using (true);
drop policy if exists "organizer gallery insert" on public.arc_gallery;
create policy "organizer gallery insert" on public.arc_gallery for insert to authenticated with check (public.arc_is_organizer());
drop policy if exists "organizer gallery delete" on public.arc_gallery;
create policy "organizer gallery delete" on public.arc_gallery for delete to authenticated using (public.arc_is_organizer());

drop policy if exists "public settings read" on public.arc_settings;
create policy "public settings read" on public.arc_settings for select to anon,authenticated using (true);
drop policy if exists "organizer settings update" on public.arc_settings;
create policy "organizer settings update" on public.arc_settings for update to authenticated using (public.arc_is_organizer()) with check (public.arc_is_organizer());

-- Gallery bucket is public for viewing; writes remain organizer-only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('arc-gallery','arc-gallery',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "ARC gallery public view" on storage.objects;
create policy "ARC gallery public view" on storage.objects for select to anon,authenticated using(bucket_id='arc-gallery');
drop policy if exists "ARC gallery organizer upload" on storage.objects;
create policy "ARC gallery organizer upload" on storage.objects for insert to authenticated with check(bucket_id='arc-gallery' and public.arc_is_organizer());
drop policy if exists "ARC gallery organizer delete" on storage.objects;
create policy "ARC gallery organizer delete" on storage.objects for delete to authenticated using(bucket_id='arc-gallery' and public.arc_is_organizer());

grant usage on schema public to anon,authenticated;
grant select,insert on public.arc_registrations to anon,authenticated;
grant select,update,delete on public.arc_registrations to authenticated;
grant select on public.arc_gallery,public.arc_settings to anon,authenticated;
grant insert,delete on public.arc_gallery to authenticated;
grant update on public.arc_settings to authenticated;
grant select,update on public.arc_profiles to authenticated;
grant execute on function public.arc_public_stats() to anon,authenticated;
grant execute on function public.arc_is_admin() to authenticated;
grant execute on function public.arc_is_organizer() to authenticated;

-- IMPORTANT: create/sign up your own account first. Verify its email, then run this
-- separately with that exact email to make the first administrator:
-- update public.arc_profiles set role='admin' where lower(email)=lower('YOUR_VERIFIED_EMAIL');
-- Never expose a service_role/secret key in browser code. Public registration also needs
-- CAPTCHA/rate limiting before production to reduce automated spam.
