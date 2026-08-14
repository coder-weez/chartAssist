-- EMSCharts Assist — login backend schema (Supabase / Postgres)
-- Run this once in your Supabase project's SQL editor.
--
-- What it sets up:
--   * allowed_domains  — email domains permitted to register (e.g. vfambulence.com)
--   * allowed_emails   — one-off individual addresses allowed regardless of domain
--   * access_codes     — time-limited codes that unlock the extension
--   * code_redemptions — audit trail of code use
--   * orgs / profiles  — crews + per-user role & org (admin console multi-tenancy)
--   * enforce_allowed_domain() trigger — admits a sign-up whose domain OR full
--       email is allow-listed, OR (with a crew selected) as a PENDING access request
--   * handle_new_user() trigger — provisions a profiles row for each new user,
--       'approved' when pre-approved else 'pending' (awaiting a crew admin)
--   * approve_signup / deny_signup / set_member_role — crew-admin console actions
--   * list_orgs() function — the crew list for the sign-up dropdown (anon-callable)
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
-- Admits a sign-up when EITHER the full email is individually allow-listed in
-- allowed_emails (one-off), OR the email's domain is in allowed_domains — those
-- become 'approved' accounts (handle_new_user sets the status). Otherwise the
-- sign-up is still admitted, but ONLY when the client selected a real crew (org)
-- to route the request to; handle_new_user marks it 'pending' so a crew admin of
-- that org must approve it before the account can sign in. A sign-up with no
-- pre-approval AND no valid crew is rejected (there is nobody to review it). Runs
-- as the table owner (security definer) so it can read the allow-lists despite RLS.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_allowed_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_requested uuid;
begin
    -- One-off individual address (matched case-insensitively).
    if exists (
        select 1 from public.allowed_emails
        where lower(email) = lower(new.email)
    ) then
        return new;
    end if;
    -- Pre-approved domain.
    if exists (
        select 1 from public.allowed_domains
        where domain = lower(split_part(new.email, '@', 2))
    ) then
        return new;
    end if;
    -- Not pre-approved: admit as a PENDING request, but only if a real crew was
    -- selected so an admin of that crew can approve/deny it. The requested crew id
    -- rides along in the sign-up metadata (options.data.requested_org_id).
    begin
        v_requested := nullif(new.raw_user_meta_data ->> 'requested_org_id', '')::uuid;
    exception
        when others then
            v_requested := null; -- malformed value → treat as no crew selected
    end;
    if v_requested is not null
       and exists (select 1 from public.orgs where id = v_requested) then
        return new;
    end if;
    raise exception 'Select your crew to request access';
end;
$$;

drop trigger if exists enforce_allowed_domain on auth.users;
create trigger enforce_allowed_domain
    before insert on auth.users
    for each row execute function public.enforce_allowed_domain();

-- ---------------------------------------------------------------------------
-- Access-code brute-force protection
-- The redeem-code Edge Function is anonymous and public, so a guessed 8-char code
-- must not be cheap to brute-force. Every attempt (pass or fail) is logged per
-- caller IP; redeem_access_code() locks the IP out after too many recent FAILURES.
-- RLS on with no policies: only the SECURITY DEFINER function (and the service-role
-- Edge Function) ever touch it. Rows are pruned opportunistically inside the
-- function, so the table stays small without a separate cron.
-- ---------------------------------------------------------------------------
create table if not exists public.redeem_attempts (
    id           bigint generated always as identity primary key,
    ip           text not null,
    success      boolean not null default false,
    attempted_at timestamptz not null default now()
);
create index if not exists redeem_attempts_ip_time
    on public.redeem_attempts (ip, attempted_at);
