-- EMSCharts Assist — login backend schema (Supabase / Postgres)
-- Run this once in your Supabase project's SQL editor.
--
-- What it sets up:
--   * allowed_domains  — email domains permitted to register (e.g. vfambulence.com)
--   * allowed_emails   — one-off individual addresses allowed regardless of domain
--   * access_codes     — time-limited codes that unlock the extension
--   * code_redemptions — audit trail of code use
--   * orgs / profiles  — crews + per-user role & org (admin console multi-tenancy)
--   * enforce_allowed_domain() trigger — rejects a sign-up unless its domain OR
--       its full email address is allow-listed
--   * handle_new_user() trigger — provisions a profiles row for each new user
--   * redeem_access_code() function — atomic validate-and-increment for a code
--
-- Individual user accounts + passwords live in Supabase's built-in auth.users
-- (managed and bcrypt-hashed by Supabase Auth) — we do not store passwords here.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_domains (
    domain     text primary key,          -- lowercased, e.g. 'vfambulence.com'
    note       text,
    created_at timestamptz not null default now()
);

-- One-off individual addresses allowed even when their domain is NOT approved
-- (contractors, ride-alongs, partner-agency medics). Store the full email.
create table if not exists public.allowed_emails (
    email      text primary key,          -- lowercased full address, e.g. 'jane@gmail.com'
    note       text,
    created_at timestamptz not null default now()
);

