-- Watchman Forecasting — sign-in and security (ported from LIFESuite)
--
--   * Only a signed-in person linked to an ACTIVE member record, who has
--     completed two-step sign-in (AAL2: password + authenticator code) — or
--     is on a trusted device — can read or change anything.
--   * Someone not signed in (anon) gets nothing: no tables, no functions.
--   * "Trust this device": after a good code the browser keeps a random token
--     in a private httpOnly cookie; only its SHA-256 fingerprint is kept here.
--     Trust ends when the days run out, the password changes, or two-step is
--     reset (the authenticator it was trusted with is gone).
--   * Every policy goes through my_tenant() / my_role(), so this one change
--     locks every table.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- per-tenant security settings
create table security_settings (
  tenant_id                 uuid primary key references tenant on delete cascade,
  two_step_required         boolean not null default true,
  trusted_device_days       int not null default 30 check (trusted_device_days between 0 and 90),
  idle_timeout_minutes      int not null default 30 check (idle_timeout_minutes between 5 and 240),
  sign_out_on_browser_close boolean not null default true,
  updated_at                timestamptz not null default now()
);
alter table security_settings enable row level security;

alter table member add column if not exists two_factor_method text;
alter table member add column if not exists last_activity_at timestamptz;

-- ---------------------------------------------------------------- trusted devices
create table trusted_device (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references member on delete cascade,
  auth_user_id   uuid not null references auth.users on delete cascade,
  token_hash     text not null unique,
  factor_id      uuid,
  password_check text,
  device_name    text,
  trusted_until  timestamptz not null,
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);
create table trusted_session (
  session_id   uuid primary key,
  auth_user_id uuid not null,
  device_id    uuid not null references trusted_device on delete cascade,
  expires_at   timestamptz not null
);
alter table trusted_device  enable row level security;
alter table trusted_session enable row level security;
revoke all on trusted_device, trusted_session from anon, authenticated;

create or replace function private.password_check(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(coalesce(u.encrypted_password, ''), 'sha256'), 'hex')
    from auth.users u where u.id = p_uid
$$;
revoke all on function private.password_check(uuid) from public, anon, authenticated;

-- the member row for this sign-in (active), ignoring two-step
create or replace function private.signed_in_member()
returns member language sql stable security definer set search_path = public as $$
  select * from member where user_id = auth.uid() and is_active limit 1
$$;
revoke all on function private.signed_in_member() from public, anon, authenticated;

-- Has THIS sign-in session done two-step (or doesn't need to)?
create or replace function two_step_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not coalesce((select s.two_step_required from security_settings s
                        where s.tenant_id = (private.signed_in_member()).tenant_id), true)
      or exists (select 1 from trusted_session t
                  where t.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
                    and t.auth_user_id = auth.uid() and t.expires_at > now())
$$;

-- every policy uses these: active member AND two-step done
create or replace function my_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select case when two_step_ok() then (private.signed_in_member()).tenant_id end
$$;
create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when two_step_ok() then (private.signed_in_member()).role end
$$;
create or replace function my_member() returns member
language sql stable security definer set search_path = public as $$
  select m.* from member m where two_step_ok() and m.user_id = auth.uid() and m.is_active limit 1
$$;

-- Right after the password (or an invite link): link the account to its
-- member record by email, and say whether they may continue.
create or replace function claim_member()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v member;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'message', 'You are not signed in.'); end if;
  select * into v from member where user_id = v_uid limit 1;
  if not found and v_email <> '' then
    update member set user_id = v_uid where lower(email) = v_email and user_id is null
      returning * into v;
  end if;
  if v.id is null then
    return jsonb_build_object('ok', false, 'message',
      format('There''s no Watchman account for %s. Ask your administrator to add you.', v_email));
  end if;
  if not v.is_active then
    return jsonb_build_object('ok', false, 'message',
      'Your Watchman access has been turned off. Ask your administrator if you think this is a mistake.');
  end if;
  update member set last_activity_at = now() where id = v.id;
  return jsonb_build_object('ok', true, 'message', null);
end $$;

-- Before the two-step screen: the rules for this person's company.
create or replace function sign_in_options()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'two_step_required', coalesce(s.two_step_required, true),
    'trusted_device_days', coalesce(s.trusted_device_days, 30),
    'idle_timeout_minutes', coalesce(s.idle_timeout_minutes, 30),
    'sign_out_on_browser_close', coalesce(s.sign_out_on_browser_close, true))
  from (select 1) x
  left join security_settings s on s.tenant_id = (private.signed_in_member()).tenant_id
