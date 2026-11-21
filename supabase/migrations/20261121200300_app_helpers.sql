-- Delete a snapshot and recompare the one after it (managers / admins).
create or replace function delete_snapshot(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_ds uuid; v_as_of date;
begin
  select s.dataset_id, s.as_of into v_ds, v_as_of
    from snapshot s join dataset d on d.id = s.dataset_id
   where s.id = p_id and d.tenant_id = my_tenant();
  if v_ds is null or coalesce(my_role(), '') not in ('admin', 'manager') then
    raise exception 'Only administrators and managers can delete snapshots.' using errcode = '42501';
  end if;
  delete from snapshot where id = p_id;
  perform recompute_moves(v_ds, v_as_of);
end $$;
revoke execute on function delete_snapshot(bigint) from public, anon;
grant execute on function delete_snapshot(bigint) to authenticated;

-- Every snapshot's total per forecast month: "how has the forecast for
-- December moved over the last N imports?"
create or replace function horizon_history(p_dataset uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'as_of', s.as_of,
           'periods', (select coalesce(jsonb_agg(jsonb_build_object('period', period_label(x.period, s.tail_from), 'qty', x.q) order by x.period), '[]'::jsonb)
                         from (select period, sum(qty) q from forecast_line where snapshot_id = s.id group by period) x))
         order by s.as_of), '[]'::jsonb)
    from snapshot s where s.dataset_id = p_dataset
$$;
revoke execute on function horizon_history(uuid) from public, anon;
grant execute on function horizon_history(uuid) to authenticated;
