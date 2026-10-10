-- REVIEW DRAFT ONLY. Never run db push with the historical profiles draft.
-- OTP activation is OFF. Private Auth ingress + gateway verification are prerequisites.
begin;
do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('auth.sessions') is null
     or to_regprocedure('private.selcore_verified_customer()') is null then
    raise exception 'The already-deployed profiles migration and Auth sessions are required';
  end if;
  if exists(select 1 from pg_roles where rolname='selcore_otp_worker') then
    raise exception 'OTP role already exists; review rather than overwrite';
  end if;
end $$;
create role selcore_otp_worker nologin noinherit nobypassrls;
grant usage on schema private to selcore_otp_worker;
create table private.selcore_otp_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.selcore_otp_config values (true, false);
create table private.selcore_otp_logins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null
);
create table private.selcore_otp_approvals (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null,
  expires_at timestamptz not null
);
create table private.selcore_otp_challenges (
  id uuid primary key,
  binding text not null check (binding ~ '^[a-f0-9]{64}$'),
  scope text not null check (scope ~ '^[a-f0-9]{64}$'),
  purpose text not null check (purpose in ('registration','login','email_current','email_new','password','recovery')),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid references auth.sessions(id) on delete cascade,
  code_digest text not null check (code_digest ~ '^[a-f0-9]{64}$'),
  action_digest text not null,
  bridge_cipher text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '10 minutes',
  attempts smallint not null default 0 check (attempts between 0 and 5),
  ready boolean not null default true,
  verified_at timestamptz,
  consumed_at timestamptz,
  cancelled boolean not null default false
);
create index selcore_otp_scope_created on private.selcore_otp_challenges(scope,created_at desc);
create table private.selcore_otp_rates (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  started_at timestamptz not null,
  hits integer not null
);
create table private.selcore_gateway_sessions (
  binding text primary key check (binding ~ '^[a-f0-9]{64}$'),
  payload_cipher text not null,
  revision integer not null default 1,
  expires_at timestamptz not null
);
-- Configuration is owner-only; the worker cannot turn enforcement off.
revoke all on private.selcore_otp_config from public,anon,authenticated,service_role,selcore_otp_worker;
alter table private.selcore_otp_config enable row level security;
do $$ declare t text; begin
  foreach t in array array['selcore_otp_logins','selcore_otp_approvals','selcore_otp_challenges','selcore_otp_rates','selcore_gateway_sessions'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert,update,delete on private.%I to selcore_otp_worker',t);
    execute format('create policy worker_only on private.%I to selcore_otp_worker using (true) with check (true)',t);
  end loop;
end $$;

create function private.selcore_otp_live_session(u uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions a join auth.users b on b.id=a.user_id
  where a.id=s and a.user_id=u and b.email_confirmed_at is not null and not b.is_anonymous
   and (a.not_after is null or a.not_after>now()));
$$;
revoke all on function private.selcore_otp_live_session(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.selcore_otp_live_session(uuid,uuid) to selcore_otp_worker;

create function private.selcore_otp_rate(k text,max_hits integer,seconds integer) returns boolean
language plpgsql set search_path='' as $$
declare n integer;
begin
 if max_hits not between 1 and 100 or seconds not between 1 and 3600 then return false; end if;
 insert into private.selcore_otp_rates as r values(k,clock_timestamp(),1)
 on conflict(key) do update set
  hits=case when r.started_at+make_interval(secs=>seconds)<=clock_timestamp() then 1 else r.hits+1 end,
  started_at=case when r.started_at+make_interval(secs=>seconds)<=clock_timestamp() then clock_timestamp() else r.started_at end
 returning hits into n;
 return n<=max_hits;
end $$;

create function private.selcore_otp_issue(i uuid,b text,sc text,p text,u uuid,s uuid,d text,a text,c text,awaiting_native boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare latest timestamptz; n integer; expiry timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(sc,0));
 select max(created_at),count(*) filter(where created_at>clock_timestamp()-interval '1 hour') into latest,n
  from private.selcore_otp_challenges where scope=sc;
 if latest+interval '60 seconds'>clock_timestamp() then return jsonb_build_object('error','cooldown'); end if;
 if n>=5 then return jsonb_build_object('error','rate_limited'); end if;
 if p not in ('registration','recovery') and not private.selcore_otp_live_session(u,s) then
  return jsonb_build_object('error','session_required'); end if;
 update private.selcore_otp_challenges set cancelled=true where scope=sc and consumed_at is null;
 insert into private.selcore_otp_challenges(id,binding,scope,purpose,user_id,session_id,code_digest,action_digest,bridge_cipher,ready)
 values(i,b,sc,p,u,s,d,a,c,not awaiting_native) returning expires_at into expiry;
 return jsonb_build_object('id',i,'purpose',p,'expiresAt',expiry,'resendAt',clock_timestamp()+interval '60 seconds');
end $$;

-- Reserve cooldown/quota BEFORE generating native proofs. Concurrent requests
-- cannot regenerate a native token and invalidate the winning request's code.
create function private.selcore_otp_prepare(i uuid,b text,d text,c text) returns jsonb
language plpgsql set search_path='' as $$
begin
 update private.selcore_otp_challenges set code_digest=d,bridge_cipher=c,ready=true
  where id=i and binding=b and not ready and not cancelled
   and verified_at is null and consumed_at is null and expires_at>clock_timestamp();
 if not found then return jsonb_build_object('error','invalid'); end if;
 return '{}'::jsonb;
end $$;
create function private.selcore_otp_verify(i uuid,b text,d text) returns jsonb
language plpgsql set search_path='' as $$
declare r private.selcore_otp_challenges;
begin
 select * into r from private.selcore_otp_challenges where id=i and binding=b for update;
 if not found or r.cancelled or not r.ready then return jsonb_build_object('error','invalid'); end if;
 if r.verified_at is not null or r.consumed_at is not null then return jsonb_build_object('error','used'); end if;
 if r.expires_at<=clock_timestamp() then return jsonb_build_object('error','expired'); end if;
 if r.attempts>=5 then return jsonb_build_object('error','locked'); end if;
 if r.session_id is not null and not private.selcore_otp_live_session(r.user_id,r.session_id) then
  return jsonb_build_object('error','session_required'); end if;
 update private.selcore_otp_challenges set attempts=attempts+1 where id=i;
 if r.code_digest<>d then return jsonb_build_object('error',case when r.attempts=4 then 'locked' else 'incorrect' end); end if;
 update private.selcore_otp_challenges set verified_at=clock_timestamp() where id=i;
 return jsonb_build_object('id',r.id,'purpose',r.purpose);
end $$;

-- Claim BEFORE dispatch. Failures burn the grant; they cannot replay an Auth mutation.
create function private.selcore_otp_consume(i uuid,b text,p text,a text) returns jsonb
language plpgsql set search_path='' as $$
declare r private.selcore_otp_challenges;
begin
 select * into r from private.selcore_otp_challenges where id=i and binding=b for update;
 if not found or r.cancelled or r.purpose<>p or r.action_digest<>a then return jsonb_build_object('error','invalid'); end if;
 if r.consumed_at is not null then return jsonb_build_object('error','used'); end if;
 if r.verified_at is null or r.verified_at+interval '2 minutes'<=clock_timestamp() or r.expires_at<=clock_timestamp() then
  return jsonb_build_object('error','expired'); end if;
 if r.session_id is not null and not private.selcore_otp_live_session(r.user_id,r.session_id) then
  return jsonb_build_object('error','session_required'); end if;
 update private.selcore_otp_challenges set consumed_at=clock_timestamp() where id=i;
 return jsonb_build_object('bridgeCipher',r.bridge_cipher);
end $$;

-- A verified registration/email-change proof can approve its newly rotated session,
-- without updating the timestamp reserved for successful LOGIN OTP verification.
create function private.selcore_otp_approve(u uuid,s uuid,login_otp boolean,verified_non_login boolean) returns jsonb
language plpgsql set search_path='' as $$
declare verified timestamptz;
begin
 if not private.selcore_otp_live_session(u,s) then return jsonb_build_object('error','session_required'); end if;
 if login_otp then
  insert into private.selcore_otp_logins values(u,clock_timestamp()) on conflict(user_id)
   do update set verified_at=excluded.verified_at returning verified_at into verified;
 elsif verified_non_login then verified=clock_timestamp();
 else select verified_at into verified from private.selcore_otp_logins where user_id=u;
 end if;
 if verified is null or verified+interval '48 hours'<=clock_timestamp() then return jsonb_build_object('error','otp_required'); end if;
 insert into private.selcore_otp_approvals values(s,u,verified,verified+interval '48 hours')
 on conflict(session_id) do update set verified_at=excluded.verified_at,expires_at=excluded.expires_at;
 return jsonb_build_object('approved',true,'verifiedAt',verified,'expiresAt',verified+interval '48 hours');
end $$;
create function private.selcore_otp_status(u uuid,s uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('live',private.selcore_otp_live_session(u,s),'approved',private.selcore_otp_live_session(u,s) and exists(
  select 1 from private.selcore_otp_approvals where user_id=u and session_id=s and expires_at>now()),
  'recent',private.selcore_otp_live_session(u,s) and exists(
  select 1 from private.selcore_otp_approvals where user_id=u and session_id=s and verified_at>now()-interval '10 minutes'));
$$;
create function private.selcore_otp_session_save(b text,p text,e timestamptz,v integer) returns jsonb
language plpgsql set search_path='' as $$
declare rev integer;
begin
 if v=0 then
  insert into private.selcore_gateway_sessions(binding,payload_cipher,expires_at) values(b,p,e)
   on conflict do nothing returning revision into rev;
 else
  update private.selcore_gateway_sessions set payload_cipher=p,expires_at=e,revision=revision+1
   where binding=b and revision=v and expires_at>clock_timestamp() returning revision into rev;
 end if;
 if rev is null then return jsonb_build_object('error','conflict'); end if;
 return jsonb_build_object('revision',rev);
end;
$$;
create function private.selcore_otp_session_read(b text) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('cipher',payload_cipher,'revision',revision) from private.selcore_gateway_sessions where binding=b and expires_at>now();
$$;
create function private.selcore_otp_session_delete(b text) returns jsonb
language plpgsql set search_path='' as $$
begin
 update private.selcore_otp_challenges set cancelled=true where binding=b and consumed_at is null;
 delete from private.selcore_gateway_sessions where binding=b;
 return '{}'::jsonb;
end $$;
create function private.selcore_otp_cancel(i uuid,b text) returns jsonb
language sql set search_path='' as $$
 update private.selcore_otp_challenges set cancelled=true where id=i and binding=b returning '{}'::jsonb;
$$;
-- Every new function is private, has an empty search path, and denies customers.
create function private.selcore_otp_revoke(s uuid) returns jsonb
language plpgsql set search_path='' as $$
begin
 update private.selcore_otp_approvals set expires_at=clock_timestamp() where session_id=s;
 update private.selcore_otp_challenges set cancelled=true where session_id=s and consumed_at is null;
 return '{}'::jsonb;
end $$;
create function private.selcore_otp_revoke_user(u uuid) returns jsonb
language plpgsql set search_path='' as $$
begin
 update private.selcore_otp_approvals set expires_at=clock_timestamp() where user_id=u;
 update private.selcore_otp_challenges set cancelled=true where user_id=u and consumed_at is null;
 return '{}'::jsonb;
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname like 'selcore_otp_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name);
  execute format('grant execute on function %s to selcore_otp_worker',f.name);
 end loop;
end $$;
create function private.selcore_otp_authorized() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sid text; uid uuid;
begin
 if not (select enabled from private.selcore_otp_config where singleton) then return true; end if;
 uid := (select auth.uid()); sid := (select auth.jwt()->>'session_id');
 if uid is null or sid is null or sid !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
 return private.selcore_otp_live_session(uid,sid::uuid) and exists(
  select 1 from private.selcore_otp_approvals where user_id=uid and session_id=sid::uuid and expires_at>now());
end $$;
revoke all on function private.selcore_otp_authorized() from public,anon,authenticated,service_role,selcore_otp_worker;
grant execute on function private.selcore_otp_authorized() to authenticated;
create policy "OTP approval required for profiles" on public.profiles as restrictive for all to authenticated
 using ((select private.selcore_otp_authorized())) with check ((select private.selcore_otp_authorized()));
commit;