alter table public.redeem_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic access-code redemption (with per-IP rate limiting)
-- Locks the code row, validates (exists / not revoked / not expired / uses left),
-- increments the use count, records the redemption, and returns a JSON result.
-- Called by the redeem-code Edge Function with the service-role key. SECURITY
-- DEFINER + row lock make two simultaneous redemptions of the last remaining use
-- safe. p_ip is the caller's IP (from the Edge Function); when non-null, more than
-- REDEEM_MAX_FAILS failed attempts within REDEEM_WINDOW locks that IP out. Only
-- FAILED guesses count toward the lockout, so a legitimate user with a valid code
-- is unaffected. Returns:
--   { "ok": true,  "expires_at": <ts> }   success
--   { "ok": false, "locked": true }       too many recent failures from this IP
--   { "ok": false, "locked": false }      invalid / expired / used-up / revoked
-- ---------------------------------------------------------------------------
drop function if exists public.redeem_access_code(text);
drop function if exists public.redeem_access_code(text, text);
create or replace function public.redeem_access_code(p_code text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row       public.access_codes%rowtype;
    v_fails     integer;
    v_window    constant interval := interval '15 minutes';
    v_max_fails constant integer  := 5;
begin
    -- Rate limit by IP: block once recent FAILED attempts hit the ceiling.
    if p_ip is not null then
        select count(*) into v_fails
        from public.redeem_attempts
        where ip = p_ip and success = false and attempted_at > now() - v_window;
        if v_fails >= v_max_fails then
            return jsonb_build_object('ok', false, 'locked', true);
        end if;
    end if;

    select * into v_row
    from public.access_codes
    where code = p_code
    for update;

    if found and not v_row.revoked and v_row.expires_at > now()
       and (v_row.max_uses is null or v_row.uses < v_row.max_uses) then
        update public.access_codes set uses = uses + 1 where code = p_code;
        insert into public.code_redemptions (code) values (p_code);
        if p_ip is not null then
            insert into public.redeem_attempts (ip, success) values (p_ip, true);
            -- Opportunistic prune so the log can't grow without bound.
            delete from public.redeem_attempts where attempted_at < now() - interval '1 day';
        end if;
        return jsonb_build_object('ok', true, 'expires_at', v_row.expires_at);
    end if;

    -- Failure (missing / revoked / expired / used up): count it against the IP.
    if p_ip is not null then
        insert into public.redeem_attempts (ip, success) values (p_ip, false);
    end if;
    return jsonb_build_object('ok', false, 'locked', false);
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
    -- 'qa_auditor' is a QA-review role: it may use the popup's QA Mode toggle but
    -- has no admin powers (not an auth_is_admin() role).
    role       text not null default 'member'
               check (role in ('member', 'crew_admin', 'qa_auditor', 'super_admin')),
    -- 'approved' accounts can sign in; 'pending' ones self-registered without a
    -- pre-approved email/domain and await a crew admin's approve/deny.
    status     text not null default 'approved'
               check (status in ('pending', 'approved')),
    email      text,                      -- copied at sign-up so admins can list members
    created_at timestamptz not null default now()
);

-- Tie each allow-list row to the org that owns it, so a crew admin only sees and
-- manages their own. Existing rows stay org_id = NULL (global) until assigned.
alter table public.allowed_emails  add column if not exists org_id uuid references public.orgs(id);
alter table public.allowed_domains add column if not exists org_id uuid references public.orgs(id);

-- Approval status, for installs created before the approve/deny flow. Existing
-- rows backfill to 'approved' via the default (they predate pending sign-ups). The
-- CHECK is added separately and guarded, since a fresh create-table already added
-- it as profiles_status_check (Postgres names the inline column check that).
alter table public.profiles add column if not exists status text not null default 'approved';
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass and conname = 'profiles_status_check'
    ) then
        alter table public.profiles
            add constraint profiles_status_check check (status in ('pending', 'approved'));
    end if;
end $$;

-- Widen the role check to include qa_auditor (a QA-review role) for installs
-- created before it existed. Drop + re-add so the constraint definition updates.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check
    check (role in ('member', 'crew_admin', 'qa_auditor', 'super_admin'));

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
-- (BEFORE INSERT) has already admitted them.
--   * Pre-approved (exact email or domain) → status 'approved'; org = the
--     allow-list row's org ONLY. A global (org_id NULL) pre-approval yields a NULL
--     org until a super-admin assigns one — it deliberately does NOT fall back to
--     the crew the user picked, so a pre-approved account can never self-assign
--     (approved, unreviewed) into an arbitrary crew's roster.
--   * Not pre-approved → status 'pending'; org = the selected crew (guaranteed
--     present, since enforce_allowed_domain rejected the sign-up otherwise), so
--     that crew's admins see the request in their approve/deny bucket.
-- Role always starts as 'member' (a super-admin promotes crew admins by hand).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
    v_org       uuid;
    v_requested uuid;
    v_status    text;