$$;

create or replace function note_two_factor(p_method text)
returns void language sql security definer set search_path = public as $$
  update member set two_factor_method = p_method
   where user_id = auth.uid() and p_method in ('authenticator')
$$;

create or replace function trust_this_device(p_token_hash text, p_device_name text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v member := private.signed_in_member(); v_days int; v_factor uuid; v_until timestamptz;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then raise exception 'Enter your authenticator code first.'; end if;
  if v.id is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'This device can''t be trusted.'; end if;
  select coalesce(trusted_device_days, 30) into v_days from security_settings where tenant_id = v.tenant_id;
  v_days := coalesce(v_days, 30);
  if v_days <= 0 then raise exception 'Trusted devices are turned off for your company.'; end if;
  select f.id into v_factor from auth.mfa_factors f
   where f.user_id = auth.uid() and f.status = 'verified' order by f.created_at desc limit 1;
  v_until := now() + make_interval(days => v_days);
  insert into trusted_device (member_id, auth_user_id, token_hash, factor_id, password_check, device_name, trusted_until)
  values (v.id, auth.uid(), p_token_hash, v_factor, private.password_check(auth.uid()), left(p_device_name, 200), v_until);
  return v_until;
end $$;

create or replace function use_trusted_device(p_token_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare d trusted_device; v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or v_session is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from trusted_session where expires_at < now();
  select * into d from trusted_device
   where token_hash = p_token_hash and auth_user_id = auth.uid()
     and trusted_until > now() and revoked_at is null;
  if not found then return false; end if;
  if not exists (select 1 from auth.mfa_factors f
                  where f.id = d.factor_id and f.user_id = auth.uid() and f.status = 'verified')
     or d.password_check is distinct from private.password_check(auth.uid()) then
    update trusted_device set revoked_at = now() where id = d.id;
    return false;
  end if;
  insert into trusted_session (session_id, auth_user_id, device_id, expires_at)
  values (v_session, auth.uid(), d.id, d.trusted_until)
  on conflict (session_id) do update set expires_at = excluded.expires_at, device_id = excluded.device_id;
  update trusted_device set last_used_at = now() where id = d.id;
  update member set last_activity_at = now() where user_id = auth.uid();
  return true;
end $$;

create or replace function end_trusted_session()
returns void language sql security definer set search_path = public as $$
  delete from trusted_session
   where session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and auth_user_id = auth.uid()
$$;

-- My trusted devices (profile) — admins see everyone's in their company
create or replace function my_trusted_devices()
returns table (id uuid, member_id uuid, device_name text, trusted_at timestamptz,
               last_used_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.member_id, coalesce(d.device_name, 'Browser'), d.created_at, d.last_used_at, d.trusted_until
    from trusted_device d join member m on m.id = d.member_id
   where d.revoked_at is null and d.trusted_until > now()
     and m.tenant_id = my_tenant()
     and (d.auth_user_id = auth.uid() or my_role() = 'admin')
   order by d.created_at desc
$$;

create or replace function revoke_trusted_device(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update trusted_device d set revoked_at = now()
    from member m
   where d.id = p_id and m.id = d.member_id and m.tenant_id = my_tenant()
     and (d.auth_user_id = auth.uid() or my_role() = 'admin')
$$;

-- ---------------------------------------------------------------- settings policies
create policy security_read on security_settings for select to authenticated using (tenant_id = my_tenant());
create policy security_admin on security_settings for update to authenticated
  using (tenant_id = my_tenant() and my_role() = 'admin') with check (tenant_id = my_tenant() and my_role() = 'admin');

-- policies call the helpers once per query, not once per row
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'public' and (qual ~ 'my_(tenant|role)\(\)' or with_check ~ 'my_(tenant|role)\(\)')
              and (coalesce(qual,'') !~ '\(select my_' and coalesce(with_check,'') !~ '\(select my_') loop
    execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
      case when r.qual is not null then 'using (' || regexp_replace(r.qual, 'my_(tenant|role)\(\)', '(select my_\1())', 'g') || ')' else '' end,
      case when r.with_check is not null then 'with check (' || regexp_replace(r.with_check, 'my_(tenant|role)\(\)', '(select my_\1())', 'g') || ')' else '' end);
  end loop;
end $$;

-- ---------------------------------------------------------------- nothing for anyone not signed in
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function recompute_moves(uuid, date) from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

insert into security_settings (tenant_id) select id from tenant on conflict do nothing;
