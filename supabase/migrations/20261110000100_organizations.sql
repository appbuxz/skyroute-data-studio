begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint organizations_name_valid
    check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null,
  user_id uuid not null,
  role text not null default 'member'
    constraint organization_members_role_valid
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  constraint organization_members_pkey
    primary key (organization_id, user_id),
  constraint organization_members_organization_fkey
    foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  constraint organization_members_user_fkey
    foreign key (user_id)
    references auth.users (id) on delete restrict
);

-- The primary key already indexes organization-first membership lookups.
create index organization_members_user_idx
  on public.organization_members (user_id, organization_id);

-- At most one owner. Atomic operator procedures maintain at least one owner.
create unique index organization_members_one_owner_idx
  on public.organization_members (organization_id)
  where role = 'owner';

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

revoke all privileges
  on table public.organizations, public.organization_members
  from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select
  on table public.organizations, public.organization_members
  to authenticated;

create policy organization_members_select_self
  on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Membership SELECT is self-only and does not query itself: no RLS recursion.
create policy organizations_select_member
  on public.organizations
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = organizations.id
        and membership.user_id = (select auth.uid())
    )
  );

-- No application write grants, write policies, or elevated RPCs.
commit;