begin
    -- The crew the user picked at sign-up (options.data.requested_org_id).
    begin
        v_requested := nullif(new.raw_user_meta_data ->> 'requested_org_id', '')::uuid;
    exception
        when others then
            v_requested := null;
    end;

    if exists (
        select 1 from public.allowed_emails where lower(email) = lower(new.email)
    ) then
        -- Approved: org comes ONLY from the allow-list row (NULL until assigned) —
        -- never from the user-supplied requested_org_id, so a pre-approved account
        -- can't self-assign into a crew it picked.
        select org_id into v_org from public.allowed_emails
        where lower(email) = lower(new.email) limit 1;
        v_status := 'approved';
    elsif exists (
        select 1 from public.allowed_domains
        where domain = lower(split_part(new.email, '@', 2))
    ) then
        select org_id into v_org from public.allowed_domains
        where domain = lower(split_part(new.email, '@', 2)) limit 1;
        v_status := 'approved';
    else
        -- Not pre-approved: this is a request routed to the crew the user selected.
        v_status := 'pending';
        v_org := v_requested;
    end if;

    insert into public.profiles (user_id, org_id, email, status)
    values (new.id, v_org, new.email, v_status)
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
-- (to list members AND pending sign-up requests — the console filters by status).
-- No client writes — status/role are changed only through the SECURITY DEFINER
-- console functions (approve_signup / set_member_role / …), a super-admin (see
-- bootstrap), or the handle_new_user trigger.
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

-- The notify-approved Edge Function reads these two tables DIRECTLY with the
-- service-role key (recipient email/org/status + crew name) rather than via a
-- SECURITY DEFINER RPC, so service_role needs its own SELECT — it isn't granted
-- one automatically here. (RLS doesn't apply to service_role; this is just the
-- base table privilege.)
grant select on public.profiles to service_role;
grant select on public.orgs to service_role;

-- ---------------------------------------------------------------------------
-- Removing a pre-approval revokes the person. When an allowed_emails row is
-- deleted, delete the matching account too — their profiles row then cascades
-- away via its ON DELETE CASCADE FK to auth.users. SECURITY DEFINER so it may
-- modify auth.users regardless of who triggered the delete.
--
-- SECURITY: the deletion is scoped to the pre-approval's own org — it removes an
-- account only when that user's profile sits in old.org_id. The email column is
-- deliberately free-form (crew admins add one-off outside addresses that match
-- no domain), so email alone cannot bound WHICH account gets destroyed: without
-- the org match, a crew admin could insert ANY address into their own org, then
-- delete it, and this trigger's global email match would delete that account in
-- ANOTHER org. Matching on org as well as email confines a crew admin to their
-- own tenant — the same boundary remove_member() enforces. `is not distinct
-- from` so a global (org_id NULL) pre-approval still lines up with a NULL-org
-- profile.
--
-- No-op when the email never registered an account, or when the account's
-- profile is in a different org. The user's session ends within one refresh
-- cycle.
-- ---------------------------------------------------------------------------
create or replace function public.remove_user_on_allowed_email_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from auth.users u
    using public.profiles p
    where p.user_id = u.id
      and lower(u.email) = lower(old.email)
      and p.org_id is not distinct from old.org_id;
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
-- and the target must be in the caller's org. Guards mirror set_member_role so the
-- console gate is not the only boundary — an admin cannot delete THEIR OWN account
-- (self-lockout), cannot delete a super_admin (a SQL-only role), and cannot delete
-- the org's LAST remaining admin (which would leave the crew with nobody able to
-- approve sign-ups or manage members).
-- ---------------------------------------------------------------------------
create or replace function public.remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    if not auth_is_admin() then
        raise exception 'Not authorized';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'You cannot remove your own account';
    end if;
    -- Target must be in the caller's org; capture its role for the guards below.
    select role into v_role from public.profiles
    where user_id = p_user_id and org_id = auth_org_id();
    if not found then
        raise exception 'Member is not in your organization';
    end if;
    if v_role = 'super_admin' then
        raise exception 'You cannot remove a super admin';
    end if;
    if v_role = 'crew_admin' and (
        select count(*) from public.profiles
        where org_id = auth_org_id()
          and role in ('crew_admin', 'super_admin')
    ) <= 1 then
        raise exception 'You cannot remove the last admin in your organization';
    end if;
    delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Account-approval console (crew admins)
