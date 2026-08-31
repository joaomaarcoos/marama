"""Transactional remote checks for the SIGEC submission readiness gate."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from psycopg2.extras import Json
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env

def main() -> int:
    env = load_env(); api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]; password = f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    def expect(name: str, condition: bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={"email":f"sigec-ready-{label}-{run_id}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}", status == 200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def auth(cur: Any, user_id: str, role="candidato"):
        cur.execute("set local role authenticated"); cur.execute("select set_config('request.jwt.claims',%s,true)",(json.dumps({"sub":user_id,"role":"authenticated","app_metadata":{"role":role}}),))
    def reset(cur: Any): cur.execute("reset role"); cur.execute("select set_config('request.jwt.claims','',true)")
    def error(cur: Any, name: str, sql: str, params: tuple, code: str):
        sp=f"ready_{len(checks)}"; cur.execute(f"savepoint {sp}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {sp}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {sp}"); raise AssertionError(name)
    def cleanup():
        return all(api.request("DELETE",f"/auth/v1/admin/users/{uid}",service=True)[0] in {200,204,404} for uid in reversed(users))
    try:
        candidate=create_user("candidate","candidato"); other=create_user("other","candidato"); manager=create_user("manager","gerente")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        for index, uid in enumerate((candidate,other),1):
            base=f"{(int(run_id[:8],16)+80+index)%1_000_000_000:09d}"
            cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at) values(%s,%s,%s,'1990-01-01',%s,now(),'65000123','Rua Teste','10','Centro','São Luís','MA','Manhã',now())""",(uid,f"Candidato Gate {index}",valid_cpf(base),f"5598{(int(run_id[1:9],16)+80+index)%1_000_000_000:09d}"))
        cur.execute("""insert into public.sigec_processes(title,slug,status,published_at,applications_open_at,applications_close_at,created_by,edital_version,max_preferences) values(%s,%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s,'teste-1',1) returning id""",("Processo gate",f"sigec-ready-{run_id}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id) values(%s,%s) returning id",(process,candidate)); application=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial,position) values(%s,'recebida','Recebida',true,0) returning id",(process,)); initial_stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_modalities(process_id,name,slug) values(%s,'Modalidade','modalidade') returning id",(process,)); modality=cur.fetchone()[0]
        name=f"Curso Gate {run_id}"; cur.execute("insert into public.sigec_courses(canonical_name,normalized_name) values(%s,%s) returning id",(name,name.lower())); course=cur.fetchone()[0]
        cur.execute("insert into public.sigec_vacancies(process_id,modality_id,course_id,municipality,vacancy_kind,vacancy_count) values(%s,%s,%s,'São Luís','quantidade',1) returning id",(process,modality,course)); vacancy=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_questions(process_id,code,label,question_type,required,config) values(%s,'confirmacao','Confirme os dados','boolean',true,%s) returning id",(process,Json({"audience":"all"}))); question=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label,condition_config) values(%s,'identificacao','Identificação',%s) returning id",(process,Json({"audience":"all"}))); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label,condition_config) values(%s,'laudo_pcd','Laudo PCD',%s)",(process,Json({"audience":"pcd"})))
        auth(cur,candidate); cur.execute("select code,ready,detail from public.sigec_get_application_submission_readiness(%s)",(application,)); initial={row[0]:row[1:] for row in cur.fetchall()}
        expect("six_readiness_controls",len(initial)==6); expect("profile_and_window_ready",initial["profile"][0] and initial["application"][0]); expect("incomplete_items_block",not initial["preferences"][0] and not initial["answers"][0] and not initial["documents"][0] and not initial["consents"][0])
        reset(cur); cur.execute("insert into public.sigec_application_preferences(application_id,vacancy_id,position) values(%s,%s,1)",(application,vacancy))
        auth(cur,candidate); cur.execute("select public.sigec_replace_application_answers(%s,%s)",(application,Json({str(question):True})))
        reset(cur); cur.execute("select * from public.sigec_register_candidate_document(%s,%s,%s,'identificacao.pdf','application/pdf',10,%s,%s)",(application,requirement,f"{candidate}/{application}/{uuid.uuid4()}.pdf","c"*64,candidate)); document=cur.fetchone()[0]
        cur.execute("select public.sigec_record_document_malware_scan(%s,%s,'clean','clamav',null,null)",(document,"c"*64))
        for kind,version in (("edital","edital:teste-1"),("truthfulness","declaracao-veracidade:1"),("requirements","requisitos:teste-1"),("lgpd","aviso-privacidade:1")):
            cur.execute("insert into public.sigec_consents(application_id,consent_type,document_version,accepted,ip_hash,user_agent_hash) values(%s,%s,%s,true,%s,%s)",(application,kind,version,"d"*64,"e"*64))
        auth(cur,candidate); cur.execute("select code,ready from public.sigec_get_application_submission_readiness(%s)",(application,)); final=cur.fetchall(); expect("complete_application_ready",len(final)==6 and all(row[1] for row in final)); cur.execute("select private.sigec_assert_application_ready_for_submission(%s)",(application,)); expect("database_assertion_passes",True)
        auth(cur,other); error(cur,"other_candidate_forbidden","select * from public.sigec_get_application_submission_readiness(%s)",(application,),"42501")
        reset(cur); cur.execute("delete from public.sigec_application_answers where application_id=%s",(application,)); auth(cur,candidate); error(cur,"missing_answer_assertion_blocks","select private.sigec_assert_application_ready_for_submission(%s)",(application,),"23514")
        reset(cur); cur.execute("insert into public.sigec_application_answers(application_id,question_id,answer) values(%s,%s,'true'::jsonb)",(application,question)); auth(cur,candidate)
        cur.execute("select * from public.sigec_submit_application(%s,%s,%s)",(application,"d"*64,"e"*64)); submitted=cur.fetchone(); expect("application_submitted_with_protocol",submitted[0].startswith("SIGEC-") and submitted[3]==1)
        cur.execute("select * from public.sigec_submit_application(%s,%s,%s)",(application,"d"*64,"e"*64)); expect("repeated_submit_is_idempotent",cur.fetchone()==submitted)
        reset(cur); cur.execute("select application_state,stage_id from public.sigec_applications where id=%s",(application,)); expect("application_moved_to_initial_stage",cur.fetchone()==("submitted",initial_stage))
        cur.execute("select snapshot, snapshot_sha256 from public.sigec_application_submissions where application_id=%s",(application,)); snapshot,snapshot_hash=cur.fetchone(); expect("snapshot_contains_required_evidence",len(snapshot["preferences"])==1 and len(snapshot["answers"])==1 and len(snapshot["documents"])==1 and len(snapshot["consents"])==4 and len(snapshot_hash)==64)
        cur.execute("select snapshot_sha256=encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex') from public.sigec_application_submissions where application_id=%s",(application,)); expect("snapshot_hash_matches_content",cur.fetchone()[0] is True)
        error(cur,"snapshot_update_is_immutable","update public.sigec_application_submissions set protocol=protocol where application_id=%s",(application,),"55000")
        error(cur,"submitted_document_upload_requires_correction","select * from public.sigec_register_candidate_document(%s,%s,%s,'novo.pdf','application/pdf',10,%s,%s)",(application,requirement,f"{candidate}/{application}/{uuid.uuid4()}.pdf","a"*64,candidate),"23514")
        auth(cur,candidate); error(cur,"direct_snapshot_insert_revoked","insert into public.sigec_application_submissions(application_id,version,protocol,edital_version,snapshot,snapshot_sha256,submitted_at) values(%s,2,'SIGEC-2026-AAAAAAAAAAAA','x','{}',%s,now())",(application,"f"*64),"42501")
        auth(cur,other); cur.execute("select count(*) from public.sigec_application_submissions where application_id=%s",(application,)); expect("snapshot_rls_isolates_candidate",cur.fetchone()[0]==0)
        error(cur,"other_candidate_cannot_open_correction","select * from public.sigec_start_application_correction(%s)",(application,),"42501")
        auth(cur,candidate); cur.execute("select * from public.sigec_start_application_correction(%s)",(application,)); opened=cur.fetchone(); expect("candidate_opens_correction",opened==(submitted[0],1,False))
        cur.execute("select * from public.sigec_start_application_correction(%s)",(application,)); expect("correction_open_is_idempotent",cur.fetchone()==(submitted[0],1,True))
        cur.execute("select version,is_current from public.sigec_application_submission_versions where application_id=%s order by version",(application,)); expect("previous_protocol_stays_current_while_editing",cur.fetchall()==[(1,True)])
        cur.execute("select public.sigec_replace_application_answers(%s,%s)",(application,Json({str(question):False})))
        cur.execute("select * from public.sigec_submit_application(%s,%s,%s)",(application,"1"*64,"2"*64)); corrected=cur.fetchone(); expect("correction_creates_second_protocol",corrected[0]!=submitted[0] and corrected[3]==2)
        cur.execute("select * from public.sigec_submit_application(%s,%s,%s)",(application,"1"*64,"2"*64)); expect("corrected_submit_is_idempotent",cur.fetchone()==corrected)
        cur.execute("select version,is_current from public.sigec_application_submission_versions where application_id=%s order by version",(application,)); expect("only_latest_protocol_is_current",cur.fetchall()==[(1,False),(2,True)])
        reset(cur); cur.execute("select count(*),bool_and(case when version=1 then supersedes_submission_id is null else supersedes_submission_id is not null end) from public.sigec_application_submissions where application_id=%s",(application,)); expect("submission_lineage_preserved",cur.fetchone()==(2,True))
        cur.execute("select version,snapshot->'answers'->0->'answer' from public.sigec_application_submissions where application_id=%s order by version",(application,)); expect("snapshots_preserve_each_answer",cur.fetchall()==[(1,True),(2,False)])
        cur.execute("select count(*) from public.sigec_application_status_history where application_id=%s and public_message in ('Correção iniciada pelo candidato.','Correção recebida.')",(application,)); expect("correction_history_recorded",cur.fetchone()[0]==2)
        cur.execute("update public.sigec_processes set applications_close_at=now()-interval '1 second' where id=%s",(process,)); auth(cur,candidate); error(cur,"closed_window_blocks_new_correction","select * from public.sigec_start_application_correction(%s)",(application,),"23514")
        reset(cur); cur.execute("select has_function_privilege('authenticated','public.sigec_get_application_submission_readiness(uuid)','EXECUTE'), not has_function_privilege('anon','public.sigec_get_application_submission_readiness(uuid)','EXECUTE'), has_function_privilege('authenticated','public.sigec_submit_application(uuid,text,text)','EXECUTE'), has_function_privilege('authenticated','public.sigec_start_application_correction(uuid)','EXECUTE'), not has_function_privilege('anon','public.sigec_start_application_correction(uuid)','EXECUTE')"); expect("least_privilege_grants",cur.fetchone()==(True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1
if __name__ == "__main__": sys.exit(main())
