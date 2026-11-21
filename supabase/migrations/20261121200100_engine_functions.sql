-- Watchman Forecasting — import + comparison functions.
-- Comparisons run as the caller (security invoker), so row-level security
-- decides what anyone can see. Import is security definer with its own check.

-- ---------------------------------------------------------------- part movement (materialized)
create or replace function recompute_moves(p_dataset uuid, p_from date)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_prev bigint; v_h date[];
begin
  for s in select id, as_of, periods from snapshot
            where dataset_id = p_dataset and as_of >= p_from order by as_of loop
    delete from part_move where snapshot_id = s.id;
    select id into v_prev from snapshot
     where dataset_id = p_dataset and as_of < s.as_of order by as_of desc limit 1;

    if v_prev is null then
      insert into part_move (snapshot_id, part_id, prev_total, total, delta, trend, streak)
      select s.id, part_id, null, sum(qty), 0, 'Baseline', 0
        from forecast_line where snapshot_id = s.id group by part_id;
      continue;
    end if;

    select array(select unnest(periods) from snapshot where id = v_prev
                 intersect select unnest(s.periods)) into v_h;

    insert into part_move (snapshot_id, part_id, prev_total, total, delta, trend, streak)
    with b as (select part_id, sum(qty) t from forecast_line
                where snapshot_id = v_prev and period = any(v_h) group by part_id),
         c as (select part_id, sum(qty) t from forecast_line
                where snapshot_id = s.id and period = any(v_h) group by part_id),
         j as (select coalesce(b.part_id, c.part_id) part_id, b.t pt, c.t ct,
                      case when b.part_id is null then 'New'
                           when c.part_id is null then 'Removed'
                           when c.t > b.t then 'Increased'
                           when c.t < b.t then 'Decreased'
                           else 'No Change' end trend
                 from b full join c on c.part_id = b.part_id)
    select s.id, j.part_id, j.pt, j.ct, coalesce(j.ct, 0) - coalesce(j.pt, 0), j.trend,
           case j.trend
             when 'Increased' then greatest(coalesce(pm.streak, 0), 0) + 1
             when 'Decreased' then least(coalesce(pm.streak, 0), 0) - 1
             else 0 end
      from j left join part_move pm on pm.snapshot_id = v_prev and pm.part_id = j.part_id;
  end loop;
end $$;

