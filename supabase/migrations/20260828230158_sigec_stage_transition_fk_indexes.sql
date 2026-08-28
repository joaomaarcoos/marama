begin;

create index sigec_stage_transitions_from_stage_fk_idx
  on public.sigec_process_stage_transitions(from_stage_id);
create index sigec_stage_transitions_to_stage_fk_idx
  on public.sigec_process_stage_transitions(to_stage_id);

commit;
