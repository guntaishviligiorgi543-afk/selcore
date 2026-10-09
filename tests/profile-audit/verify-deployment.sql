-- Read-only checks. Run as postgres in Selcore's SQL Editor after explicit deployment approval.
-- Never run the migration itself from this file; no customer data is returned.
select current_user, version(), to_regclass('public.profiles') as profiles;
select version, name from supabase_migrations.schema_migrations order by version;
select n.nspname, c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('profiles','categories','brands','products','product_images'))
   or (n.nspname='storage' and c.relname in ('buckets','objects'))
order by n.nspname,c.relname;
select conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.profiles'::regclass order by conname;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage')
order by schemaname,tablename,policyname;
select p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as customer_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' order by p.proname;
select tgname,tgrelid::regclass as relation,pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal
  and tgrelid in ('auth.users'::regclass,'public.profiles'::regclass);
select role_name,privilege,
       has_table_privilege(role_name,'public.profiles',privilege) as allowed
from (values ('anon'),('authenticated')) roles(role_name)
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) privileges(privilege);
select column_name,
       has_column_privilege('authenticated','public.profiles',column_name,'INSERT') as can_insert,
       has_column_privilege('authenticated','public.profiles',column_name,'UPDATE') as can_update
from information_schema.columns where table_schema='public' and table_name='profiles'
order by ordinal_position;
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users u left join public.profiles p on p.id=u.id where p.id is null) as missing_profiles,
  (select count(*) from public.profiles p left join auth.users u on u.id=p.id where u.id is null) as orphan_profiles,
  (select count(*) from public.categories) as categories,
  (select count(*) from public.brands) as brands,
  (select count(*) from public.products) as products,
  (select count(*) from public.product_images) as images;
select
  (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.products t) as products_fingerprint,
  (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.product_images t) as images_fingerprint,
  (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from storage.objects t) as storage_fingerprint;