-- ---------------------------------------------------------------- import (one call, one transaction)
-- p_rows: [[part_no, descr|null, [qty per period...]], ...]
create or replace function import_snapshot(
  p_dataset uuid, p_as_of date, p_label text, p_file text,
  p_periods text[], p_rows jsonb, p_parse_ms int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz := clock_timestamp();
  v_dates date[]; v_tail date; v_sid bigint; v_prev bigint; v_replaced boolean;
  v_parts int; v_new int; v_removed int; v_last text;
begin
  if auth.uid() is not null then
    if coalesce(my_role(), '') not in ('admin','manager')
       or not exists (select 1 from dataset where id = p_dataset and tenant_id = my_tenant()) then
      raise exception 'Only administrators and managers can import forecasts.' using errcode = '42501';
    end if;
  elsif session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  if p_as_of is null then raise exception 'The snapshot date is required.'; end if;
  if coalesce(jsonb_array_length(p_rows), 0) = 0 then raise exception 'The file has no part rows.'; end if;

  v_dates := array(select period_from_label(x) from unnest(p_periods) with ordinality u(x, i) order by i);
  if array_position(v_dates, null) is not null then
    raise exception 'Unrecognized period column: %', p_periods[array_position(v_dates, null)];
  end if;
  v_last := btrim(regexp_replace(p_periods[array_length(p_periods, 1)], '^\s*sum of\s*', '', 'i'));
  if v_last ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{4}$' then v_tail := v_dates[array_length(v_dates, 1)]; end if;

  delete from snapshot where dataset_id = p_dataset and as_of = p_as_of;
  v_replaced := found;

  insert into part (dataset_id, part_no, descr)
  select distinct on (btrim(r->>0)) p_dataset, btrim(r->>0), nullif(btrim(r->>1), '')
    from jsonb_array_elements(p_rows) r
   where btrim(coalesce(r->>0, '')) <> ''
  on conflict (dataset_id, part_no) do update
    set descr = coalesce(excluded.descr, part.descr);

  insert into snapshot (dataset_id, as_of, label, file_name, periods, tail_from, created_by)
  values (p_dataset, p_as_of, coalesce(nullif(btrim(p_label), ''), to_char(p_as_of, 'Mon DD, YYYY')),
          p_file, v_dates, v_tail, auth.uid())
  returning id into v_sid;

  insert into forecast_line (snapshot_id, part_id, period, qty)
  select v_sid, p.id, v_dates[q.i], round(sum(coalesce(nullif(q.v, ''), '0')::numeric), 2)
    from jsonb_array_elements(p_rows) r
    join part p on p.dataset_id = p_dataset and p.part_no = btrim(r->>0)
    cross join lateral jsonb_array_elements_text(r->2) with ordinality q(v, i)
   where q.i <= array_length(v_dates, 1)
   group by p.id, q.i;

  update snapshot s set
    part_count = x.n, total_qty = x.t
    from (select count(distinct part_id) n, coalesce(sum(qty), 0) t from forecast_line where snapshot_id = v_sid) x
   where s.id = v_sid;

  perform recompute_moves(p_dataset, p_as_of);
  analyze forecast_line; analyze part_move; analyze part;

  select count(*) filter (where trend = 'New'), count(*) filter (where trend = 'Removed'), count(*)
    into v_new, v_removed, v_parts from part_move where snapshot_id = v_sid;

  update snapshot set import_ms = coalesce(p_parse_ms, 0) +
         (extract(epoch from clock_timestamp() - t0) * 1000)::int where id = v_sid;

  return jsonb_build_object(
    'snapshot_id', v_sid, 'replaced', v_replaced,
    'parts', (select part_count from snapshot where id = v_sid),
    'lines', (select count(*) from forecast_line where snapshot_id = v_sid),
    'periods', array_length(v_dates, 1),
    'new_parts', v_new, 'removed_parts', v_removed,
    'db_ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int);
end $$;

-- ---------------------------------------------------------------- line-level comparison
create or replace function compare_lines(p_base bigint, p_curr bigint)
returns table (part_id bigint, period date, prev_qty numeric, qty numeric,
               delta numeric, pct numeric, trend text)
language sql stable as $$
  with h as (
    select array(select unnest(b.periods) intersect select unnest(c.periods)) p
      from snapshot b, snapshot c where b.id = p_base and c.id = p_curr),
  b as (select l.part_id, l.period, l.qty from forecast_line l, h
         where l.snapshot_id = p_base and l.period = any(h.p)),
  c as (select l.part_id, l.period, l.qty from forecast_line l, h
         where l.snapshot_id = p_curr and l.period = any(h.p))
  select coalesce(b.part_id, c.part_id), coalesce(b.period, c.period), b.qty, c.qty,
         coalesce(c.qty, 0) - coalesce(b.qty, 0),
         case when b.qty is not null and c.qty is not null and b.qty <> 0
              then round((c.qty - b.qty) / abs(b.qty) * 100, 1) end,
         case when b.qty is null then 'New'
              when c.qty is null then 'Removed'
              when c.qty > b.qty then 'Increased'
              when c.qty < b.qty then 'Decreased'
              else 'No Change' end
    from b full join c on c.part_id = b.part_id and c.period = b.period
$$;

-- Periods a filter allows (null = all)
create or replace function filter_periods(f jsonb) returns date[]
language sql immutable as $$
  select case
    when jsonb_typeof(f->'periods') = 'array' and jsonb_array_length(f->'periods') > 0 then
      array(select period_from_label(x) from jsonb_array_elements_text(f->'periods') x)
    else null end
$$;

create or replace function num(f jsonb, k text) returns numeric
language sql immutable as $$ select nullif(f->>k, '')::numeric $$;

-- ---------------------------------------------------------------- filtered line rows
create or replace function compare_line_rows(p_base bigint, p_curr bigint, f jsonb default '{}')
returns table (part_id bigint, part_no text, descr text, period date, period_label text,
               prev_qty numeric, qty numeric, delta numeric, pct numeric, trend text, streak int)
language sql stable as $$
  with cl as materialized (select * from compare_lines(p_base, p_curr))
  select l.part_id, p.part_no, p.descr, l.period, period_label(l.period, s.tail_from),
         l.prev_qty, l.qty, l.delta, l.pct, l.trend, coalesce(m.streak, 0)
    from cl l
    join part p on p.id = l.part_id
    join snapshot s on s.id = p_curr
    left join part_move m on m.snapshot_id = p_curr and m.part_id = l.part_id
   where (f->>'part' is null or p.part_no ilike '%' || (f->>'part') || '%')
     and (f->>'descr' is null or p.descr ilike '%' || (f->>'descr') || '%')
     and (jsonb_typeof(f->'parts') is distinct from 'array'
          or p.part_no in (select jsonb_array_elements_text(f->'parts')))
     and (filter_periods(f) is null or l.period = any(filter_periods(f)))
     and (f->>'period_from' is null or l.period >= period_from_label(f->>'period_from'))
     and (f->>'period_to'   is null or l.period <= period_from_label(f->>'period_to'))
     and (jsonb_typeof(f->'trend') is distinct from 'array' or jsonb_array_length(f->'trend') = 0
          or l.trend in (select jsonb_array_elements_text(f->'trend')))
     and (num(f, 'qty_min')       is null or l.qty >= num(f, 'qty_min'))
     and (num(f, 'qty_max')       is null or l.qty <= num(f, 'qty_max'))
     and (num(f, 'prev_min')      is null or l.prev_qty >= num(f, 'prev_min'))
     and (num(f, 'prev_max')      is null or l.prev_qty <= num(f, 'prev_max'))
     and (num(f, 'delta_min')     is null or l.delta >= num(f, 'delta_min'))
     and (num(f, 'delta_max')     is null or l.delta <= num(f, 'delta_max'))
     and (num(f, 'abs_delta_min') is null or abs(l.delta) >= num(f, 'abs_delta_min'))
     and (num(f, 'pct_min')       is null or l.pct >= num(f, 'pct_min'))
     and (num(f, 'pct_max')       is null or l.pct <= num(f, 'pct_max'))
     and (num(f, 'abs_pct_min')   is null or abs(l.pct) >= num(f, 'abs_pct_min'))
     and (num(f, 'streak_min')    is null or coalesce(m.streak, 0) >= num(f, 'streak_min'))
     and (num(f, 'streak_max')    is null or coalesce(m.streak, 0) <= num(f, 'streak_max'))
     and (coalesce((f->>'changed_only')::boolean, false) = false or l.trend <> 'No Change')
$$;

-- ---------------------------------------------------------------- part-level rows
-- Shifted = total unchanged but quantities moved between months (pull-in / push-out).
create or replace function compare_part_rows(p_base bigint, p_curr bigint, f jsonb default '{}')
returns table (part_id bigint, part_no text, descr text, prev_qty numeric, qty numeric,
               delta numeric, pct numeric, trend text, up int, down int, streak int,
               prev_series numeric[], series numeric[])
language sql stable as $$
  with cl as materialized (select * from compare_lines(p_base, p_curr)),
  l as (
    select l.*, p.part_no, p.descr from cl l
      join part p on p.id = l.part_id
     where (f->>'part' is null or p.part_no ilike '%' || (f->>'part') || '%')
       and (f->>'descr' is null or p.descr ilike '%' || (f->>'descr') || '%')
       and (jsonb_typeof(f->'parts') is distinct from 'array'
            or p.part_no in (select jsonb_array_elements_text(f->'parts')))
       and (filter_periods(f) is null or l.period = any(filter_periods(f)))
       and (f->>'period_from' is null or l.period >= period_from_label(f->>'period_from'))
       and (f->>'period_to'   is null or l.period <= period_from_label(f->>'period_to'))),
  a as (
    select part_id, min(part_no) part_no, min(descr) descr,
           sum(prev_qty) prev_qty, sum(qty) qty, sum(delta) delta,
           count(*) filter (where trend = 'Increased')::int up,
           count(*) filter (where trend = 'Decreased')::int down,
           bool_and(trend = 'New') all_new, bool_and(trend = 'Removed') all_removed,
           array_agg(coalesce(prev_qty, 0) order by period) prev_series,
           array_agg(coalesce(qty, 0) order by period) series
      from l group by part_id),
  r as (
    select a.*,
           case when a.prev_qty is not null and a.prev_qty <> 0 and not a.all_new and not a.all_removed
                then round(a.delta / abs(a.prev_qty) * 100, 1) end pct,
           case when a.all_new then 'New' when a.all_removed then 'Removed'
                when a.delta > 0 then 'Increased' when a.delta < 0 then 'Decreased'
                when a.up + a.down > 0 then 'Shifted' else 'No Change' end trend,
           coalesce(m.streak, 0) streak
      from a left join part_move m on m.snapshot_id = p_curr and m.part_id = a.part_id)
  select part_id, part_no, descr, prev_qty, qty, delta, pct, trend, up, down, streak, prev_series, series
    from r
   where (jsonb_typeof(f->'trend') is distinct from 'array' or jsonb_array_length(f->'trend') = 0
          or trend in (select jsonb_array_elements_text(f->'trend')))
     and (num(f, 'qty_min')       is null or qty >= num(f, 'qty_min'))
     and (num(f, 'qty_max')       is null or qty <= num(f, 'qty_max'))
     and (num(f, 'prev_min')      is null or prev_qty >= num(f, 'prev_min'))
     and (num(f, 'prev_max')      is null or prev_qty <= num(f, 'prev_max'))
     and (num(f, 'delta_min')     is null or delta >= num(f, 'delta_min'))
     and (num(f, 'delta_max')     is null or delta <= num(f, 'delta_max'))
     and (num(f, 'abs_delta_min') is null or abs(delta) >= num(f, 'abs_delta_min'))
     and (num(f, 'pct_min')       is null or pct >= num(f, 'pct_min'))
     and (num(f, 'pct_max')       is null or pct <= num(f, 'pct_max'))
     and (num(f, 'abs_pct_min')   is null or abs(pct) >= num(f, 'abs_pct_min'))
     and (num(f, 'streak_min')    is null or streak >= num(f, 'streak_min'))
     and (num(f, 'streak_max')    is null or streak <= num(f, 'streak_max'))
     and (coalesce((f->>'changed_only')::boolean, false) = false or trend <> 'No Change')
$$;

-- ---------------------------------------------------------------- grid (paged, sorted, with totals)
create or replace function compare_grid(
  p_base bigint, p_curr bigint, f jsonb default '{}', p_mode text default 'part',
  p_sort text default null, p_desc boolean default true, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable as $$
declare v_sort text; v_dir text := case when p_desc then 'desc' else 'asc' end; v_src text; r jsonb;
begin
  f := coalesce(f, '{}'::jsonb);
  v_sort := case p_sort
    when 'part_no' then 'part_no' when 'descr' then 'descr' when 'prev_qty' then 'prev_qty'
    when 'qty' then 'qty' when 'delta' then 'delta' when 'pct' then 'pct' when 'streak' then 'streak'
    when 'trend' then 'trend' when 'period' then 'period'
    else 'abs(delta)' end;
  if p_mode = 'line' then
    v_src := 'compare_line_rows($1, $2, $3)';
    if v_sort = 'part_no' then v_sort := 'part_no ' || v_dir || ', period'; v_dir := ''; end if;
  else
    v_src := 'compare_part_rows($1, $2, $3)';
    if v_sort = 'period' then v_sort := 'part_no'; end if;
  end if;

  execute format($q$
    with x as (select * from %s)
    select jsonb_build_object(
      'total', (select count(*) from x),
      'parts', (select count(distinct part_id) from x),
      'sum_prev', (select coalesce(sum(prev_qty), 0) from x),
      'sum_qty', (select coalesce(sum(qty), 0) from x),
      'sum_delta', (select coalesce(sum(delta), 0) from x),
      'rows', coalesce((select jsonb_agg(to_jsonb(y)) from (
          select * from x order by %s %s nulls last, part_no limit $4 offset $5) y), '[]'::jsonb))
  $q$, v_src, v_sort, v_dir)
  into r using p_base, p_curr, f, p_limit, p_offset;
  return r;
end $$;

-- ---------------------------------------------------------------- dashboard summary
create or replace function compare_summary(p_base bigint, p_curr bigint)
returns jsonb language sql stable as $$
  with pr as materialized (select * from compare_part_rows(p_base, p_curr, '{}')),
       ln as materialized (select * from compare_lines(p_base, p_curr)),
       cur as (select * from snapshot where id = p_curr),
       hz as (select array(select unnest(b.periods) intersect select unnest(c.periods) order by 1) p
                from snapshot b, snapshot c where b.id = p_base and c.id = p_curr)
  select jsonb_build_object(
    'parts', (select count(*) from pr where trend <> 'Removed'),
    'parts_all', (select count(*) from pr),
    'up', (select count(*) from pr where trend = 'Increased'),
    'down', (select count(*) from pr where trend = 'Decreased'),
    'flat', (select count(*) from pr where trend = 'No Change'),
    'shifted', (select count(*) from pr where trend = 'Shifted'),
    'new', (select count(*) from pr where trend = 'New'),
    'removed', (select count(*) from pr where trend = 'Removed'),
    'trending_up', (select count(*) from pr where streak >= 2),
    'trending_down', (select count(*) from pr where streak <= -2),
    'lines_changed', (select count(*) from ln where trend <> 'No Change'),
    'lines', (select count(*) from ln),
    'prev_total', (select coalesce(sum(prev_qty), 0) from ln),
    'total', (select coalesce(sum(qty), 0) from ln),
    'net', (select coalesce(sum(delta), 0) from ln),
    'wf', jsonb_build_object(
      'increases', (select coalesce(sum(delta), 0) from ln where trend = 'Increased'),
      'decreases', (select coalesce(sum(delta), 0) from ln where trend = 'Decreased'),
      'added',     (select coalesce(sum(qty), 0) from ln where trend = 'New'),
      'dropped',   (select coalesce(-sum(prev_qty), 0) from ln where trend = 'Removed')),
    'top_up', (select to_jsonb(t) from (select part_id, part_no, descr, delta, pct from pr
                where delta > 0 order by delta desc limit 1) t),
    'top_down', (select to_jsonb(t) from (select part_id, part_no, descr, delta, pct from pr
                where delta < 0 order by delta asc limit 1) t),
    'top_pct', (select to_jsonb(t) from (select part_id, part_no, descr, delta, pct from pr
                where pct is not null and prev_qty >= 10 order by abs(pct) desc limit 1) t),
    'by_period', (select coalesce(jsonb_agg(jsonb_build_object(
                    'period', period_label(x.period, (select tail_from from cur)),
                    'up', x.up, 'down', x.down, 'net', x.up + x.down,
                    'prev', x.prev, 'qty', x.qty) order by x.period), '[]'::jsonb)
                  from (select period,
                               coalesce(sum(delta) filter (where delta > 0), 0) up,
                               coalesce(sum(delta) filter (where delta < 0), 0) down,
                               coalesce(sum(prev_qty), 0) prev, coalesce(sum(qty), 0) qty
                          from ln group by period) x),
    'periods', (select coalesce(jsonb_agg(period_label(u.d, (select tail_from from cur)) order by u.d), '[]'::jsonb)
                  from hz, unnest(hz.p) u(d))
  )
$$;

-- ---------------------------------------------------------------- history of one part across every snapshot
create or replace function part_history(p_part bigint)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'part', (select to_jsonb(p) from (select id, part_no, descr from part where id = p_part) p),
    'snapshots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'as_of', s.as_of, 'label', s.label,
               'total', (select coalesce(sum(qty), 0) from forecast_line where snapshot_id = s.id and part_id = p_part),
               'trend', m.trend, 'delta', m.delta, 'streak', m.streak,
               'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                            'period', period_label(l.period, s.tail_from), 'date', l.period, 'qty', l.qty)
                            order by l.period), '[]'::jsonb)
                           from forecast_line l where l.snapshot_id = s.id and l.part_id = p_part))
             order by s.as_of)
        from snapshot s
        left join part_move m on m.snapshot_id = s.id and m.part_id = p_part
       where s.dataset_id = (select dataset_id from part where id = p_part)
         and exists (select 1 from forecast_line where snapshot_id = s.id and part_id = p_part)), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- one period of one part over time ("how has the forecast for M09 moved?")