create table if not exists public.access_codes (
    code       text primary key,          -- random, e.g. 8 chars
    label      text,                       -- who/what it's for
    expires_at timestamptz not null,       -- admin sets the TTL here
    max_uses   integer,                    -- null = unlimited within the window
    uses       integer not null default 0,
    revoked    boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.code_redemptions (
    id          bigint generated always as identity primary key,
    code        text references public.access_codes(code),
    redeemed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Enable RLS and add NO policies, so these tables are unreadable/unwritable by
-- the publishable key. All access happens either through SECURITY DEFINER
-- functions (below) or server-side with the service-role key (the Edge
-- Function). This prevents anyone from enumerating codes with the publishable key.
-- ---------------------------------------------------------------------------
alter table public.allowed_domains  enable row level security;
alter table public.allowed_emails   enable row level security;
alter table public.access_codes     enable row level security;
alter table public.code_redemptions enable row level security;

-- ---------------------------------------------------------------------------
-- Allow-list enforcement
-- Rejects a sign-up unless EITHER the full email is individually allow-listed in
-- allowed_emails (one-off), OR the email's domain is in allowed_domains. Runs as
-- the table owner (security definer) so it can read both despite RLS.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_allowed_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- One-off individual address (matched case-insensitively).
    if exists (
        select 1 from public.allowed_emails
        where lower(email) = lower(new.email)
    ) then
        return new;
    end if;
    -- Otherwise the email's domain must be approved.
    if exists (
        select 1 from public.allowed_domains
        where domain = lower(split_part(new.email, '@', 2))
    ) then
        return new;
    end if;
    raise exception 'Email domain not allowed';
end;
$$;

drop trigger if exists enforce_allowed_domain on auth.users;
create trigger enforce_allowed_domain
    before insert on auth.users
    for each row execute function public.enforce_allowed_domain();

-- ---------------------------------------------------------------------------
-- Atomic access-code redemption
-- Locks the code row, validates (exists / not revoked / not expired / uses left),
-- increments the use count, records the redemption, and returns the code's
-- expires_at (or NULL when the code is not usable). Called by the redeem-code
-- Edge Function with the service-role key. SECURITY DEFINER + row lock make two
-- simultaneous redemptions of the last remaining use safe.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_access_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.access_codes%rowtype;
begin
    select * into v_row
    from public.access_codes
    where code = p_code
    for update;

    if not found then return null; end if;
    if v_row.revoked then return null; end if;
    if v_row.expires_at <= now() then return null; end if;
    if v_row.max_uses is not null and v_row.uses >= v_row.max_uses then
        return null;
    end if;

    update public.access_codes set uses = uses + 1 where code = p_code;
    insert into public.code_redemptions (code) values (p_code);
    return v_row.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Multi-tenant admin console — orgs + roles
-- Crews are `orgs`; every user has a `profiles` row carrying their role and org.
-- Crew admins manage their own org's allow-list from the extension's admin page.
-- RLS (below) is what actually isolates one org's admin from another's data —
-- the UI gate is only convenience.
-- ---------------------------------------------------------------------------
create table if not exists public.orgs (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    org_id     uuid references public.orgs(id),
    role       text not null default 'member'
               check (role in ('member', 'crew_admin', 'super_admin')),
    email      text,                      -- copied at sign-up so admins can list members
    created_at timestamptz not null default now()
);

-- Tie each allow-list row to the org that owns it, so a crew admin only sees and
-- manages their own. Existing rows stay org_id = NULL (global) until assigned.
alter table public.allowed_emails  add column if not exists org_id uuid references public.orgs(id);
alter table public.allowed_domains add column if not exists org_id uuid references public.orgs(id);

alter table public.orgs     enable row level security;
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- RLS helpers — SECURITY DEFINER so they read profiles WITHOUT re-triggering
-- profiles' own RLS (avoids infinite recursion inside the policies below).
-- ---------------------------------------------------------------------------
create or replace function public.auth_org_id()
returns uuid language sql security definer set search_path = public stable
as $$ select org_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.auth_is_admin()
returns boolean language sql security definer set search_path = public stable
as $$
    select coalesce(
        (select role in ('crew_admin', 'super_admin')
         from public.profiles where user_id = auth.uid()),
        false)
$$;

-- The caller's own profile (role/org/email). The extension calls this via
-- POST /rest/v1/rpc/my_profile so it need not know its own user id.
create or replace function public.my_profile()
returns setof public.profiles language sql security definer set search_path = public stable
as $$ select * from public.profiles where user_id = auth.uid() $$;

grant execute on function public.auth_org_id(), public.auth_is_admin(),
    public.my_profile() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Provision a profile for every new user. AFTER INSERT, so enforce_allowed_domain
-- (BEFORE INSERT) has already admitted them. Best-effort org: the org that
-- pre-approved their exact email, else the org that owns their domain, else NULL.
-- Role always starts as 'member' (a super-admin promotes crew admins by hand).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
    v_org uuid;
begin
    select org_id into v_org from public.allowed_emails
    where lower(email) = lower(new.email) limit 1;
    if v_org is null then
        select org_id into v_org from public.allowed_domains
        where domain = lower(split_part(new.email, '@', 2)) limit 1;
    end if;
    insert into public.profiles (user_id, org_id, email)
    values (new.id, v_org, new.email)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists handle_new_user on auth.users;
create trigger handle_new_user
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Backfill a profile for any users that existed before this migration, so the
-- bootstrap UPDATE below (and member listings) work for them too.
insert into public.profiles (user_id, org_id, email)
select id, null, email from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS policies
-- profiles: a user reads their own row; a crew admin also reads their org's rows
-- (to list members). No client writes — roles/orgs are set by a super-admin (see
-- bootstrap) or the handle_new_user trigger.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
    for select using (user_id = auth.uid());

drop policy if exists profiles_org_read on public.profiles;
create policy profiles_org_read on public.profiles
    for select using (auth_is_admin() and org_id = auth_org_id());

-- orgs: a user can read their own org (to show its name).
drop policy if exists orgs_self_read on public.orgs;
create policy orgs_self_read on public.orgs
    for select using (id = auth_org_id());

-- allowed_emails: was locked (RLS on, no policies). Crew admins may now read/add/
-- remove rows for THEIR org only. `with check` blocks writing another org's rows
-- even if the client supplies a different org_id.
drop policy if exists allowed_emails_admin_read on public.allowed_emails;
create policy allowed_emails_admin_read on public.allowed_emails
    for select using (auth_is_admin() and org_id = auth_org_id());

drop policy if exists allowed_emails_admin_insert on public.allowed_emails;
create policy allowed_emails_admin_insert on public.allowed_emails
    for insert with check (auth_is_admin() and org_id = auth_org_id());

drop policy if exists allowed_emails_admin_delete on public.allowed_emails;
create policy allowed_emails_admin_delete on public.allowed_emails
    for delete using (auth_is_admin() and org_id = auth_org_id());

-- Base table privileges for the signed-in (authenticated) role. RLS above gates
-- WHICH rows a request may touch; without these grants the role can't reach the
-- table at all and PostgREST returns "permission denied for table".
grant select, insert, delete on public.allowed_emails to authenticated;
grant select on public.profiles to authenticated;
grant select on public.orgs to authenticated;

-- ---------------------------------------------------------------------------
-- Removing a pre-approval revokes the person. When an allowed_emails row is
-- deleted, delete the matching account too — their profiles row then cascades
-- away via its ON DELETE CASCADE FK to auth.users. SECURITY DEFINER so it may
-- modify auth.users regardless of who triggered the delete (a crew admin, whose
-- RLS scopes them to their own org's rows). No-op when the email never
-- registered an account. The user's session ends within one refresh cycle.
-- ---------------------------------------------------------------------------
create or replace function public.remove_user_on_allowed_email_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from auth.users where lower(email) = lower(old.email);
    return old;
end;
$$;

drop trigger if exists remove_user_on_allowed_email_delete on public.allowed_emails;
create trigger remove_user_on_allowed_email_delete
    after delete on public.allowed_emails
    for each row execute function public.remove_user_on_allowed_email_delete();

-- ---------------------------------------------------------------------------
-- Remove a member WITHOUT un-approving them: deletes the account (its profiles
-- row cascades away) but leaves the allowed_emails pre-approval, so the person
-- can re-register. Called by the admin console via POST /rest/v1/rpc/remove_member.
-- SECURITY DEFINER, so it does its OWN authorization: the caller must be an admin
-- and the target must be in the caller's org.
-- ---------------------------------------------------------------------------
create or replace function public.remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not auth_is_admin() then
        raise exception 'Not authorized';
    end if;
    if not exists (
        select 1 from public.profiles
        where user_id = p_user_id and org_id = auth_org_id()
    ) then
        raise exception 'Member is not in your organization';
    end if;
    delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap (super-admin, once per crew) — create an org, promote its admin, and
-- point the crew's domain at the org so their members self-register into it:
--   insert into public.orgs (name) values ('VF Ambulance') returning id;
--   update public.profiles set role = 'crew_admin', org_id = '<org-id>'
--     where user_id = (select id from auth.users where email = 'admin@vfambulance.com');
--   update public.allowed_domains set org_id = '<org-id>' where domain = 'vfambulence.com';
-- ---------------------------------------------------------------------------
