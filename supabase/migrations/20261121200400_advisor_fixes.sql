-- Security-advisor fixes.
-- 1. pg_trgm moves out of public (search_parts names it explicitly).
-- 2. A fixed search_path on the functions where it costs nothing.
--    Deliberately NOT on the comparison functions (compare_lines,
--    compare_line_rows, compare_part_rows, compare_summary, part_history) or the
--    tiny pure helpers: a pinned search_path stops Postgres from inlining a SQL
--    function, and that measured 90 ms → 92 s on the part grid. They read only
--    public tables, run as the caller (row-level security applies), and are
--    not security definer — so a caller's search_path can't widen what they see.
-- 3. The sign-up trigger function can't be called through the API.

create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

create or replace function search_parts(p_dataset uuid, q text, p_limit int default 12)
returns table (id bigint, part_no text, descr text)
language sql stable set search_path = public, extensions as $$
  select id, part_no, descr from public.part
   where dataset_id = p_dataset
     and (q is null or q = '' or part_no ilike '%' || q || '%' or descr ilike '%' || q || '%')
   order by (part_no ilike q || '%') desc, extensions.similarity(part_no, coalesce(q, '')) desc, part_no
   limit p_limit
$$;

alter function compare_grid(bigint, bigint, jsonb, text, text, boolean, integer, integer) set search_path = public, extensions;
alter function dataset_overview(uuid) set search_path = public, extensions;
alter function horizon_history(uuid)  set search_path = public, extensions;

revoke execute on function link_member() from public, anon, authenticated;
