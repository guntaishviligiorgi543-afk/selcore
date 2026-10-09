begin;
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Apply this migration as the postgres owner role';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'Supabase auth.users is required';
  end if;
  if to_regclass('public.profiles') is not null
     or exists (select 1 from pg_namespace where nspname = 'private') then
    raise exception 'Profiles/private schema already exists; inspect it instead of overwriting';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
             and tgname = 'selcore_create_profile') then
    raise exception 'selcore_create_profile already exists; inspect before applying';
  end if;
end;
$$;
create schema private authorization postgres;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create function private.selcore_profile_name(metadata jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(name) >= 2 then name else 'Customer' end
  from (
    select left(btrim(
      case when jsonb_typeof(metadata->'full_name') = 'string'
           then metadata->>'full_name' else '' end,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    ), 100) as name
  ) as normalized;
$$;
revoke all on function private.selcore_profile_name(jsonb) from public, anon, authenticated;
create function private.selcore_verified_customer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = (select auth.uid())
    and email_confirmed_at is not null and not is_anonymous);
$$;
revoke all on function private.selcore_verified_customer() from public, anon, authenticated;
grant execute on function private.selcore_verified_customer() to authenticated;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (
    char_length(full_name) <= 100 and char_length(btrim(full_name,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )) between 2 and 100
  ),
  avatar_url text check (avatar_url is null or
    (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://[^/[:space:]]+([/?#][^[:space:]]*)?$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id,full_name,avatar_url) on public.profiles to authenticated;
grant update (full_name,avatar_url) on public.profiles to authenticated;
create policy "Verified customers read their profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id and (select private.selcore_verified_customer()));
create policy "Verified customers create their profile" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id and (select private.selcore_verified_customer()));
create policy "Verified customers update their profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id and (select private.selcore_verified_customer()))
  with check ((select auth.uid()) = id and (select private.selcore_verified_customer()));
create function private.selcore_profile_timestamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.selcore_profile_timestamp() from public, anon, authenticated;
create trigger profiles_timestamp before update on public.profiles for each row
  execute function private.selcore_profile_timestamp();
create function private.selcore_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,full_name)
  values (new.id, private.selcore_profile_name(new.raw_user_meta_data))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.selcore_new_profile() from public, anon, authenticated;
create trigger selcore_create_profile after insert on auth.users for each row
  execute function private.selcore_new_profile();
insert into public.profiles (id,full_name,created_at)
select id,private.selcore_profile_name(raw_user_meta_data),coalesce(created_at,now())
from auth.users on conflict (id) do nothing;
commit;