create or replace function dataset_overview(p_dataset uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'snapshots', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'as_of', s.as_of, 'label', s.label, 'file_name', s.file_name,
        'part_count', s.part_count, 'total_qty', s.total_qty, 'periods', array_length(s.periods, 1),
        'import_ms', s.import_ms, 'created_at', s.created_at,
        'up', (select count(*) from part_move m where m.snapshot_id = s.id and trend = 'Increased'),
        'down', (select count(*) from part_move m where m.snapshot_id = s.id and trend = 'Decreased'),
        'new', (select count(*) from part_move m where m.snapshot_id = s.id and trend = 'New'),
        'removed', (select count(*) from part_move m where m.snapshot_id = s.id and trend = 'Removed'))
      order by s.as_of) from snapshot s where s.dataset_id = p_dataset), '[]'::jsonb))
$$;

create or replace function search_parts(p_dataset uuid, q text, p_limit int default 12)
returns table (id bigint, part_no text, descr text)
language sql stable as $$
  select id, part_no, descr from part
   where dataset_id = p_dataset
     and (q is null or q = '' or part_no ilike '%' || q || '%' or descr ilike '%' || q || '%')
   order by (part_no ilike q || '%') desc, similarity(part_no, coalesce(q, '')) desc, part_no
   limit p_limit
$$;

-- ---------------------------------------------------------------- recent / my context
create or replace function whoami()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member', (select to_jsonb(m) - 'user_id' from member m where m.user_id = auth.uid() and m.is_active limit 1),
    'tenant', (select to_jsonb(t) from tenant t where t.id = my_tenant()),
    'datasets', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from dataset d where d.tenant_id = my_tenant()), '[]'::jsonb))
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function recompute_moves(uuid, date) from authenticated;
