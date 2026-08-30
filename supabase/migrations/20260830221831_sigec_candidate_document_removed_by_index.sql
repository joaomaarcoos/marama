create index sigec_documents_removed_by_fk_idx
on public.sigec_application_documents(removed_by)
where removed_by is not null;