-- Self-registered users whose email/domain isn't pre-approved land as 'pending'
-- profiles in the crew they selected. A crew admin sees them by reading their org's
-- profiles (the profiles_org_read policy already permits this — the console just
-- filters status=eq.pending) and acts via these SECURITY DEFINER functions, which
-- do their OWN authorization (caller must be an admin; target must be in the
-- caller's org). auth.uid() reflects the CALLER even inside a definer function.
-- ---------------------------------------------------------------------------

-- Approve a pending sign-up: flip its status to 'approved' so it can sign in. The
-- user already set their password at sign-up, so they just sign in afterwards.
create or replace function public.approve_signup(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not auth_is_admin() then
        raise exception 'Not authorized';
    end if;
    update public.profiles set status = 'approved'
    where user_id = p_user_id
      and org_id = auth_org_id()
      and status = 'pending';
    if not found then
        raise exception 'No pending request for that user in your organization';
    end if;
end;
$$;

-- Deny a pending sign-up: delete the account (its profiles row cascades away). Only
-- a PENDING request in the caller's org may be denied here — deleting an already-
-- approved member is the Members-list Remove (remove_member), a separate action.
create or replace function public.deny_signup(p_user_id uuid)
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
        where user_id = p_user_id and org_id = auth_org_id() and status = 'pending'
    ) then
        raise exception 'No pending request for that user in your organization';
    end if;
    delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.approve_signup(uuid), public.deny_signup(uuid)
    to authenticated;

-- ---------------------------------------------------------------------------
-- Change an approved member's role (crew admins). A crew admin may set a member's
-- role to 'member' or 'crew_admin' within their own org. Guards, so the console
-- gate is not the only boundary: the caller must be an admin; 'super_admin' cannot
-- be assigned here (that stays a SQL-only, super-admin task) and a super_admin
-- member cannot be demoted here; and an admin cannot change their OWN role (no
-- accidental self-lockout). Pending users are not members yet, so they are excluded.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not auth_is_admin() then
        raise exception 'Not authorized';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'You cannot change your own role';
    end if;
    if p_role not in ('member', 'crew_admin', 'qa_auditor') then
        raise exception 'Invalid role';
    end if;
    update public.profiles set role = p_role
    where user_id = p_user_id
      and org_id = auth_org_id()
      and status = 'approved'
      and role <> 'super_admin';
    if not found then
        raise exception 'Member is not in your organization';
    end if;
end;
$$;

grant execute on function public.set_member_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Crew list for the sign-up "select your crew" dropdown. Returns just id + name,
-- and is granted to anon so the SIGNED-OUT popup can populate it. SECURITY DEFINER
-- so it reads orgs despite RLS. (Crew names are low-sensitivity; exposing the list
-- to the publishable key is an accepted trade-off, consistent with the cooperative
-- gate.) Approval still gates who can actually get in.
-- ---------------------------------------------------------------------------
create or replace function public.list_orgs()
returns table (id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
    select id, name from public.orgs order by name
$$;

grant execute on function public.list_orgs() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Is an email pre-approved — either individually on allowed_emails OR by its domain
-- on allowed_domains? Anon-callable so the SIGNED-OUT sign-up form can keep the
-- "select your crew" dropdown hidden for anyone already pre-approved (they don't
-- need to request access; only an un-pre-approved sign-up picks a crew to route to).
-- Returns only a boolean for the exact address asked about, so it can't enumerate
-- the lists.
-- ---------------------------------------------------------------------------
drop function if exists public.email_individually_approved(text);
create or replace function public.email_preapproved(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.allowed_emails where lower(email) = lower(p_email)
    ) or exists (
        select 1 from public.allowed_domains
        where domain = lower(split_part(p_email, '@', 2))
    )
$$;

grant execute on function public.email_preapproved(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap (super-admin, once per crew) — create an org, promote its admin, and
-- point the crew's domain at the org so their members self-register into it:
--   insert into public.orgs (name) values ('VF Ambulance') returning id;
--   update public.profiles set role = 'crew_admin', org_id = '<org-id>'
--     where user_id = (select id from auth.users where email = 'admin@vfambulance.com');
--   update public.allowed_domains set org_id = '<org-id>' where domain = 'vfambulence.com';
-- ---------------------------------------------------------------------------
