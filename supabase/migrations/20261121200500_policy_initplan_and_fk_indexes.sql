-- Performance-advisor fixes: look the user up once per query in the question
-- policies, and index the foreign keys the app joins on.
alter policy question_read on question
  using (tenant_id = (select my_tenant()) and (user_id = (select auth.uid()) or (select my_role()) in ('admin','manager')));
alter policy question_insert on question
  with check (tenant_id = (select my_tenant()) and user_id = (select auth.uid()));
alter policy question_delete on question
  using (tenant_id = (select my_tenant()) and (user_id = (select auth.uid()) or (select my_role()) = 'admin'));
alter policy saved_own on saved_question
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and tenant_id = (select my_tenant()));

create index if not exists part_move_part_idx on part_move (part_id);
create index if not exists dataset_tenant_idx on dataset (tenant_id);
create index if not exists trusted_device_member_idx on trusted_device (member_id);
create index if not exists trusted_device_user_idx on trusted_device (auth_user_id);
create index if not exists trusted_session_device_idx on trusted_session (device_id);
create index if not exists question_user_fk_idx on question (user_id);
