-- Watchman Forecasting — engine schema
-- Multi-tenant snapshot model. One import = one dated snapshot of a dataset.
-- Comparisons are computed in Postgres; the app only ever reads through RPCs.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- tenancy
create table tenant (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

-- People allowed in. A row here is an invitation until someone signs up with
-- that email; the sign-up trigger links it to auth.users.
create table member (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant on delete cascade,
  user_id     uuid unique references auth.users on delete set null,
  email       text not null,
  first_name  text not null default '',
  last_name   text not null default '',
  login_name  text,
  mobile      text,
  role        text not null default 'user' check (role in ('admin','manager','user')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, email)
);
create index member_email_idx on member (lower(email));

-- ---------------------------------------------------------------- forecast data
create table dataset (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant on delete cascade,
  name       text not null,
  customer   text not null,
  created_at timestamptz not null default now()
);

create table part (
  id         bigint generated always as identity primary key,
  dataset_id uuid not null references dataset on delete cascade,
  part_no    text not null,
  descr      text,
  unique (dataset_id, part_no)
);
create index part_no_trgm on part using gin (part_no gin_trgm_ops);

create table snapshot (
  id          bigint generated always as identity primary key,
  dataset_id  uuid not null references dataset on delete cascade,
  as_of       date not null,
  label       text not null,
  file_name   text,
  periods     date[] not null,           -- horizon of this snapshot, in order
  tail_from   date,                      -- last bucket is "this month and beyond"
  part_count  int not null default 0,
  total_qty   numeric(16,2) not null default 0,
  import_ms   int,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  unique (dataset_id, as_of)
);

-- One quantity per part per period per snapshot. Past-due = period 1900-01-01.
create table forecast_line (
  snapshot_id bigint not null references snapshot on delete cascade,
  part_id     bigint not null references part on delete cascade,
  period      date   not null,
  qty         numeric(14,2) not null,
  primary key (snapshot_id, part_id, period)
);
create index forecast_line_part_idx on forecast_line (part_id, snapshot_id);

-- Part-level movement vs the previous snapshot, materialized at import.
create table part_move (
  snapshot_id bigint not null references snapshot on delete cascade,
  part_id     bigint not null references part on delete cascade,
  prev_total  numeric(16,2),
  total       numeric(16,2),
  delta       numeric(16,2) not null,
  trend       text not null,
  streak      int not null default 0,     -- +n = up n snapshots in a row, -n = down
  primary key (snapshot_id, part_id)
);

-- ---------------------------------------------------------------- semantic layer & Q&A
create table field_def (
  id         bigint generated always as identity primary key,
  tenant_id  uuid references tenant on delete cascade,   -- null = engine default
  key        text not null,
  label      text not null,
  kind       text not null,                -- text | number | date | enum
  synonyms   text[] not null default '{}',
  allowed    text[] not null default '{}',
  notes      text not null default '',
  filterable boolean not null default true,
  sort_order int not null default 0,
  unique nulls not distinct (tenant_id, key)
);

create table question (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references tenant on delete cascade,
  user_id      uuid references auth.users on delete set null,
  text         text not null,
  source       text not null default 'typed' check (source in ('typed','voice','saved')),
  filter       jsonb,
  summary      text,
  result_count int,
  engine       text,                       -- claude | local
  ms           int,
  asked_at     timestamptz not null default now()
);
create index question_user_idx on question (tenant_id, user_id, asked_at desc);
create index question_zero_idx on question (tenant_id, asked_at desc) where result_count = 0;

create table saved_question (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenant on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  text        text not null,
  is_favorite boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, text)
);

-- ---------------------------------------------------------------- helpers
create function my_member() returns member
language sql stable security definer set search_path = public as $$
  select * from member where user_id = auth.uid() and is_active limit 1
$$;

create function my_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from member where user_id = auth.uid() and is_active limit 1
$$;

create function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from member where user_id = auth.uid() and is_active limit 1
$$;

create function period_label(p date, tail date) returns text
language sql immutable as $$
  select case
    when p = date '1900-01-01' then 'Past'
    when tail is not null and p = tail then to_char(p, 'YYYY') || '+'
    else to_char(p, 'YYYY "M"MM') end
$$;

-- "Past" | "2026 M04" | "01-01-2028" → bucket date
create function period_from_label(lbl text) returns date
language plpgsql immutable as $$
declare m text[];
begin
  lbl := btrim(regexp_replace(lbl, '^\s*sum of\s*', '', 'i'));
  if lower(lbl) = 'past' then return date '1900-01-01'; end if;
  m := regexp_match(lbl, '^(\d{4})\s*M(\d{1,2})$', 'i');
  if m is not null then return make_date(m[1]::int, m[2]::int, 1); end if;
  m := regexp_match(lbl, '^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$');
  if m is not null then return make_date(m[3]::int, m[1]::int, 1); end if;
  m := regexp_match(lbl, '^(\d{4})[-/](\d{1,2})');
  if m is not null then return make_date(m[1]::int, m[2]::int, 1); end if;
  return null;
end $$;

-- Sign-up: link the new auth user to their invitation (by email).
create function link_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update member set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function link_member();

-- ---------------------------------------------------------------- RLS
alter table tenant         enable row level security;
alter table member         enable row level security;
alter table dataset        enable row level security;
alter table part           enable row level security;
alter table snapshot       enable row level security;
alter table forecast_line  enable row level security;
alter table part_move      enable row level security;
alter table field_def      enable row level security;
alter table question       enable row level security;
alter table saved_question enable row level security;

create policy tenant_read on tenant for select to authenticated using (id = my_tenant());

create policy member_read on member for select to authenticated using (tenant_id = my_tenant());
create policy member_admin on member for all to authenticated
  using (tenant_id = my_tenant() and my_role() = 'admin')
  with check (tenant_id = my_tenant() and my_role() = 'admin');

create policy dataset_read on dataset for select to authenticated using (tenant_id = my_tenant());
create policy part_read on part for select to authenticated
  using (dataset_id in (select id from dataset where tenant_id = my_tenant()));
create policy snapshot_read on snapshot for select to authenticated
  using (dataset_id in (select id from dataset where tenant_id = my_tenant()));
create policy snapshot_delete on snapshot for delete to authenticated
  using (my_role() in ('admin','manager') and dataset_id in (select id from dataset where tenant_id = my_tenant()));
create policy snapshot_label on snapshot for update to authenticated
  using (my_role() in ('admin','manager') and dataset_id in (select id from dataset where tenant_id = my_tenant()));
create policy line_read on forecast_line for select to authenticated
  using (snapshot_id in (select s.id from snapshot s join dataset d on d.id = s.dataset_id where d.tenant_id = my_tenant()));
create policy move_read on part_move for select to authenticated
  using (snapshot_id in (select s.id from snapshot s join dataset d on d.id = s.dataset_id where d.tenant_id = my_tenant()));

create policy field_read on field_def for select to authenticated
  using (tenant_id is null or tenant_id = my_tenant());
create policy field_admin on field_def for all to authenticated
  using (tenant_id = my_tenant() and my_role() = 'admin')
  with check (tenant_id = my_tenant() and my_role() = 'admin');

create policy question_read on question for select to authenticated
  using (tenant_id = my_tenant() and (user_id = auth.uid() or my_role() in ('admin','manager')));
create policy question_insert on question for insert to authenticated
  with check (tenant_id = my_tenant() and user_id = auth.uid());
create policy question_delete on question for delete to authenticated
  using (tenant_id = my_tenant() and (user_id = auth.uid() or my_role() = 'admin'));

create policy saved_own on saved_question for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and tenant_id = my_tenant());
